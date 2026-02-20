const {
  readJson,
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
  shouldFallbackToSftp,
  setCors,
  handleOptions,
  validateHost,
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
    const config = buildConfig(payload);
    const connectFtp = async () =>
      withClient(config, async (client) => {
        try {
          return await client.pwd();
        } catch {
          return "/";
        }
      });
    const connectSftp = async () =>
      withSftpClient(buildSftpConfig(payload), async () => "/");
    let cwd;
    if (payload.protocol === "sftp") {
      cwd = await connectSftp();
    } else {
      try {
        cwd = await connectFtp();
      } catch (error) {
        if (!shouldFallbackToSftp(error)) throw error;
        cwd = await connectSftp();
      }
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ cwd: cwd || "/" }));
  } catch (error) {
    sendError(res, error.statusCode || 500, error);
  }
};
