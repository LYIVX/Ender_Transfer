const path = require("path");
const {
  readJson,
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
  createThrottleStream,
  shouldFallbackToSftp,
  setCors,
  handleOptions,
  validateHost,
  validatePath,
  sendError,
} = require("./_client");

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  setCors(req, res);
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  try {
    const payload = await readJson(req);
    await validateHost(payload.host);
    validatePath(payload.remotePath, "remotePath");
    const config = buildConfig(payload);
    const remotePath = payload.remotePath;
    const rawName = payload.filename || path.basename(remotePath || "download");
    const filename = path.basename(rawName).replace(/[^\w.\-]/g, "_");
    const limitKbps = payload.downloadLimitKbps ? Number(payload.downloadLimitKbps) : 0;
    const throttle = createThrottleStream(limitKbps * 1024);

    // Defer response headers until the FTP/SFTP connection is established
    const startDownload = () => {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (throttle) {
        throttle.pipe(res);
      }
    };

    const target = throttle ?? res;
    const downloadFtp = async () =>
      withClient(config, (client) => {
        startDownload();
        return client.downloadTo(target, remotePath);
      });
    const downloadSftp = async () =>
      withSftpClient(buildSftpConfig(payload), (client) => {
        startDownload();
        const readStream = client.createReadStream(remotePath);
        return new Promise((resolve, reject) => {
          let settled = false;
          const settle = (fn) => (val) => { if (!settled) { settled = true; fn(val); } };
          readStream.on("error", (err) => {
            readStream.destroy();
            if (throttle) throttle.destroy();
            settle(reject)(err);
          });
          res.on("close", () => {
            readStream.destroy();
            settle(resolve)();
          });
          res.on("finish", settle(resolve));
          readStream.pipe(target);
        });
      });
    if (payload.protocol === "sftp") {
      await downloadSftp();
    } else {
      try {
        await downloadFtp();
      } catch (error) {
        if (!shouldFallbackToSftp(error)) throw error;
        await downloadSftp();
      }
    }
  } catch (error) {
    sendError(res, error.statusCode || 500, error);
  }
};
