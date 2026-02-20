export type ContextMenuEntry = {
  scope: "local" | "remote";
  name: string;
  path: string;
  isDir: boolean;
  isImage: boolean;
  isVideo: boolean;
};

export type ContextMenuState =
  | { kind: "entry"; x: number; y: number; entry: ContextMenuEntry }
  | { kind: "pane"; x: number; y: number; scope: "local" | "remote" };

export type RenameState = {
  scope: "local" | "remote";
  path: string;
  name: string;
  isDir: boolean;
  value: string;
};

export type ClipboardState = {
  mode: "cut" | "copy";
  scope: "local" | "remote";
  entries: {
    name: string;
    path: string;
    isDir: boolean;
  }[];
};

export type PreviewState = {
  name: string;
  path: string;
  isVideo: boolean;
  isImage: boolean;
  scope: "local" | "remote";
};

export type HistoryAction = {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export type FtpEntry = {
  name: string;
  size?: number | null;
  modified?: string | null;
  is_dir: boolean;
  raw?: string | null;
};

export type ListResponse = {
  cwd: string;
  entries: FtpEntry[];
};

export type ConnectResponse = {
  cwd: string;
};

export type LocalEntry = {
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

export type LocalListResponse = {
  path: string;
  entries: LocalEntry[];
};

export type LogEntry = {
  level: string;
  message: string;
  timestamp: number;
};

export type TransferProgress = {
  id: string;
  transferred: number;
  total?: number | null;
};

export type TransferErrorPayload = {
  id: string;
  message: string;
};

export type TransferStatus = "queued" | "active" | "done" | "error";

export type TransferItem = {
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

export type ModalState =
  | { type: "delete"; scope: "local" | "remote"; targetName: string; targetPath: string; isDir: boolean }
  | { type: "ftp-bookmark" }
  | { type: "prefs" };

export type Favorite = {
  label: string;
  path: string;
};

export type FtpBookmark = {
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string | null;
};

export type DragPayload = {
  source: "local" | "remote";
  paths: string[];
};

export type ViewMode =
  | "details"
  | "list"
  | "tiles"
  | "content"
  | "small-icons"
  | "medium-icons"
  | "large-icons"
  | "extra-large-icons";

export type SortBy =
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

export type SortOrder = "asc" | "desc";

export type ThemeMode = "galaxy" | "system" | "light" | "plain-light" | "plain-dark";
