import type { MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent } from "react";
import { open as openExternal } from "@tauri-apps/api/shell";
import type { DragPayload, Favorite, FtpBookmark, SortBy, SortOrder, ViewMode } from "./types";
import { isTauri, apiBase } from "./constants";

export const shouldFallbackToSftp = (message: string) =>
  /ENOTFOUND|10060|Failed to establish connection|Invalid response: \[227\]|425|ETIMEDOUT/i.test(
    message
  );

export const ftpRequest = async <T,>(endpoint: string, body: Record<string, unknown>) => {
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

export const openLink = (url: string) => {
  if (isTauri) {
    openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

export const handleEllipsisTooltip = (event: ReactMouseEvent<HTMLElement>) => {
  const target = event.currentTarget;
  if (target.scrollWidth > target.clientWidth) {
    target.setAttribute("title", target.textContent ?? "");
  } else {
    target.removeAttribute("title");
  }
};

export const clearEllipsisTooltip = (event: ReactMouseEvent<HTMLElement>) => {
  event.currentTarget.removeAttribute("title");
};

export const formatBytes = (value?: number | null) => {
  if (!value && value !== 0) return "-";
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const num = value / Math.pow(1024, exponent);
  return `${num.toFixed(num < 10 && exponent > 0 ? 1 : 0)} ${units[exponent]}`;
};

export const formatDate = (value?: number | string | null) => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const imageExtensions = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff",
]);

export const isImageFile = (name: string) => imageExtensions.has(getExtension(name));

const videoExtensions = new Set([
  "mp4", "m4v", "mov", "webm", "mkv", "avi",
]);

export const isVideoFile = (name: string) => videoExtensions.has(getExtension(name));

export const toImageKey = (path: string, size: number) => `${path}::${size}`;
export const toVideoKey = (path: string, size: number) => `${path}::${size}`;

export const viewThumbSize = (mode: ViewMode) => {
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

export const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const getExtension = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

export const toTimestamp = (value?: number | string | null) => {
  if (!value && value !== 0) return 0;
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const sortEntries = <T extends { name: string; is_dir: boolean }>(
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

export const buildRemotePath = (base: string, name: string) => {
  if (!base) return name;
  if (name.startsWith("/")) return name;
  if (base.endsWith("/")) return `${base}${name}`;
  return `${base}/${name}`;
};

export const remoteParent = (path: string) => {
  if (!path) return "";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
};

export const normalizeLocalInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "this_pc";
  if (trimmed.toLowerCase() === "this pc") return "this_pc";
  return trimmed;
};

export const loadLocalBookmarks = (): Favorite[] => {
  try {
    const raw = localStorage.getItem("localBookmarks");
    if (!raw) return [];
    return JSON.parse(raw) as Favorite[];
  } catch {
    return [];
  }
};

export const saveLocalBookmarks = (bookmarks: Favorite[]) => {
  localStorage.setItem("localBookmarks", JSON.stringify(bookmarks));
};

export const loadFtpBookmarks = (): FtpBookmark[] => {
  try {
    const raw = localStorage.getItem("ftpBookmarks");
    if (!raw) return [];
    return JSON.parse(raw) as FtpBookmark[];
  } catch {
    return [];
  }
};

export const saveFtpBookmarks = (bookmarks: FtpBookmark[]) => {
  localStorage.setItem("ftpBookmarks", JSON.stringify(bookmarks));
};

export const parseDragPayload = (event: ReactDragEvent) => {
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

export const toFileUri = (value: string) => {
  if (value.startsWith("file://")) return value;
  const normalized = value.replace(/\\/g, "/");
  return `file:///${normalized.replace(/^\/+/, "")}`;
};

export const toLocalFileId = (file: File) =>
  `${file.name}-${file.size}-${file.lastModified}`;
