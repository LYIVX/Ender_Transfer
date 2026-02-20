import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  desktopDir,
  dirname,
  documentDir,
  downloadDir,
  homeDir,
  pictureDir,
  join,
} from "@tauri-apps/api/path";
import type { Favorite, LocalEntry, LocalListResponse, SortBy, SortOrder, ViewMode } from "../types";
import { isTauri, viewModeOptions, sortPrimaryOptions, sortMoreOptions } from "../constants";
import {
  getExtension,
  isImageFile,
  isVideoFile,
  loadLocalBookmarks,
  saveLocalBookmarks,
  sortEntries,
  toImageKey,
  toLocalFileId,
  toTimestamp,
  toVideoKey,
  viewThumbSize,
} from "../utils";

interface UseLocalBrowserParams {
  addLog: (level: string, message: string) => void;
  isPremium: boolean;
}

export function useLocalBrowser({ addLog, isPremium }: UseLocalBrowserParams) {
  const [localPath, setLocalPath] = useState(() => (isTauri ? "this_pc" : "browser"));
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<string[]>([]);
  const [lastLocalIndex, setLastLocalIndex] = useState<number | null>(null);
  const [localSearch, setLocalSearch] = useState("");
  const [localAddress, setLocalAddress] = useState(isTauri ? "This PC" : "Browser files");

  const [localViewMode, setLocalViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("viewModeLocal") ?? localStorage.getItem("viewMode");
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
  const [localSortOrder, setLocalSortOrder] = useState<SortOrder>(() => {
    const stored = localStorage.getItem("sortOrderLocal") ?? localStorage.getItem("sortOrder");
    return stored === "desc" ? "desc" : "asc";
  });

  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [localBookmarks, setLocalBookmarks] = useState<Favorite[]>(loadLocalBookmarks());
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [videoThumbCache, setVideoThumbCache] = useState<Record<string, string>>({});
  const [videoPreviewCache, setVideoPreviewCache] = useState<Record<string, string>>({});
  const [videoPreviewErrors, setVideoPreviewErrors] = useState<Record<string, string>>({});
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Sync address bar
  useEffect(() => {
    if (!isTauri) {
      setLocalAddress("Browser files");
      return;
    }
    setLocalAddress(localPath === "this_pc" ? "This PC" : localPath);
  }, [localPath]);

  // Persist view/sort preferences
  useEffect(() => { localStorage.setItem("viewModeLocal", localViewMode); }, [localViewMode]);
  useEffect(() => { localStorage.setItem("sortByLocal", localSortBy); }, [localSortBy]);
  useEffect(() => { localStorage.setItem("sortOrderLocal", localSortOrder); }, [localSortOrder]);

  // Load system favorites
  useEffect(() => {
    if (!isTauri) {
      setFavorites([]);
      return;
    }
    const loadFavorites = async () => {
      const [home, desktop, documents, downloads, pictures] = await Promise.all([
        homeDir(), desktopDir(), documentDir(), downloadDir(), pictureDir(),
      ]);

      const safeInvoke = async <T,>(command: string, args: Record<string, unknown>, fallback: T) => {
        try { return await invoke<T>(command, args); }
        catch { return fallback; }
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

  // Initial local file load
  useEffect(() => {
    if (isTauri) {
      refreshLocal("this_pc");
    } else {
      setLocalPath("browser");
    }
  }, []);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url: string) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

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

  const jumpLocalUp = async () => {
    if (!isTauri) return;
    if (!localPath || localPath === "this_pc") return;
    const parent = await dirname(localPath);
    if (parent && parent !== localPath) {
      refreshLocal(parent);
    }
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

  const addLocalBookmark = async (paths: string[]) => {
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

  // Filtered + sorted entries
  const filteredLocalEntries = useMemo(() => {
    const query = localSearch.trim().toLowerCase();
    const filtered = query
      ? localEntries.filter((entry) => entry.name.toLowerCase().includes(query))
      : localEntries;
    const getValue = (entry: LocalEntry) => {
      switch (localSortBy) {
        case "type": return getExtension(entry.name);
        case "size": return entry.size ?? 0;
        case "date": return toTimestamp(entry.modified ?? null);
        case "date-modified": return toTimestamp(entry.modified ?? null);
        case "date-created": return toTimestamp(entry.created ?? null);
        case "date-taken": return toTimestamp(entry.taken ?? null);
        case "dimensions": return entry.dimensions ? entry.dimensions.width * entry.dimensions.height : 0;
        case "rating": return entry.rating ?? 0;
        case "tags": return entry.tags?.join(",").toLowerCase() ?? "";
        default: return entry.name.toLowerCase();
      }
    };
    return sortEntries(filtered, localSortBy, localSortOrder, getValue);
  }, [localEntries, localSearch, localSortBy, localSortOrder]);

  // Image thumbnail caching
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
        const blobUrl = URL.createObjectURL(entry.file);
        blobUrlsRef.current.add(blobUrl);
        next[key] = blobUrl;
        changed = true;
      });
      if (changed) setImageCache(next);
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
          const dataUrl = await invoke<string>("read_local_image_thumb", { path, maxSize: thumbSize });
          next[toImageKey(path, thumbSize)] = dataUrl;
        } catch { /* ignore */ }
      }
      if (!cancelled) setImageCache(next);
    };

    const batch = targets.slice(0, 30);
    const idle = "requestIdleCallback" in window
      ? (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
      : (cb: () => void) => window.setTimeout(cb, 50);
    idle?.(() => loadBatch(batch));
    return () => { cancelled = true; };
  }, [filteredLocalEntries, imageCache, localViewMode]);

  // Video thumbnail caching
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
          const thumb = await invoke<string>("read_local_video_thumb", { path, maxSize: thumbSize });
          next[toVideoKey(path, thumbSize)] = thumb;
        } catch { /* ignore */ }
      }
      if (!cancelled) setVideoThumbCache(next);
    };

    const batch = targets.slice(0, 12);
    const idle = "requestIdleCallback" in window
      ? (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
      : (cb: () => void) => window.setTimeout(cb, 120);
    idle?.(() => loadBatch(batch));
    return () => { cancelled = true; };
  }, [filteredLocalEntries, videoThumbCache, localViewMode]);

  return {
    localPath, setLocalPath,
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
    videoThumbCache, setVideoThumbCache,
    videoPreviewCache, setVideoPreviewCache,
    videoPreviewErrors, setVideoPreviewErrors,
    blobUrlsRef,
    filteredLocalEntries,
    refreshLocal, jumpLocalUp, addLocalFiles,
    addLocalBookmark, removeLocalBookmark,
  };
}
