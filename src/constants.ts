import type { ViewMode, SortBy, SortOrder, ThemeMode } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_IPC__" in window;
export const appId = "ftp-browser";
export const freeUploadLimitBytes = 25 * 1024 * 1024;
export const maxVideoPreviewBytes = 30_000_000;
export const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

export const viewModeOptions: { value: ViewMode; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "list", label: "List" },
  { value: "tiles", label: "Tiles" },
  { value: "content", label: "Content" },
  { value: "small-icons", label: "Small icons" },
  { value: "medium-icons", label: "Medium icons" },
  { value: "large-icons", label: "Large icons" },
  { value: "extra-large-icons", label: "Extra large icons" },
];

export const sortPrimaryOptions: { value: SortBy; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
  { value: "type", label: "Type" },
];

export const sortMoreOptions: { value: SortBy; label: string }[] = [
  { value: "size", label: "Size" },
  { value: "tags", label: "Tags" },
  { value: "date-created", label: "Date created" },
  { value: "date-modified", label: "Date modified" },
  { value: "date-taken", label: "Date taken" },
  { value: "dimensions", label: "Dimensions" },
  { value: "rating", label: "Ratings" },
];

export const sortOrderOptions: { value: SortOrder; label: string }[] = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];

export const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System (Default)" },
  { value: "galaxy", label: "Galaxy (Dark)" },
  { value: "light", label: "Galaxy (Light)" },
  { value: "plain-light", label: "Plain Light" },
  { value: "plain-dark", label: "Plain Dark" },
];
