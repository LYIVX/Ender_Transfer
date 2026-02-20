import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { FtpEntry, ListResponse, SortBy, SortOrder, ViewMode } from "../types";
import { isTauri, viewModeOptions, sortPrimaryOptions, sortMoreOptions } from "../constants";
import { ftpRequest, getExtension, sortEntries, toTimestamp } from "../utils";
import type { ConnectionConfig } from "./useConnection";

interface UseRemoteBrowserParams {
  connectionConfig: ConnectionConfig;
  connected: boolean;
  addLog: (level: string, message: string) => void;
}

export function useRemoteBrowser({ connectionConfig, connected, addLog }: UseRemoteBrowserParams) {
  const [remotePath, setRemotePath] = useState("/");
  const [remoteEntries, setRemoteEntries] = useState<FtpEntry[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string[]>([]);
  const [lastRemoteIndex, setLastRemoteIndex] = useState<number | null>(null);
  const [remoteSearch, setRemoteSearch] = useState("");
  const [remoteAddress, setRemoteAddress] = useState("/");

  const [remoteViewMode, setRemoteViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("viewModeRemote") ?? localStorage.getItem("viewMode");
    if (stored && viewModeOptions.some((item) => item.value === stored)) {
      return stored as ViewMode;
    }
    return "details";
  });
  const [remoteSortBy, setRemoteSortBy] = useState<SortBy>(() => {
    const stored = localStorage.getItem("sortByRemote") ?? localStorage.getItem("sortBy");
    const available = [...sortPrimaryOptions, ...sortMoreOptions];
    if (stored && available.some((item) => item.value === stored)) {
      return stored as SortBy;
    }
    return "name";
  });
  const [remoteSortOrder, setRemoteSortOrder] = useState<SortOrder>(() => {
    const stored = localStorage.getItem("sortOrderRemote") ?? localStorage.getItem("sortOrder");
    return stored === "desc" ? "desc" : "asc";
  });

  // Sync address bar with path
  useEffect(() => {
    setRemoteAddress(remotePath || "/");
  }, [remotePath]);

  // Persist view/sort preferences
  useEffect(() => { localStorage.setItem("viewModeRemote", remoteViewMode); }, [remoteViewMode]);
  useEffect(() => { localStorage.setItem("sortByRemote", remoteSortBy); }, [remoteSortBy]);
  useEffect(() => { localStorage.setItem("sortOrderRemote", remoteSortOrder); }, [remoteSortOrder]);

  const refreshRemote = async (path?: string, force?: boolean) => {
    if (!connected && !force) return;
    try {
      const { host, port, username, password, protocol, sftpPort } = connectionConfig;
      const response = isTauri
        ? await invoke<ListResponse>("list_dir", { path: path ?? null })
        : await ftpRequest<ListResponse>("list", {
            host, port, username, password, path: path ?? null, protocol, sftpPort,
          });
      setRemoteEntries(response.entries);
      setRemotePath(response.cwd || "/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const jumpRemoteUp = async () => {
    if (!remotePath) return;
    const trimmed = remotePath.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    const parent = idx <= 0 ? "/" : trimmed.slice(0, idx);
    if (parent && parent !== remotePath) {
      refreshRemote(parent);
    }
  };

  const reset = () => {
    setRemoteEntries([]);
    setRemotePath("/");
    setSelectedRemote([]);
  };

  const filteredRemoteEntries = useMemo(() => {
    const query = remoteSearch.trim().toLowerCase();
    const filtered = query
      ? remoteEntries.filter((entry) => entry.name.toLowerCase().includes(query))
      : remoteEntries;
    const getValue = (entry: FtpEntry) => {
      switch (remoteSortBy) {
        case "type":
          return getExtension(entry.name);
        case "size":
          return entry.size ?? 0;
        case "date":
        case "date-modified":
        case "date-created":
        case "date-taken":
          return toTimestamp(entry.modified ?? null);
        case "tags":
        case "dimensions":
        case "rating":
        default:
          return entry.name.toLowerCase();
      }
    };
    return sortEntries(filtered, remoteSortBy, remoteSortOrder, getValue);
  }, [remoteEntries, remoteSearch, remoteSortBy, remoteSortOrder]);

  return {
    remotePath, setRemotePath,
    remoteEntries, setRemoteEntries,
    selectedRemote, setSelectedRemote,
    lastRemoteIndex, setLastRemoteIndex,
    remoteSearch, setRemoteSearch,
    remoteAddress, setRemoteAddress,
    remoteViewMode, setRemoteViewMode,
    remoteSortBy, setRemoteSortBy,
    remoteSortOrder, setRemoteSortOrder,
    filteredRemoteEntries,
    refreshRemote, jumpRemoteUp, reset,
  };
}
