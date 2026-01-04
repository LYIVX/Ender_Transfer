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
} = require("./_client");

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  setCors(res);
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  try {
    const payload = await readJson(req);
    const config = buildConfig(payload);
    const remotePath = payload.remotePath;
    const filename = payload.filename || path.basename(remotePath || "download");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/"/g, "")}"`
    );
    const limitKbps = payload.downloadLimitKbps ? Number(payload.downloadLimitKbps) : 0;
    const throttle = createThrottleStream(limitKbps * 1024);
    if (throttle) {
      throttle.pipe(res);
    }
    const target = throttle ?? res;
    const downloadFtp = async () =>
      withClient(config, (client) => client.downloadTo(target, remotePath));
    const downloadSftp = async () =>
      withSftpClient(buildSftpConfig(payload), (client) => {
        const readStream = client.createReadStream(remotePath);
        return new Promise((resolve, reject) => {
          readStream.on("error", reject);
          res.on("close", resolve);
          res.on("finish", resolve);
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
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(error) }));
  }
};
