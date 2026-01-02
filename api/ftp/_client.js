const ftp = require("basic-ftp");
const { Transform } = require("stream");

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

const withClient = async (config, fn) => {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access(config);
    return await fn(client);
  } finally {
    client.close();
  }
};

const mapEntry = (entry) => ({
  name: entry.name,
  size: entry.size ?? null,
  modified: entry.modifiedAt ? entry.modifiedAt.toISOString() : null,
  is_dir: Boolean(entry.isDirectory ?? entry.type === 2),
  raw: entry.raw ?? null,
});

module.exports = {
  readJson,
  buildConfig,
  withClient,
  mapEntry,
  createThrottleStream,
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
