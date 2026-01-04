const {
  readJson,
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
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
    const path = payload.path;
    const isDir = Boolean(payload.is_dir);
    const deleteFtp = async () =>
      withClient(config, (client) => (isDir ? client.removeDir(path) : client.remove(path)));
    const deleteSftp = async () =>
      withSftpClient(buildSftpConfig(payload), (client) =>
        isDir ? client.rmdir(path, true) : client.delete(path)
      );
    if (payload.protocol === "sftp") {
      await deleteSftp();
    } else {
      try {
        await deleteFtp();
      } catch (error) {
        if (!shouldFallbackToSftp(error)) throw error;
        await deleteSftp();
      }
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(error) }));
  }
};
