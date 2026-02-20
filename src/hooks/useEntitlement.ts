import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import {
  isEntitledForApp,
  openAppBrowser,
  refreshLaunchToken,
  type LaunchToken,
} from "@enderfall/runtime";
import { isTauri, appId } from "../constants";
import { openLink } from "../utils";

export function useEntitlement() {
  const [entitlementStatus, setEntitlementStatus] = useState<"checking" | "allowed" | "locked">(
    isTauri ? "checking" : "allowed"
  );
  const [requestedBrowser, setRequestedBrowser] = useState(false);
  const [isPremium, setIsPremium] = useState(isTauri);
  const [entitlementDebug, setEntitlementDebug] = useState<string>("");
  const [launchToken, setLaunchToken] = useState<LaunchToken | null>(null);

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

  const handleOpenAppBrowser = async () => {
    console.log("[Ender Transfer] open Enderfall Hub");
    await openAppBrowser(appId);
  };

  const openProfile = () => {
    openLink("https://enderfall.co.uk/profile");
  };

  // Initial entitlement check
  useEffect(() => {
    refreshEntitlement();
  }, []);

  // Refresh every 5 minutes
  useEffect(() => {
    if (!isTauri) return;
    const interval = window.setInterval(() => {
      refreshEntitlement();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [isTauri]);

  // Auto-open browser when locked
  useEffect(() => {
    if (entitlementStatus !== "locked" || requestedBrowser) return;
    setRequestedBrowser(true);
    handleOpenAppBrowser();
  }, [entitlementStatus, requestedBrowser]);

  // Web tier detection
  useEffect(() => {
    if (isTauri) {
      setIsPremium(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setIsPremium(params.get("tier") === "premium");
  }, []);

  // Dev HMR setup
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

  // Derived display values
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

  return {
    entitlementStatus,
    isPremium,
    entitlementDebug,
    launchToken,
    displayName,
    avatarUrl,
    avatarUrlFallback,
    handleOpenAppBrowser,
    openProfile,
    refreshEntitlement,
  };
}
