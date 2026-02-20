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
  validatePath,
  sendError,
} = require("./_client");

const MAX_DELETE_DEPTH = 20;
const MAX_DELETE_FILES = 10000;

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
    validatePath(payload.path);
    const config = buildConfig(payload);
    const path = payload.path;
    const isDir = Boolean(payload.is_dir);

    let deletedCount = 0;
    const removeDirRecursive = async (client, dirPath, depth = 0) => {
      if (depth > MAX_DELETE_DEPTH) {
        throw new Error("Directory tree too deeply nested (possible symlink loop)");
      }
      const items = await client.list(dirPath);
      for (const item of items) {
        if (item.name === "." || item.name === "..") continue;
        if (++deletedCount > MAX_DELETE_FILES) {
          throw new Error("Too many files to delete in a single operation");
        }
        const childPath = dirPath.endsWith("/")
          ? dirPath + item.name
          : dirPath + "/" + item.name;
        if (item.isDirectory) {
          await removeDirRecursive(client, childPath, depth + 1);
        } else {
          await client.remove(childPath);
        }
      }
      await client.removeDir(dirPath);
    };

    const deleteFtp = async () =>
      withClient(config, (client) => {
        if (isDir) return removeDirRecursive(client, path);
        return client.remove(path);
      });
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
    sendError(res, error.statusCode || 500, error);
  }
};
