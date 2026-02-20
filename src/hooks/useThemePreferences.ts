import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  readSharedPreferences,
  writeSharedPreferences,
} from "@enderfall/runtime";
import { applyTheme, getStoredTheme } from "@enderfall/ui";
import type { ThemeMode } from "../types";
import { isTauri } from "../constants";

export function useThemePreferences() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    getStoredTheme({
      storageKey: "themeMode",
      defaultTheme: "system",
      allowed: ["galaxy", "system", "light", "plain-light", "plain-dark"],
    })
  );
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
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
  const [uploadLimitKbps, setUploadLimitKbps] = useState(() => {
    const stored = localStorage.getItem("uploadLimitKbps");
    return stored ? Number(stored) : 0;
  });
  const [downloadLimitKbps, setDownloadLimitKbps] = useState(() => {
    const stored = localStorage.getItem("downloadLimitKbps");
    return stored ? Number(stored) : 0;
  });

  const sharedThemeUpdatedAtRef = useRef<number>(0);
  const sharedThemeApplyRef = useRef<ThemeMode | null>(null);
  const sharedAnimationsApplyRef = useRef<boolean | null>(null);
  const sharedThemeAllowed = useMemo(
    () => new Set<ThemeMode>(["system", "galaxy", "light", "plain-light", "plain-dark"]),
    []
  );

  // Read shared preferences on mount (Tauri only)
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

  // Apply theme to DOM
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

  // Apply animations attribute
  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute(
      "data-reduce-motion",
      animationsEnabled ? "false" : "true"
    );
  }, [animationsEnabled]);

  // Sync theme to shared preferences
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

  // Sync animations to shared preferences
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

  // Poll shared preferences every 3 seconds
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
  }, [themeMode, animationsEnabled, sharedThemeAllowed]);

  // Persist preference toggles
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
      prefs: { openOnStartup, closeToTray, minimizeToTray },
    }).catch((error) => {
      console.error("Failed to update preferences", error);
    });
  }, [openOnStartup, closeToTray, minimizeToTray]);

  // Persist speed limits
  useEffect(() => {
    localStorage.setItem("uploadLimitKbps", String(uploadLimitKbps));
  }, [uploadLimitKbps]);

  useEffect(() => {
    localStorage.setItem("downloadLimitKbps", String(downloadLimitKbps));
  }, [downloadLimitKbps]);

  return {
    themeMode,
    setThemeMode,
    animationsEnabled,
    setAnimationsEnabled,
    openOnStartup,
    setOpenOnStartup,
    minimizeToTray,
    setMinimizeToTray,
    closeToTray,
    setCloseToTray,
    uploadLimitKbps,
    setUploadLimitKbps,
    downloadLimitKbps,
    setDownloadLimitKbps,
  };
}
