import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/api/dialog";
import { open as openExternal } from "@tauri-apps/api/shell";
import { isEntitledForApp, openAppBrowser, readLaunchToken } from "@enderfall/runtime";
import { AccessGate, applyTheme, getStoredTheme } from "@enderfall/ui";
const IconLock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const IconUnlock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 10V7a4 4 0 0 1 7.5-1" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const IconStar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 3.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.6 6.6 20.3l1-6.1-4.4-4.3 6.1-.9L12 3.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const IconTrash = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconEdit = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 16.5V20h3.5l10-10-3.5-3.5-10 10zM14 6l3.5 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 9l6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type DropdownOption = { value: string; label: string };
type DropdownSection = { label?: string; options: DropdownOption[] };

const Dropdown = ({
  value,
  onChange,
  sections,
}: {
  value: string;
  onChange: (value: string) => void;
  sections: DropdownSection[];
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active =
    sections.flatMap((section) => section.options).find((item) => item.value === value) ??
    sections[0]?.options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [open]);

  return (
    <div className="bookmark-dropdown" ref={ref}>
      <button
        className="bookmark-trigger"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="bookmark-text">{active?.label ?? "Select"}</span>
        <span className="bookmark-caret">
          <IconChevronDown />
        </span>
      </button>
      {open ? (
        <div className="bookmark-menu">
          {sections.map((section) => (
            <div key={section.label ?? "options"}>
              {section.label ? <div className="bookmark-group">{section.label}</div> : null}
              {section.options.map((item) => (
                <button
                  key={item.value}
                  className="bookmark-item"
                  type="button"
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span className="bookmark-text">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
import {
  desktopDir,
  dirname,
  documentDir,
  downloadDir,
  homeDir,
  pictureDir,
  join,
} from "@tauri-apps/api/path";

const isTauri = typeof window !== "undefined" && "__TAURI_IPC__" in window;
const appId = "ftp-browser";

type FtpEntry = {
  name: string;
  size?: number | null;
  modified?: string | null;
  is_dir: boolean;
  raw?: string | null;
};

type ListResponse = {
  cwd: string;
  entries: FtpEntry[];
};

type ConnectResponse = {
  cwd: string;
};

type LocalEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
  modified?: number | null;
  created?: number | null;
  taken?: number | null;
  dimensions?: { width: number; height: number } | null;
  rating?: number | null;
  tags?: string[] | null;
  file?: File | null;
};

type LocalListResponse = {
  path: string;
  entries: LocalEntry[];
};

type LogEntry = {
  level: string;
  message: string;
  timestamp: number;
};

type TransferProgress = {
  id: string;
  transferred: number;
  total?: number | null;
};

type TransferErrorPayload = {
  id: string;
  message: string;
};

type TransferStatus = "queued" | "active" | "done" | "error";

type TransferItem = {
  id: string;
  direction: "upload" | "download";
  name: string;
  localPath: string;
  remotePath: string;
  status: TransferStatus;
  transferred: number;
  total?: number | null;
  message?: string | null;
  file?: File | null;
};

type ModalState =
  | { type: "mkdir"; scope: "local" | "remote" }
  | { type: "rename"; scope: "local" | "remote"; targetName: string; targetPath: string }
  | { type: "delete"; scope: "local" | "remote"; targetName: string; targetPath: string; isDir: boolean }
  | { type: "ftp-bookmark" }
  | { type: "prefs" };

type Favorite = {
  label: string;
  path: string;
};

type FtpBookmark = {
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string | null;
};

type DragPayload = {
  source: "local" | "remote";
  paths: string[];
};

type ViewMode =
  | "details"
  | "list"
  | "tiles"
  | "content"
  | "small-icons"
  | "medium-icons"
  | "large-icons"
  | "extra-large-icons";

type DetailsPanePosition = "right" | "bottom";

type SortBy =
  | "name"
  | "date"
  | "type"
  | "size"
  | "tags"
  | "date-created"
  | "date-modified"
  | "date-taken"
  | "dimensions"
  | "rating";

type SortOrder = "asc" | "desc";

type ThemeMode = "system" | "light" | "dark";

const freeUploadLimitBytes = 25 * 1024 * 1024;

const viewModeOptions: { value: ViewMode; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "list", label: "List" },
  { value: "tiles", label: "Tiles" },
  { value: "content", label: "Content" },
  { value: "small-icons", label: "Small icons" },
  { value: "medium-icons", label: "Medium icons" },
  { value: "large-icons", label: "Large icons" },
  { value: "extra-large-icons", label: "Extra large icons" },
];

const sortPrimaryOptions: { value: SortBy; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
  { value: "type", label: "Type" },
];

const sortMoreOptions: { value: SortBy; label: string }[] = [
  { value: "size", label: "Size" },
  { value: "tags", label: "Tags" },
  { value: "date-created", label: "Date created" },
  { value: "date-modified", label: "Date modified" },
  { value: "date-taken", label: "Date taken" },
  { value: "dimensions", label: "Dimensions" },
  { value: "rating", label: "Ratings" },
];

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

const shouldFallbackToSftp = (message: string) =>
  /ENOTFOUND|10060|Failed to establish connection|Invalid response: \[227\]|425|ETIMEDOUT/i.test(
    message
  );

const ftpRequest = async <T,>(endpoint: string, body: Record<string, unknown>) => {
  const send = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${apiBase}/api/ftp/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return (await response.json()) as T;
  };

  try {
    return await send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!shouldFallbackToSftp(message)) throw error;
    return await send({ ...body, protocol: "sftp", sftpPort: 22 });
  }
};

const openLink = (url: string) => {
  if (isTauri) {
    openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

const formatBytes = (value?: number | null) => {
  if (!value && value !== 0) return "-";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const num = value / Math.pow(1024, exponent);
  return `${num.toFixed(num < 10 && exponent > 0 ? 1 : 0)} ${units[exponent]}`;
};

const formatDate = (value?: number | string | null) => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const imageExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "tif",
  "tiff",
]);

const isImageFile = (name: string) => imageExtensions.has(getExtension(name));

const videoExtensions = new Set([
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
]);

const isVideoFile = (name: string) => videoExtensions.has(getExtension(name));

const toImageKey = (path: string, size: number) => `${path}::${size}`;
const toVideoKey = (path: string, size: number) => `${path}::${size}`;

const viewThumbSize = (mode: ViewMode) => {
  switch (mode) {
    case "small-icons":
      return 64;
    case "medium-icons":
      return 96;
    case "large-icons":
      return 128;
    case "extra-large-icons":
      return 160;
    case "tiles":
      return 160;
    case "content":
      return 96;
    default:
      return 96;
  }
};

const maxVideoPreviewBytes = 30_000_000;

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getExtension = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

const toTimestamp = (value?: number | string | null) => {
  if (!value && value !== 0) return 0;
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sortEntries = <T extends { name: string; is_dir: boolean }>(
  entries: T[],
  sortBy: SortBy,
  order: SortOrder,
  getValue: (entry: T) => string | number
) => {
  const direction = order === "asc" ? 1 : -1;
  const compare = (valueA: string | number, valueB: string | number) => {
    if (valueA === valueB) return 0;
    return valueA > valueB ? direction : -direction;
  };

  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (sortBy === "name") {
      return direction * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    }
    return compare(getValue(a), getValue(b));
  });
};

const buildRemotePath = (base: string, name: string) => {
  if (!base) return name;
  if (name.startsWith("/")) return name;
  if (base.endsWith("/")) return `${base}${name}`;
  return `${base}/${name}`;
};

const remoteParent = (path: string) => {
  if (!path) return "";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
};

const normalizeLocalInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "this_pc";
  if (trimmed.toLowerCase() === "this pc") return "this_pc";
  return trimmed;
};

const loadLocalBookmarks = (): Favorite[] => {
  try {
    const raw = localStorage.getItem("localBookmarks");
    if (!raw) return [];
    return JSON.parse(raw) as Favorite[];
  } catch {
    return [];
  }
};

const saveLocalBookmarks = (bookmarks: Favorite[]) => {
  localStorage.setItem("localBookmarks", JSON.stringify(bookmarks));
};

const loadFtpBookmarks = (): FtpBookmark[] => {
  try {
    const raw = localStorage.getItem("ftpBookmarks");
    if (!raw) return [];
    return JSON.parse(raw) as FtpBookmark[];
  } catch {
    return [];
  }
};

const saveFtpBookmarks = (bookmarks: FtpBookmark[]) => {
  localStorage.setItem("ftpBookmarks", JSON.stringify(bookmarks));
};

const parseDragPayload = (event: React.DragEvent) => {
  const raw =
    event.dataTransfer.getData("application/json") ||
    event.dataTransfer.getData("text/plain");
  if (!raw) {
    const files = Array.from(event.dataTransfer.files ?? [])
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (!files.length) return null;
    return { source: "local", paths: files };
  }
  try {
    const payload = JSON.parse(raw) as DragPayload;
    if (!payload.paths?.length) return null;
    return payload;
  } catch {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return null;
    const paths = lines.map((line) => {
      if (!line.startsWith("file://")) return line;
      const trimmed = line.replace("file:///", "");
      const decoded = decodeURIComponent(trimmed);
      return decoded.replace(/\//g, "\\");
    });
    return { source: "local", paths };
  }
};

const toFileUri = (value: string) => {
  if (value.startsWith("file://")) return value;
  const normalized = value.replace(/\\/g, "/");
  return `file:///${normalized.replace(/^\/+/, "")}`;
};

const toLocalFileId = (file: File) =>
  `${file.name}-${file.size}-${file.lastModified}`;

export default function App() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(21);
  const [protocol, setProtocol] = useState<"ftp" | "sftp">("ftp");
  const [sftpPort, setSftpPort] = useState(22);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [remotePath, setRemotePath] = useState("/");
  const [remoteEntries, setRemoteEntries] = useState<FtpEntry[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string[]>([]);
  const [lastRemoteIndex, setLastRemoteIndex] = useState<number | null>(null);

  const [localPath, setLocalPath] = useState(() => (isTauri ? "this_pc" : "browser"));
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<string[]>([]);
  const [lastLocalIndex, setLastLocalIndex] = useState<number | null>(null);

  const [queue, setQueue] = useState<TransferItem[]>([]);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [localBookmarks, setLocalBookmarks] = useState<Favorite[]>(loadLocalBookmarks());
  const [ftpBookmarks, setFtpBookmarks] = useState<FtpBookmark[]>(loadFtpBookmarks());
  const [selectedFtpBookmark, setSelectedFtpBookmark] = useState<string>("");
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [videoThumbCache, setVideoThumbCache] = useState<Record<string, string>>({});
  const [videoPreviewCache, setVideoPreviewCache] = useState<Record<string, string>>({});
  const [videoPreviewErrors, setVideoPreviewErrors] = useState<Record<string, string>>({});

  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [savePassword, setSavePassword] = useState(false);
  const [ftpBookmarkOpen, setFtpBookmarkOpen] = useState(false);
  const ftpBookmarkRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const localPaneRef = useRef<HTMLDivElement | null>(null);
  const remotePaneRef = useRef<HTMLDivElement | null>(null);
  const [softDragTarget, setSoftDragTarget] = useState<"local" | "remote" | null>(null);
  const [menuOpen, setMenuOpen] = useState<"file" | "edit" | "view" | "help" | null>(null);
  const menuCloseRef = useRef<number | null>(null);
  const [openOnStartup, setOpenOnStartup] = useState(() => {
    const stored = localStorage.getItem("openOnStartup");
    return stored === "true";
  });
  const [minimizeToTray, setMinimizeToTray] = useState(() => {
    const stored = localStorage.getItem("minimizeToTray");
    return stored === "true";
  });
  const [closeToTray, setCloseToTray] = useState(() => {
    const stored = localStorage.getItem("closeToTray");
    return stored === "true";
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    getStoredTheme({
      storageKey: "themeMode",
      defaultTheme: "system",
      allowed: ["system", "light", "dark"],
    })
  );
  const [entitlementStatus, setEntitlementStatus] = useState<"checking" | "allowed" | "locked">(
    isTauri ? "checking" : "allowed"
  );
  const [requestedBrowser, setRequestedBrowser] = useState(false);
  const [isPremium, setIsPremium] = useState(isTauri);
  const [uploadLimitKbps, setUploadLimitKbps] = useState(() => {
    const stored = localStorage.getItem("uploadLimitKbps");
    return stored ? Number(stored) : 0;
  });
  const [downloadLimitKbps, setDownloadLimitKbps] = useState(() => {
    const stored = localStorage.getItem("downloadLimitKbps");
    return stored ? Number(stored) : 0;
  });

  useEffect(() => {
    applyTheme(themeMode, {
      storageKey: "themeMode",
      defaultTheme: "system",
      allowed: ["system", "light", "dark"],
    });
  }, [themeMode]);

  const [localSearch, setLocalSearch] = useState("");
  const [remoteSearch, setRemoteSearch] = useState("");
  const [localAddress, setLocalAddress] = useState(isTauri ? "This PC" : "Browser files");
  const [remoteAddress, setRemoteAddress] = useState("/");

  const refreshEntitlement = async () => {
    if (!isTauri) {
      setEntitlementStatus("allowed");
      setIsPremium(true);
      return;
    }
    const token = await readLaunchToken(appId);
    const allowed = isEntitledForApp(token, appId);
    setEntitlementStatus(allowed ? "allowed" : "locked");
    setIsPremium(allowed);
  };

  useEffect(() => {
    refreshEntitlement();
  }, []);

  useEffect(() => {
    if (entitlementStatus !== "locked" || requestedBrowser) return;
    setRequestedBrowser(true);
    handleOpenAppBrowser();
  }, [entitlementStatus, requestedBrowser]);

  const handleOpenAppBrowser = async () => {
    await openAppBrowser(appId);
  };

  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [activePane, setActivePane] = useState<"local" | "remote">("local");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("viewMode");
    if (stored && viewModeOptions.some((item) => item.value === stored)) {
      return stored as ViewMode;
    }
    return "details";
  });
  const [detailsPanePosition, setDetailsPanePosition] = useState<DetailsPanePosition>(() => {
    const stored = localStorage.getItem("detailsPanePosition");
    return stored === "bottom" ? "bottom" : "right";
  });
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const stored = localStorage.getItem("sortBy");
    const available = [...sortPrimaryOptions, ...sortMoreOptions];
    if (stored && available.some((item) => item.value === stored)) {
      return stored as SortBy;
    }
    return "name";
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const stored = localStorage.getItem("sortOrder");
    return stored === "desc" ? "desc" : "asc";
  });

  const queueActive = useMemo(
    () => queue.find((item) => item.status === "active"),
    [queue]
  );

  const filteredLocalEntries = useMemo(() => {
    const query = localSearch.trim().toLowerCase();
    const filtered = query
      ? localEntries.filter((entry) => entry.name.toLowerCase().includes(query))
      : localEntries;
    const getValue = (entry: LocalEntry) => {
      switch (sortBy) {
        case "type":
          return getExtension(entry.name);
        case "size":
          return entry.size ?? 0;
        case "date":
          return toTimestamp(entry.modified ?? null);
        case "date-modified":
          return toTimestamp(entry.modified ?? null);
        case "date-created":
          return toTimestamp(entry.created ?? null);
        case "date-taken":
          return toTimestamp(entry.taken ?? null);
        case "dimensions":
          return entry.dimensions ? entry.dimensions.width * entry.dimensions.height : 0;
        case "rating":
          return entry.rating ?? 0;
        case "tags":
          return entry.tags?.join(",").toLowerCase() ?? "";
        default:
          return entry.name.toLowerCase();
      }
    };
    return sortEntries(filtered, sortBy, sortOrder, getValue);
  }, [localEntries, localSearch, sortBy, sortOrder]);

  const filteredRemoteEntries = useMemo(() => {
    const query = remoteSearch.trim().toLowerCase();
    const filtered = query
      ? remoteEntries.filter((entry) => entry.name.toLowerCase().includes(query))
      : remoteEntries;
    const getValue = (entry: FtpEntry) => {
      switch (sortBy) {
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
    return sortEntries(filtered, sortBy, sortOrder, getValue);
  }, [remoteEntries, remoteSearch, sortBy, sortOrder]);

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

  const refreshRemote = async (path?: string, force?: boolean) => {
    if (!connected && !force) return;
    try {
      const response = isTauri
        ? await invoke<ListResponse>("list_dir", { path: path ?? null })
        : await ftpRequest<ListResponse>("list", {
            host,
            port,
            username,
            password,
            path: path ?? null,
            protocol,
            sftpPort,
          });
      setRemoteEntries(response.entries);
      setRemotePath(response.cwd || "/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const refreshLocal = async (path: string) => {
    if (!isTauri) {
      setLocalPath("browser");
      return;
    }
    try {
      const response = await invoke<LocalListResponse>("list_local", { path });
      setLocalEntries(response.entries);
      setLocalPath(response.path || "this_pc");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
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

  const enqueueUploadPaths = (paths: string[]) => {
    if (!connected) {
      addLog("error", "Connect to a server first.");
      return;
    }
    const entryMap = new Map(localEntries.map((entry) => [entry.path, entry]));
    const items: TransferItem[] = [];
    let blocked = 0;

    paths.forEach((path) => {
      const entry = entryMap.get(path);
      if (!entry || entry.is_dir) return;
      if (!isPremium && !isTauri && (entry.size ?? 0) > freeUploadLimitBytes) {
        blocked += 1;
        return;
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
    });

    if (!items.length) {
      addLog("error", "Select local files to upload.");
      return;
    }
    if (blocked > 0) {
      addLog(
        "info",
        `Free plan limit: ${blocked} file${blocked === 1 ? "" : "s"} over ${formatBytes(
          freeUploadLimitBytes
        )} were skipped.`
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
    names.forEach((name) => {
      const entry = remoteEntries.find((item) => item.name === name);
      if (!entry || entry.is_dir) return;
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
    });

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
      items.map(async (item) => ({
        ...item,
        localPath: await join(item.localPath, item.name),
      }))
    );

    setQueue((prev) => [...prev, ...queued]);
  };

  const uploadWebTransfer = async (item: TransferItem) => {
    if (!item.file) {
      throw new Error("Missing local file for upload.");
    }
    if (!isPremium && item.file.size > freeUploadLimitBytes) {
      throw new Error(`Free plan upload limit is ${formatBytes(freeUploadLimitBytes)}.`);
    }
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
      form.append("file", item.file, item.name);
      const response = await fetch(`${apiBase}/api/ftp/upload`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
    };

    try {
      await send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldFallbackToSftp(message)) throw error;
      await send("sftp");
    }
  };

  const downloadWebTransfer = async (item: TransferItem) => {
    const send = async (protocolOverride?: "ftp" | "sftp") => {
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

    try {
      await send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldFallbackToSftp(message)) throw error;
      await send("sftp");
    }
  };
  useEffect(() => {
    if (!isTauri) {
      setFavorites([]);
      return;
    }
    const loadFavorites = async () => {
      const [home, desktop, documents, downloads, pictures] = await Promise.all([
        homeDir(),
        desktopDir(),
        documentDir(),
        downloadDir(),
        pictureDir(),
      ]);

      const safeInvoke = async <T,>(command: string, args: Record<string, unknown>, fallback: T) => {
        try {
          return await invoke<T>(command, args);
        } catch {
          return fallback;
        }
      };

      let detectedOneDrive: string | null = null;
      if (home) {
        const envOneDrive = await safeInvoke<string | null>("get_env", { key: "OneDrive" }, null);
        if (envOneDrive) {
          detectedOneDrive = envOneDrive;
        } else {
          const candidate = await join(home, "OneDrive");
          const hasCandidate = await safeInvoke<boolean>("path_exists", { path: candidate }, false);
          if (hasCandidate) detectedOneDrive = candidate;
        }
      }

      const next: Favorite[] = [];
      if (home) next.push({ label: "Home", path: home });
      if (desktop) next.push({ label: "Desktop", path: desktop });
      if (documents) next.push({ label: "Documents", path: documents });
      if (downloads) next.push({ label: "Downloads", path: downloads });
      if (pictures) next.push({ label: "Pictures", path: pictures });

      if (detectedOneDrive) {
        const labels = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"];
        for (const label of labels) {
          const candidate = await join(detectedOneDrive, label);
          const exists = await safeInvoke<boolean>("path_exists", { path: candidate }, false);
          if (exists && !next.some((item) => item.path === candidate)) {
            next.push({ label, path: candidate });
          }
        }
      }

      if (home) {
        const base = detectedOneDrive ?? home;
        const musicPath = await join(base, "Music");
        const videosPath = await join(base, "Videos");
        const [hasMusic, hasVideos] = await Promise.all([
          safeInvoke<boolean>("path_exists", { path: musicPath }, false),
          safeInvoke<boolean>("path_exists", { path: videosPath }, false),
        ]);
        if (hasMusic) next.push({ label: "Music", path: musicPath });
        if (hasVideos) next.push({ label: "Videos", path: videosPath });
      }

      setFavorites(next);
    };

    loadFavorites().catch(() => null);
  }, []);

  useEffect(() => {
    if (isTauri) {
      refreshLocal("this_pc");
    } else {
      setLocalPath("browser");
    }
  }, []);

  useEffect(() => {
    if (!isTauri) {
      setLocalAddress("Browser files");
      return;
    }
    setLocalAddress(localPath === "this_pc" ? "This PC" : localPath);
  }, [localPath]);

  useEffect(() => {
    setRemoteAddress(remotePath || "/");
  }, [remotePath]);

  useEffect(() => {
    localStorage.setItem("viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("detailsPanePosition", detailsPanePosition);
  }, [detailsPanePosition]);

  useEffect(() => {
    localStorage.setItem("sortBy", sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem("sortOrder", sortOrder);
  }, [sortOrder]);

  useEffect(() => {
    localStorage.setItem("openOnStartup", String(openOnStartup));
  }, [openOnStartup]);

  useEffect(() => {
    localStorage.setItem("minimizeToTray", String(minimizeToTray));
  }, [minimizeToTray]);

  useEffect(() => {
    localStorage.setItem("closeToTray", String(closeToTray));
  }, [closeToTray]);

  useEffect(() => {
    localStorage.setItem("themeMode", themeMode);
    const root = document.documentElement;
    root.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    if (!isTauri) return;
    invoke("update_preferences", {
      prefs: {
        openOnStartup,
        closeToTray,
        minimizeToTray,
      },
    }).catch((error) => {
      console.error("Failed to update preferences", error);
    });
  }, [openOnStartup, closeToTray, minimizeToTray]);

  useEffect(() => {
    const thumbSize = viewThumbSize(viewMode);
    if (viewMode === "details") return;
    if (!isTauri) {
      const next = { ...imageCache };
      let changed = false;
      filteredLocalEntries.forEach((entry) => {
        if (entry.is_dir || !isImageFile(entry.name) || !entry.file) return;
        const key = toImageKey(entry.path, thumbSize);
        if (next[key]) return;
        next[key] = URL.createObjectURL(entry.file);
        changed = true;
      });
      if (changed) {
        setImageCache(next);
      }
      return;
    }
    const targets = filteredLocalEntries
      .filter((entry) => !entry.is_dir && isImageFile(entry.name))
      .map((entry) => entry.path)
      .filter((path) => !imageCache[toImageKey(path, thumbSize)]);
    if (!targets.length) return;

    let cancelled = false;
    const loadBatch = async (paths: string[]) => {
      const next = { ...imageCache };
      for (const path of paths) {
        try {
          const dataUrl = await invoke<string>("read_local_image_thumb", {
            path,
            maxSize: thumbSize,
          });
          next[toImageKey(path, thumbSize)] = dataUrl;
        } catch {
          // ignore
        }
      }
      if (!cancelled) {
        setImageCache(next);
      }
    };

    const batch = targets.slice(0, 30);
    const idle =
      "requestIdleCallback" in window
        ? (window as Window & { requestIdleCallback?: (cb: () => void) => void })
            .requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 50);
    idle?.(() => loadBatch(batch));

    return () => {
      cancelled = true;
    };
  }, [filteredLocalEntries, imageCache, viewMode]);

  useEffect(() => {
    const thumbSize = viewThumbSize(viewMode);
    if (viewMode === "details") return;
    if (!isTauri) return;
    const targets = filteredLocalEntries
      .filter((entry) => !entry.is_dir && isVideoFile(entry.name))
      .map((entry) => entry.path)
      .filter((path) => !videoThumbCache[toVideoKey(path, thumbSize)]);
    if (!targets.length) return;

    let cancelled = false;
    const loadBatch = async (paths: string[]) => {
      const next = { ...videoThumbCache };
      for (const path of paths) {
        try {
          const thumb = await invoke<string>("read_local_video_thumb", {
            path,
            maxSize: thumbSize,
          });
          next[toVideoKey(path, thumbSize)] = thumb;
        } catch {
          // ignore
        }
      }
      if (!cancelled) {
        setVideoThumbCache(next);
      }
    };

    const batch = targets.slice(0, 12);
    const idle =
      "requestIdleCallback" in window
        ? (window as Window & { requestIdleCallback?: (cb: () => void) => void })
            .requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 120);
    idle?.(() => loadBatch(batch));

    return () => {
      cancelled = true;
    };
  }, [filteredLocalEntries, videoThumbCache, viewMode]);

  useEffect(() => {
    if (!isTauri) return;
    const setup = async () => {
      const unlistenLog = await listen<LogEntry>("log", (event) => {
        setLogs((prev) => [event.payload, ...prev.slice(0, 199)]);
      });
      const unlistenProgress = await listen<TransferProgress>("transfer-progress", (event) => {
        const payload = event.payload;
        setQueue((prev) =>
          prev.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  transferred: payload.transferred,
                  total: payload.total ?? item.total,
                }
              : item
          )
        );
      });
      const unlistenComplete = await listen<{ id: string }>("transfer-complete", (event) => {
        const payload = event.payload;
        setQueue((prev) =>
          prev.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  status: "done",
                  transferred: item.total ?? item.transferred,
                }
              : item
          )
        );
      });
      const unlistenError = await listen<TransferErrorPayload>("transfer-error", (event) => {
        const payload = event.payload;
        setQueue((prev) =>
          prev.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  status: "error",
                  message: payload.message,
                }
              : item
          )
        );
      });

      return () => {
        unlistenLog();
        unlistenProgress();
        unlistenComplete();
        unlistenError();
      };
    };

    const cleanupPromise = setup();
    return () => {
      cleanupPromise.then((cleanup) => cleanup()).catch(() => null);
    };
  }, []);

  useEffect(() => {
    if (activeTransferId || !queue.length) return;
    const next = queue.find((item) => item.status === "queued");
    if (!next) return;

    const startTransfer = async () => {
      setActiveTransferId(next.id);
      setQueue((prev) =>
        prev.map((item) =>
          item.id === next.id ? { ...item, status: "active" } : item
        )
      );

      try {
        if (isTauri) {
          if (next.direction === "upload") {
            await invoke("upload_file", {
              id: next.id,
              localPath: next.localPath,
              remotePath: next.remotePath,
            });
          } else {
            await invoke("download_file", {
              id: next.id,
              remotePath: next.remotePath,
              localPath: next.localPath,
            });
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
                ? {
                    ...item,
                    status: "done",
                    transferred: item.total ?? item.transferred,
                  }
                : item
            )
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog("error", message);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === next.id
              ? { ...item, status: "error", message }
              : item
          )
        );
      } finally {
        setActiveTransferId(null);
      }
    };

    startTransfer();
  }, [activeTransferId, queue, host, port, username, password]);

  const handleConnect = async () => {
    if (isTauri && protocol === "sftp") {
      addLog("error", "SFTP is available in the web app only.");
      return;
    }
    if (!host) {
      addLog("error", "Host is required.");
      return;
    }

    setConnecting(true);
    try {
      const response = isTauri
        ? await invoke<ConnectResponse>("connect", {
            config: {
              host,
              port,
              username,
              password,
            },
          })
        : await ftpRequest<ConnectResponse>("connect", {
            host,
            port,
            username,
            password,
            protocol,
            sftpPort,
          });
      setConnected(true);
      setRemotePath(response.cwd || "/");
      addLog("success", "Connected.");
      await refreshRemote(response.cwd || "/", true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isTauri) {
      setConnected(false);
      setRemoteEntries([]);
      setRemotePath("/");
      setSelectedRemote([]);
      addLog("info", "Disconnected.");
      return;
    }
    try {
      await invoke("disconnect");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
    setConnected(false);
    setRemoteEntries([]);
    setRemotePath("/");
    setSelectedRemote([]);
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
    setFtpBookmarkOpen(false);
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
      openModalForRename("local", { name: entry.name, path: entry.path });
    } else {
      const target = selectedRemote[0];
      if (!target) return;
      openModalForRename("remote", { name: target, path: target });
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

  const openModalForMkdir = (scope: "local" | "remote") => {
    setModal({ type: "mkdir", scope });
    setModalValue("");
  };

  const openModalForRename = (scope: "local" | "remote", target: { name: string; path: string }) => {
    setModal({ type: "rename", scope, targetName: target.name, targetPath: target.path });
    setModalValue(target.name);
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
      if (modal.type === "mkdir") {
        if (!modalValue.trim()) {
          addLog("error", "Folder name required.");
          return;
        }
        if (modal.scope === "local") {
          if (!isTauri) {
            addLog("error", "Local folders are not available in the browser.");
            return;
          }
          const target = await join(localPath, modalValue.trim());
          await invoke("create_local_dir", { path: target });
          await refreshLocal(localPath);
        } else {
          const target = buildRemotePath(remotePath || "/", modalValue.trim());
          if (isTauri) {
            await invoke("create_dir", { path: target });
          } else {
            await ftpRequest("mkdir", {
              host,
              port,
              username,
              password,
              path: target,
              protocol,
              sftpPort,
            });
          }
          await refreshRemote();
        }
      }

      if (modal.type === "rename") {
        if (!modalValue.trim()) {
          addLog("error", "New name required.");
          return;
        }
        if (modal.scope === "local") {
          if (!isTauri) {
            setLocalEntries((prev) =>
              prev.map((entry) =>
                entry.path === modal.targetPath
                  ? { ...entry, name: modalValue.trim() }
                  : entry
              )
            );
          } else {
            const parent = await dirname(modal.targetPath);
            const target = await join(parent, modalValue.trim());
            await invoke("rename_local", { from: modal.targetPath, to: target });
            await refreshLocal(localPath);
          }
        } else {
          const from = buildRemotePath(remotePath || "/", modal.targetName);
          const to = buildRemotePath(remotePath || "/", modalValue.trim());
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
      }

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
      }

      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const jumpLocalUp = async () => {
    if (!isTauri) return;
    if (!localPath || localPath === "this_pc") return;
    const parent = await dirname(localPath);
    if (parent && parent !== localPath) {
      refreshLocal(parent);
    }
  };

  const jumpRemoteUp = async () => {
    if (!remotePath) return;
    const parent = remoteParent(remotePath);
    if (parent && parent !== remotePath) {
      refreshRemote(parent);
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

  const addLocalFiles = (files: File[]) => {
    if (!files.length) return;
    if (!isTauri) {
      setLocalPath("browser");
    }
    setLocalEntries((prev) => {
      const existing = new Set(prev.map((entry) => entry.path));
      const next = [...prev];
      for (const file of files) {
        const id = toLocalFileId(file);
        if (existing.has(id)) continue;
        existing.add(id);
        next.push({
          name: file.name,
          path: id,
          is_dir: false,
          size: file.size,
          modified: file.lastModified,
          created: file.lastModified,
          file,
        });
      }
      return next;
    });
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

  const addLocalBookmarks = async (paths: string[]) => {
    if (!isPremium) {
      addLog("info", "Premium required to save bookmarks.");
      return;
    }
    const entryMap = new Map(localEntries.map((entry) => [entry.path, entry]));
    const next = [...localBookmarks];
    for (const path of paths) {
      const entry = entryMap.get(path);
      if (!entry || !entry.is_dir) continue;
      if (next.some((item) => item.path === entry.path)) continue;
      next.push({ label: entry.name, path: entry.path });
    }
    if (next.length !== localBookmarks.length) {
      setLocalBookmarks(next);
      saveLocalBookmarks(next);
    }
  };

  const removeLocalBookmark = (path: string) => {
    const next = localBookmarks.filter((item) => item.path !== path);
    setLocalBookmarks(next);
    saveLocalBookmarks(next);
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
      await addLocalBookmarks(payload.paths);
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
      await addLocalBookmarks(dirs);
    }
  };

  const detailsPaneClass =
    detailsPanePosition === "bottom" ? "workspace details-bottom" : "workspace details-right";

  const selectedFtp = ftpBookmarks.find((item) => item.name === selectedFtpBookmark) ?? null;

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
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    dragPayloadRef.current = payload;
    setSoftDragTarget(null);

    const handleMove = (moveEvent: PointerEvent) => {
      const target = getSoftDropTarget(moveEvent.clientX, moveEvent.clientY);
      setSoftDragTarget(target);
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
      window.removeEventListener("pointermove", handleMove);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  useEffect(() => {
    if (!ftpBookmarkOpen) return;
    const handlePointer = (event: PointerEvent) => {
      if (!ftpBookmarkRef.current) return;
      if (ftpBookmarkRef.current.contains(event.target as Node)) return;
      setFtpBookmarkOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [ftpBookmarkOpen]);

  useEffect(() => {
    return () => {
      if (menuCloseRef.current !== null) {
        window.clearTimeout(menuCloseRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isTauri) {
      setIsPremium(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setIsPremium(params.get("tier") === "premium");
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!("__TAURI_IPC__" in window)) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectId: number | null = null;

    const connect = () => {
      socket = new WebSocket("ws://127.0.0.1:1420", "vite-hmr");
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data as string) as { type?: string };
          if (payload.type === "update" || payload.type === "full-reload") {
            window.location.reload();
          }
        } catch {
          // ignore
        }
      });
      socket.addEventListener("close", () => {
        if (reconnectId !== null) return;
        reconnectId = window.setTimeout(() => {
          reconnectId = null;
          connect();
        }, 1200);
      });
    };

    connect();

    return () => {
      if (reconnectId !== null) {
        window.clearTimeout(reconnectId);
      }
      if (socket) {
        socket.close();
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("uploadLimitKbps", String(uploadLimitKbps));
  }, [uploadLimitKbps]);

  useEffect(() => {
    localStorage.setItem("downloadLimitKbps", String(downloadLimitKbps));
  }, [downloadLimitKbps]);

  useEffect(() => {
    if (!detailsItem || detailsItem.scope !== "Local" || !isImageFile(detailsItem.name)) return;
    const key = toImageKey(detailsItem.path, 512);
    if (imageCache[key]) return;
    if (!isTauri) {
      if (detailsItem.file) {
        const url = URL.createObjectURL(detailsItem.file);
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

  return (
    <div
      className="app explorer"
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
        primaryLabel="Open App Browser"
        secondaryLabel="Retry"
        onPrimary={handleOpenAppBrowser}
        onSecondary={refreshEntitlement}
        primaryClassName="primary"
        secondaryClassName="ghost"
      />
      <header className="topbar explorer-topbar">
        <div className="menu-bar">
          <div
            className="menu-group"
            onMouseEnter={() => openMenu("file")}
            onMouseLeave={closeMenu}
          >
            <button className="menu-button" type="button">
              File
            </button>
            {menuOpen === "file" ? (
              <div className="menu-popover" onMouseEnter={() => openMenu("file")} onMouseLeave={closeMenu}>
                <button className="menu-item" type="button" onClick={openPreferences}>
                  Preferences
                </button>
                <div className="menu-divider" />
                <button
                  className="menu-item"
                  type="button"
                  onClick={handleConnect}
                  disabled={connected || connecting}
                >
                  Connect
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={handleDisconnect}
                  disabled={!connected}
                >
                  Disconnect
                </button>
                <div className="menu-divider" />
                <button
                  className="menu-item"
                  type="button"
                  onClick={() =>
                    activePane === "local"
                      ? openModalForMkdir("local")
                      : openModalForMkdir("remote")
                  }
                  disabled={
                    activePane === "local"
                      ? !isTauri || !localPath || localPath === "this_pc"
                      : !connected
                  }
                >
                  New folder
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() =>
                    activePane === "local" ? refreshLocal(localPath) : refreshRemote()
                  }
                  disabled={activePane === "local" ? !localPath : !connected}
                >
                  Refresh
                </button>
              </div>
            ) : null}
          </div>
          <div
            className="menu-group"
            onMouseEnter={() => openMenu("edit")}
            onMouseLeave={closeMenu}
          >
            <button className="menu-button" type="button">
              Edit
            </button>
            {menuOpen === "edit" ? (
              <div className="menu-popover" onMouseEnter={() => openMenu("edit")} onMouseLeave={closeMenu}>
                <button
                  className="menu-item"
                  type="button"
                  onClick={openActiveRename}
                  disabled={
                    activePane === "local"
                      ? !selectedLocal.length || localPath === "this_pc"
                      : !selectedRemote.length || !connected
                  }
                >
                  Rename
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={openActiveDelete}
                  disabled={
                    activePane === "local"
                      ? !selectedLocal.length || localPath === "this_pc"
                      : !selectedRemote.length || !connected
                  }
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
          <div
            className="menu-group"
            onMouseEnter={() => openMenu("view")}
            onMouseLeave={closeMenu}
          >
            <button className="menu-button" type="button">
              View
            </button>
            {menuOpen === "view" ? (
              <div className="menu-popover" onMouseEnter={() => openMenu("view")} onMouseLeave={closeMenu}>
                <div className="menu-item has-submenu" role="button" tabIndex={0}>
                  <span>View mode</span>
                  <span className="menu-sub-caret">
                    <IconChevronDown />
                  </span>
                  <div className="menu-sub">
                    {viewModeOptions.map((item) => (
                      <button
                        key={item.value}
                        className="menu-item"
                        type="button"
                        onClick={() => setViewMode(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="menu-item has-submenu" role="button" tabIndex={0}>
                  <span>Theme</span>
                  <span className="menu-sub-caret">
                    <IconChevronDown />
                  </span>
                  <div className="menu-sub">
                    {themeOptions.map((item) => (
                      <button
                        key={item.value}
                        className="menu-item"
                        type="button"
                        onClick={() => setThemeMode(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="menu-item has-submenu" role="button" tabIndex={0}>
                  <span>Details pane</span>
                  <span className="menu-sub-caret">
                    <IconChevronDown />
                  </span>
                  <div className="menu-sub">
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => setDetailsPanePosition("right")}
                    >
                      Right
                    </button>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => setDetailsPanePosition("bottom")}
                    >
                      Bottom
                    </button>
                  </div>
                </div>
                <div className="menu-divider" />
                <div className="menu-item has-submenu" role="button" tabIndex={0}>
                  <span>Sort by</span>
                  <span className="menu-sub-caret">
                    <IconChevronDown />
                  </span>
                  <div className="menu-sub">
                    {sortPrimaryOptions.map((item) => (
                      <button
                        key={item.value}
                        className="menu-item"
                        type="button"
                        onClick={() => setSortBy(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                    <div className="menu-divider" />
                    <div className="menu-group-title">More</div>
                    {sortMoreOptions.map((item) => (
                      <button
                        key={item.value}
                        className="menu-item"
                        type="button"
                        onClick={() => setSortBy(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="menu-item has-submenu" role="button" tabIndex={0}>
                  <span>Order</span>
                  <span className="menu-sub-caret">
                    <IconChevronDown />
                  </span>
                  <div className="menu-sub">
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => setSortOrder("asc")}
                    >
                      Ascending
                    </button>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => setSortOrder("desc")}
                    >
                      Descending
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div
            className="menu-group"
            onMouseEnter={() => openMenu("help")}
            onMouseLeave={closeMenu}
          >
            <button className="menu-button" type="button">
              Help
            </button>
            {menuOpen === "help" ? (
              <div className="menu-popover" onMouseEnter={() => openMenu("help")} onMouseLeave={closeMenu}>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => openLink("https://enderfall.co.uk")}
                >
                  About
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="connection-card compact">
          <div className="connection-grid">
            <label>
              Host
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="ftp.example.com"
              />
            </label>
            <label>
              Port
              <input
                type="number"
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </label>
            <label>
              Protocol
              <Dropdown
                value={protocol}
                onChange={(value) => {
                  const next = value as "ftp" | "sftp";
                  if (isTauri && next === "sftp") {
                    addLog("error", "SFTP is available in the web app only.");
                    return;
                  }
                  setProtocol(next);
                }}
                sections={[
                  {
                    options: [
                      { value: "ftp", label: "FTP" },
                      {
                        value: "sftp",
                        label: isTauri ? "SFTP (web only)" : "SFTP",
                      },
                    ],
                  },
                ]}
              />
            </label>
            {protocol === "sftp" && !isTauri ? (
              <label>
                SFTP Port
                <input
                  type="number"
                  value={sftpPort}
                  onChange={(event) => setSftpPort(Number(event.target.value))}
                />
              </label>
            ) : null}
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="anonymous"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="checkbox-field">
              Save password
              <input
                type="checkbox"
                checked={savePassword}
                onChange={(event) => setSavePassword(event.target.checked)}
              />
            </label>
          </div>

          <div className="connection-actions">
            <button
              className="primary"
              onClick={handleConnect}
              disabled={connecting || connected}
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
            <button onClick={handleDisconnect} disabled={!connected}>
              Disconnect
            </button>
            <button
              onClick={openFtpBookmarkModal}
              disabled={!isPremium}
              title={!isPremium ? "Premium required" : "Save bookmark"}
            >
              Save Bookmark
            </button>
            <div className={`status-pill ${connected ? "online" : "offline"}`}>
              {connected ? "Connected" : "Disconnected"}
            </div>
          </div>

          <div className="bookmark-row" ref={ftpBookmarkRef}>
            <div className="bookmark-label">Bookmarks</div>
            <div className={`bookmark-dropdown ${ftpBookmarkOpen ? "open" : ""}`}>
              <button
                className="bookmark-trigger"
                onClick={() => setFtpBookmarkOpen((open) => !open)}
              >
                <span className="bookmark-icon">
                  {selectedFtp ? (
                    selectedFtp.password ? (
                      <IconUnlock />
                    ) : (
                      <IconLock />
                    )
                  ) : (
                    <IconLock />
                  )}
                </span>
                <span className="bookmark-text">
                  {selectedFtp ? selectedFtp.name : "Select a saved connection"}
                </span>
                <span className="bookmark-caret">
                  <IconChevronDown />
                </span>
              </button>
              {ftpBookmarkOpen ? (
                <div className="bookmark-menu">
                  {ftpBookmarks.length === 0 ? (
                    <div className="side-muted">No saved connections.</div>
                  ) : (
                    ftpBookmarks.map((item) => (
                      <button
                        key={item.name}
                        className="bookmark-item"
                        onClick={() => handleFtpBookmarkSelect(item.name)}
                      >
                        <span className="bookmark-icon">
                          {item.password ? <IconUnlock /> : <IconLock />}
                        </span>
                        <span className="bookmark-text">{item.name}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="activity-card">
          <div className="section-title">Activity</div>
          {logs.length === 0 ? (
            <div className="empty-state">Actions will appear here.</div>
          ) : (
            <div className="log-list">
              {logs.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className={`log-row ${entry.level}`}>
                  <span className="log-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="log-msg">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="shell">
        <aside
          className="sidebar"
          onDragEnter={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleBookmarksDrop}
          onDragEnterCapture={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragOverCapture={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
        >
          <div className="side-section">
            <div className="side-title">Places</div>
            {isTauri ? (
              <>
                <button
                  className={`side-item ${localPath === "this_pc" ? "active" : ""}`}
                  onClick={() => refreshLocal("this_pc")}
                >
                  This PC
                </button>
                {favorites.map((item) => (
                  <button
                    key={item.path}
                    className={`side-item ${localPath === item.path ? "active" : ""}`}
                    onClick={() => refreshLocal(item.path)}
                  >
                    {item.label}
                  </button>
                ))}
                <button className="side-item ghost" onClick={openLocalFolder}>
                  Browse...
                </button>
              </>
            ) : (
              <button className="side-item ghost" onClick={openLocalFolder}>
                Add files...
              </button>
            )}
          </div>

          <div
            className="side-section"
            onDragEnter={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleBookmarksDrop}
            onDragEnterCapture={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragOverCapture={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDropCapture={handleBookmarksDrop}
          >
            <div className="side-title">Bookmarks</div>
            {!isTauri ? (
              <div className="side-muted">Bookmarks are available in the desktop app.</div>
            ) : !isPremium ? (
              <div className="side-muted">Premium required to save bookmarks.</div>
            ) : localBookmarks.length === 0 ? (
              <div className="side-muted">Drag local folders here.</div>
            ) : (
              localBookmarks.map((item) => (
                <div key={item.path} className="side-bookmark">
                  <button
                    className={`side-item ${localPath === item.path ? "active" : ""}`}
                    onClick={() => refreshLocal(item.path)}
                  >
                    {item.label}
                  </button>
                  <button
                    className="side-item remove"
                    onClick={() => removeLocalBookmark(item.path)}
                    title="Remove"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))
            )}
          </div>

        </aside>

        <section className={detailsPaneClass}>
          <section className="panes explorer-panes">
            <div
              ref={localPaneRef}
              className={`pane ${softDragTarget === "local" ? "soft-drop" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragOverCapture={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDropCapture={(event) => {
                event.preventDefault();
                handleDropLocal(event);
              }}
              onDrop={handleDropLocal}
            >
              <div className="pane-header explorer-header">
                <div className="pane-title-row">
                  <div>
                    <div className="pane-title">Local</div>
                    <div className="pane-sub">{isTauri ? "This PC" : "Browser files"}</div>
                  </div>
                  <div className="pane-actions">
                    {isTauri ? (
                      <>
                        <button
                          onClick={() => openModalForMkdir("local")}
                          disabled={!localPath || localPath === "this_pc"}
                        >
                          New folder
                        </button>
                        <button onClick={() => refreshLocal(localPath)} disabled={!localPath}>
                          Refresh
                        </button>
                        <button
                          className="icon-btn"
                          onClick={jumpLocalUp}
                          disabled={!localPath || localPath === "this_pc"}
                        >
                          Up
                        </button>
                      </>
                    ) : (
                      <button onClick={openLocalFolder}>Add files</button>
                    )}
                  </div>
                </div>

                <div className="address-row">
                  <div className="address-input">
                    <input
                      value={localAddress}
                      onChange={(event) => setLocalAddress(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleLocalAddressSubmit();
                      }}
                      disabled={!isTauri}
                    />
                    <button className="ghost" onClick={handleLocalAddressSubmit} disabled={!isTauri}>
                      Go
                    </button>
                  </div>
                  <div className="search-row">
                    <input
                      value={localSearch}
                      onChange={(event) => setLocalSearch(event.target.value)}
                      placeholder="Search local"
                    />
                  </div>
                </div>
                {!isTauri ? (
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handlePickFiles}
                    hidden
                  />
                ) : null}
              </div>

              <div
                className={`pane-body view-${viewMode}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleDropLocal}
              >
                {viewMode === "details" ? (
                  <>
                    <div className="table-row table-head">
                      <span>Name</span>
                      <span>Size</span>
                      <span>Modified</span>
                      <span>Actions</span>
                    </div>
                    {filteredLocalEntries.length === 0 ? (
                      <div className="empty-state">No items found.</div>
                    ) : (
                      filteredLocalEntries.map((entry, index) => {
                        const isSelected = selectedLocal.includes(entry.path);
                        const keys = filteredLocalEntries.map((item) => item.path);
                        const isPinned = localBookmarks.some((item) => item.path === entry.path);
                        return (
                          <div
                            key={entry.path}
                            className={`table-row ${isSelected ? "selected" : ""}`}
                            draggable={!isTauri}
                            onDragStart={(event) => {
                              const payload: DragPayload = {
                                source: "local",
                                paths: isSelected ? selectedLocal : [entry.path],
                              };
                              dragPayloadRef.current = payload;
                              if (isTauri && import.meta.env.DEV) {
                                addLog("info", `Drag start local (${payload.paths.length})`);
                              }
                              event.dataTransfer.setData(
                                "application/json",
                                JSON.stringify(payload)
                              );
                              event.dataTransfer.setData(
                                "text/plain",
                                payload.paths.join("\n")
                              );
                              if (!isTauri) {
                                event.dataTransfer.setData(
                                  "text/uri-list",
                                  payload.paths.map(toFileUri).join("\n")
                                );
                              }
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.dropEffect = "copy";
                            }}
                            onPointerDown={(event) => {
                              startSoftDrag(
                                {
                                  source: "local",
                                  paths: isSelected ? selectedLocal : [entry.path],
                                },
                                event
                              );
                            }}
                            onDragEnd={() => {
                              dragPayloadRef.current = null;
                            }}
                            onClick={(event) => {
                              setActivePane("local");
                              applySelection(
                                keys,
                                index,
                                entry.path,
                                selectedLocal,
                                setSelectedLocal,
                                lastLocalIndex,
                                setLastLocalIndex,
                                event
                              );
                            }}
                            onDoubleClick={() =>
                              entry.is_dir ? refreshLocal(entry.path) : null
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                if (entry.is_dir) {
                                  refreshLocal(entry.path);
                                }
                              }
                            }}
                          >
                            <span className="name-cell">
                              <span className={`entry-dot ${entry.is_dir ? "dir" : "file"}`} />
                              <span className="name-text">{entry.name}</span>
                            </span>
                            <span>{entry.is_dir ? "-" : formatBytes(entry.size ?? null)}</span>
                            <span>{formatDate(entry.modified ?? null)}</span>
                            <span className="row-actions">
                              {entry.is_dir ? (
                                <button
                                  className={`pin-btn ${isPinned ? "pinned" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!isPremium && !isPinned) {
                                      addLog("info", "Premium required to save bookmarks.");
                                      return;
                                    }
                                    if (isPinned) {
                                      removeLocalBookmark(entry.path);
                                    } else {
                                      addLocalBookmarks([entry.path]).catch(() => null);
                                    }
                                  }}
                                  disabled={!isPremium && !isPinned}
                                  title={isPinned ? "Unpin" : "Pin"}
                                >
                                  <IconStar />
                                </button>
                              ) : null}
                              <button
                                className="action-icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openModalForRename("local", { name: entry.name, path: entry.path });
                                }}
                                disabled={localPath === "this_pc"}
                                title="Rename"
                              >
                                <IconEdit />
                              </button>
                              <button
                                className="action-icon danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openModalForDelete("local", {
                                    name: entry.name,
                                    path: entry.path,
                                    isDir: entry.is_dir,
                                  });
                                }}
                                disabled={localPath === "this_pc"}
                                title="Delete"
                              >
                                <IconTrash />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </>
                ) : filteredLocalEntries.length === 0 ? (
                  <div className="empty-state">No items found.</div>
                ) : (
                  <div className={`entries-grid view-${viewMode}`}>
                    {filteredLocalEntries.map((entry, index) => {
                      const isSelected = selectedLocal.includes(entry.path);
                      const keys = filteredLocalEntries.map((item) => item.path);
                      const layoutClass =
                        viewMode === "list"
                          ? "list"
                          : viewMode === "content"
                            ? "content"
                            : viewMode === "tiles"
                              ? "tiles"
                              : "grid";
                      const showMeta =
                        viewMode === "list" || viewMode === "tiles" || viewMode === "content";
                      const metaText = entry.is_dir
                        ? "Folder"
                        : viewMode === "list"
                          ? formatBytes(entry.size ?? null)
                          : `${formatBytes(entry.size ?? null)} - ${formatDate(entry.modified ?? null)}`;
                      const isImage = !entry.is_dir && isImageFile(entry.name);
                      const isVideo = !entry.is_dir && isVideoFile(entry.name);
                      const isPinned = entry.is_dir
                        ? localBookmarks.some((item) => item.path === entry.path)
                        : false;
                      const thumbSize = viewThumbSize(viewMode);
                      const thumbnailSrc = isImage
                        ? imageCache[toImageKey(entry.path, thumbSize)] ?? ""
                        : "";
                      const videoThumbSrc = isVideo
                        ? videoThumbCache[toVideoKey(entry.path, thumbSize)] ?? ""
                        : "";
                      return (
                        <div
                          key={entry.path}
                          className={`entry-card ${layoutClass} ${
                            isSelected ? "selected" : ""
                          }`}
                          draggable={!isTauri}
                          onDragStart={(event) => {
                            const payload: DragPayload = {
                              source: "local",
                              paths: isSelected ? selectedLocal : [entry.path],
                            };
                            dragPayloadRef.current = payload;
                            if (isTauri && import.meta.env.DEV) {
                              addLog("info", `Drag start local (${payload.paths.length})`);
                            }
                            event.dataTransfer.setData("application/json", JSON.stringify(payload));
                            event.dataTransfer.setData(
                              "text/plain",
                              payload.paths.join("\n")
                            );
                            if (!isTauri) {
                              event.dataTransfer.setData(
                                "text/uri-list",
                                payload.paths.map(toFileUri).join("\n")
                              );
                            }
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.dropEffect = "copy";
                          }}
                          onPointerDown={(event) => {
                            startSoftDrag(
                              {
                                source: "local",
                                paths: isSelected ? selectedLocal : [entry.path],
                              },
                              event
                            );
                          }}
                          onDragEnd={() => {
                            dragPayloadRef.current = null;
                          }}
                          onClick={(event) => {
                            setActivePane("local");
                            applySelection(
                              keys,
                              index,
                              entry.path,
                              selectedLocal,
                              setSelectedLocal,
                              lastLocalIndex,
                              setLastLocalIndex,
                              event
                            );
                          }}
                          onDoubleClick={() =>
                            entry.is_dir ? refreshLocal(entry.path) : null
                          }
                          role="button"
                          tabIndex={0}
                        >
                          {entry.is_dir ? (
                            <button
                              className={`entry-pin ${isPinned ? "pinned" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!isPremium && !isPinned) {
                                  addLog("info", "Premium required to save bookmarks.");
                                  return;
                                }
                                if (isPinned) {
                                  removeLocalBookmark(entry.path);
                                } else {
                                  addLocalBookmarks([entry.path]).catch(() => null);
                                }
                              }}
                              disabled={!isPremium && !isPinned}
                              title={isPinned ? "Unpin" : "Pin"}
                            >
                              <IconStar />
                            </button>
                          ) : null}
                          <div
                            className={`entry-icon ${
                              entry.is_dir
                                ? "dir"
                                : isImage
                                  ? "image"
                                  : isVideo
                                    ? "video"
                                    : "file"
                            }`}
                          >
                            {thumbnailSrc ? (
                              <img src={thumbnailSrc} alt="" className="entry-thumb" />
                            ) : null}
                            {!thumbnailSrc && videoThumbSrc ? (
                              <img src={videoThumbSrc} alt="" className="entry-thumb" />
                            ) : null}
                            {isVideo ? <span className="entry-play" /> : null}
                          </div>
                          <div className="entry-text">
                            <div className="entry-name">{entry.name}</div>
                            {showMeta ? <div className="entry-meta">{metaText}</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="transfer-actions">
              <div className="action-card">
                <div className="action-title">Transfer</div>
                <button
                  className="primary"
                  onClick={enqueueUpload}
                  disabled={!connected || !selectedLocal.length}
                >
                  Upload {"->"}
                </button>
                <button
                  className="primary ghost"
                  onClick={enqueueDownload}
                  disabled={
                    !selectedRemote.length ||
                    (isTauri ? !localPath || localPath === "this_pc" : false)
                  }
                >
                  Download {"<-"}
                </button>
                <div className="action-hint">
                  Drag files across panes or use the buttons.
                </div>
                <div className="action-status">
                  Queue {queue.length} / Active {queueActive ? 1 : 0}
                </div>
                <div className="transfer-queue">
                  {queue.length === 0 ? (
                    <div className="empty-state">No transfers yet.</div>
                  ) : (
                    queue.map((item) => {
                      const total = item.total ?? 0;
                      const progress = total
                        ? Math.min(100, Math.round((item.transferred / total) * 100))
                        : 0;
                      return (
                        <div key={item.id} className={`queue-item ${item.status}`}>
                          <div>
                            <div className="queue-title">
                              {item.direction === "upload" ? "Upload" : "Download"} | {item.name}
                            </div>
                            <div className="queue-sub">
                              {item.status === "error"
                                ? item.message
                                : `${formatBytes(item.transferred)} / ${formatBytes(item.total ?? null)}`}
                            </div>
                          </div>
                          <div className="queue-meta">
                            <span className="queue-status">{item.status}</span>
                            <div className="progress">
                              <div
                                className="progress-bar"
                                style={{
                                  width: `${
                                    item.total
                                      ? progress
                                      : item.status === "done"
                                        ? 100
                                        : 20
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            <div
              ref={remotePaneRef}
              className={`pane ${softDragTarget === "remote" ? "soft-drop" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragOverCapture={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDropCapture={(event) => {
                event.preventDefault();
                handleDropRemote(event);
              }}
              onDrop={handleDropRemote}
            >
              <div className="pane-header explorer-header">
                <div className="pane-title-row">
                  <div>
                    <div className="pane-title">Remote</div>
                    <div className="pane-sub">FTP Server</div>
                  </div>
                  <div className="pane-actions">
                    <button onClick={() => openModalForMkdir("remote")} disabled={!connected}>
                      New folder
                    </button>
                    <button onClick={() => refreshRemote()} disabled={!connected}>
                      Refresh
                    </button>
                    <button className="icon-btn" onClick={jumpRemoteUp} disabled={!connected}>
                      Up
                    </button>
                  </div>
                </div>

                <div className="address-row">
                  <div className="address-input">
                    <input
                      value={remoteAddress}
                      onChange={(event) => setRemoteAddress(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleRemoteAddressSubmit();
                      }}
                      disabled={!connected}
                    />
                    <button className="ghost" onClick={handleRemoteAddressSubmit} disabled={!connected}>
                      Go
                    </button>
                  </div>
                  <div className="search-row">
                    <input
                      value={remoteSearch}
                      onChange={(event) => setRemoteSearch(event.target.value)}
                      placeholder="Search remote"
                      disabled={!connected}
                    />
                  </div>
                </div>
              </div>

              <div
                className={`pane-body view-${viewMode}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleDropRemote}
              >
                {viewMode === "details" ? (
                  <>
                    <div className="table-row table-head">
                      <span>Name</span>
                      <span>Size</span>
                      <span>Modified</span>
                      <span>Actions</span>
                    </div>
                    {!connected ? (
                      <div className="empty-state">Connect to a server to browse files.</div>
                    ) : filteredRemoteEntries.length === 0 ? (
                      <div className="empty-state">No items found.</div>
                    ) : (
                      filteredRemoteEntries.map((entry, index) => {
                        const isSelected = selectedRemote.includes(entry.name);
                        const keys = filteredRemoteEntries.map((item) => item.name);
                        return (
                          <div
                            key={entry.name}
                            className={`table-row ${isSelected ? "selected" : ""}`}
                            draggable={!isTauri && !entry.is_dir}
                            onDragStart={(event) => {
                              const payload: DragPayload = {
                                source: "remote",
                                paths: isSelected ? selectedRemote : [entry.name],
                              };
                              event.dataTransfer.setData(
                                "application/json",
                                JSON.stringify(payload)
                              );
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onPointerDown={(event) => {
                              if (entry.is_dir) return;
                              startSoftDrag(
                                {
                                  source: "remote",
                                  paths: isSelected ? selectedRemote : [entry.name],
                                },
                                event
                              );
                            }}
                            onClick={(event) => {
                              setActivePane("remote");
                              applySelection(
                                keys,
                                index,
                                entry.name,
                                selectedRemote,
                                setSelectedRemote,
                                lastRemoteIndex,
                                setLastRemoteIndex,
                                event
                              );
                            }}
                            onDoubleClick={() =>
                              entry.is_dir
                                ? refreshRemote(buildRemotePath(remotePath || "/", entry.name))
                                : null
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                if (entry.is_dir) {
                                  refreshRemote(buildRemotePath(remotePath || "/", entry.name));
                                }
                              }
                            }}
                          >
                            <span className="name-cell">
                              <span className={`entry-dot ${entry.is_dir ? "dir" : "file"}`} />
                              <span className="name-text">{entry.name}</span>
                            </span>
                            <span>{entry.is_dir ? "-" : formatBytes(entry.size ?? null)}</span>
                            <span>{formatDate(entry.modified ?? null)}</span>
                            <span className="row-actions">
                              <button
                                className="action-icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openModalForRename("remote", {
                                    name: entry.name,
                                    path: entry.name,
                                  });
                                }}
                                title="Rename"
                              >
                                <IconEdit />
                              </button>
                              <button
                                className="action-icon danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openModalForDelete("remote", {
                                    name: entry.name,
                                    path: entry.name,
                                    isDir: entry.is_dir,
                                  });
                                }}
                                title="Delete"
                              >
                                <IconTrash />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </>
                ) : !connected ? (
                  <div className="empty-state">Connect to a server to browse files.</div>
                ) : filteredRemoteEntries.length === 0 ? (
                  <div className="empty-state">No items found.</div>
                ) : (
                  <div className={`entries-grid view-${viewMode}`}>
                    {filteredRemoteEntries.map((entry, index) => {
                      const isSelected = selectedRemote.includes(entry.name);
                      const keys = filteredRemoteEntries.map((item) => item.name);
                      const layoutClass =
                        viewMode === "list"
                          ? "list"
                          : viewMode === "content"
                            ? "content"
                            : viewMode === "tiles"
                              ? "tiles"
                              : "grid";
                      const showMeta =
                        viewMode === "list" || viewMode === "tiles" || viewMode === "content";
                      const metaText = entry.is_dir
                        ? "Folder"
                        : viewMode === "list"
                          ? formatBytes(entry.size ?? null)
                          : `${formatBytes(entry.size ?? null)} - ${formatDate(entry.modified ?? null)}`;
                      return (
                        <div
                          key={entry.name}
                          className={`entry-card ${layoutClass} ${
                            isSelected ? "selected" : ""
                          }`}
                          draggable={!isTauri && !entry.is_dir}
                          onDragStart={(event) => {
                            const payload: DragPayload = {
                              source: "remote",
                              paths: isSelected ? selectedRemote : [entry.name],
                            };
                            event.dataTransfer.setData("application/json", JSON.stringify(payload));
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          onPointerDown={(event) => {
                            if (entry.is_dir) return;
                            startSoftDrag(
                              {
                                source: "remote",
                                paths: isSelected ? selectedRemote : [entry.name],
                              },
                              event
                            );
                          }}
                          onClick={(event) => {
                            setActivePane("remote");
                            applySelection(
                              keys,
                              index,
                              entry.name,
                              selectedRemote,
                              setSelectedRemote,
                              lastRemoteIndex,
                              setLastRemoteIndex,
                              event
                            );
                          }}
                          onDoubleClick={() =>
                            entry.is_dir
                              ? refreshRemote(buildRemotePath(remotePath || "/", entry.name))
                              : null
                          }
                          role="button"
                          tabIndex={0}
                        >
                          <div className={`entry-icon ${entry.is_dir ? "dir" : "file"}`} />
                          <div className="entry-text">
                            <div className="entry-name">{entry.name}</div>
                            {showMeta ? <div className="entry-meta">{metaText}</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="details-pane">
            <div className="section-title">Details</div>
            {detailsItem ? (
              <div className="details-content">
                {detailsItem.scope === "Local" && isImageFile(detailsItem.name) ? (
                  <div className="details-preview">
                    {imageCache[toImageKey(detailsItem.path, 512)] ? (
                      <img src={imageCache[toImageKey(detailsItem.path, 512)]} alt="" />
                    ) : (
                      <div className="empty-state">Loading preview...</div>
                    )}
                  </div>
                ) : null}
                {detailsItem.scope === "Local" && isVideoFile(detailsItem.name) ? (
                  <div className="details-preview video">
                    {videoPreviewCache[toVideoKey(detailsItem.path, 0)] ? (
                      <video
                        src={videoPreviewCache[toVideoKey(detailsItem.path, 0)]}
                        controls
                        preload="metadata"
                        onError={() => {
                          if (!isTauri) return;
                          const key = toVideoKey(detailsItem.path, 0);
                          if (videoPreviewErrors[key]) return;
                          invoke<string>("read_local_video_data", {
                            path: detailsItem.path,
                            maxBytes: maxVideoPreviewBytes,
                          })
                            .then((dataUrl) => {
                              setVideoPreviewCache((prev) => ({
                                ...prev,
                                [key]: dataUrl,
                              }));
                            })
                            .catch((error) => {
                              const message =
                                error instanceof Error ? error.message : String(error);
                              setVideoPreviewErrors((prev) => ({
                                ...prev,
                                [key]: message,
                              }));
                            });
                        }}
                      />
                    ) : videoPreviewErrors[toVideoKey(detailsItem.path, 0)] === "too_large" ? (
                      <div className="empty-state">
                        Video too large for preview (over {Math.round(maxVideoPreviewBytes / 1_000_000)}MB).
                      </div>
                    ) : videoPreviewErrors[toVideoKey(detailsItem.path, 0)] ? (
                      <div className="empty-state">Video preview unavailable.</div>
                    ) : (
                      <div className="empty-state">Loading preview...</div>
                    )}
                  </div>
                ) : null}
                <div className="details-name">{detailsItem.name}</div>
                <div className="details-scope">{detailsItem.scope}</div>
                <div className="details-row">
                  <span>Type</span>
                  <span>{detailsItem.isDir ? "Folder" : "File"}</span>
                </div>
                <div className="details-row">
                  <span>Size</span>
                  <span>{detailsItem.isDir ? "-" : formatBytes(detailsItem.size)}</span>
                </div>
                <div className="details-row">
                  <span>Modified</span>
                  <span>{formatDate(detailsItem.modified)}</span>
                </div>
                {detailsItem.created ? (
                  <div className="details-row">
                    <span>Created</span>
                    <span>{formatDate(detailsItem.created)}</span>
                  </div>
                ) : null}
                {detailsItem.taken ? (
                  <div className="details-row">
                    <span>Date taken</span>
                    <span>{formatDate(detailsItem.taken)}</span>
                  </div>
                ) : null}
                {detailsItem.dimensions ? (
                  <div className="details-row">
                    <span>Dimensions</span>
                    <span>
                      {detailsItem.dimensions.width} x {detailsItem.dimensions.height}
                    </span>
                  </div>
                ) : null}
                {detailsItem.rating ? (
                  <div className="details-row">
                    <span>Rating</span>
                    <span>{detailsItem.rating}</span>
                  </div>
                ) : null}
                {detailsItem.tags?.length ? (
                  <div className="details-row">
                    <span>Tags</span>
                    <span>{detailsItem.tags.join(", ")}</span>
                  </div>
                ) : null}
                <div className="details-row">
                  <span>Path</span>
                  <span className="details-path">
                    {!isTauri && detailsItem.scope === "Local"
                      ? detailsItem.name
                      : detailsItem.path}
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty-state">Select an item to see details.</div>
            )}
          </aside>
        </section>
      </main>

      {modal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              {modal.type === "mkdir" && `New ${modal.scope} folder`}
              {modal.type === "rename" && `Rename ${modal.scope} item`}
              {modal.type === "delete" && `Delete ${modal.scope} item`}
              {modal.type === "ftp-bookmark" && "Save connection bookmark"}
              {modal.type === "prefs" && "Preferences"}
            </div>
            {modal.type !== "delete" && modal.type !== "prefs" && (
              <input
                autoFocus
                value={modalValue}
                onChange={(event) => setModalValue(event.target.value)}
                placeholder="Enter a name"
              />
            )}
            {modal.type === "delete" && (
              <p>
                Delete <strong>{modal.targetName}</strong>? This cannot be undone.
              </p>
            )}
            {modal.type === "prefs" && (
              <div className="modal-form">
                <label>
                  Theme
                  <Dropdown
                    value={themeMode}
                    onChange={(value) => setThemeMode(value as ThemeMode)}
                    sections={[{ options: themeOptions }]}
                  />
                </label>
                <label className={!isPremium ? "disabled" : ""}>
                  Upload speed (KB/s)
                  <input
                    type="number"
                    min={0}
                    value={uploadLimitKbps}
                    onChange={(event) => setUploadLimitKbps(Number(event.target.value))}
                    disabled={!isPremium}
                  />
                </label>
                <label className={!isPremium ? "disabled" : ""}>
                  Download speed (KB/s)
                  <input
                    type="number"
                    min={0}
                    value={downloadLimitKbps}
                    onChange={(event) => setDownloadLimitKbps(Number(event.target.value))}
                    disabled={!isPremium}
                  />
                </label>
                <label className="checkbox-field">
                  Open on startup
                  <input
                    type="checkbox"
                    checked={openOnStartup}
                    onChange={(event) => setOpenOnStartup(event.target.checked)}
                  />
                </label>
                <label className="checkbox-field">
                  Minimize to system tray
                  <input
                    type="checkbox"
                    checked={minimizeToTray}
                    onChange={(event) => setMinimizeToTray(event.target.checked)}
                  />
                </label>
                <label className="checkbox-field">
                  Close to system tray
                  <input
                    type="checkbox"
                    checked={closeToTray}
                    onChange={(event) => setCloseToTray(event.target.checked)}
                  />
                </label>
                <div className="side-muted">
                  Applies immediately on this device.
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button onClick={closeModal} className="ghost">
                {modal.type === "prefs" ? "Close" : "Cancel"}
              </button>
              {modal.type !== "prefs" ? (
                <button onClick={confirmModal} className="primary">
                  Confirm
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}








