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
    const mkdirFtp = async () => withClient(config, (client) => client.ensureDir(payload.path));
    const mkdirSftp = async () =>
      withSftpClient(buildSftpConfig(payload), (client) =>
        client.mkdir(payload.path, true)
      );
    if (payload.protocol === "sftp") {
      await mkdirSftp();
    } else {
      try {
        await mkdirFtp();
      } catch (error) {
        if (!shouldFallbackToSftp(error)) throw error;
        await mkdirSftp();
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
