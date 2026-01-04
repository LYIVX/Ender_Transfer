const Busboy = require("busboy");
const {
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
  createThrottleStream,
  setCors,
  handleOptions,
} = require("./_client");

const freeUploadLimitBytes = 25 * 1024 * 1024;

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  setCors(res);
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const busboy = Busboy({ headers: req.headers });
  let payload = {};
  let fileStream = null;
  let fileName = null;
  let fileBytes = 0;
  let fileTooLarge = false;

  busboy.on("field", (name, value) => {
    payload[name] = value;
  });

  busboy.on("file", (_name, stream, info) => {
    fileStream = stream;
    fileName = info.filename;
    stream.on("data", (chunk) => {
      fileBytes += chunk.length;
      if (payload.tier !== "premium" && fileBytes > freeUploadLimitBytes) {
        fileTooLarge = true;
        stream.unpipe();
        stream.resume();
        stream.destroy();
      }
    });
  });

  busboy.on("finish", async () => {
    if (!fileStream) {
      res.statusCode = 400;
      res.end("No file uploaded");
      return;
    }
    if (fileTooLarge) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: `Free plan upload limit is ${freeUploadLimitBytes} bytes.`,
        })
      );
      return;
    }
    try {
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
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(error) }));
    }
  });

  req.pipe(busboy);
};
