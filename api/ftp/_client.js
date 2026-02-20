const ftp = require("basic-ftp");
const { Transform } = require("stream");
const SftpClient = require("ssh2-sftp-client");
const dns = require("dns").promises;
const net = require("net");

const MAX_BODY_SIZE = 10 * 1024; // 10KB max for JSON config payloads

const ALLOWED_ORIGINS = new Set([
  "https://endertransfer.vercel.app",
  "http://localhost:3000",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "https://tauri.localhost",
]);

const readJson = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_SIZE) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON in request body"), { statusCode: 400 });
  }
};

const BLOCKED_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, /^::1$/,
  /^fc/, /^fd/, /^fe80/,
];

const validateHost = async (host) => {
  if (!host || typeof host !== "string") {
    throw new Error("host is required");
  }
  // Block direct IP addresses in private ranges
  if (net.isIP(host)) {
    if (BLOCKED_IP_PATTERNS.some((p) => p.test(host)) || host === "0.0.0.0") {
      throw new Error("Connection to private/reserved addresses is not allowed");
    }
    return;
  }
  // Resolve DNS and check the resulting IP
  try {
    const { address } = await dns.lookup(host, { family: 4 });
    if (BLOCKED_IP_PATTERNS.some((p) => p.test(address)) || address === "0.0.0.0") {
      throw new Error("Connection to private/reserved addresses is not allowed");
    }
  } catch (err) {
    if (err.message.includes("private")) throw err;
    // DNS resolution failure will be caught by FTP/SFTP connect
  }
};

const buildConfig = (payload) => ({
  host: payload.host,
  port: payload.port || 21,
  user: payload.username,
  password: payload.password || "",
  secure: Boolean(payload.secure),
});

const buildSftpConfig = (payload) => ({
  host: payload.host,
  port: payload.sftpPort ? Number(payload.sftpPort) : 22,
  username: payload.username,
  password: payload.password || "",
  readyTimeout: 10000,
});

const runWithClient = async (config, fn, options = {}) => {
  const client = new ftp.Client(30000); // 30s timeout
  client.ftp.verbose = false;
  if (typeof options.useEPSV === "boolean") {
    client.ftp.useEPSV = options.useEPSV;
  }
  try {
    await client.access(config);
    return await fn(client);
  } finally {
    client.close();
  }
};

const withClient = async (config, fn) => {
  try {
    return await runWithClient(config, fn);
  } catch (error) {
    const message = String(error);
    if (
      message.includes("Invalid response: [227]") ||
      message.includes("Failed to establish connection") ||
      message.includes("425")
    ) {
      return await runWithClient(config, fn, { useEPSV: false });
    }
    throw error;
  }
};

const mapEntry = (entry) => ({
  name: entry.name,
  size: entry.size ?? null,
  modified: entry.modifiedAt ? entry.modifiedAt.toISOString() : null,
  is_dir: Boolean(entry.isDirectory ?? entry.type === 2),
  raw: entry.raw ?? null,
});

const mapSftpEntry = (entry) => ({
  name: entry.name,
  size: entry.size ?? null,
  modified: entry.modifyTime ? new Date(entry.modifyTime).toISOString() : null,
  is_dir: entry.type === "d",
  raw: entry.longname ?? null,
});

const withSftpClient = async (config, fn) => {
  const client = new SftpClient();
  try {
    await client.connect(config);
    return await fn(client);
  } finally {
    client.end();
  }
};

const shouldFallbackToSftp = (error) => {
  const message = String(error);
  return /ENOTFOUND|10060|Failed to establish connection|Invalid response: \[227\]|425|ETIMEDOUT/i.test(
    message
  );
};

const setCors = (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const handleOptions = (req, res) => {
  if (req.method !== "OPTIONS") return false;
  setCors(req, res);
  res.statusCode = 204;
  res.end();
  return true;
};

const validatePath = (p, name = "path") => {
  if (!p || typeof p !== "string") throw new Error(`${name} is required`);
  if (p.includes("\0")) throw new Error(`${name} contains invalid characters`);
};

const sanitizeError = (error) => {
  const msg = String(error);
  // Strip potential credential/host info from error messages
  if (/password|credential|auth/i.test(msg)) {
    return "Authentication failed. Check your credentials.";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/i.test(msg)) {
    return "Could not connect to server. Check host and port.";
  }
  // Log unexpected errors server-side before returning generic message
  console.error("[FTP] Unexpected error:", error);
  return "Operation failed. Check server connection and try again.";
};

const sendError = (res, statusCode, error) => {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: typeof error === "string" ? error : sanitizeError(error) }));
};

module.exports = {
  readJson,
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
  mapEntry,
  mapSftpEntry,
  createThrottleStream,
  shouldFallbackToSftp,
  setCors,
  handleOptions,
  validateHost,
  validatePath,
  sanitizeError,
  sendError,
};

function createThrottleStream(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null;
  let allowance = bytesPerSecond;
  let lastTime = Date.now();

  return new Transform({
    transform(chunk, _encoding, callback) {
      const now = Date.now();
      const elapsed = now - lastTime;
      if (elapsed > 0) {
        allowance = Math.min(bytesPerSecond, allowance + (elapsed / 1000) * bytesPerSecond);
        lastTime = now;
      }

      const needed = chunk.length;
      if (allowance >= needed) {
        allowance -= needed;
        callback(null, chunk);
        return;
      }

      const delay = ((needed - allowance) / bytesPerSecond) * 1000;
      allowance = 0;
      setTimeout(() => {
        lastTime = Date.now();
        callback(null, chunk);
      }, Math.max(0, delay));
    },
  });
}
