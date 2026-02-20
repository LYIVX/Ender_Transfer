import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/tauri";
import { open as openDialog } from "@tauri-apps/api/dialog";
import { AccessGate, Button, Dropdown, Input, MainHeader, PreferencesModal, SideMenu, SideMenuSubmenu, Toggle } from "@enderfall/ui";
import type {
  ContextMenuEntry,
  ContextMenuState,
  RenameState,
  ClipboardState,
  PreviewState,
  FtpEntry,
  LocalEntry,
  LogEntry,
  ModalState,
  DragPayload,
  SortBy,
  SortOrder,
  ThemeMode,
} from "./types";
import { isTauri, apiBase, themeOptions } from "./constants";
import {
  shouldFallbackToSftp,
  ftpRequest,
  openLink,
  isImageFile,
  isVideoFile,
  toImageKey,
  toVideoKey,
  buildRemotePath,
  normalizeLocalInput,
  parseDragPayload,
  toLocalFileId,
} from "./utils";
import { IconChevronDown } from "./icons";
import { dirname, join } from "@tauri-apps/api/path";
import ConnectionPanel from "./components/ConnectionPanel";
import Sidebar from "./components/Sidebar";
import TransferPanel from "./components/TransferPanel";
import DetailsPanel from "./components/DetailsPanel";
import ActivityLog from "./components/ActivityLog";
import ContextMenuComponent from "./components/ContextMenu";
import PreviewModal from "./components/PreviewModal";
import AppModals from "./components/AppModals";
import LocalPane from "./components/LocalPane";
import RemotePane from "./components/RemotePane";
import {
  useHistory,
  useThemePreferences,
  useEntitlement,
  useResizeHandles,
  useConnection,
  useRemoteBrowser,
  useLocalBrowser,
  useTransferQueue,
} from "./hooks";

export default function App() {
  const shellRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalValue, setModalValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const localPaneRef = useRef<HTMLDivElement | null>(null);
  const remotePaneRef = useRef<HTMLDivElement | null>(null);
  const [softDragTarget, setSoftDragTarget] = useState<"local" | "remote" | null>(null);
  const [menuOpen, setMenuOpen] = useState<"file" | "edit" | "view" | "help" | null>(null);
  const menuCloseRef = useRef<number | null>(null);
  const [activePane, setActivePane] = useState<"local" | "remote">("local");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextPaneSortOpen, setContextPaneSortOpen] = useState(false);
  const appRef = useRef<HTMLDivElement | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [clipboardState, setClipboardState] = useState<ClipboardState | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // ── Logging (defined early so hooks can use addLog) ──
  const formatErrorMessage = (raw: string) => {
    let text = raw.trim();
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) {
          text = String(parsed.error).trim();
        }
      } catch {
        // keep original
      }
    }

    if (/^Error:\s*/i.test(text)) {
      text = text.replace(/^Error:\s*/i, "").trim();
    }

    if (/getaddrinfo ENOTFOUND/i.test(text)) {
      const match = text.match(/ENOTFOUND\s+([^\s]+)/i);
      const host = match?.[1] ? ` (${match[1]})` : "";
      return `Host not found${host}. Check the server address.`;
    }
    if (/ECONNREFUSED/i.test(text)) {
      return "Connection refused by server. Check host, port, or firewall.";
    }
    if (/ETIMEDOUT/i.test(text)) {
      return "Connection timed out. Check the server address and port.";
    }
    if (/ECONNRESET/i.test(text)) {
      return "Connection reset by server.";
    }
    if (/530\b/.test(text) || /login/i.test(text)) {
      return "Login failed. Check username and password.";
    }

    return text;
  };

  const addLog = (level: string, message: string) => {
    const safeMessage = level === "error" ? formatErrorMessage(message) : message;
    setLogs((prev) => [
      { level, message: safeMessage, timestamp: Date.now() },
      ...prev.slice(0, 199),
    ]);
  };

  // ── Hooks ──
  const prefs = useThemePreferences();
  const {
    themeMode, setThemeMode,
    animationsEnabled, setAnimationsEnabled,
    openOnStartup, setOpenOnStartup,
    minimizeToTray, setMinimizeToTray,
    closeToTray, setCloseToTray,
    uploadLimitKbps, setUploadLimitKbps,
    downloadLimitKbps, setDownloadLimitKbps,
  } = prefs;

  const entitlement = useEntitlement();
  const {
    entitlementStatus, isPremium, displayName, avatarUrl, avatarUrlFallback,
    handleOpenAppBrowser, openProfile,
  } = entitlement;

  const resize = useResizeHandles({ shellRef, workspaceRef, sidebarRef, detailsRef });
  const { startResize, startResizeVertical } = resize;

  const { pushHistory, undoLast, redoLast, canUndo, canRedo } = useHistory(addLog);

  const {
    host, setHost, port, setPort, protocol, setProtocol,
    sftpPort, setSftpPort, username, setUsername, password, setPassword,
    connected, connecting,
    connectionDetailOpen, setConnectionDetailOpen,
    ftpBookmarks, selectedFtpBookmark, savePassword, setSavePassword,
    connectionConfig,
    connect, disconnect,
    handleFtpBookmarkSelect, deleteFtpBookmark, saveFtpBookmark,
  } = useConnection({ addLog });

  const {
    remotePath,
    remoteEntries,
    selectedRemote, setSelectedRemote,
    lastRemoteIndex, setLastRemoteIndex,
    remoteSearch, setRemoteSearch,
    remoteAddress, setRemoteAddress,
    remoteViewMode, setRemoteViewMode,
    remoteSortBy, setRemoteSortBy,
    remoteSortOrder, setRemoteSortOrder,
    filteredRemoteEntries,
    refreshRemote, jumpRemoteUp, reset: resetRemote,
  } = useRemoteBrowser({ connectionConfig, connected, addLog });

  const {
    localPath,
    localEntries, setLocalEntries,
    selectedLocal, setSelectedLocal,
    lastLocalIndex, setLastLocalIndex,
    localSearch, setLocalSearch,
    localAddress, setLocalAddress,
    localViewMode, setLocalViewMode,
    localSortBy, setLocalSortBy,
    localSortOrder, setLocalSortOrder,
    favorites, localBookmarks,
    imageCache, setImageCache,
    videoThumbCache,
    videoPreviewCache, setVideoPreviewCache,
    videoPreviewErrors, setVideoPreviewErrors,
    blobUrlsRef,
    filteredLocalEntries,
    refreshLocal, jumpLocalUp, addLocalFiles,
    addLocalBookmark, removeLocalBookmark,
  } = useLocalBrowser({ addLog, isPremium });

  const {
    queue,
    activeCount,
    enqueueUploadPaths, enqueueDownloadNames,
    clearCompletedTransfers, cancelQueuedTransfers,
    retryFailedTransfers, clearAllTransfers,
  } = useTransferQueue({
    connectionConfig, connected, remotePath, localPath,
    localEntries, remoteEntries, isPremium,
    uploadLimitKbps, downloadLimitKbps, addLog, setLogs,
  });

  // Refs for stable keyboard handler (avoids re-registering listener every render)
  const keyboardRef = useRef<{
    contextMenu: typeof contextMenu;
    activePane: string;
    selectedLocal: string[];
    selectedRemote: string[];
    localPath: string;
    remotePath: string;
    localEntries: LocalEntry[];
    remoteEntries: FtpEntry[];
    openActiveDelete: () => void;
    openActiveRename: () => void;
    undoLast: () => void;
    redoLast: () => void;
    openEntry: (e: { scope: string; name: string; path: string; isDir: boolean; isImage: boolean; isVideo: boolean }) => void;
    addLog: (level: string, message: string) => void;
    setSelectedLocal: (v: string[]) => void;
    setSelectedRemote: (v: string[]) => void;
  } | null>(null);

  const closeContextMenu = () => setContextMenu(null);

  const openContextMenu = (
    event: ReactMouseEvent,
    entry: ContextMenuEntry
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setActivePane(entry.scope);
    if (entry.scope === "local") {
      setSelectedLocal([entry.path]);
    } else {
      setSelectedRemote([entry.name]);
    }
    const menuWidth = 260;
    const menuHeight = 420;
    const margin = 12;
    const minX = margin;
    const minY = margin;
    const maxX = window.innerWidth - menuWidth - margin;
    const maxY = window.innerHeight - menuHeight - margin;
    const nextX = Math.max(minX, Math.min(event.clientX, maxX));
    const nextY = Math.max(minY, Math.min(event.clientY, maxY));
    setContextMenu(null);
    requestAnimationFrame(() => {
      setContextMenu({ kind: "entry", x: nextX, y: nextY, entry });
    });
  };

  const openPaneContextMenu = (
    event: ReactMouseEvent,
    scope: "local" | "remote"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 260;
    const menuHeight = 320;
    const margin = 12;
    const minX = margin;
    const minY = margin;
    const maxX = window.innerWidth - menuWidth - margin;
    const maxY = window.innerHeight - menuHeight - margin;
    const nextX = Math.max(minX, Math.min(event.clientX, maxX));
    const nextY = Math.max(minY, Math.min(event.clientY, maxY));
    setContextMenu(null);
    requestAnimationFrame(() => {
      setContextMenu({ kind: "pane", x: nextX, y: nextY, scope });
    });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const root = document.documentElement;
    root.style.setProperty("--context-menu-x", `${contextMenu.x}px`);
    root.style.setProperty("--context-menu-y", `${contextMenu.y}px`);
    return () => {
      root.style.removeProperty("--context-menu-x");
      root.style.removeProperty("--context-menu-y");
    };
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu) return;
    setContextPaneSortOpen(false);
  }, [contextMenu]);


  useEffect(() => {
    if (!contextMenu) return;
    const raf = requestAnimationFrame(() => {
      const menu = document.querySelector(".context-menu.ef-modal") as HTMLElement | null;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      const margin = 12;
      const minX = margin;
      const minY = margin;
      const maxX = window.innerWidth - rect.width - margin;
      const maxY = window.innerHeight - rect.height - margin;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), Math.max(min, max));
      const nextX = clamp(contextMenu.x, minX, maxX);
      const nextY = clamp(contextMenu.y, minY, maxY);
      if (nextX === contextMenu.x && nextY === contextMenu.y) return;
      setContextMenu((prev) =>
        prev ? { ...prev, x: nextX, y: nextY } : prev
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".context-menu")) return;
      closeContextMenu();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  /* ── Global keyboard shortcuts (registered once, reads from ref) ── */
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      const s = keyboardRef.current;
      if (!s) return;
      // Skip when user is typing in an input / textarea / contentEditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      // Skip when a modal or context menu is open
      if (s.contextMenu) return;

      // Delete – delete selected item
      if (e.key === "Delete") {
        e.preventDefault();
        s.openActiveDelete();
        return;
      }
      // F2 – rename selected item
      if (e.key === "F2") {
        e.preventDefault();
        s.openActiveRename();
        return;
      }
      // Ctrl+Z – undo
      if (e.ctrlKey && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        s.undoLast();
        return;
      }
      // Ctrl+Y – redo
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        s.redoLast();
        return;
      }
      // Ctrl+Shift+C – copy path
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        (async () => {
          let value = "";
          if (s.activePane === "local") {
            value = s.selectedLocal[0] ?? s.localPath;
          } else {
            const sel = s.selectedRemote[0];
            value = sel ? buildRemotePath(s.remotePath || "/", sel) : s.remotePath || "/";
          }
          if (!value) return;
          try {
            await navigator.clipboard.writeText(value);
            s.addLog("info", "Path copied to clipboard.");
          } catch {
            s.addLog("error", "Unable to copy path.");
          }
        })();
        return;
      }
      // Ctrl+A – select all in active pane
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        if (s.activePane === "local") {
          s.setSelectedLocal(s.localEntries.map((item) => item.path));
        } else {
          s.setSelectedRemote(s.remoteEntries.map((item) => item.name));
        }
        return;
      }
      // Alt+Enter – properties (local only, Tauri only)
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        if (s.activePane === "local" && isTauri) {
          const target = s.selectedLocal[0] ?? s.localPath;
          if (target && target !== "this_pc") {
            invoke("open_properties", { path: target }).catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              s.addLog("error", message);
            });
          }
        }
        return;
      }
      // Enter – open selected item
      if (e.key === "Enter") {
        e.preventDefault();
        if (s.activePane === "local") {
          const target = s.selectedLocal[0];
          const entry = s.localEntries.find((item) => item.path === target);
          if (entry) {
            s.openEntry({
              scope: "local",
              name: entry.name,
              path: entry.path,
              isDir: entry.is_dir,
              isImage: !entry.is_dir && isImageFile(entry.name),
              isVideo: !entry.is_dir && isVideoFile(entry.name),
            });
          }
        } else {
          const target = s.selectedRemote[0];
          const entry = s.remoteEntries.find((item) => item.name === target);
          if (entry) {
            s.openEntry({
              scope: "remote",
              name: entry.name,
              path: buildRemotePath(s.remotePath || "/", entry.name),
              isDir: entry.is_dir,
              isImage: !entry.is_dir && isImageFile(entry.name),
              isVideo: !entry.is_dir && isVideoFile(entry.name),
            });
          }
        }
        return;
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const detailsItem = useMemo(() => {
    if (activePane === "local") {
      const target = selectedLocal[0];
      const entry = localEntries.find((item) => item.path === target);
      if (!entry) return null;
      return {
        scope: "Local",
        name: entry.name,
        path: entry.path,
        size: entry.size ?? null,
        modified: entry.modified ?? null,
        created: entry.created ?? null,
        taken: entry.taken ?? null,
        dimensions: entry.dimensions ?? null,
        rating: entry.rating ?? null,
        tags: entry.tags ?? null,
        isDir: entry.is_dir,
        file: entry.file ?? null,
      };
    }

    const target = selectedRemote[0];
    const entry = remoteEntries.find((item) => item.name === target);
    if (!entry) return null;
    return {
      scope: "Remote",
      name: entry.name,
      path: buildRemotePath(remotePath || "/", entry.name),
      size: entry.size ?? null,
      modified: entry.modified ?? null,
      created: null,
      taken: null,
      dimensions: null,
      rating: null,
      tags: null,
      isDir: entry.is_dir,
    };
  }, [activePane, selectedLocal, selectedRemote, localEntries, remoteEntries, remotePath]);

  const openEntry = (entry: {
    scope: "local" | "remote";
    name: string;
    path: string;
    isDir: boolean;
    isImage: boolean;
    isVideo: boolean;
  }) => {
    if (entry.isDir) {
      if (entry.scope === "local") {
        refreshLocal(entry.path);
      } else {
        refreshRemote(buildRemotePath(remotePath || "/", entry.name));
      }
      return;
    }
    if (entry.scope === "local" && (entry.isImage || entry.isVideo)) {
      setPreviewState({
        name: entry.name,
        path: entry.path,
        isImage: entry.isImage,
        isVideo: entry.isVideo,
        scope: entry.scope,
      });
      return;
    }
    if (entry.scope === "local") {
      if (!isTauri) {
        addLog("error", "Opening local files requires the desktop app.");
        return;
      }
      invoke("launch_path", { path: entry.path }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        addLog("error", message);
      });
      return;
    }
    enqueueDownloadNames([entry.name]).catch(() => null);
  };

  const handleContextOpen = () => {
    if (!contextMenu) return;
    if (contextMenu.kind !== "entry") return;
    const { entry } = contextMenu;
    closeContextMenu();
    openEntry(entry);
  };

  const handleContextRename = () => {
    if (!contextMenu) return;
    if (contextMenu.kind !== "entry") return;
    const { entry } = contextMenu;
    closeContextMenu();
    startInlineRename(entry);
  };

  const handleContextDelete = () => {
    if (!contextMenu) return;
    if (contextMenu.kind !== "entry") return;
    const { entry } = contextMenu;
    closeContextMenu();
    if (entry.scope === "local") {
      openModalForDelete("local", {
        name: entry.name,
        path: entry.path,
        isDir: entry.isDir,
      });
    } else {
      openModalForDelete("remote", {
        name: entry.name,
        path: entry.name,
        isDir: entry.isDir,
      });
    }
  };

  const handleContextProperties = () => {
    if (!contextMenu) return;
    if (contextMenu.kind !== "entry") return;
    const { entry } = contextMenu;
    closeContextMenu();
    if (entry.scope === "local") {
      if (!isTauri) {
        addLog("error", "Properties are only available in the desktop app.");
        return;
      }
      invoke("open_properties", { path: entry.path }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        addLog("error", message);
      });
      return;
    }
    setActivePane("remote");
    setSelectedRemote([entry.name]);
  };

  const handleContextCopyPath = async () => {
    if (!contextEntry) return;
    const value = contextEntry.path;
    closeContextMenu();
    try {
      if (!navigator.clipboard) {
        addLog("error", "Clipboard unavailable.");
        return;
      }
      await navigator.clipboard.writeText(value);
      addLog("info", "Path copied to clipboard.");
    } catch {
      addLog("error", "Unable to copy path.");
    }
  };

  const handleContextCut = () => {
    if (!contextEntry) return;
    setClipboardState({
      mode: "cut",
      scope: contextEntry.scope,
      entries: [
        {
          name: contextEntry.name,
          path: contextEntry.path,
          isDir: contextEntry.isDir,
        },
      ],
    });
    closeContextMenu();
  };

  const handleContextCopy = () => {
    if (!contextEntry) return;
    setClipboardState({
      mode: "copy",
      scope: contextEntry.scope,
      entries: [
        {
          name: contextEntry.name,
          path: contextEntry.path,
          isDir: contextEntry.isDir,
        },
      ],
    });
    closeContextMenu();
  };

  const handleContextPaste = async () => {
    if (!clipboardState || !contextScope) return;
    const { mode, scope, entries } = clipboardState;
    closeContextMenu();
    try {
      if (contextScope === "local") {
        if (!isTauri) {
          addLog("error", "Pasting into local files requires the desktop app.");
          return;
        }
        if (!localPath || localPath === "this_pc") {
          addLog("error", "Select a local folder to paste into.");
          return;
        }
        const created: { path: string; isDir: boolean }[] = [];
        for (const entry of entries) {
          const target = await join(localPath, entry.name);
          if (scope === "local") {
            if (mode === "cut") {
              await invoke("rename_local", { from: entry.path, to: target });
            } else {
              await invoke("copy_local", { from: entry.path, to: target });
            }
            created.push({ path: target, isDir: entry.isDir });
          } else {
            enqueueDownloadNames([entry.name]).catch(() => null);
          }
        }
        await refreshLocal(localPath);
        if (scope === "local") {
          const actionType = mode === "cut" ? "Move" : "Copy";
          pushHistory({
            label: actionType,
            undo: async () => {
              if (mode === "cut") {
                for (const entry of entries) {
                  const target = await join(localPath, entry.name);
                  await invoke("rename_local", { from: target, to: entry.path });
                }
              } else {
                for (const item of created) {
                  await deleteEntry("local", item.path, item.isDir);
                }
              }
              await refreshLocal(localPath);
            },
            redo: async () => {
              for (const entry of entries) {
                const target = await join(localPath, entry.name);
                if (mode === "cut") {
                  await invoke("rename_local", { from: entry.path, to: target });
                } else {
                  await invoke("copy_local", { from: entry.path, to: target });
                }
              }
              await refreshLocal(localPath);
            },
          });
        }
      } else {
        if (!connected) {
          addLog("error", "Connect to a server to paste.");
          return;
        }
        const created: { path: string; isDir: boolean; name: string }[] = [];
        for (const entry of entries) {
          const target = buildRemotePath(remotePath || "/", entry.name);
          if (scope === "remote") {
            if (mode === "cut") {
              if (isTauri) {
                await invoke("rename_path", { from: entry.path, to: target });
              } else {
                await ftpRequest("rename", {
                  host,
                  port,
                  username,
                  password,
                  from: entry.path,
                  to: target,
                  protocol,
                  sftpPort,
                });
              }
            } else {
              if (isTauri) {
                await invoke("copy_remote", { from: entry.path, to: target, isDir: entry.isDir });
              } else {
                if (entry.isDir) {
                  addLog("error", "Remote folder copy is not supported in the browser.");
                  continue;
                }
                const sendDownload = async (protocolOverride?: "ftp" | "sftp") => {
                  const actualProtocol = protocolOverride ?? protocol;
                  const response = await fetch(`${apiBase}/api/ftp/download`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      host,
                      port,
                      username,
                      password,
                      remotePath: entry.path,
                      filename: entry.name,
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
                  return await response.blob();
                };
                let blob: Blob;
                try {
                  blob = await sendDownload();
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  if (!shouldFallbackToSftp(message)) throw error;
                  blob = await sendDownload("sftp");
                }
                const form = new FormData();
                form.append("host", host);
                form.append("port", String(port));
                form.append("username", username);
                form.append("password", password);
                form.append("protocol", protocol);
                form.append("sftpPort", String(sftpPort));
                form.append("remotePath", target);
                form.append("file", blob, entry.name);
                const response = await fetch(`${apiBase}/api/ftp/upload`, {
                  method: "POST",
                  body: form,
                });
                if (!response.ok) {
                  const text = await response.text();
                  throw new Error(text || response.statusText);
                }
              }
            }
            created.push({ path: target, isDir: entry.isDir, name: entry.name });
          } else {
            enqueueUploadPaths([entry.path]);
          }
        }
        await refreshRemote();
        if (scope === "remote") {
          const actionType = mode === "cut" ? "Move" : "Copy";
          pushHistory({
            label: actionType,
            undo: async () => {
              if (mode === "cut") {
                for (const entry of entries) {
                  const target = buildRemotePath(remotePath || "/", entry.name);
                  if (isTauri) {
                    await invoke("rename_path", { from: target, to: entry.path });
                  } else {
                    await ftpRequest("rename", {
                      host,
                      port,
                      username,
                      password,
                      from: target,
                      to: entry.path,
                      protocol,
                      sftpPort,
                    });
                  }
                }
              } else {
                for (const item of created) {
                  await deleteEntry("remote", item.path, item.isDir);
                }
              }
              await refreshRemote();
            },
            redo: async () => {
              for (const entry of entries) {
                const target = buildRemotePath(remotePath || "/", entry.name);
                if (mode === "cut") {
                  if (isTauri) {
                    await invoke("rename_path", { from: entry.path, to: target });
                  } else {
                    await ftpRequest("rename", {
                      host,
                      port,
                      username,
                      password,
                      from: entry.path,
                      to: target,
                      protocol,
                      sftpPort,
                    });
                  }
                } else {
                  if (isTauri) {
                    await invoke("copy_remote", { from: entry.path, to: target, isDir: entry.isDir });
                  } else {
                    if (entry.isDir) {
                      addLog("error", "Remote folder copy redo not supported in browser.");
                    } else {
                      addLog("error", "Remote copy redo not supported in browser.");
                    }
                  }
                }
              }
              await refreshRemote();
            },
          });
        }
      }
      if (mode === "cut") {
        setClipboardState(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const handleContextNewFolder = () => {
    if (!contextScope) return;
    closeContextMenu();
    createNewFolder(contextScope);
  };

  const handleContextNewTextFile = () => {
    if (!contextScope) return;
    closeContextMenu();
    createNewTextFile(contextScope);
  };

  const handleContextOpenWith = () => {
    if (!contextEntry) return;
    closeContextMenu();
    if (contextEntry.scope !== "local") {
      addLog("error", "Open with is only available for local files.");
      return;
    }
    if (!isTauri) {
      addLog("error", "Open with is only available in the desktop app.");
      return;
    }
    invoke("open_with_dialog", { path: contextEntry.path }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    });
  };

  const selectRange = (keys: string[], start: number, end: number) => {
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    return keys.slice(from, to + 1);
  };

  const applySelection = (
    keys: string[],
    index: number,
    key: string,
    selected: string[],
    setSelected: (value: string[]) => void,
    lastIndex: number | null,
    setLastIndex: (value: number) => void,
    event: React.MouseEvent
  ) => {
    const useRange = event.shiftKey && lastIndex !== null;
    const toggle = event.ctrlKey || event.metaKey;

    if (useRange) {
      const range = selectRange(keys, lastIndex ?? index, index);
      if (toggle) {
        const next = new Set(selected);
        range.forEach((item) => next.add(item));
        setSelected(Array.from(next));
      } else {
        setSelected(range);
      }
    } else if (toggle) {
      if (selected.includes(key)) {
        setSelected(selected.filter((item) => item !== key));
      } else {
        setSelected([...selected, key]);
      }
      setLastIndex(index);
    } else {
      setSelected([key]);
      setLastIndex(index);
    }
  };

  // ── Orchestration wrappers (cross-hook coordination) ──
  const handleConnect = async () => {
    try {
      const cwd = await connect();
      addLog("success", "Connected.");
      await refreshRemote(cwd, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    resetRemote();
    addLog("info", "Disconnected.");
  };

  const openFtpBookmarkModal = () => {
    if (!isPremium) {
      addLog("info", "Premium required to save bookmarks.");
      return;
    }
    if (!host) {
      addLog("error", "Connect details are empty.");
      return;
    }
    setModal({ type: "ftp-bookmark" });
    setModalValue(`${host}`);
  };

  const openPreferences = () => {
    setModal({ type: "prefs" });
  };


  const openMenu = (name: "file" | "edit" | "view" | "help") => {
    if (menuCloseRef.current !== null) {
      window.clearTimeout(menuCloseRef.current);
      menuCloseRef.current = null;
    }
    setMenuOpen(name);
  };

  const closeMenu = () => {
    if (menuCloseRef.current !== null) {
      window.clearTimeout(menuCloseRef.current);
    }
    menuCloseRef.current = window.setTimeout(() => {
      setMenuOpen(null);
      menuCloseRef.current = null;
    }, 150);
  };

  const openActiveRename = () => {
    if (activePane === "local") {
      const target = selectedLocal[0];
      const entry = localEntries.find((item) => item.path === target);
      if (!entry) return;
      startInlineRename({
        scope: "local",
        name: entry.name,
        path: entry.path,
        isDir: entry.is_dir,
        isImage: !entry.is_dir && isImageFile(entry.name),
        isVideo: !entry.is_dir && isVideoFile(entry.name),
      });
    } else {
      const target = selectedRemote[0];
      if (!target) return;
      const entry = remoteEntries.find((item) => item.name === target);
      if (!entry) return;
      startInlineRename({
        scope: "remote",
        name: entry.name,
        path: buildRemotePath(remotePath || "/", entry.name),
        isDir: entry.is_dir,
        isImage: !entry.is_dir && isImageFile(entry.name),
        isVideo: !entry.is_dir && isVideoFile(entry.name),
      });
    }
  };

  const openActiveDelete = () => {
    if (activePane === "local") {
      const target = selectedLocal[0];
      const entry = localEntries.find((item) => item.path === target);
      if (!entry) return;
      openModalForDelete("local", {
        name: entry.name,
        path: entry.path,
        isDir: entry.is_dir,
      });
    } else {
      const target = selectedRemote[0];
      const entry = remoteEntries.find((item) => item.name === target);
      if (!entry) return;
      openModalForDelete("remote", {
        name: entry.name,
        path: entry.name,
        isDir: entry.is_dir,
      });
    }
  };

  const openLocalFolder = async () => {
    if (!isTauri) {
      fileInputRef.current?.click();
      return;
    }
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      refreshLocal(picked);
    }
  };

  const handlePickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length) {
      addLocalFiles(files);
    }
    event.target.value = "";
  };

  const enqueueUpload = () => {
    if (!selectedLocal.length) {
      addLog("error", "Select local files to upload.");
      return;
    }
    enqueueUploadPaths(selectedLocal);
  };

  const enqueueDownload = () => {
    if (!selectedRemote.length) {
      addLog("error", "Select remote files to download.");
      return;
    }
    enqueueDownloadNames(selectedRemote).catch(() => null);
  };

  const openModalForDelete = (scope: "local" | "remote", target: { name: string; path: string; isDir: boolean }) => {
    setModal({
      type: "delete",
      scope,
      targetName: target.name,
      targetPath: target.path,
      isDir: target.isDir,
    });
    setModalValue("");
  };

  const closeModal = () => {
    setModal(null);
    setModalValue("");
  };

  const confirmModal = async () => {
    if (!modal) return;

    try {
      if (modal.type === "delete") {
        if (modal.scope === "local") {
          if (!isTauri) {
            setLocalEntries((prev) => prev.filter((entry) => entry.path !== modal.targetPath));
          } else {
            await invoke("delete_local", { path: modal.targetPath, isDir: modal.isDir });
            await refreshLocal(localPath);
          }
        } else {
          const target = buildRemotePath(remotePath || "/", modal.targetName);
          if (isTauri) {
            await invoke("delete_path", { path: target, isDir: modal.isDir });
          } else {
            await ftpRequest("delete", {
              host,
              port,
              username,
              password,
              path: target,
              is_dir: modal.isDir,
              protocol,
              sftpPort,
            });
          }
          await refreshRemote();
        }
      }

      if (modal.type === "ftp-bookmark") {
        if (!isPremium) {
          addLog("info", "Premium required to save bookmarks.");
          closeModal();
          return;
        }
        const name = modalValue.trim();
        if (!name) {
          addLog("error", "Bookmark name required.");
          return;
        }
        saveFtpBookmark(name);
      }

      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const getUniqueName = (baseName: string, existing: string[]) => {
    const lower = new Set(existing.map((item) => item.toLowerCase()));
    if (!lower.has(baseName.toLowerCase())) return baseName;
    const dotIndex = baseName.lastIndexOf(".");
    const hasExtension = dotIndex > 0 && dotIndex < baseName.length - 1;
    const stem = hasExtension ? baseName.slice(0, dotIndex) : baseName;
    const ext = hasExtension ? baseName.slice(dotIndex) : "";
    let index = 2;
    let candidate = `${stem} (${index})${ext}`;
    while (lower.has(candidate.toLowerCase())) {
      index += 1;
      candidate = `${stem} (${index})${ext}`;
    }
    return candidate;
  };

  const getScopeEntries = (scope: "local" | "remote") =>
    scope === "local" ? localEntries : remoteEntries;

  const deleteEntry = async (scope: "local" | "remote", path: string, isDir: boolean) => {
    if (scope === "local") {
      if (!isTauri) {
        setLocalEntries((prev) => prev.filter((entry) => entry.path !== path));
        return;
      }
      await invoke("delete_local", { path, isDir });
      await refreshLocal(localPath);
      return;
    }
    if (isTauri) {
      await invoke("delete_path", { path, isDir });
    } else {
      await ftpRequest("delete", {
        host,
        port,
        username,
        password,
        path,
        is_dir: isDir,
        protocol,
        sftpPort,
      });
    }
    await refreshRemote();
  };

  const createFolderAt = async (scope: "local" | "remote", path: string) => {
    if (scope === "local") {
      if (!isTauri) {
        addLog("error", "Local folders are not available in the browser.");
        return;
      }
      await invoke("create_local_dir", { path });
      await refreshLocal(localPath);
      return;
    }
    if (isTauri) {
      await invoke("create_dir", { path });
    } else {
      await ftpRequest("mkdir", {
        host,
        port,
        username,
        password,
        path,
        protocol,
        sftpPort,
      });
    }
    await refreshRemote();
  };

  const createFileAt = async (scope: "local" | "remote", path: string, name: string) => {
    if (scope === "local") {
      if (!isTauri) {
        addLog("error", "Local files are not available in the browser.");
        return;
      }
      await invoke("create_local_file", { path });
      await refreshLocal(localPath);
      return;
    }
    if (isTauri) {
      await invoke("create_remote_file", { path });
    } else {
      const blob = new Blob([""], { type: "text/plain" });
      const form = new FormData();
      form.append("host", host);
      form.append("port", String(port));
      form.append("username", username);
      form.append("password", password);
      form.append("protocol", protocol);
      form.append("sftpPort", String(sftpPort));
      form.append("remotePath", path);
      form.append("file", blob, name);
      const response = await fetch(`${apiBase}/api/ftp/upload`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
    }
    await refreshRemote();
  };

  const startInlineRename = (entry: ContextMenuEntry) => {
    setRenameState({
      scope: entry.scope,
      path: entry.path,
      name: entry.name,
      isDir: entry.isDir,
      value: entry.name,
    });
  };

  const cancelInlineRename = () => setRenameState(null);


  /* ── Sync keyboard ref with latest state (cheap assignment, no re-render) ── */
  keyboardRef.current = {
    contextMenu,
    activePane,
    selectedLocal,
    selectedRemote,
    localPath,
    remotePath,
    localEntries,
    remoteEntries,
    openActiveDelete,
    openActiveRename,
    undoLast,
    redoLast,
    openEntry,
    addLog,
    setSelectedLocal,
    setSelectedRemote,
  };

  const commitInlineRename = async () => {
    if (!renameState) return;
    const nextName = renameState.value.trim();
    if (!nextName || nextName === renameState.name) {
      cancelInlineRename();
      return;
    }
    try {
      let toPath = renameState.path;
      if (renameState.scope === "local") {
        if (!isTauri) {
          setLocalEntries((prev) =>
            prev.map((entry) =>
              entry.path === renameState.path
                ? { ...entry, name: nextName }
                : entry
            )
          );
        } else {
          const parent = await dirname(renameState.path);
          const target = await join(parent, nextName);
          toPath = target;
          await invoke("rename_local", { from: renameState.path, to: target });
          await refreshLocal(localPath);
        }
      } else {
        const from = buildRemotePath(remotePath || "/", renameState.name);
        const to = buildRemotePath(remotePath || "/", nextName);
        if (isTauri) {
          await invoke("rename_path", { from, to });
        } else {
          await ftpRequest("rename", {
            host,
            port,
            username,
            password,
            from,
            to,
            protocol,
            sftpPort,
          });
        }
        await refreshRemote();
      }
      const fromName = renameState.name;
      const fromPath = renameState.path;
      const scope = renameState.scope;
      const renameTargetPath = toPath;
      pushHistory({
        label: "Rename",
        undo: async () => {
          if (scope === "local") {
            if (!isTauri) {
              setLocalEntries((prev) =>
                prev.map((entry) =>
                  entry.path === fromPath ? { ...entry, name: fromName } : entry
                )
              );
            } else {
              const parent = await dirname(fromPath);
              const target = await join(parent, fromName);
              await invoke("rename_local", { from: renameTargetPath, to: target });
              await refreshLocal(localPath);
            }
          } else {
            const from = buildRemotePath(remotePath || "/", nextName);
            const to = buildRemotePath(remotePath || "/", fromName);
            if (isTauri) {
              await invoke("rename_path", { from, to });
            } else {
              await ftpRequest("rename", {
                host,
                port,
                username,
                password,
                from,
                to,
                protocol,
                sftpPort,
              });
            }
            await refreshRemote();
          }
        },
        redo: async () => {
          if (scope === "local") {
            if (!isTauri) {
              setLocalEntries((prev) =>
                prev.map((entry) =>
                  entry.path === fromPath ? { ...entry, name: nextName } : entry
                )
              );
            } else {
              const parent = await dirname(fromPath);
              const target = await join(parent, nextName);
              await invoke("rename_local", { from: fromPath, to: target });
              await refreshLocal(localPath);
            }
          } else {
            const from = buildRemotePath(remotePath || "/", fromName);
            const to = buildRemotePath(remotePath || "/", nextName);
            if (isTauri) {
              await invoke("rename_path", { from, to });
            } else {
              await ftpRequest("rename", {
                host,
                port,
                username,
                password,
                from,
                to,
                protocol,
                sftpPort,
              });
            }
            await refreshRemote();
          }
        },
      });
      cancelInlineRename();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitInlineRename();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineRename();
    }
  };

  const createNewFolder = async (scope: "local" | "remote") => {
    const entries = getScopeEntries(scope);
    const defaultName = getUniqueName("New folder", entries.map((item) => item.name));
    try {
      if (scope === "local") {
        if (!isTauri) {
          addLog("error", "Local folders are not available in the browser.");
          return;
        }
        const target = await join(localPath, defaultName);
        await createFolderAt("local", target);
        pushHistory({
          label: "New folder",
          undo: async () => deleteEntry("local", target, true),
          redo: async () => createFolderAt("local", target),
        });
        startInlineRename({
          scope: "local",
          name: defaultName,
          path: target,
          isDir: true,
          isImage: false,
          isVideo: false,
        });
      } else {
        const target = buildRemotePath(remotePath || "/", defaultName);
        await createFolderAt("remote", target);
        pushHistory({
          label: "New folder",
          undo: async () => deleteEntry("remote", target, true),
          redo: async () => createFolderAt("remote", target),
        });
        startInlineRename({
          scope: "remote",
          name: defaultName,
          path: target,
          isDir: true,
          isImage: false,
          isVideo: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const createNewTextFile = async (scope: "local" | "remote") => {
    const entries = getScopeEntries(scope);
    const defaultName = getUniqueName(
      "New text file.txt",
      entries.map((item) => item.name)
    );
    try {
      if (scope === "local") {
        if (!isTauri) {
          addLog("error", "Local files are not available in the browser.");
          return;
        }
        const target = await join(localPath, defaultName);
        await createFileAt("local", target, defaultName);
        pushHistory({
          label: "New text file",
          undo: async () => deleteEntry("local", target, false),
          redo: async () => createFileAt("local", target, defaultName),
        });
        startInlineRename({
          scope: "local",
          name: defaultName,
          path: target,
          isDir: false,
          isImage: false,
          isVideo: false,
        });
      } else {
        const target = buildRemotePath(remotePath || "/", defaultName);
        await createFileAt("remote", target, defaultName);
        pushHistory({
          label: "New text file",
          undo: async () => deleteEntry("remote", target, false),
          redo: async () => createFileAt("remote", target, defaultName),
        });
        startInlineRename({
          scope: "remote",
          name: defaultName,
          path: target,
          isDir: false,
          isImage: false,
          isVideo: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const handleDropRemote = (event: React.DragEvent) => {
    event.preventDefault();
    const payload = parseDragPayload(event) ?? dragPayloadRef.current;
    dragPayloadRef.current = null;
    if (isTauri && import.meta.env.DEV) {
      addLog("info", payload ? `Drop remote (${payload.source})` : "Drop remote (no payload)");
    }
    if (!payload || payload.source !== "local") {
      if (!isTauri && event.dataTransfer.files?.length) {
        const files = Array.from(event.dataTransfer.files);
        addLocalFiles(files);
        enqueueUploadPaths(files.map((file) => toLocalFileId(file)));
      }
      return;
    }
    enqueueUploadPaths(payload.paths);
  };

  const handleDropLocal = (event: React.DragEvent) => {
    event.preventDefault();
    const payload = parseDragPayload(event) ?? dragPayloadRef.current;
    dragPayloadRef.current = null;
    if (isTauri && import.meta.env.DEV) {
      addLog("info", payload ? `Drop local (${payload.source})` : "Drop local (no payload)");
    }
    if (!payload || payload.source !== "remote") {
      if (!isTauri && event.dataTransfer.files?.length) {
        const files = Array.from(event.dataTransfer.files);
        addLocalFiles(files);
      }
      return;
    }
    enqueueDownloadNames(payload.paths).catch(() => null);
  };

  const handleLocalAddressSubmit = () => {
    if (!isTauri) return;
    const target = normalizeLocalInput(localAddress);
    refreshLocal(target);
  };

  const handleRemoteAddressSubmit = () => {
    if (!connected) return;
    const target = remoteAddress.trim() || "/";
    refreshRemote(target);
  };

  const handleBookmarksDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    if (!isPremium) {
      addLog("info", "Premium required to save bookmarks.");
      return;
    }
    if (!isTauri) {
      return;
    }
    const payload = parseDragPayload(event);
    if (payload && payload.source === "local") {
      await addLocalBookmark(payload.paths);
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? [])
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (!files.length) return;

    const dirs: string[] = [];
    for (const path of files) {
      try {
        const isDir = await invoke<boolean>("is_local_dir", { path });
        if (isDir) dirs.push(path);
      } catch {
        // ignore
      }
    }
    if (dirs.length) {
      await addLocalBookmark(dirs);
    }
  };

  const detailsPaneClass = "workspace details-right";


  const getSoftDropTarget = (clientX: number, clientY: number) => {
    const isInside = (ref: React.RefObject<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    };
    if (isInside(remotePaneRef)) return "remote";
    if (isInside(localPaneRef)) return "local";
    return null;
  };

  const startSoftDrag = (payload: DragPayload, event: React.PointerEvent) => {
    if (!isTauri) return;
    if (dragPayloadRef.current) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    dragPayloadRef.current = payload;
    setSoftDragTarget(null);

    const handleMove = (moveEvent: PointerEvent) => {
      const target = getSoftDropTarget(moveEvent.clientX, moveEvent.clientY);
      setSoftDragTarget(target);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("blur", handleCancel);
    };

    const handleUp = (upEvent: PointerEvent) => {
      const target = getSoftDropTarget(upEvent.clientX, upEvent.clientY);
      setSoftDragTarget(null);
      if (payload.source === "local" && target === "remote") {
        enqueueUploadPaths(payload.paths);
      }
      if (payload.source === "remote" && target === "local") {
        enqueueDownloadNames(payload.paths).catch(() => null);
      }
      dragPayloadRef.current = null;
      cleanup();
    };

    const handleCancel = () => {
      setSoftDragTarget(null);
      dragPayloadRef.current = null;
      cleanup();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleCancel, { once: true });
    window.addEventListener("blur", handleCancel, { once: true });
  };

  useEffect(() => {
    return () => {
      if (menuCloseRef.current !== null) {
        window.clearTimeout(menuCloseRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!detailsItem || detailsItem.scope !== "Local" || !isImageFile(detailsItem.name)) return;
    const key = toImageKey(detailsItem.path, 512);
    if (imageCache[key]) return;
    if (!isTauri) {
      if (detailsItem.file) {
        const url = URL.createObjectURL(detailsItem.file);
        blobUrlsRef.current.add(url);
        setImageCache((prev) => ({ ...prev, [key]: url }));
      }
      return;
    }
    const load = async () => {
      try {
        const dataUrl = await invoke<string>("read_local_image_thumb", {
          path: detailsItem.path,
          maxSize: 512,
        });
        setImageCache((prev) => ({ ...prev, [key]: dataUrl }));
      } catch {
        // ignore
      }
    };
    load().catch(() => null);
  }, [detailsItem, imageCache]);

  useEffect(() => {
    if (!detailsItem || detailsItem.scope !== "Local" || !isVideoFile(detailsItem.name)) return;
    const key = toVideoKey(detailsItem.path, 0);
    if (videoPreviewCache[key] || videoPreviewErrors[key]) return;
    if (!isTauri) {
      if (detailsItem.file) {
        const url = URL.createObjectURL(detailsItem.file);
        blobUrlsRef.current.add(url);
        setVideoPreviewCache((prev) => ({
          ...prev,
          [key]: url,
        }));
      }
      return;
    }
    setVideoPreviewCache((prev) => ({
      ...prev,
      [key]: convertFileSrc(detailsItem.path),
    }));
  }, [detailsItem, videoPreviewCache, videoPreviewErrors]);

  useEffect(() => {
    if (!previewState) {
      setPreviewSrc(null);
      return;
    }
    if (previewState.scope !== "local") return;
    if (isTauri) {
      setPreviewSrc(convertFileSrc(previewState.path));
      return;
    }
    const entry = localEntries.find((item) => item.path === previewState.path);
    if (!entry?.file) return;
    const url = URL.createObjectURL(entry.file);
    setPreviewSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [previewState, localEntries, isTauri]);

  const contextEntry = contextMenu?.kind === "entry" ? contextMenu.entry : null;
  const contextScope =
    contextMenu?.kind === "pane" ? contextMenu.scope : contextEntry?.scope ?? null;
  const contextDisableLocalActions =
    contextScope === "local" && localPath === "this_pc";
  const contextCanOpen = Boolean(contextEntry);
  const contextCanCreate =
    contextScope === "remote"
      ? connected
      : isTauri && localPath !== "this_pc" && Boolean(localPath);
  const contextCanPaste = Boolean(clipboardState) && Boolean(contextScope);
  const contextViewMode =
    contextScope === "local"
      ? localViewMode
      : contextScope === "remote"
        ? remoteViewMode
        : null;
  const applyContextSortBy = (value: SortBy) => {
    if (contextScope === "local") {
      setLocalSortBy(value);
    } else if (contextScope === "remote") {
      setRemoteSortBy(value);
    }
  };
  const applyContextSortOrder = (value: SortOrder) => {
    if (contextScope === "local") {
      setLocalSortOrder(value);
    } else if (contextScope === "remote") {
      setRemoteSortOrder(value);
    }
  };
  const contextMenuResetKey = contextMenu
    ? `${contextMenu.kind}-${contextMenu.x}-${contextMenu.y}`
    : "closed";

  return (
    <div
      className="page app explorer"
      ref={appRef}
      onDragEnter={
        isTauri
          ? undefined
          : (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
      }
      onDragOver={
        isTauri
          ? undefined
          : (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
      }
    >
      <AccessGate
        status={entitlementStatus}
        primaryLabel="Open Enderfall Hub"
        secondaryLabel="Retry"
        onPrimary={handleOpenAppBrowser}
        onSecondary={refreshEntitlement}
        primaryClassName="primary"
        secondaryClassName="ghost"
        messageLocked={`Open Enderfall Hub to verify premium or admin access. (${entitlementDebug})`}
      />
      <MainHeader
        logoSrc="/brand/enderfall-mark.png"
        menus={[
          {
            id: "file",
            label: "File",
            content: (
              <>
                <Button className="ef-menu-item" type="button" onClick={openPreferences}>
                  Preferences
                </Button>
                <div className="ef-menu-divider" />
                <Button
                  className="ef-menu-item"
                  type="button"
                  onClick={handleConnect}
                  disabled={connected || connecting}
                >
                  Connect
                </Button>
                <Button
                  className="ef-menu-item"
                  type="button"
                  onClick={handleDisconnect}
                  disabled={!connected}
                >
                  Disconnect
                </Button>
                <div className="ef-menu-divider" />
                <Button
                  className="ef-menu-item"
                  type="button"
                  onClick={() =>
                    activePane === "local"
                      ? createNewFolder("local")
                      : createNewFolder("remote")
                  }
                  disabled={
                    activePane === "local"
                      ? !isTauri || !localPath || localPath === "this_pc"
                      : !connected
                  }
                >
                  New folder
                </Button>
                <Button
                  className="ef-menu-item"
                  type="button"
                  onClick={() =>
                    activePane === "local" ? refreshLocal(localPath) : refreshRemote()
                  }
                  disabled={activePane === "local" ? !localPath : !connected}
                >
                  Refresh
                </Button>
              </>
            ),
          },
          {
            id: "edit",
            label: "Edit",
            content: (
              <>
                <Button
                  className="ef-menu-item"
                  type="button"
                  onClick={openActiveRename}
                  disabled={
                    activePane === "local"
                      ? !selectedLocal.length || localPath === "this_pc"
                      : !selectedRemote.length || !connected
                  }
                >
                  Rename
                </Button>
                <Button
                  className="ef-menu-item"
                  type="button"
                  onClick={openActiveDelete}
                  disabled={
                    activePane === "local"
                      ? !selectedLocal.length || localPath === "this_pc"
                      : !selectedRemote.length || !connected
                  }
                >
                  Delete
                </Button>
              </>
            ),
          },
          {
            id: "view",
            label: "View",
            content: (
              <SideMenu resetKey={menuOpen === "view" ? "open" : "closed"}>
                <SideMenuSubmenu
                  id="theme"
                  className="ef-menu-group"
                  panelClassName="ef-menu-sub ef-menu-sub--header"
                  enableViewportFlip
                  variant="header"
                  trigger={(triggerProps) => (
                    <button
                      className="ef-menu-item"
                      type="button"
                      onClick={triggerProps.onClick}
                      aria-expanded={triggerProps["aria-expanded"]}
                      disabled={triggerProps.disabled}
                    >
                      <span>Theme</span>
                      <span className="ef-menu-sub-caret">
                        <IconChevronDown />
                      </span>
                    </button>
                  )}
                >
                  {themeOptions.map((item) => (
                    <Button
                      key={item.value}
                      className={`theme-preview theme-preview--${item.value}`}
                      variant="primary"
                      type="button"
                      onClick={() => {
                        setThemeMode(item.value);
                        closeMenu();
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </SideMenuSubmenu>
              </SideMenu>
            ),
          },
          {
            id: "help",
            label: "Help",
            content: (
              <Button className="ef-menu-item" type="button" onClick={() => openLink("https://enderfall.co.uk")}>
                About
              </Button>
            ),
          },
        ]}
        menuOpen={menuOpen}
        onOpenMenu={openMenu}
        onCloseMenu={closeMenu}
        actions={
          <div className="actions">
            <Dropdown
              variant="user"
              name={displayName}
              avatarUrl={avatarUrl}
              avatarUrlFallback={avatarUrlFallback}
              avatarFallback={displayName.slice(0, 1).toUpperCase()}
              items={[
                {
                  label: "Open Enderfall Hub",
                  onClick: handleOpenAppBrowser,
                  title: "Focuses Enderfall Hub if it's already open.",
                },
                {
                  label: "Profile",
                  onClick: openProfile,
                },
              ]}
            />
          </div>
        }
      />
      <ConnectionPanel
        host={host}
        setHost={setHost}
        port={port}
        setPort={setPort}
        protocol={protocol}
        setProtocol={setProtocol}
        sftpPort={sftpPort}
        setSftpPort={setSftpPort}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        connected={connected}
        connecting={connecting}
        connectionDetailOpen={connectionDetailOpen}
        setConnectionDetailOpen={setConnectionDetailOpen}
        savePassword={savePassword}
        setSavePassword={setSavePassword}
        ftpBookmarks={ftpBookmarks}
        selectedFtpBookmark={selectedFtpBookmark}
        isPremium={isPremium}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onBookmarkSelect={handleFtpBookmarkSelect}
        onDeleteBookmark={deleteFtpBookmark}
        onSaveBookmark={openFtpBookmarkModal}
        addLog={addLog}
      />

      <main className="shell" ref={shellRef}>
        <Sidebar
          sidebarRef={sidebarRef}
          localPath={localPath}
          favorites={favorites}
          localBookmarks={localBookmarks}
          isPremium={isPremium}
          onRefreshLocal={refreshLocal}
          onOpenLocalFolder={openLocalFolder}
          onRemoveBookmark={removeLocalBookmark}
          onBookmarksDrop={handleBookmarksDrop}
        />
        <div
          className="resize-handle resize-handle--sidebar"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startResize("sidebar")}
        />

        <section className={detailsPaneClass} ref={workspaceRef}>
          <section className="panes explorer-panes">
            <LocalPane
              paneRef={localPaneRef}
              fileInputRef={fileInputRef}
              softDragTarget={softDragTarget}
              localPath={localPath}
              localViewMode={localViewMode}
              localSortBy={localSortBy}
              localSortOrder={localSortOrder}
              localAddress={localAddress}
              localSearch={localSearch}
              filteredEntries={filteredLocalEntries}
              selectedLocal={selectedLocal}
              localBookmarks={localBookmarks}
              imageCache={imageCache}
              videoThumbCache={videoThumbCache}
              renameState={renameState}
              isPremium={isPremium}
              dragPayloadRef={dragPayloadRef}
              setLocalViewMode={setLocalViewMode}
              setLocalSortBy={setLocalSortBy}
              setLocalSortOrder={setLocalSortOrder}
              setLocalAddress={setLocalAddress}
              setLocalSearch={setLocalSearch}
              setRenameState={setRenameState}
              onRefresh={() => refreshLocal(localPath)}
              onJumpUp={jumpLocalUp}
              onCreateNewFolder={() => createNewFolder("local")}
              onOpenLocalFolder={openLocalFolder}
              onPickFiles={handlePickFiles}
              onAddressSubmit={handleLocalAddressSubmit}
              onDrop={handleDropLocal}
              onSelect={(index, key, event) => {
                setActivePane("local");
                applySelection(
                  filteredLocalEntries.map((item) => item.path),
                  index,
                  key,
                  selectedLocal,
                  setSelectedLocal,
                  lastLocalIndex,
                  setLastLocalIndex,
                  event
                );
              }}
              onStartSoftDrag={startSoftDrag}
              onOpenEntry={openEntry}
              onContextMenu={openContextMenu}
              onPaneContextMenu={(event) => openPaneContextMenu(event, "local")}
              onStartRename={startInlineRename}
              onRenameKeyDown={handleRenameKeyDown}
              onCommitRename={commitInlineRename}
              onDelete={(target) => openModalForDelete("local", target)}
              onAddBookmark={addLocalBookmark}
              onRemoveBookmark={removeLocalBookmark}
              addLog={addLog}
            />

            <TransferPanel
              queue={queue}
              activeCount={activeCount}
              connected={connected}
              selectedLocal={selectedLocal}
              selectedRemote={selectedRemote}
              localPath={localPath}
              onUpload={enqueueUpload}
              onDownload={enqueueDownload}
              onRetryFailed={retryFailedTransfers}
              onClearCompleted={clearCompletedTransfers}
              onCancelQueued={cancelQueuedTransfers}
              onClearAll={clearAllTransfers}
              isTauri={isTauri}
            />
            <RemotePane
              paneRef={remotePaneRef}
              softDragTarget={softDragTarget}
              connected={connected}
              remotePath={remotePath}
              remoteViewMode={remoteViewMode}
              remoteSortBy={remoteSortBy}
              remoteSortOrder={remoteSortOrder}
              remoteAddress={remoteAddress}
              remoteSearch={remoteSearch}
              filteredEntries={filteredRemoteEntries}
              selectedRemote={selectedRemote}
              renameState={renameState}
              setRemoteViewMode={setRemoteViewMode}
              setRemoteSortBy={setRemoteSortBy}
              setRemoteSortOrder={setRemoteSortOrder}
              setRemoteAddress={setRemoteAddress}
              setRemoteSearch={setRemoteSearch}
              setRenameState={setRenameState}
              onRefresh={() => refreshRemote()}
              onJumpUp={jumpRemoteUp}
              onCreateNewFolder={() => createNewFolder("remote")}
              onAddressSubmit={handleRemoteAddressSubmit}
              onDrop={handleDropRemote}
              onSelect={(index, key, event) => {
                setActivePane("remote");
                applySelection(
                  filteredRemoteEntries.map((item) => item.name),
                  index,
                  key,
                  selectedRemote,
                  setSelectedRemote,
                  lastRemoteIndex,
                  setLastRemoteIndex,
                  event
                );
              }}
              onStartSoftDrag={startSoftDrag}
              onOpenEntry={openEntry}
              onContextMenu={openContextMenu}
              onPaneContextMenu={(event) => openPaneContextMenu(event, "remote")}
              onStartRename={startInlineRename}
              onRenameKeyDown={handleRenameKeyDown}
              onCommitRename={commitInlineRename}
              onDelete={(target) => openModalForDelete("remote", target)}
            />
          </section>

          <div
            className="resize-handle resize-handle--details"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startResize("details")}
          />

          <div className="details-stack">
            <DetailsPanel
              detailsItem={detailsItem}
              detailsRef={detailsRef}
              imageCache={imageCache}
              videoPreviewCache={videoPreviewCache}
              videoPreviewErrors={videoPreviewErrors}
              setVideoPreviewCache={setVideoPreviewCache}
              setVideoPreviewErrors={setVideoPreviewErrors}
            />
            <ActivityLog logs={logs} />
          </div>
        </section>
      </main>
      <div
        className="resize-handle resize-handle--horizontal"
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={startResizeVertical}
      />


      <AppModals
        modal={modal}
        modalValue={modalValue}
        onModalValueChange={setModalValue}
        onClose={closeModal}
        onConfirm={confirmModal}
      />

      {contextMenu ? (
        <ContextMenuComponent
          contextMenu={contextMenu}
          onClose={closeContextMenu}
          resetKey={contextMenuResetKey}
          onOpen={handleContextOpen}
          onRename={handleContextRename}
          onDelete={handleContextDelete}
          onCut={handleContextCut}
          onCopy={handleContextCopy}
          onPaste={handleContextPaste}
          onCopyPath={handleContextCopyPath}
          onProperties={handleContextProperties}
          onOpenWith={handleContextOpenWith}
          onNewFolder={handleContextNewFolder}
          onNewTextFile={handleContextNewTextFile}
          onUndo={undoLast}
          onRedo={redoLast}
          canUndo={canUndo}
          canRedo={canRedo}
          contextViewMode={contextViewMode}
          onViewModeChange={(scope, mode) => {
            if (scope === "local") setLocalViewMode(mode);
            else setRemoteViewMode(mode);
          }}
          onSortByChange={applyContextSortBy}
          onSortOrderChange={applyContextSortOrder}
          contextPaneSortOpen={contextPaneSortOpen}
          onContextPaneSortOpenChange={setContextPaneSortOpen}
          contextScope={contextScope}
          contextEntry={contextEntry}
          contextCanOpen={contextCanOpen}
          contextCanCreate={contextCanCreate}
          contextCanPaste={contextCanPaste}
          contextDisableLocalActions={contextDisableLocalActions}
          localBookmarks={localBookmarks}
          isPremium={isPremium}
          onToggleBookmark={(path) => {
            closeContextMenu();
            if (!isPremium) {
              addLog("info", "Premium required to save bookmarks.");
              return;
            }
            const exists = localBookmarks.some((item) => item.path === path);
            if (exists) {
              removeLocalBookmark(path);
            } else {
              addLocalBookmark([path]).catch(() => null);
            }
          }}
          localPath={localPath}
          isTauri={isTauri}
          addLog={addLog}
          onPaneProperties={() => {
            closeContextMenu();
            if (!isTauri) {
              addLog("error", "Properties are only available in the desktop app.");
              return;
            }
            if (!localPath || localPath === "this_pc") {
              addLog("error", "Select a folder to view properties.");
              return;
            }
            invoke("open_properties", { path: localPath }).catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              addLog("error", message);
            });
          }}
        />
      ) : null}

      <PreviewModal
        previewState={previewState}
        previewSrc={previewSrc}
        onClose={() => setPreviewState(null)}
      />

      <PreferencesModal
        isOpen={modal?.type === "prefs"}
        onClose={closeModal}
        themeMode={themeMode}
        onThemeChange={(value) => setThemeMode(value as ThemeMode)}
        themeOptions={themeOptions}
        animationsEnabled={animationsEnabled}
        onAnimationsChange={setAnimationsEnabled}
      >
        <div className="prefs-section">
          <div className="prefs-section-title">Ender Transfer</div>
          <label className={!isPremium ? "disabled" : ""}>
            Upload speed (KB/s)
            <Input
              type="number"
              min={0}
              value={uploadLimitKbps}
              onChange={(event) => setUploadLimitKbps(Number(event.target.value))}
              disabled={!isPremium}
            />
          </label>
          <label className={!isPremium ? "disabled" : ""}>
            Download speed (KB/s)
            <Input
              type="number"
              min={0}
              value={downloadLimitKbps}
              onChange={(event) => setDownloadLimitKbps(Number(event.target.value))}
              disabled={!isPremium}
            />
          </label>
          <Toggle
            variant="checkbox"
            checked={openOnStartup}
            onChange={(event) => setOpenOnStartup(event.target.checked)}
            label="Open on startup"
          />
          <Toggle
            variant="checkbox"
            checked={minimizeToTray}
            onChange={(event) => setMinimizeToTray(event.target.checked)}
            label="Minimize to system tray"
          />
          <Toggle
            variant="checkbox"
            checked={closeToTray}
            onChange={(event) => setCloseToTray(event.target.checked)}
            label="Close to system tray"
          />
        </div>
        <div className="side-muted">Applies immediately on this device.</div>
      </PreferencesModal>
    </div>
  );
}
