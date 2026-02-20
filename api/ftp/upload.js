const { PassThrough } = require("stream");
const Busboy = require("busboy");
const {
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
  createThrottleStream,
  setCors,
  handleOptions,
  validateHost,
  sendError,
} = require("./_client");

const freeUploadLimitBytes = 25 * 1024 * 1024;

// Field names that must not be set via multipart form data
const BLOCKED_FIELDS = new Set(["__proto__", "constructor", "prototype", "toString", "valueOf"]);

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  setCors(req, res);
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const busboy = Busboy({ headers: req.headers });
  const payload = Object.create(null);
  let fileStream = null;
  let fileName = null;
  let fileBytes = 0;
  let fileTooLarge = false;

  busboy.on("field", (name, value) => {
    if (BLOCKED_FIELDS.has(name)) return;
    payload[name] = value;
  });

  busboy.on("file", (_name, stream, info) => {
    const passthrough = new PassThrough();
    fileStream = passthrough;
    fileName = info.filename;
    stream.on("data", (chunk) => {
      fileBytes += chunk.length;
      // Always enforce free-tier limit (tier must be verified server-side)
      if (fileBytes > freeUploadLimitBytes) {
        fileTooLarge = true;
        stream.destroy();
        passthrough.destroy(new Error("File too large"));
        return;
      }
      passthrough.write(chunk);
    });
    stream.on("end", () => passthrough.end());
    stream.on("error", (err) => passthrough.destroy(err));
  });

  busboy.on("error", (err) => {
    console.error("Multipart parse error:", err);
    sendError(res, 400, "Invalid multipart data");
  });

  busboy.on("finish", async () => {
    try {
      if (!fileStream) {
        sendError(res, 400, "No file uploaded");
        return;
      }
      if (fileTooLarge) {
        sendError(res, 413, `Free plan upload limit is ${freeUploadLimitBytes} bytes.`);
        return;
      }

      await validateHost(payload.host);

      const config = buildConfig({
        host: payload.host,
        port: payload.port ? Number(payload.port) : 21,
        username: payload.username,
        password: payload.password || "",
        secure: payload.secure === "true",
      });
      const remotePath = payload.remotePath || fileName;
      const limitKbps = payload.uploadLimitKbps
        ? Number(payload.uploadLimitKbps)
        : 0;
      const throttle = createThrottleStream(limitKbps * 1024);
      const sourceStream = throttle ? fileStream.pipe(throttle) : fileStream;

      if (payload.protocol === "sftp") {
        await withSftpClient(buildSftpConfig(payload), (client) =>
          client.put(sourceStream, remotePath)
        );
      } else {
        await withClient(config, (client) => client.uploadFrom(sourceStream, remotePath));
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      sendError(res, error.statusCode || 500, error);
    }
  });

  req.pipe(busboy);
};
