import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { ConnectResponse, FtpBookmark } from "../types";
import { isTauri } from "../constants";
import { ftpRequest, loadFtpBookmarks, saveFtpBookmarks } from "../utils";

interface UseConnectionParams {
  addLog: (level: string, message: string) => void;
}

export function useConnection({ addLog }: UseConnectionParams) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(21);
  const [protocol, setProtocol] = useState<"ftp" | "sftp">("ftp");
  const [sftpPort, setSftpPort] = useState(22);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionDetailOpen, setConnectionDetailOpen] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [ftpBookmarks, setFtpBookmarks] = useState<FtpBookmark[]>(loadFtpBookmarks());
  const [selectedFtpBookmark, setSelectedFtpBookmark] = useState("");
  const [savePassword, setSavePassword] = useState(false);

  useEffect(() => {
    setConnectionDetailOpen(!connected);
  }, [connected]);

  /** Attempts connection. Returns the remote cwd on success, throws on failure. */
  const connect = async (): Promise<string> => {
    if (isTauri && protocol === "sftp") {
      throw new Error("SFTP is available in the web app only.");
    }
    if (!host) {
      throw new Error("Host is required.");
    }
    setConnecting(true);
    try {
      const response = isTauri
        ? await invoke<ConnectResponse>("connect", {
            config: { host, port, username, password },
          })
        : await ftpRequest<ConnectResponse>("connect", {
            host, port, username, password, protocol, sftpPort,
          });
      setConnected(true);
      return response.cwd || "/";
    } finally {
      setConnecting(false);
    }
  };

  /** Disconnects from the server. Clears connection state only — caller resets remote browser. */
  const disconnect = async () => {
    if (isTauri) {
      try {
        await invoke("disconnect");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog("error", message);
      }
    }
    setConnected(false);
  };

  const handleFtpBookmarkSelect = (value: string) => {
    setSelectedFtpBookmark(value);
    const selected = ftpBookmarks.find((item) => item.name === value);
    if (!selected) return;
    setHost(selected.host);
    setPort(selected.port);
    setUsername(selected.username);
    setPassword(selected.password ?? "");
    setSavePassword(Boolean(selected.password));
  };

  const deleteFtpBookmark = (name: string) => {
    const next = ftpBookmarks.filter((item) => item.name !== name);
    setFtpBookmarks(next);
    saveFtpBookmarks(next);
    if (selectedFtpBookmark === name) {
      setSelectedFtpBookmark("");
    }
  };

  const saveFtpBookmark = (name: string) => {
    const next = ftpBookmarks.filter((item) => item.name !== name);
    next.unshift({
      name,
      host,
      port,
      username,
      password: savePassword ? password : null,
    });
    setFtpBookmarks(next);
    saveFtpBookmarks(next);
    setSelectedFtpBookmark(name);
  };

  const connectionConfig = { host, port, username, password, protocol, sftpPort };

  return {
    host, setHost, port, setPort, protocol, setProtocol,
    sftpPort, setSftpPort, username, setUsername, password, setPassword,
    connected, setConnected, connecting,
    connectionDetailOpen, setConnectionDetailOpen,
    ftpBookmarks, selectedFtpBookmark, savePassword, setSavePassword,
    connectionConfig,
    connect, disconnect,
    handleFtpBookmarkSelect, deleteFtpBookmark, saveFtpBookmark,
  };
}

export type ConnectionConfig = ReturnType<typeof useConnection>["connectionConfig"];
