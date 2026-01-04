const {
  readJson,
  buildConfig,
  buildSftpConfig,
  withClient,
  withSftpClient,
  mapEntry,
  mapSftpEntry,
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
    const path = payload.path || "/";
    const listFtp = async () =>
      withClient(config, async (client) => {
        const entries = await client.list(path);
        let cwd = path;
        try {
          cwd = await client.pwd();
        } catch {
          // keep requested path
        }
        return { cwd, entries, protocol: "ftp" };
      });
    const listSftp = async () =>
      withSftpClient(buildSftpConfig(payload), async (client) => {
        const entries = await client.list(path);
        return { cwd: path, entries, protocol: "sftp" };
      });
    let result;
    if (payload.protocol === "sftp") {
      result = await listSftp();
    } else {
      try {
        result = await listFtp();
      } catch (error) {
        if (!shouldFallbackToSftp(error)) throw error;
        result = await listSftp();
      }
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        cwd: result.cwd || "/",
        entries:
          result.protocol === "sftp"
            ? result.entries.map(mapSftpEntry)
            : result.entries.map(mapEntry),
        protocol: result.protocol,
      })
    );
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(error) }));
  }
};
