const ftp = require("basic-ftp");
const { Transform } = require("stream");
const SftpClient = require("ssh2-sftp-client");

const readJson = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
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
  const client = new ftp.Client();
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
  return /ENOTFOUND|10060|Failed to establish connection|Invalid response: \\[227\\]|425|ETIMEDOUT/i.test(
    message
  );
};

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const handleOptions = (req, res) => {
  if (req.method !== "OPTIONS") return false;
  setCors(res);
  res.statusCode = 204;
  res.end();
  return true;
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
