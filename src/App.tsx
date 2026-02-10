import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/api/dialog";
import { open as openExternal } from "@tauri-apps/api/shell";
import {
  isEntitledForApp,
  openAppBrowser,
  readSharedPreferences,
  refreshLaunchToken,
  writeSharedPreferences,
  type LaunchToken,
} from "@enderfall/runtime";
import { AccessGate, Button, Dropdown, Input, MainHeader, Modal, Panel, PreferencesModal, SideMenu, SideMenuSubmenu, Toggle, applyTheme, getStoredTheme } from "@enderfall/ui";
import {
  FiChevronRight,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiArrowDown,
  FiArrowUp,
  FiBox,
  FiCalendar,
  FiPlusCircle,
  FiCamera,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFilm,
  FiFile,
  FiFileText,
  FiFolder,
  FiFolderPlus,
  FiHardDrive,
  FiHome,
  FiImage,
  FiInfo,
  FiMaximize2,
  FiMonitor,
  FiMusic,
  FiPlus,
  FiScissors,
  FiTag,
  FiType,
} from "react-icons/fi";
import {
  BiColumns,
  BiGridAlt,
  BiGridSmall,
  BiListUl,
  BiTable,
} from "react-icons/bi";
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

const getPlaceIcon = (label: string) => {
  const normalized = label.trim().toLowerCase();
  if (normalized === "this pc") return <FiHardDrive />;
  if (normalized === "home") return <FiHome />;
  if (normalized === "desktop") return <FiMonitor />;
  if (normalized === "documents") return <FiFileText />;
  if (normalized === "downloads") return <FiDownload />;
  if (normalized === "pictures") return <FiImage />;
  if (normalized === "music") return <FiMusic />;
  if (normalized === "videos") return <FiFilm />;
  return <FiFolder />;
};

const withViewIcon = (icon: JSX.Element, size = 16) => (
  <span className="view-icon" style={{ ["--view-icon-size" as any]: `${size}px` }}>
    {icon}
  </span>
);

const getViewModeIcon = (mode: ViewMode) => {
  switch (mode) {
    case "details":
      return withViewIcon(<BiTable />);
    case "list":
      return withViewIcon(<BiListUl />);
    case "tiles":
      return withViewIcon(<BiGridAlt />);
    case "content":
      return withViewIcon(<BiColumns />);
    case "small-icons":
      return withViewIcon(<BiGridSmall />, 12);
    case "medium-icons":
      return withViewIcon(<BiGridSmall />, 18);
    case "large-icons":
      return withViewIcon(<BiGridSmall />, 26);
    case "extra-large-icons":
      return withViewIcon(<BiGridSmall />, 34);
    default:
      return withViewIcon(<BiTable />);
  }
};

const getSortByIcon = (value: SortBy) => {
  switch (value) {
    case "name":
      return <FiType />;
    case "date":
      return <FiCalendar />;
    case "type":
      return <FiFile />;
    case "size":
      return <FiBox />;
    case "tags":
      return <FiTag />;
    case "date-created":
      return <FiPlusCircle />;
    case "date-modified":
      return <FiEdit2 />;
    case "date-taken":
      return <FiCamera />;
    case "dimensions":
      return <FiMaximize2 />;
    case "rating":
      return <IconStar />;
    default:
      return <FiType />;
  }
};

const getSortOrderIcon = (value: SortOrder) => {
  if (value === "desc") return <FiArrowDown />;
  return <FiArrowUp />;
};

const getEntryTypeIcon = ({
  isDir,
  isImage,
  isVideo,
}: {
  isDir: boolean;
  isImage: boolean;
  isVideo: boolean;
}) => {
  if (isDir) return <FiFolder />;
  if (isImage) return <FiImage />;
  if (isVideo) return <FiFilm />;
  return <FiFileText />;
};

type ContextMenuEntry = {
  scope: "local" | "remote";
  name: string;
  path: string;
  isDir: boolean;
  isImage: boolean;
  isVideo: boolean;
};

type ContextMenuState =
  | { kind: "entry"; x: number; y: number; entry: ContextMenuEntry }
  | { kind: "pane"; x: number; y: number; scope: "local" | "remote" };

type RenameState = {
  scope: "local" | "remote";
  path: string;
  name: string;
  isDir: boolean;
  value: string;
};

type ClipboardState = {
  mode: "cut" | "copy";
  scope: "local" | "remote";
  entries: {
    name: string;
    path: string;
    isDir: boolean;
  }[];
};

type PreviewState = {
  name: string;
  path: string;
  isVideo: boolean;
  isImage: boolean;
  scope: "local" | "remote";
};

type HistoryAction = {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

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

const PaneSortMenu = ({
  sortBy,
  sortOrder,
  onSortBy,
  onSortOrder,
}: {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortBy: (value: SortBy) => void;
  onSortOrder: (value: SortOrder) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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
    <div className={`bookmark-dropdown pane-sort-dropdown ${open ? "open" : ""}`} ref={ref}>
      <button className="bookmark-trigger" type="button" onClick={() => setOpen((prev) => !prev)}>
        <span className="bookmark-icon sort-icon"><FiArrowDown /></span>
        <span className="bookmark-text">Sort</span>
        <span className="bookmark-caret">
          <IconChevronDown />
        </span>
      </button>
      <div className="bookmark-menu">
        <SideMenu resetKey={open}>
          {sortPrimaryOptions.map((item) => (
            <button
              key={item.value}
              className={`bookmark-item ${sortBy === item.value ? "active" : ""}`}
              type="button"
              onClick={() => {
                onSortBy(item.value);
                setOpen(false);
              }}
            >
              <span className="bookmark-icon sort-icon">{getSortByIcon(item.value)}</span>
              <span className="bookmark-text">{item.label}</span>
            </button>
          ))}
          <div className="context-menu-separator" role="separator" />
        <SideMenuSubmenu
          id="pane-sort-more"
          className="bookmark-submenu"
          panelClassName="bookmark-submenu-panel"
          enableViewportFlip
          trigger={(triggerProps) => (
            <button
              className="bookmark-item is-submenu"
              type="button"
              onClick={triggerProps.onClick}
              aria-expanded={triggerProps["aria-expanded"]}
              disabled={triggerProps.disabled}
            >
              <span className="bookmark-text">More</span>
              <span className="bookmark-caret">
                <FiChevronRight />
              </span>
            </button>
          )}
        >
            {sortMoreOptions.map((item) => (
              <button
                key={item.value}
                className={`bookmark-item ${sortBy === item.value ? "active" : ""}`}
                type="button"
                onClick={() => {
                  onSortBy(item.value);
                  setOpen(false);
                }}
              >
                <span className="bookmark-icon sort-icon">{getSortByIcon(item.value)}</span>
                <span className="bookmark-text">{item.label}</span>
              </button>
            ))}
          </SideMenuSubmenu>
        <SideMenuSubmenu
          id="pane-sort-order"
          className="bookmark-submenu"
          panelClassName="bookmark-submenu-panel"
          enableViewportFlip
          trigger={(triggerProps) => (
            <button
              className="bookmark-item is-submenu"
              type="button"
              onClick={triggerProps.onClick}
              aria-expanded={triggerProps["aria-expanded"]}
              disabled={triggerProps.disabled}
            >
              <span className="bookmark-text">Order</span>
              <span className="bookmark-caret">
                <FiChevronRight />
              </span>
            </button>
          )}
        >
            {sortOrderOptions.map((item) => (
              <button
                key={item.value}
                className={`bookmark-item ${sortOrder === item.value ? "active" : ""}`}
                type="button"
                onClick={() => {
                  onSortOrder(item.value);
                  setOpen(false);
                }}
              >
                <span className="bookmark-icon sort-icon">{getSortOrderIcon(item.value)}</span>
                <span className="bookmark-text">{item.label}</span>
              </button>
            ))}
          </SideMenuSubmenu>
        </SideMenu>
      </div>
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

type ThemeMode = "galaxy" | "system" | "light" | "plain-light" | "plain-dark";

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

const sortOrderOptions: { value: SortOrder; label: string }[] = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System (Default)" },
  { value: "galaxy", label: "Galaxy (Dark)" },
  { value: "light", label: "Galaxy (Light)" },
  { value: "plain-light", label: "Plain Light" },
  { value: "plain-dark", label: "Plain Dark" },
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

const handleEllipsisTooltip = (event: ReactMouseEvent<HTMLElement>) => {
  const target = event.currentTarget;
  if (target.scrollWidth > target.clientWidth) {
    target.setAttribute("title", target.textContent ?? "");
  } else {
    target.removeAttribute("title");
  }
};

const clearEllipsisTooltip = (event: ReactMouseEvent<HTMLElement>) => {
  event.currentTarget.removeAttribute("title");
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
  const shellRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(21);
  const [protocol, setProtocol] = useState<"ftp" | "sftp">("ftp");
  const [sftpPort, setSftpPort] = useState(22);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionDetailOpen, setConnectionDetailOpen] = useState(true);
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
  const [activeTransferIds, setActiveTransferIds] = useState<Set<string>>(new Set());
  const maxConcurrentTransfers = isTauri ? 1 : 3;
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
      allowed: ["galaxy", "system", "light", "plain-light", "plain-dark"],
    })
  );
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const sharedThemeUpdatedAtRef = useRef<number>(0);
  const sharedThemeApplyRef = useRef<ThemeMode | null>(null);
  const sharedAnimationsApplyRef = useRef<boolean | null>(null);
  const sharedThemeAllowed = useMemo(
    () => new Set<ThemeMode>(["system", "galaxy", "light", "plain-light", "plain-dark"]),
    []
  );
  const [entitlementStatus, setEntitlementStatus] = useState<"checking" | "allowed" | "locked">(
    isTauri ? "checking" : "allowed"
  );
  const [requestedBrowser, setRequestedBrowser] = useState(false);
  const [isPremium, setIsPremium] = useState(isTauri);
  const [entitlementDebug, setEntitlementDebug] = useState<string>("");
  const [launchToken, setLaunchToken] = useState<LaunchToken | null>(null);
  const [uploadLimitKbps, setUploadLimitKbps] = useState(() => {
    const stored = localStorage.getItem("uploadLimitKbps");
    return stored ? Number(stored) : 0;
  });
  const [downloadLimitKbps, setDownloadLimitKbps] = useState(() => {
    const stored = localStorage.getItem("downloadLimitKbps");
    return stored ? Number(stored) : 0;
  });

  useEffect(() => {
    const shell = shellRef.current;
    const workspace = workspaceRef.current;
    const storedSidebar = localStorage.getItem("ftpSidebarWidth");
    const storedDetails = localStorage.getItem("ftpDetailsWidth");
    const storedMainHeight = localStorage.getItem("ftpMainHeight");
    const storedDefaultHeight = localStorage.getItem("ftpMainHeightDefault");
    if (shell && !storedDefaultHeight) {
      localStorage.setItem("ftpMainHeightDefault", String(shell.getBoundingClientRect().height));
    }
    if (shell && storedSidebar) {
      shell.style.setProperty("--sidebar-width", `${Number(storedSidebar)}px`);
    }
    if (workspace && storedDetails) {
      workspace.style.setProperty("--details-width", `${Number(storedDetails)}px`);
    }
    if (shell && storedMainHeight) {
      shell.style.setProperty("--main-height", `${Number(storedMainHeight)}px`);
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    let active = true;
    readSharedPreferences()
      .then((prefs) => {
        if (!active || !prefs) return;
        const updatedAt = prefs.updatedAt ?? 0;
        sharedThemeUpdatedAtRef.current = updatedAt;
        if (prefs.themeMode) {
          const nextTheme = prefs.themeMode as ThemeMode;
          if (sharedThemeAllowed.has(nextTheme) && nextTheme !== themeMode) {
            sharedThemeApplyRef.current = nextTheme;
            setThemeMode(nextTheme);
          }
        }
        if (typeof prefs.animationsEnabled === "boolean") {
          if (prefs.animationsEnabled !== animationsEnabled) {
            sharedAnimationsApplyRef.current = prefs.animationsEnabled;
            setAnimationsEnabled(prefs.animationsEnabled);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyResolvedTheme = () => {
      const resolvedTheme =
        themeMode === "system" ? (media.matches ? "galaxy" : "light") : themeMode;
      const isGalaxy = resolvedTheme === "galaxy";
      const isLight = resolvedTheme === "light";
      document.documentElement.setAttribute("data-theme", resolvedTheme);
      document.body.classList.toggle("ef-galaxy", isGalaxy);
      document.body.classList.toggle("ef-galaxy-light", isLight);
    };
    if (themeMode === "system") {
      localStorage.setItem("themeMode", "system");
    } else {
      applyTheme(themeMode, {
        storageKey: "themeMode",
        defaultTheme: "system",
        allowed: ["galaxy", "system", "light", "plain-light", "plain-dark"],
      });
    }
    applyResolvedTheme();
    if (themeMode !== "system") return;
    const handler = () => applyResolvedTheme();
    if ("addEventListener" in media) {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute(
      "data-reduce-motion",
      animationsEnabled ? "false" : "true"
    );
  }, [animationsEnabled]);

  useEffect(() => {
    if (!isTauri) return;
    if (sharedThemeApplyRef.current === themeMode) {
      sharedThemeApplyRef.current = null;
      return;
    }
    if (!sharedThemeAllowed.has(themeMode)) return;
    writeSharedPreferences({ themeMode })
      .then((prefs) => {
        if (prefs?.updatedAt) sharedThemeUpdatedAtRef.current = prefs.updatedAt;
      })
      .catch(() => undefined);
  }, [themeMode, sharedThemeAllowed]);

  useEffect(() => {
    if (!isTauri) return;
    if (sharedAnimationsApplyRef.current === animationsEnabled) {
      sharedAnimationsApplyRef.current = null;
      return;
    }
    writeSharedPreferences({ animationsEnabled })
      .then((prefs) => {
        if (prefs?.updatedAt) sharedThemeUpdatedAtRef.current = prefs.updatedAt;
      })
      .catch(() => undefined);
  }, [animationsEnabled]);

  useEffect(() => {
    if (!isTauri) return;
    const interval = window.setInterval(async () => {
      try {
        const prefs = await readSharedPreferences();
        if (!prefs) return;
        const updatedAt = prefs.updatedAt ?? 0;
        if (updatedAt <= sharedThemeUpdatedAtRef.current) return;
        sharedThemeUpdatedAtRef.current = updatedAt;
        if (prefs.themeMode) {
          const nextTheme = prefs.themeMode as ThemeMode;
          if (sharedThemeAllowed.has(nextTheme) && nextTheme !== themeMode) {
            sharedThemeApplyRef.current = nextTheme;
            setThemeMode(nextTheme);
          }
        }
        if (typeof prefs.animationsEnabled === "boolean") {
          if (prefs.animationsEnabled !== animationsEnabled) {
            sharedAnimationsApplyRef.current = prefs.animationsEnabled;
            setAnimationsEnabled(prefs.animationsEnabled);
          }
        }
      } catch {
        // ignore poll failures
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [themeMode, sharedThemeAllowed]);

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
    const token = await refreshLaunchToken(appId);
    console.log("[Ender Transfer] launch token", token);
    setLaunchToken(token);
    const allowed = isEntitledForApp(token, appId);
    setEntitlementStatus(allowed ? "allowed" : "locked");
    setIsPremium(allowed);
    const now = Date.now();
    const expires = token?.expiresAt ?? 0;
    const debug = token
      ? `token ${token.appId} exp ${new Date(expires).toLocaleString()} (${expires - now}ms)`
      : "no token found";
    setEntitlementDebug(debug);
  };

  useEffect(() => {
    refreshEntitlement();
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    const interval = window.setInterval(() => {
      refreshEntitlement();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [isTauri]);

  useEffect(() => {
    if (entitlementStatus !== "locked" || requestedBrowser) return;
    setRequestedBrowser(true);
    handleOpenAppBrowser();
  }, [entitlementStatus, requestedBrowser]);

  useEffect(() => {
    setConnectionDetailOpen(!connected);
  }, [connected]);

  const startResize =
    (target: "sidebar" | "details") => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
    const startX = event.clientX;
    const shell = shellRef.current;
    const workspace = workspaceRef.current;
    const sidebar = sidebarRef.current;
    const details = detailsRef.current;
    const startWidth =
      target === "sidebar"
        ? sidebar?.getBoundingClientRect().width ?? 240
        : details?.getBoundingClientRect().width ?? 260;
    const containerWidth =
      target === "sidebar"
        ? shell?.getBoundingClientRect().width ?? window.innerWidth
        : workspace?.getBoundingClientRect().width ?? window.innerWidth;
    const minWidth = target === "sidebar" ? 200 : 220;
    const maxWidth = Math.max(minWidth, Math.min(520, containerWidth - 320));

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextRaw = target === "details" ? startWidth - delta : startWidth + delta;
      const next = Math.min(maxWidth, Math.max(minWidth, nextRaw));
      if (target === "sidebar" && shell) {
        shell.style.setProperty("--sidebar-width", `${next}px`);
      }
      if (target === "details" && workspace) {
        workspace.style.setProperty("--details-width", `${next}px`);
      }
    };

    const handleUp = () => {
      const value =
        target === "sidebar"
          ? shell?.style.getPropertyValue("--sidebar-width")
          : workspace?.style.getPropertyValue("--details-width");
      if (value) {
        const parsed = Number(value.replace("px", ""));
        if (!Number.isNaN(parsed)) {
          localStorage.setItem(
            target === "sidebar" ? "ftpSidebarWidth" : "ftpDetailsWidth",
            String(parsed)
          );
        }
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const startResizeVertical = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const shell = shellRef.current;
    if (!shell) return;
    const startY = event.clientY;
    const startHeight = shell.getBoundingClientRect().height;
    const storedDefault = localStorage.getItem("ftpMainHeightDefault");
    const minHeight = storedDefault ? Number(storedDefault) : startHeight;
    const maxHeight = Math.max(minHeight, window.innerHeight - 220);

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      const next = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));
      shell.style.setProperty("--main-height", `${next}px`);
    };

    const handleUp = () => {
      const value = shell.style.getPropertyValue("--main-height");
      if (value) {
        const parsed = Number(value.replace("px", ""));
        if (!Number.isNaN(parsed)) {
          localStorage.setItem("ftpMainHeight", String(parsed));
        }
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "row-resize";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleOpenAppBrowser = async () => {
    console.log("[Ender Transfer] open Enderfall Hub");
    await openAppBrowser(appId);
  };

  const openProfile = () => {
    const url = "https://enderfall.co.uk/profile";
    if (isTauri) {
      openExternal(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [activePane, setActivePane] = useState<"local" | "remote">("local");
  const [localViewMode, setLocalViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("viewModeLocal") ?? localStorage.getItem("viewMode");
    if (stored && viewModeOptions.some((item) => item.value === stored)) {
      return stored as ViewMode;
    }
    return "details";
  });
  const [remoteViewMode, setRemoteViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("viewModeRemote") ?? localStorage.getItem("viewMode");
    if (stored && viewModeOptions.some((item) => item.value === stored)) {
      return stored as ViewMode;
    }
    return "details";
  });
  const [localSortBy, setLocalSortBy] = useState<SortBy>(() => {
    const stored = localStorage.getItem("sortByLocal") ?? localStorage.getItem("sortBy");
    const available = [...sortPrimaryOptions, ...sortMoreOptions];
    if (stored && available.some((item) => item.value === stored)) {
      return stored as SortBy;
    }
    return "name";
  });
  const [remoteSortBy, setRemoteSortBy] = useState<SortBy>(() => {
    const stored = localStorage.getItem("sortByRemote") ?? localStorage.getItem("sortBy");
    const available = [...sortPrimaryOptions, ...sortMoreOptions];
    if (stored && available.some((item) => item.value === stored)) {
      return stored as SortBy;
    }
    return "name";
  });
  const [localSortOrder, setLocalSortOrder] = useState<SortOrder>(() => {
    const stored = localStorage.getItem("sortOrderLocal") ?? localStorage.getItem("sortOrder");
    return stored === "desc" ? "desc" : "asc";
  });
  const [remoteSortOrder, setRemoteSortOrder] = useState<SortOrder>(() => {
    const stored = localStorage.getItem("sortOrderRemote") ?? localStorage.getItem("sortOrder");
    return stored === "desc" ? "desc" : "asc";
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextPaneSortOpen, setContextPaneSortOpen] = useState(false);
  const appRef = useRef<HTMLDivElement | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [clipboardState, setClipboardState] = useState<ClipboardState | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);

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

  const activeCount = useMemo(
    () => queue.filter((item) => item.status === "active").length,
    [queue]
  );

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

  /* ── Global keyboard shortcuts ── */
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      // Skip when user is typing in an input / textarea / contentEditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      // Skip when a modal or context menu is open
      if (contextMenu) return;

      // Delete – delete selected item
      if (e.key === "Delete") {
        e.preventDefault();
        openActiveDelete();
        return;
      }
      // F2 – rename selected item
      if (e.key === "F2") {
        e.preventDefault();
        openActiveRename();
        return;
      }
      // Ctrl+Z – undo
      if (e.ctrlKey && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undoLast();
        return;
      }
      // Ctrl+Y – redo
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redoLast();
        return;
      }
      // Ctrl+Shift+C – copy path
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        (async () => {
          let value = "";
          if (activePane === "local") {
            value = selectedLocal[0] ?? localPath;
          } else {
            const sel = selectedRemote[0];
            value = sel ? buildRemotePath(remotePath || "/", sel) : remotePath || "/";
          }
          if (!value) return;
          try {
            await navigator.clipboard.writeText(value);
            addLog("info", "Path copied to clipboard.");
          } catch {
            addLog("error", "Unable to copy path.");
          }
        })();
        return;
      }
      // Ctrl+A – select all in active pane
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        if (activePane === "local") {
          setSelectedLocal(localEntries.map((item) => item.path));
        } else {
          setSelectedRemote(remoteEntries.map((item) => item.name));
        }
        return;
      }
      // Alt+Enter – properties (local only, Tauri only)
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        if (activePane === "local" && isTauri) {
          const target = selectedLocal[0] ?? localPath;
          if (target && target !== "this_pc") {
            invoke("open_properties", { path: target }).catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              addLog("error", message);
            });
          }
        }
        return;
      }
      // Enter – open selected item
      if (e.key === "Enter") {
        e.preventDefault();
        if (activePane === "local") {
          const target = selectedLocal[0];
          const entry = localEntries.find((item) => item.path === target);
          if (entry) {
            openEntry({
              scope: "local",
              name: entry.name,
              path: entry.path,
              isDir: entry.is_dir,
              isImage: !entry.is_dir && isImageFile(entry.name),
              isVideo: !entry.is_dir && isVideoFile(entry.name),
            });
          }
        } else {
          const target = selectedRemote[0];
          const entry = remoteEntries.find((item) => item.name === target);
          if (entry) {
            openEntry({
              scope: "remote",
              name: entry.name,
              path: buildRemotePath(remotePath || "/", entry.name),
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
  });

  const displayName =
    launchToken?.displayName || launchToken?.email?.split("@")[0] || "Account";
  const rawAvatarUrl = launchToken?.avatarUrl ?? null;
  const normalizedAvatarPath = launchToken?.avatarPath
    ? launchToken.avatarPath.replace(/\\/g, "/")
    : null;
  const canUseLocalAvatar =
    isTauri &&
    typeof window !== "undefined" &&
    (window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost");
  const avatarUrl =
    canUseLocalAvatar && normalizedAvatarPath ? convertFileSrc(normalizedAvatarPath) : rawAvatarUrl;
  const avatarUrlFallback = canUseLocalAvatar && normalizedAvatarPath ? rawAvatarUrl : null;

  const filteredLocalEntries = useMemo(() => {
    const query = localSearch.trim().toLowerCase();
    const filtered = query
      ? localEntries.filter((entry) => entry.name.toLowerCase().includes(query))
      : localEntries;
    const getValue = (entry: LocalEntry) => {
      switch (localSortBy) {
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
    return sortEntries(filtered, localSortBy, localSortOrder, getValue);
  }, [localEntries, localSearch, localSortBy, localSortOrder]);

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

      // Handle directory uploads recursively (Tauri only)
      if (entry.is_dir) {
        if (!isTauri) {
          addLog("info", `Folder upload "${entry.name}" is only supported in the desktop app.`);
          continue;
        }
        try {
          const children: { relative_path: string; is_dir: boolean; size: number | null }[] =
            await invoke("list_local_files_recursive", { root: entry.path });
          const baseRemote = buildRemotePath(remotePath || "/", entry.name);
          // Create the root remote directory
          try { await invoke("create_dir", { path: baseRemote }); } catch { /* may exist */ }
          // Create remote subdirectories
          for (const child of children) {
            if (child.is_dir) {
              try {
                await invoke("create_dir", { path: buildRemotePath(baseRemote, child.relative_path) });
              } catch {
                // Directory may already exist
              }
            }
          }
          // Enqueue files
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

    for (const name of names) {
      const entry = remoteEntries.find((item) => item.name === name);
      if (!entry) continue;

      // Handle directory downloads recursively (Tauri only)
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
          // Create local directories first (including the root folder)
          try { await invoke("create_local_dir", { path: baseLocal }); } catch { /* may exist */ }
          for (const child of children) {
            if (child.is_dir) {
              try {
                const dirPath = await join(baseLocal, ...child.relative_path.split("/"));
                await invoke("create_local_dir", { path: dirPath });
              } catch {
                // Directory may already exist
              }
            }
          }
          // Enqueue files
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
        // For items from recursive folder listing, localPath is already a full path
        if (item.localPath !== localPath && item.localPath !== "browser") {
          return item;
        }
        return {
          ...item,
          localPath: await join(item.localPath, item.name),
        };
      })
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

      const next: Favorite[] = [];
      if (home) next.push({ label: "Home", path: home });
      if (desktop) next.push({ label: "Desktop", path: desktop });
      if (documents) next.push({ label: "Documents", path: documents });
      if (downloads) next.push({ label: "Downloads", path: downloads });
      if (pictures) next.push({ label: "Pictures", path: pictures });

      if (home) {
        const musicPath = await join(home, "Music");
        const videosPath = await join(home, "Videos");
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
    localStorage.setItem("viewModeLocal", localViewMode);
  }, [localViewMode]);

  useEffect(() => {
    localStorage.setItem("viewModeRemote", remoteViewMode);
  }, [remoteViewMode]);


  useEffect(() => {
    localStorage.setItem("sortByLocal", localSortBy);
  }, [localSortBy]);

  useEffect(() => {
    localStorage.setItem("sortByRemote", remoteSortBy);
  }, [remoteSortBy]);

  useEffect(() => {
    localStorage.setItem("sortOrderLocal", localSortOrder);
  }, [localSortOrder]);

  useEffect(() => {
    localStorage.setItem("sortOrderRemote", remoteSortOrder);
  }, [remoteSortOrder]);

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
    const thumbSize = viewThumbSize(localViewMode);
    if (localViewMode === "details") return;
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
  }, [filteredLocalEntries, imageCache, localViewMode]);

  useEffect(() => {
    const thumbSize = viewThumbSize(localViewMode);
    if (localViewMode === "details") return;
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
  }, [filteredLocalEntries, videoThumbCache, localViewMode]);

  useEffect(() => {
    if (!isTauri) return;
    // Buffer progress events and flush at a throttled interval to avoid excessive re-renders
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
          return {
            ...item,
            transferred: update.transferred,
            total: update.total ?? item.total,
          };
        })
      );
    };

    const setup = async () => {
      progressFlushTimer = setInterval(flushProgress, 500);

      const unlistenLog = await listen<LogEntry>("log", (event) => {
        setLogs((prev) => [event.payload, ...prev.slice(0, 199)]);
      });
      const unlistenProgress = await listen<TransferProgress>("transfer-progress", (event) => {
        const payload = event.payload;
        progressBuffer.set(payload.id, {
          transferred: payload.transferred,
          total: payload.total,
        });
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
      if (progressFlushTimer) clearInterval(progressFlushTimer);
      flushProgress(); // flush any remaining buffered progress
      cleanupPromise.then((cleanup) => cleanup()).catch(() => null);
    };
  }, []);

  useEffect(() => {
    if (activeTransferIds.size >= maxConcurrentTransfers || !queue.length) return;
    const next = queue.find((item) => item.status === "queued");
    if (!next) return;

    // Mark as active immediately to prevent re-picking
    setActiveTransferIds((prev) => new Set(prev).add(next.id));
    setQueue((prev) =>
      prev.map((item) =>
        item.id === next.id ? { ...item, status: "active" } : item
      )
    );

    const runTransfer = async () => {
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
        setActiveTransferIds((prev) => {
          const updated = new Set(prev);
          updated.delete(next.id);
          return updated;
        });
      }
    };

    runTransfer();
  }, [activeTransferIds.size, queue, host, port, username, password]);

  /* ── Transfer queue management ── */
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
      // Keep only the currently active transfer
      setQueue((prev) => prev.filter((item) => item.status === "active"));
    } else {
      setQueue([]);
    }
  };

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
  };

  const deleteFtpBookmark = (name: string) => {
    const next = ftpBookmarks.filter((item) => item.name !== name);
    setFtpBookmarks(next);
    saveFtpBookmarks(next);
    if (selectedFtpBookmark === name) {
      setSelectedFtpBookmark("");
    }
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

  const pushHistory = (action: HistoryAction) => {
    setHistoryStack((prev) => [action, ...prev].slice(0, 50));
    setRedoStack([]);
  };

  const undoLast = async () => {
    const action = historyStack[0];
    if (!action) return;
    try {
      await action.undo();
      setHistoryStack((prev) => prev.slice(1));
      setRedoStack((prev) => [action, ...prev]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const redoLast = async () => {
    const action = redoStack[0];
    if (!action) return;
    try {
      await action.redo();
      setRedoStack((prev) => prev.slice(1));
      setHistoryStack((prev) => [action, ...prev]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
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

  const detailsPaneClass = "workspace details-right";

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
    if (!("__TAURI_IPC__" in window)) return;
    const client = document.createElement("script");
    client.type = "module";
    client.src = "http://127.0.0.1:1420/@vite/client";
    document.head.appendChild(client);
    return () => {
      client.remove();
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
  const contextCanUndo = historyStack.length > 0;
  const contextCanRedo = redoStack.length > 0;
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
      <header className="topbar explorer-topbar">
        <Panel variant="card" borderWidth={1} className="connection-card compact">
          <div className="connection-header">
            <div className="section-title">Connection</div>
            <Button
              variant="ghost"
              className="connection-toggle-button"
              onClick={() => setConnectionDetailOpen((prev) => !prev)}
              aria-expanded={connectionDetailOpen}
              type="button"
            >
              {connectionDetailOpen ? "Hide" : "Show"}
            </Button>
          </div>
          <div className={connectionDetailOpen ? "connection-body" : "connection-body is-collapsed"}>
            <div className="connection-grid">
            <label>
              Host
              <Input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="ftp.example.com"
              />
            </label>
            <label>
              Port
              <Input
                type="number"
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </label>
            <label>
              Protocol
              <Dropdown
                variant="bookmark"
                layout="field"
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
                <Input
                  type="number"
                  value={sftpPort}
                  onChange={(event) => setSftpPort(Number(event.target.value))}
                />
              </label>
            ) : null}
            <label>
              Username
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="anonymous"
              />
            </label>
            <label>
              Password
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="connection-toggle">
              <Toggle
                checked={savePassword}
                onChange={(event) => setSavePassword(event.target.checked)}
                label="Save password"
              />
            </div>
            </div>
          </div>

          <div className={connectionDetailOpen ? "connection-body" : "connection-body is-collapsed"}>
            <div className="connection-actions">
              <div className="connection-actions-main">
                <div className="connection-bookmarks">
                  <Dropdown
                    variant="bookmark"
                    label="Bookmarks"
                    value={selectedFtpBookmark}
                    placeholder="Select a saved connection"
                    sections={[
                      {
                        options: ftpBookmarks.map((item) => ({
                          value: item.name,
                          label: item.name,
                          meta: item,
                        })),
                      },
                    ]}
                    onChange={(next, option) => handleFtpBookmarkSelect(option?.value ?? next)}
                    renderTriggerIcon={
                      selectedFtp ? (selectedFtp.password ? <IconUnlock /> : <IconLock />) : <IconLock />
                    }
                    renderItemIcon={(option) => {
                      const item = option.meta as FtpBookmark | undefined;
                      return item?.password ? <IconUnlock /> : <IconLock />;
                    }}
                    caret={<IconChevronDown />}
                    emptyLabel="No saved connections."
                    emptyClassName="side-muted"
                  />
                </div>
                <Button
                  className="primary"
                  onClick={handleConnect}
                  disabled={connecting || connected}
                >
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
                <Button onClick={handleDisconnect} disabled={!connected}>
                  Disconnect
                </Button>
                <Button
                  onClick={openFtpBookmarkModal}
                  disabled={!isPremium}
                  title={!isPremium ? "Premium required" : "Save bookmark"}
                >
                  Save Bookmark
                </Button>
                <Button
                  onClick={() => deleteFtpBookmark(selectedFtpBookmark)}
                  disabled={!selectedFtpBookmark}
                  title="Delete selected bookmark"
                >
                  Delete Bookmark
                </Button>
              </div>
              <div className={`status-pill ${connected ? "online" : "offline"}`}>
                {connected ? "Connected" : "Disconnected"}
              </div>
            </div>
          </div>
        </Panel>
      </header>

      <main className="shell" ref={shellRef}>
        <Panel
          variant="card"
          borderWidth={1}
          className="sidebar"
          ref={sidebarRef}
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
                <Button
                  className={`side-item ${localPath === "this_pc" ? "active" : ""}`}
                  onClick={() => refreshLocal("this_pc")}
                >
                  <span className="side-item-icon">{getPlaceIcon("This PC")}</span>
                  <span className="side-item-label">This PC</span>
                </Button>
                {favorites.map((item) => (
                  <Button
                    key={item.path}
                    className={`side-item ${localPath === item.path ? "active" : ""}`}
                    onClick={() => refreshLocal(item.path)}
                  >
                    <span className="side-item-icon">{getPlaceIcon(item.label)}</span>
                    <span className="side-item-label">{item.label}</span>
                  </Button>
                ))}
                <Button className="side-item ghost" onClick={openLocalFolder}>
                  <span className="side-item-icon"><FiFolderPlus /></span>
                  <span className="side-item-label">Browse...</span>
                </Button>
              </>
            ) : (
              <Button className="side-item ghost" onClick={openLocalFolder}>
                <span className="side-item-icon"><FiFolderPlus /></span>
                <span className="side-item-label">Add files...</span>
              </Button>
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
                  <Button
                    className={`side-item ${localPath === item.path ? "active" : ""}`}
                    onClick={() => refreshLocal(item.path)}
                  >
                    <span className="side-item-icon"><IconStar /></span>
                    <span className="side-item-label">{item.label}</span>
                  </Button>
                  <Button
                    className="side-item remove"
                    onClick={() => removeLocalBookmark(item.path)}
                    title="Remove"
                  >
                    <IconTrash />
                  </Button>
                </div>
              ))
            )}
          </div>

        </Panel>
        <div
          className="resize-handle resize-handle--sidebar"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startResize("sidebar")}
        />

        <section className={detailsPaneClass} ref={workspaceRef}>
          <section className="panes explorer-panes">
            <Panel
              variant="card"
              borderWidth={1}
              ref={localPaneRef}
              className={`pane pane-local ${softDragTarget === "local" ? "soft-drop" : ""}`}
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
                        <Button
                          onClick={() => createNewFolder("local")}
                          disabled={!localPath || localPath === "this_pc"}
                        >
                          New folder
                        </Button>
                        <Button onClick={() => refreshLocal(localPath)} disabled={!localPath}>
                          Refresh
                        </Button>
                        <Button
                          className="icon-btn"
                          onClick={jumpLocalUp}
                          disabled={!localPath || localPath === "this_pc"}
                        >
                          Up
                        </Button>
                      </>
                    ) : (
                      <Button onClick={openLocalFolder}>Add files</Button>
                    )}
                    <Dropdown
                      variant="bookmark"
                      layout="field"
                      label="View"
                      triggerLabel="View"
                      value={localViewMode}
                      onChange={(next) => setLocalViewMode(next as ViewMode)}
                      renderItemIcon={(option) => getViewModeIcon(option.value as ViewMode)}
                      renderTriggerIcon={getViewModeIcon(localViewMode)}
                      sections={[
                        {
                          options: viewModeOptions.map((item) => ({
                            value: item.value,
                            label: item.label,
                          })),
                        },
                      ]}
                    />
                    <PaneSortMenu
                      sortBy={localSortBy}
                      sortOrder={localSortOrder}
                      onSortBy={setLocalSortBy}
                      onSortOrder={setLocalSortOrder}
                    />
                  </div>
                </div>

                <div className="address-row">
                  <div className="address-input">
                    <Input
                      value={localAddress}
                      onChange={(event) => setLocalAddress(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleLocalAddressSubmit();
                      }}
                      disabled={!isTauri}
                    />
                    <Button className="ghost" onClick={handleLocalAddressSubmit} disabled={!isTauri}>
                      Go
                    </Button>
                  </div>
                  <div className="search-row">
                    <Input
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
                className={`pane-body view-${localViewMode}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleDropLocal}
                onContextMenu={(event) => {
                  if (
                    (event.target as HTMLElement).closest(".entry-card") ||
                    (event.target as HTMLElement).closest(".table-row")
                  ) {
                    return;
                  }
                  openPaneContextMenu(event, "local");
                }}
              >
                {localViewMode === "details" ? (
                  <>
                    <Panel variant="highlight" borderWidth={1} className="table-row table-head">
                      <span>Name</span>
                      <span>Size</span>
                      <span>Modified</span>
                      <span>Actions</span>
                    </Panel>
                    {filteredLocalEntries.length === 0 ? (
                      <div className="empty-state">No items found.</div>
                    ) : (
                      filteredLocalEntries.map((entry, index) => {
                        const isSelected = selectedLocal.includes(entry.path);
                        const keys = filteredLocalEntries.map((item) => item.path);
                        const isPinned = localBookmarks.some((item) => item.path === entry.path);
                        const isImage = !entry.is_dir && isImageFile(entry.name);
                        const isVideo = !entry.is_dir && isVideoFile(entry.name);
                        const entryIcon = getEntryTypeIcon({
                          isDir: entry.is_dir,
                          isImage,
                          isVideo,
                        });
                        const isRenaming =
                          renameState?.scope === "local" && renameState.path === entry.path;
                        return (
                          <Panel
                            key={entry.path}
                            variant="card"
                            borderWidth={1}
                            className={`table-row ${isSelected ? "selected" : ""}`}
                            onContextMenu={(event) =>
                              openContextMenu(event, {
                                scope: "local",
                                name: entry.name,
                                path: entry.path,
                                isDir: entry.is_dir,
                                isImage,
                                isVideo,
                              })
                            }
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
                              openEntry({
                                scope: "local",
                                name: entry.name,
                                path: entry.path,
                                isDir: entry.is_dir,
                                isImage: isImage,
                                isVideo: isVideo,
                              })
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                openEntry({
                                  scope: "local",
                                  name: entry.name,
                                  path: entry.path,
                                  isDir: entry.is_dir,
                                  isImage: isImage,
                                  isVideo: isVideo,
                                });
                              }
                            }}
                          >
                            <span className="name-cell">
                              <span
                                className={`entry-dot-icon ${
                                  entry.is_dir
                                    ? "dir"
                                    : isImage
                                      ? "image"
                                      : isVideo
                                        ? "video"
                                        : "file"
                                }`}
                              >
                                {entryIcon}
                              </span>
                              {isRenaming ? (
                                <Input
                                  value={renameState?.value ?? ""}
                                  onChange={(event) =>
                                    setRenameState((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev
                                    )
                                  }
                                  onKeyDown={handleRenameKeyDown}
                                  onClick={(event) => event.stopPropagation()}
                                  onBlur={commitInlineRename}
                                  autoFocus
                                />
                              ) : (
                                <span className="name-text">{entry.name}</span>
                              )}
                            </span>
                            <span>{entry.is_dir ? "-" : formatBytes(entry.size ?? null)}</span>
                            <span>{formatDate(entry.modified ?? null)}</span>
                            <span className="row-actions">
                              {entry.is_dir ? (
                                <Button
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
                                </Button>
                              ) : null}
                              <Button
                                className="action-icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startInlineRename({
                                    scope: "local",
                                    name: entry.name,
                                    path: entry.path,
                                    isDir: entry.is_dir,
                                    isImage,
                                    isVideo,
                                  });
                                }}
                                disabled={localPath === "this_pc"}
                                title="Rename"
                              >
                                <IconEdit />
                              </Button>
                              <Button
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
                              </Button>
                            </span>
                          </Panel>
                        );
                      })
                    )}
                  </>
                ) : filteredLocalEntries.length === 0 ? (
                  <div className="empty-state">No items found.</div>
                ) : (
                  <div className={`entries-grid view-${localViewMode}`}>
                    {filteredLocalEntries.map((entry, index) => {
                      const isSelected = selectedLocal.includes(entry.path);
                      const keys = filteredLocalEntries.map((item) => item.path);
                      const layoutClass =
                        localViewMode === "list"
                          ? "list"
                          : localViewMode === "content"
                            ? "content"
                            : localViewMode === "tiles"
                              ? "tiles"
                              : "grid";
                      const showMeta =
                        localViewMode === "list" ||
                        localViewMode === "tiles" ||
                        localViewMode === "content";
                      const metaText = entry.is_dir
                        ? "Folder"
                        : localViewMode === "list"
                          ? formatBytes(entry.size ?? null)
                          : `${formatBytes(entry.size ?? null)} - ${formatDate(entry.modified ?? null)}`;
                      const isImage = !entry.is_dir && isImageFile(entry.name);
                      const isVideo = !entry.is_dir && isVideoFile(entry.name);
                      const entryIcon = getEntryTypeIcon({
                        isDir: entry.is_dir,
                        isImage,
                        isVideo,
                      });
                      const isPinned = entry.is_dir
                        ? localBookmarks.some((item) => item.path === entry.path)
                        : false;
                      const disableLocalActions = localPath === "this_pc";
                      const isRenaming =
                        renameState?.scope === "local" && renameState.path === entry.path;
                      const thumbSize = viewThumbSize(localViewMode);
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
                          onContextMenu={(event) =>
                            openContextMenu(event, {
                              scope: "local",
                              name: entry.name,
                              path: entry.path,
                              isDir: entry.is_dir,
                              isImage,
                              isVideo,
                            })
                          }
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
                            openEntry({
                              scope: "local",
                              name: entry.name,
                              path: entry.path,
                              isDir: entry.is_dir,
                              isImage: isImage,
                              isVideo: isVideo,
                            })
                          }
                          role="button"
                          tabIndex={0}
                        >
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
                            {!thumbnailSrc && !videoThumbSrc ? (
                              <span className="entry-icon-symbol">{entryIcon}</span>
                            ) : null}
                            {isVideo ? <span className="entry-play" /> : null}
                          </div>
                          <div className="entry-text">
                            {isRenaming ? (
                              <Input
                                value={renameState?.value ?? ""}
                                onChange={(event) =>
                                  setRenameState((prev) =>
                                    prev ? { ...prev, value: event.target.value } : prev
                                  )
                                }
                                onKeyDown={handleRenameKeyDown}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={commitInlineRename}
                                autoFocus
                              />
                            ) : (
                              <div className="entry-name">{entry.name}</div>
                            )}
                            {showMeta ? <div className="entry-meta">{metaText}</div> : null}
                          </div>
                          <div className="entry-actions">
                            {entry.is_dir ? (
                              <Button
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
                              </Button>
                            ) : null}
                            <Button
                              className="action-icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                startInlineRename({
                                  scope: "local",
                                  name: entry.name,
                                  path: entry.path,
                                  isDir: entry.is_dir,
                                  isImage,
                                  isVideo,
                                });
                              }}
                              disabled={disableLocalActions}
                              title="Rename"
                            >
                              <IconEdit />
                            </Button>
                            <Button
                              className="action-icon danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                openModalForDelete("local", {
                                  name: entry.name,
                                  path: entry.path,
                                  isDir: entry.is_dir,
                                });
                              }}
                              disabled={disableLocalActions}
                              title="Delete"
                            >
                              <IconTrash />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>

            <div className="transfer-actions">
              <Panel variant="card" borderWidth={1} className="action-card">
                <div className="transfer-header">
                  <Button
                    className="primary transfer-button"
                    onClick={enqueueUpload}
                    disabled={!connected || !selectedLocal.length}
                  >
                    Upload {"->"}
                  </Button>
                  <div className="action-title">Transfer</div>
                  <Button
                    className="primary ghost transfer-button"
                    onClick={enqueueDownload}
                    disabled={
                      !selectedRemote.length ||
                      (isTauri ? !localPath || localPath === "this_pc" : false)
                    }
                  >
                    Download {"<-"}
                  </Button>
                </div>
                <div className="action-status">
                  <span>Queue {queue.length} / Active {activeCount}</span>
                  {queue.length > 0 && (
                    <span className="queue-actions">
                      {queue.some((i) => i.status === "error") && (
                        <button type="button" className="queue-action-btn" title="Retry failed" onClick={retryFailedTransfers}>
                          Retry
                        </button>
                      )}
                      {queue.some((i) => i.status === "done") && (
                        <button type="button" className="queue-action-btn" title="Clear completed" onClick={clearCompletedTransfers}>
                          Clear done
                        </button>
                      )}
                      {queue.some((i) => i.status === "queued") && (
                        <button type="button" className="queue-action-btn" title="Cancel queued" onClick={cancelQueuedTransfers}>
                          Cancel
                        </button>
                      )}
                      <button type="button" className="queue-action-btn" title="Clear all" onClick={clearAllTransfers}>
                        Clear all
                      </button>
                    </span>
                  )}
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
              </Panel>
            </div>
            <Panel
              variant="card"
              borderWidth={1}
              ref={remotePaneRef}
              className={`pane pane-remote ${softDragTarget === "remote" ? "soft-drop" : ""}`}
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
                    <Button onClick={() => createNewFolder("remote")} disabled={!connected}>
                      New folder
                    </Button>
                    <Button onClick={() => refreshRemote()} disabled={!connected}>
                      Refresh
                    </Button>
                    <Button className="icon-btn" onClick={jumpRemoteUp} disabled={!connected}>
                      Up
                    </Button>
                    <Dropdown
                      variant="bookmark"
                      layout="field"
                      label="View"
                      triggerLabel="View"
                      value={remoteViewMode}
                      onChange={(next) => setRemoteViewMode(next as ViewMode)}
                      renderItemIcon={(option) => getViewModeIcon(option.value as ViewMode)}
                      renderTriggerIcon={getViewModeIcon(remoteViewMode)}
                      sections={[
                        {
                          options: viewModeOptions.map((item) => ({
                            value: item.value,
                            label: item.label,
                          })),
                        },
                      ]}
                    />
                    <PaneSortMenu
                      sortBy={remoteSortBy}
                      sortOrder={remoteSortOrder}
                      onSortBy={setRemoteSortBy}
                      onSortOrder={setRemoteSortOrder}
                    />
                  </div>
                </div>

                <div className="address-row">
                  <div className="address-input">
                    <Input
                      value={remoteAddress}
                      onChange={(event) => setRemoteAddress(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleRemoteAddressSubmit();
                      }}
                      disabled={!connected}
                    />
                    <Button className="ghost" onClick={handleRemoteAddressSubmit} disabled={!connected}>
                      Go
                    </Button>
                  </div>
                  <div className="search-row">
                    <Input
                      value={remoteSearch}
                      onChange={(event) => setRemoteSearch(event.target.value)}
                      placeholder="Search remote"
                      disabled={!connected}
                    />
                  </div>
                </div>
              </div>

              <div
                className={`pane-body view-${remoteViewMode}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleDropRemote}
                onContextMenu={(event) => {
                  if (
                    (event.target as HTMLElement).closest(".entry-card") ||
                    (event.target as HTMLElement).closest(".table-row")
                  ) {
                    return;
                  }
                  openPaneContextMenu(event, "remote");
                }}
              >
                {remoteViewMode === "details" ? (
                  <>
                    <Panel variant="highlight" borderWidth={1} className="table-row table-head">
                      <span>Name</span>
                      <span>Size</span>
                      <span>Modified</span>
                      <span>Actions</span>
                    </Panel>
                    {!connected ? (
                      <div className="empty-state">Connect to a server to browse files.</div>
                    ) : filteredRemoteEntries.length === 0 ? (
                      <div className="empty-state">No items found.</div>
                    ) : (
                      filteredRemoteEntries.map((entry, index) => {
                        const isSelected = selectedRemote.includes(entry.name);
                        const keys = filteredRemoteEntries.map((item) => item.name);
                      const isImage = !entry.is_dir && isImageFile(entry.name);
                      const isVideo = !entry.is_dir && isVideoFile(entry.name);
                      const entryIcon = getEntryTypeIcon({
                        isDir: entry.is_dir,
                        isImage,
                        isVideo,
                      });
                      const isRenaming =
                        renameState?.scope === "remote" &&
                        renameState.path === buildRemotePath(remotePath || "/", entry.name);
                      return (
                          <Panel
                            key={entry.name}
                            variant="card"
                            borderWidth={1}
                            className={`table-row ${isSelected ? "selected" : ""}`}
                            onContextMenu={(event) =>
                              openContextMenu(event, {
                                scope: "remote",
                                name: entry.name,
                                path: buildRemotePath(remotePath || "/", entry.name),
                                isDir: entry.is_dir,
                                isImage,
                                isVideo,
                              })
                            }
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
                              openEntry({
                                scope: "remote",
                                name: entry.name,
                                path: buildRemotePath(remotePath || "/", entry.name),
                                isDir: entry.is_dir,
                                isImage: isImage,
                                isVideo: isVideo,
                              })
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                openEntry({
                                  scope: "remote",
                                  name: entry.name,
                                  path: buildRemotePath(remotePath || "/", entry.name),
                                  isDir: entry.is_dir,
                                  isImage: isImage,
                                  isVideo: isVideo,
                                });
                              }
                            }}
                          >
                            <span className="name-cell">
                              <span
                                className={`entry-dot-icon ${
                                  entry.is_dir
                                    ? "dir"
                                    : isImage
                                      ? "image"
                                      : isVideo
                                        ? "video"
                                        : "file"
                                }`}
                              >
                                {entryIcon}
                              </span>
                              {isRenaming ? (
                                <Input
                                  value={renameState?.value ?? ""}
                                  onChange={(event) =>
                                    setRenameState((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev
                                    )
                                  }
                                  onKeyDown={handleRenameKeyDown}
                                  onClick={(event) => event.stopPropagation()}
                                  onBlur={commitInlineRename}
                                  autoFocus
                                />
                              ) : (
                                <span className="name-text">{entry.name}</span>
                              )}
                            </span>
                            <span>{entry.is_dir ? "-" : formatBytes(entry.size ?? null)}</span>
                            <span>{formatDate(entry.modified ?? null)}</span>
                            <span className="row-actions">
                              <Button
                                className="action-icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startInlineRename({
                                    scope: "remote",
                                    name: entry.name,
                                    path: buildRemotePath(remotePath || "/", entry.name),
                                    isDir: entry.is_dir,
                                    isImage,
                                    isVideo,
                                  });
                                }}
                                title="Rename"
                              >
                                <IconEdit />
                              </Button>
                              <Button
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
                              </Button>
                            </span>
                          </Panel>
                        );
                      })
                    )}
                  </>
                ) : !connected ? (
                  <div className="empty-state">Connect to a server to browse files.</div>
                ) : filteredRemoteEntries.length === 0 ? (
                  <div className="empty-state">No items found.</div>
                ) : (
                  <div className={`entries-grid view-${remoteViewMode}`}>
                    {filteredRemoteEntries.map((entry, index) => {
                      const isSelected = selectedRemote.includes(entry.name);
                      const keys = filteredRemoteEntries.map((item) => item.name);
                      const layoutClass =
                        remoteViewMode === "list"
                          ? "list"
                          : remoteViewMode === "content"
                            ? "content"
                            : remoteViewMode === "tiles"
                              ? "tiles"
                              : "grid";
                      const showMeta =
                        remoteViewMode === "list" ||
                        remoteViewMode === "tiles" ||
                        remoteViewMode === "content";
                      const metaText = entry.is_dir
                        ? "Folder"
                        : remoteViewMode === "list"
                          ? formatBytes(entry.size ?? null)
                          : `${formatBytes(entry.size ?? null)} - ${formatDate(entry.modified ?? null)}`;
                      const isImage = !entry.is_dir && isImageFile(entry.name);
                      const isVideo = !entry.is_dir && isVideoFile(entry.name);
                      const entryIcon = getEntryTypeIcon({
                        isDir: entry.is_dir,
                        isImage,
                        isVideo,
                      });
                      const isRenaming =
                        renameState?.scope === "remote" &&
                        renameState.path === buildRemotePath(remotePath || "/", entry.name);
                      return (
                        <div
                          key={entry.name}
                          className={`entry-card ${layoutClass} ${
                            isSelected ? "selected" : ""
                          }`}
                          onContextMenu={(event) =>
                            openContextMenu(event, {
                              scope: "remote",
                              name: entry.name,
                              path: buildRemotePath(remotePath || "/", entry.name),
                              isDir: entry.is_dir,
                              isImage,
                              isVideo,
                            })
                          }
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
                            openEntry({
                              scope: "remote",
                              name: entry.name,
                              path: buildRemotePath(remotePath || "/", entry.name),
                              isDir: entry.is_dir,
                              isImage: isImage,
                              isVideo: isVideo,
                            })
                          }
                          role="button"
                          tabIndex={0}
                        >
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
                            <span className="entry-icon-symbol">{entryIcon}</span>
                          </div>
                          <div className="entry-text">
                            {isRenaming ? (
                              <Input
                                value={renameState?.value ?? ""}
                                onChange={(event) =>
                                  setRenameState((prev) =>
                                    prev ? { ...prev, value: event.target.value } : prev
                                  )
                                }
                                onKeyDown={handleRenameKeyDown}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={commitInlineRename}
                                autoFocus
                              />
                            ) : (
                              <div className="entry-name">{entry.name}</div>
                            )}
                            {showMeta ? <div className="entry-meta">{metaText}</div> : null}
                          </div>
                          <div className="entry-actions">
                            <Button
                              className="action-icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                startInlineRename({
                                  scope: "remote",
                                  name: entry.name,
                                  path: buildRemotePath(remotePath || "/", entry.name),
                                  isDir: entry.is_dir,
                                  isImage,
                                  isVideo,
                                });
                              }}
                              title="Rename"
                            >
                              <IconEdit />
                            </Button>
                            <Button
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
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          </section>

          <div
            className="resize-handle resize-handle--details"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startResize("details")}
          />

          <div className="details-stack">
            <Panel variant="card" borderWidth={1} className="details-pane" ref={detailsRef}>
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
            </Panel>

            <Panel variant="card" borderWidth={1} className="activity-card activity-pane">
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
            </Panel>
          </div>
        </section>
      </main>
      <div
        className="resize-handle resize-handle--horizontal"
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={startResizeVertical}
      />


      {modal && modal.type !== "prefs" && (
        <Modal
          isOpen={true}
          onClose={closeModal}
          title={
            modal.type === "delete"
              ? `Delete ${modal.scope} item`
              : "Save connection bookmark"
          }
        >
          {modal.type === "ftp-bookmark" && (
            <Input
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
          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={modal.type === "delete" ? "delete" : "primary"}
              onClick={confirmModal}
            >
              {modal.type === "delete" ? "Delete" : "Confirm"}
            </Button>
          </div>
        </Modal>
      )}

      {contextMenu ? (
        <Modal isOpen={true} onClose={closeContextMenu} title="" className="context-menu">
          {contextMenu.kind === "pane" ? (
            <SideMenu resetKey={contextMenuResetKey}>
              <div className="context-menu-list">
                <SideMenuSubmenu
                  id="pane-view"
                  className="context-menu-submenu"
                  panelClassName="context-menu-submenu-panel"
                  enableViewportFlip
                  trigger={(triggerProps) => (
                    <button
                      className="context-menu-item is-submenu"
                      type="button"
                      onClick={triggerProps.onClick}
                      aria-expanded={triggerProps["aria-expanded"]}
                      disabled={triggerProps.disabled}
                    >
                      <span className="context-menu-icon">
                        {contextViewMode ? getViewModeIcon(contextViewMode) : <FiEye />}
                      </span>
                      <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>View</span>
                      <span className="context-menu-trailing"><FiChevronRight /></span>
                    </button>
                  )}
                >
                  {viewModeOptions.map((item) => (
                    <button
                      key={item.value}
                      className={[
                        "context-menu-item",
                        contextViewMode === item.value ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                      onClick={() => {
                        if (contextScope === "local") {
                          setLocalViewMode(item.value as ViewMode);
                        } else if (contextScope === "remote") {
                          setRemoteViewMode(item.value as ViewMode);
                        }
                        closeContextMenu();
                      }}
                    >
                      <span className="context-menu-icon">{getViewModeIcon(item.value as ViewMode)}</span>
                      <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>{item.label}</span>
                    </button>
                  ))}
                </SideMenuSubmenu>
                <SideMenuSubmenu
                  id="pane-sort"
                  className="context-menu-submenu"
                  panelClassName="context-menu-submenu-panel"
                  enableViewportFlip
                  onOpenChange={setContextPaneSortOpen}
                  trigger={(triggerProps) => (
                    <button
                      className="context-menu-item is-submenu"
                      type="button"
                      onClick={triggerProps.onClick}
                      aria-expanded={triggerProps["aria-expanded"]}
                      disabled={triggerProps.disabled}
                    >
                      <span className="context-menu-icon"><FiArrowDown /></span>
                      <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Sort by</span>
                      <span className="context-menu-trailing"><FiChevronRight /></span>
                    </button>
                  )}
                >
                  <SideMenu resetKey={`${contextMenuResetKey}-sort-${contextPaneSortOpen ? "open" : "closed"}`}>
                    {sortPrimaryOptions.map((item) => (
                      <button
                        key={item.value}
                        className="context-menu-item"
                        type="button"
                        onClick={() => {
                          applyContextSortBy(item.value);
                          closeContextMenu();
                        }}
                      >
                      <span className="context-menu-icon sort-icon">{getSortByIcon(item.value)}</span>
                      <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>{item.label}</span>
                    </button>
                  ))}
                    <div className="context-menu-separator" role="separator" />
                    <SideMenuSubmenu
                      id="pane-sort-more"
                      className="context-menu-submenu"
                      panelClassName="context-menu-submenu-panel"
                      enableViewportFlip
                      trigger={(triggerProps) => (
                        <button
                          className="context-menu-item is-submenu"
                          type="button"
                          onClick={triggerProps.onClick}
                          aria-expanded={triggerProps["aria-expanded"]}
                          disabled={triggerProps.disabled}
                        >
                          <span className="context-menu-icon">{getSortByIcon("size")}</span>
                          <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>More</span>
                          <span className="context-menu-trailing"><FiChevronRight /></span>
                        </button>
                      )}
                    >
                      {sortMoreOptions.map((item) => (
                        <button
                          key={item.value}
                        className="context-menu-item"
                        type="button"
                        onClick={() => {
                          applyContextSortBy(item.value);
                          closeContextMenu();
                        }}
                      >
                          <span className="context-menu-icon sort-icon">{getSortByIcon(item.value)}</span>
                          <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>{item.label}</span>
                        </button>
                      ))}
                    </SideMenuSubmenu>
                    <SideMenuSubmenu
                      id="pane-sort-order"
                      className="context-menu-submenu"
                      panelClassName="context-menu-submenu-panel"
                      enableViewportFlip
                      trigger={(triggerProps) => (
                        <button
                          className="context-menu-item is-submenu"
                          type="button"
                          onClick={triggerProps.onClick}
                          aria-expanded={triggerProps["aria-expanded"]}
                          disabled={triggerProps.disabled}
                        >
                          <span className="context-menu-icon">{getSortOrderIcon("asc")}</span>
                          <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Order</span>
                          <span className="context-menu-trailing"><FiChevronRight /></span>
                        </button>
                      )}
                    >
                      {sortOrderOptions.map((item) => (
                        <button
                          key={item.value}
                        className="context-menu-item"
                        type="button"
                        onClick={() => {
                          applyContextSortOrder(item.value);
                          closeContextMenu();
                        }}
                      >
                          <span className="context-menu-icon sort-icon">{getSortOrderIcon(item.value)}</span>
                          <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>{item.label}</span>
                        </button>
                      ))}
                    </SideMenuSubmenu>
                  </SideMenu>
                </SideMenuSubmenu>
                <div className="context-menu-separator" role="separator" />
                <div className="context-menu-inline">
                  <button
                    className="context-menu-item inline"
                    type="button"
                    disabled={!contextCanUndo}
                    onClick={undoLast}
                  >
                    <span className="context-menu-icon"><FiCornerUpLeft /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Undo</span>
                  </button>
                  <button
                    className="context-menu-item inline"
                    type="button"
                    disabled={!contextCanRedo}
                    onClick={redoLast}
                  >
                    <span className="context-menu-icon"><FiCornerUpRight /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Redo</span>
                  </button>
                </div>
                <SideMenuSubmenu
                  id="pane-new"
                  className="context-menu-submenu"
                  panelClassName="context-menu-submenu-panel"
                  enableViewportFlip
                  disabled={!contextCanCreate}
                  trigger={(triggerProps) => (
                    <button
                      className="context-menu-item is-submenu"
                      type="button"
                      onClick={triggerProps.onClick}
                      aria-expanded={triggerProps["aria-expanded"]}
                      disabled={triggerProps.disabled}
                    >
                      <span className="context-menu-icon"><FiPlus /></span>
                      <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>New</span>
                      <span className="context-menu-trailing"><FiChevronRight /></span>
                    </button>
                  )}
                >
                  <button
                    className="context-menu-item"
                    type="button"
                    disabled={!contextCanCreate}
                    onClick={handleContextNewFolder}
                  >
                    <span className="context-menu-icon"><FiFolder /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Folder</span>
                  </button>
                  <button
                    className="context-menu-item"
                    type="button"
                    disabled={!contextCanCreate}
                    onClick={handleContextNewTextFile}
                  >
                    <span className="context-menu-icon"><FiFileText /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Text document</span>
                  </button>
                </SideMenuSubmenu>
                {contextCanPaste ? (
                  <button
                    className="context-menu-item"
                    type="button"
                    onClick={handleContextPaste}
                  >
                    <span className="context-menu-icon"><FiCopy /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Paste</span>
                  </button>
                ) : null}
                <div className="context-menu-separator" role="separator" />
                <button
                  className="context-menu-item"
                  type="button"
                  disabled={contextScope !== "local"}
                  onClick={() => {
                    if (contextScope !== "local") return;
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
                >
                  <span className="context-menu-icon"><FiInfo /></span>
                  <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Properties</span>
                  <span className="context-menu-shortcut">Alt+Enter</span>
                </button>
              </div>
            </SideMenu>
          ) : (
            <SideMenu resetKey={contextMenuResetKey}>
              <div className="context-menu-toolbar">
                <button
                  className="context-menu-tool"
                  type="button"
                  disabled={contextDisableLocalActions}
                  onClick={handleContextCut}
                >
                  <FiScissors />
                  <span>Cut</span>
                </button>
                <button
                  className="context-menu-tool"
                  type="button"
                  disabled={contextDisableLocalActions}
                  onClick={handleContextCopy}
                >
                  <FiCopy />
                  <span>Copy</span>
                </button>
                <button
                  className="context-menu-tool"
                  type="button"
                  disabled={contextDisableLocalActions}
                  onClick={handleContextRename}
                >
                  <IconEdit />
                  <span>Rename</span>
                </button>
                <button
                  className="context-menu-tool danger"
                  type="button"
                  disabled={contextDisableLocalActions}
                  onClick={handleContextDelete}
                >
                  <IconTrash />
                  <span>Delete</span>
                </button>
              </div>
              <div className="context-menu-list">
                <button
                  className="context-menu-item"
                  type="button"
                  disabled={!contextCanOpen}
                  onClick={handleContextOpen}
                >
                  <span className="context-menu-icon">
                    {contextEntry
                      ? getEntryTypeIcon({
                          isDir: contextEntry.isDir,
                          isImage: contextEntry.isImage,
                          isVideo: contextEntry.isVideo,
                        })
                      : null}
                  </span>
                  <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Open</span>
                  <span className="context-menu-shortcut">Enter</span>
                </button>
                <SideMenuSubmenu
                  id="entry-open-with"
                  className="context-menu-submenu"
                  panelClassName="context-menu-submenu-panel"
                  enableViewportFlip
                  disabled={contextEntry?.isDir || contextEntry?.scope !== "local"}
                  trigger={(triggerProps) => (
                    <button
                      className="context-menu-item is-submenu"
                      type="button"
                      onClick={triggerProps.onClick}
                      aria-expanded={triggerProps["aria-expanded"]}
                      disabled={triggerProps.disabled}
                    >
                      <span className="context-menu-icon"><FiCopy /></span>
                      <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Open with</span>
                      <span className="context-menu-trailing"><FiChevronRight /></span>
                    </button>
                  )}
                >
                  <button
                    className="context-menu-item"
                    type="button"
                    disabled={!contextCanOpen}
                    onClick={handleContextOpen}
                  >
                    <span className="context-menu-icon"><FiCopy /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Default app</span>
                  </button>
                  <button
                    className="context-menu-item"
                    type="button"
                    onClick={handleContextOpenWith}
                  >
                    <span className="context-menu-icon"><FiCopy /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Choose app...</span>
                  </button>
                </SideMenuSubmenu>
                {contextEntry?.isDir ? (
                  <button
                    className="context-menu-item"
                    type="button"
                    disabled={contextDisableLocalActions || contextEntry.scope !== "local"}
                    onClick={() => {
                      if (!contextEntry || contextEntry.scope !== "local") return;
                      closeContextMenu();
                      if (!isPremium) {
                        addLog("info", "Premium required to save bookmarks.");
                        return;
                      }
                      const exists = localBookmarks.some((item) => item.path === contextEntry.path);
                      if (exists) {
                        removeLocalBookmark(contextEntry.path);
                      } else {
                        addLocalBookmarks([contextEntry.path]).catch(() => null);
                      }
                    }}
                  >
                    <span className="context-menu-icon"><IconStar /></span>
                    <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>
                      {localBookmarks.some((item) => item.path === contextEntry?.path)
                        ? "Remove bookmark"
                        : "Bookmark"}
                    </span>
                  </button>
                ) : null}
                <button className="context-menu-item is-submenu" type="button" disabled>
                  <span className="context-menu-icon"><FiPlus /></span>
                  <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Compress to...</span>
                  <span className="context-menu-trailing"><FiChevronRight /></span>
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  onClick={handleContextCopyPath}
                >
                  <span className="context-menu-icon"><FiCopy /></span>
                  <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Copy as path</span>
                  <span className="context-menu-shortcut">Ctrl+Shift+C</span>
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  onClick={handleContextProperties}
                >
                  <span className="context-menu-icon"><FiInfo /></span>
                  <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Properties</span>
                  <span className="context-menu-shortcut">Alt+Enter</span>
                </button>
              </div>
            </SideMenu>
          )}
        </Modal>
      ) : null}

      {previewState ? (
        <Modal
          isOpen={true}
          onClose={() => setPreviewState(null)}
          title={previewState.name}
          size="wide"
          className="preview-modal"
        >
          <div className="preview-body">
            {previewSrc ? (
              previewState.isVideo ? (
                <video src={previewSrc} controls preload="metadata" />
              ) : (
                <img src={previewSrc} alt={previewState.name} />
              )
            ) : (
              <div className="empty-state">Preview unavailable.</div>
            )}
          </div>
        </Modal>
      ) : null}

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





























