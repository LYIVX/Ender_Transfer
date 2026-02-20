import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import type {
  FtpEntry,
  LocalEntry,
  LogEntry,
  TransferErrorPayload,
  TransferItem,
  TransferProgress,
  TransferStatus,
} from "../types";
import { isTauri, apiBase, freeUploadLimitBytes } from "../constants";
import {
  shouldFallbackToSftp,
  buildRemotePath,
  createId,
  formatBytes,
} from "../utils";
import type { ConnectionConfig } from "./useConnection";

interface UseTransferQueueParams {
  connectionConfig: ConnectionConfig;
  connected: boolean;
  remotePath: string;
  localPath: string;
  localEntries: LocalEntry[];
  remoteEntries: FtpEntry[];
  isPremium: boolean;
  uploadLimitKbps: number;
  downloadLimitKbps: number;
  addLog: (level: string, message: string) => void;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
}

export function useTransferQueue({
  connectionConfig,
  connected,
  remotePath,
  localPath,
  localEntries,
  remoteEntries,
  isPremium,
  uploadLimitKbps,
  downloadLimitKbps,
  addLog,
  setLogs,
}: UseTransferQueueParams) {
  const [queue, setQueue] = useState<TransferItem[]>([]);
  const [activeTransferIds, setActiveTransferIds] = useState<Set<string>>(new Set());
  const maxConcurrentTransfers = isTauri ? 1 : 3;

  const activeCount = useMemo(
    () => queue.filter((item) => item.status === "active").length,
    [queue]
  );

  const enqueueUploadPaths = async (paths: string[]) => {
    if (!connected) {
      addLog("error", "Connect to a server first.");
      return;
    }
    const entryMap = new Map(localEntries.map((entry) => [entry.path, entry]));
    const items: TransferItem[] = [];
    let blocked = 0;

    for (const path of paths) {
      const entry = entryMap.get(path);
      if (!entry) continue;

      if (entry.is_dir) {
        if (!isTauri) {
          addLog("info", `Folder upload "${entry.name}" is only supported in the desktop app.`);
          continue;
        }
        try {
          const children: { relative_path: string; is_dir: boolean; size: number | null }[] =
            await invoke("list_local_files_recursive", { root: entry.path });
          const baseRemote = buildRemotePath(remotePath || "/", entry.name);
          try { await invoke("create_dir", { path: baseRemote }); } catch { /* may exist */ }
          for (const child of children) {
            if (child.is_dir) {
              try {
                await invoke("create_dir", { path: buildRemotePath(baseRemote, child.relative_path) });
              } catch { /* may exist */ }
            }
          }
          for (const child of children) {
            if (!child.is_dir) {
              items.push({
                id: createId(),
                direction: "upload",
                name: child.relative_path.split("/").pop() || child.relative_path,
                localPath: entry.path + "\\" + child.relative_path.replace(/\//g, "\\"),
                remotePath: buildRemotePath(baseRemote, child.relative_path),
                status: "queued",
                transferred: 0,
                total: child.size ?? null,
                file: null,
              });
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addLog("error", `Failed to list folder "${entry.name}": ${message}`);
        }
        continue;
      }

      if (!isPremium && !isTauri && (entry.size ?? 0) > freeUploadLimitBytes) {
        blocked += 1;
        continue;
      }
      const remoteTarget = buildRemotePath(remotePath || "/", entry.name);
      items.push({
        id: createId(),
        direction: "upload",
        name: entry.name,
        localPath: entry.path,
        remotePath: remoteTarget,
        status: "queued",
        transferred: 0,
        total: entry.size ?? null,
        file: entry.file ?? null,
      });
    }

    if (!items.length) {
      addLog("error", "Select local files to upload.");
      return;
    }
    if (blocked > 0) {
      addLog(
        "info",
        `Free plan limit: ${blocked} file${blocked === 1 ? "" : "s"} over ${formatBytes(freeUploadLimitBytes)} were skipped.`
      );
    }
    setQueue((prev) => [...prev, ...items]);
  };

  const enqueueDownloadNames = async (names: string[]) => {
    if (!connected) {
      addLog("error", "Connect to a server first.");
      return;
    }
    const items: TransferItem[] = [];

    for (const name of names) {
      const entry = remoteEntries.find((item) => item.name === name);
      if (!entry) continue;

      if (entry.is_dir) {
        if (!isTauri) {
          addLog("info", `Folder download "${entry.name}" is only supported in the desktop app.`);
          continue;
        }
        if (!localPath || localPath === "this_pc") {
          addLog("error", "Pick a local folder first.");
          continue;
        }
        try {
          const fullRemote = buildRemotePath(remotePath || "/", entry.name);
          const children: { relative_path: string; is_dir: boolean; size: number | null }[] =
            await invoke("list_remote_files_recursive", { path: fullRemote });
          const baseLocal = await join(localPath, entry.name);
          try { await invoke("create_local_dir", { path: baseLocal }); } catch { /* may exist */ }
          for (const child of children) {
            if (child.is_dir) {
              try {
                const dirPath = await join(baseLocal, ...child.relative_path.split("/"));
                await invoke("create_local_dir", { path: dirPath });
              } catch { /* may exist */ }
            }
          }
          for (const child of children) {
            if (!child.is_dir) {
              const fileName = child.relative_path.split("/").pop() || child.relative_path;
              const childLocalPath = await join(baseLocal, ...child.relative_path.split("/"));
              items.push({
                id: createId(),
                direction: "download",
                name: fileName,
                localPath: childLocalPath,
                remotePath: buildRemotePath(fullRemote, child.relative_path),
                status: "queued",
                transferred: 0,
                total: child.size ?? null,
              });
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addLog("error", `Failed to list remote folder "${entry.name}": ${message}`);
        }
        continue;
      }

      items.push({
        id: createId(),
        direction: "download",
        name: entry.name,
        localPath: localPath || "browser",
        remotePath: buildRemotePath(remotePath || "/", entry.name),
        status: "queued",
        transferred: 0,
        total: entry.size ?? null,
      });
    }

    if (!items.length) {
      addLog("error", "Select remote files to download.");
      return;
    }

    if (!isTauri) {
      setQueue((prev) => [...prev, ...items]);
      return;
    }

    if (!localPath || localPath === "this_pc") {
      addLog("error", "Pick a local folder first.");
      return;
    }

    const queued = await Promise.all(
      items.map(async (item) => {
        if (item.localPath !== localPath && item.localPath !== "browser") return item;
        return { ...item, localPath: await join(item.localPath, item.name) };
      })
    );

    setQueue((prev) => [...prev, ...queued]);
  };

  // Web transfer helpers
  const uploadWebTransfer = async (item: TransferItem) => {
    if (!item.file) throw new Error("Missing local file for upload.");
    if (!isPremium && item.file.size > freeUploadLimitBytes) {
      throw new Error(`Free plan upload limit is ${formatBytes(freeUploadLimitBytes)}.`);
    }
    const { host, port, username, password, protocol, sftpPort } = connectionConfig;
    const send = async (protocolOverride?: "ftp" | "sftp") => {
      const actualProtocol = protocolOverride ?? protocol;
      const form = new FormData();
      form.append("host", host);
      form.append("port", String(port));
      form.append("username", username);
      form.append("password", password);
      form.append("remotePath", item.remotePath);
      form.append("protocol", actualProtocol);
      form.append("sftpPort", String(sftpPort));
      form.append("tier", isPremium ? "premium" : "free");
      if (isPremium && uploadLimitKbps > 0) {
        form.append("uploadLimitKbps", String(uploadLimitKbps));
      }
      form.append("file", item.file!, item.name);
      const response = await fetch(`${apiBase}/api/ftp/upload`, { method: "POST", body: form });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
    };
    try { await send(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldFallbackToSftp(message)) throw error;
      await send("sftp");
    }
  };

  const downloadWebTransfer = async (item: TransferItem) => {
    const { host, port, username, password, protocol, sftpPort } = connectionConfig;
    const send = async (protocolOverride?: "ftp" | "sftp") => {
      const actualProtocol = protocolOverride ?? protocol;
      const response = await fetch(`${apiBase}/api/ftp/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host, port, username, password,
          remotePath: item.remotePath,
          filename: item.name,
          tier: isPremium ? "premium" : "free",
          downloadLimitKbps: isPremium ? downloadLimitKbps : 0,
          protocol: actualProtocol,
          sftpPort: actualProtocol === "sftp" ? sftpPort : undefined,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.name;
      link.click();
      URL.revokeObjectURL(url);
    };
    try { await send(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldFallbackToSftp(message)) throw error;
      await send("sftp");
    }
  };

  // Tauri event listeners for transfer progress/completion/errors
  useEffect(() => {
    if (!isTauri) return;
    const progressBuffer = new Map<string, { transferred: number; total?: number | null }>();
    let progressFlushTimer: ReturnType<typeof setInterval> | null = null;

    const flushProgress = () => {
      if (progressBuffer.size === 0) return;
      const updates = new Map(progressBuffer);
      progressBuffer.clear();
      setQueue((prev) =>
        prev.map((item) => {
          const update = updates.get(item.id);
          if (!update) return item;
          return { ...item, transferred: update.transferred, total: update.total ?? item.total };
        })
      );
    };

    const setup = async () => {
      progressFlushTimer = setInterval(flushProgress, 500);
      const unlistenLog = await listen<LogEntry>("log", (event) => {
        setLogs((prev) => [event.payload, ...prev.slice(0, 199)]);
      });
      const unlistenProgress = await listen<TransferProgress>("transfer-progress", (event) => {
        progressBuffer.set(event.payload.id, {
          transferred: event.payload.transferred,
          total: event.payload.total,
        });
      });
      const unlistenComplete = await listen<{ id: string }>("transfer-complete", (event) => {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === event.payload.id
              ? { ...item, status: "done", transferred: item.total ?? item.transferred }
              : item
          )
        );
      });
      const unlistenError = await listen<TransferErrorPayload>("transfer-error", (event) => {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === event.payload.id
              ? { ...item, status: "error", message: event.payload.message }
              : item
          )
        );
      });
      return () => { unlistenLog(); unlistenProgress(); unlistenComplete(); unlistenError(); };
    };

    const cleanupPromise = setup();
    return () => {
      if (progressFlushTimer) clearInterval(progressFlushTimer);
      flushProgress();
      cleanupPromise.then((cleanup) => cleanup()).catch(() => null);
    };
  }, []);

  // Queue processor — picks up queued items and runs transfers
  useEffect(() => {
    if (activeTransferIds.size >= maxConcurrentTransfers || !queue.length) return;
    const next = queue.find((item) => item.status === "queued");
    if (!next) return;

    setActiveTransferIds((prev) => new Set(prev).add(next.id));
    setQueue((prev) =>
      prev.map((item) => (item.id === next.id ? { ...item, status: "active" } : item))
    );

    const runTransfer = async () => {
      try {
        if (isTauri) {
          if (next.direction === "upload") {
            await invoke("upload_file", { id: next.id, localPath: next.localPath, remotePath: next.remotePath });
          } else {
            await invoke("download_file", { id: next.id, remotePath: next.remotePath, localPath: next.localPath });
          }
        } else {
          if (next.direction === "upload") {
            await uploadWebTransfer(next);
          } else {
            await downloadWebTransfer(next);
          }
          setQueue((prev) =>
            prev.map((item) =>
              item.id === next.id
                ? { ...item, status: "done", transferred: item.total ?? item.transferred }
                : item
            )
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog("error", message);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === next.id ? { ...item, status: "error", message } : item
          )
        );
      } finally {
        setActiveTransferIds((prev) => {
          const updated = new Set(prev);
          updated.delete(next.id);
          return updated;
        });
      }
    };

    runTransfer();
  }, [activeTransferIds.size, queue, connectionConfig.host, connectionConfig.port, connectionConfig.username, connectionConfig.password]);

  const clearCompletedTransfers = () => {
    setQueue((prev) => prev.filter((item) => item.status !== "done"));
  };

  const cancelQueuedTransfers = () => {
    setQueue((prev) => prev.filter((item) => item.status !== "queued"));
  };

  const retryFailedTransfers = () => {
    setQueue((prev) =>
      prev.map((item) =>
        item.status === "error"
          ? { ...item, status: "queued" as TransferStatus, transferred: 0, message: null }
          : item
      )
    );
  };

  const clearAllTransfers = () => {
    if (activeCount > 0) {
      setQueue((prev) => prev.filter((item) => item.status === "active"));
    } else {
      setQueue([]);
    }
  };

  return {
    queue, setQueue,
    activeTransferIds,
    activeCount,
    enqueueUploadPaths,
    enqueueDownloadNames,
    clearCompletedTransfers,
    cancelQueuedTransfers,
    retryFailedTransfers,
    clearAllTransfers,
  };
}
