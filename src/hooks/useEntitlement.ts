import { useEffect, useState } from "react";
import {
  readAuthOverrideTokens,
  readSharedAuthOverrideTokens,
  openAppBrowser,
} from "@enderfall/runtime";
import { isTauri, appId } from "../constants";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { openLink } from "../utils";

const isMobilePlatform = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua);
};

export function useEntitlement() {
  const supportsHubAuth = isTauri && !isMobilePlatform();
  const [entitlementStatus, setEntitlementStatus] = useState<"checking" | "allowed" | "locked">(
    supportsHubAuth ? "checking" : "allowed"
  );
  const [requestedBrowser, setRequestedBrowser] = useState(false);
  const [isPremium, setIsPremium] = useState(supportsHubAuth);
  const [entitlementDebug, setEntitlementDebug] = useState<string>("");
  const [displayName, setDisplayName] = useState("Account");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUrlFallback, setAvatarUrlFallback] = useState<string | null>(null);

  const refreshEntitlement = async () => {
    if (!supportsHubAuth) {
      setEntitlementStatus("allowed");
      setIsPremium(true);
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setEntitlementStatus("locked");
      setIsPremium(false);
      setEntitlementDebug("supabase not configured");
      return;
    }

    const localTokens = readAuthOverrideTokens();
    const sharedTokens = await readSharedAuthOverrideTokens();
    const tokens = localTokens ?? sharedTokens;
    if (tokens?.access_token && tokens.refresh_token) {
      await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setEntitlementStatus("locked");
      setIsPremium(false);
      setEntitlementDebug("no supabase session");
      setDisplayName("Account");
      setAvatarUrl(null);
      setAvatarUrlFallback(null);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name,username,avatar_url,is_admin")
      .eq("id", user.id)
      .maybeSingle<{
        display_name?: string | null;
        username?: string | null;
        avatar_url?: string | null;
        is_admin?: boolean | null;
      }>();

    const { data: entitlements } = await supabase
      .from("entitlements")
      .select("app_id,active")
      .eq("user_id", user.id)
      .eq("active", true);

    const entitled = (entitlements ?? []).some(
      (entry) => entry.app_id === appId || entry.app_id === "all-apps"
    );
    const allowed = (profile?.is_admin ?? false) || entitled;
    setEntitlementStatus(allowed ? "allowed" : "locked");
    setIsPremium(allowed);
    const debug = `user=${user.id} admin=${profile?.is_admin ? "yes" : "no"} entitled=${entitled ? "yes" : "no"}`;
    setEntitlementDebug(debug);
    const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fallbackName =
      (userMeta.full_name as string | undefined) ??
      (userMeta.username as string | undefined) ??
      (user.email ? user.email.split("@")[0] : "Account");
    setDisplayName(profile?.display_name ?? profile?.username ?? fallbackName ?? "Account");
    setAvatarUrl(profile?.avatar_url ?? (userMeta.avatar_url as string | null | undefined) ?? null);
    setAvatarUrlFallback(null);
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
    if (!supportsHubAuth) return;
    const interval = window.setInterval(() => {
      refreshEntitlement();
    }, 15 * 1000);
    return () => window.clearInterval(interval);
  }, [supportsHubAuth]);

  // Auto-open browser when locked
  useEffect(() => {
    if (!supportsHubAuth) return;
    if (entitlementStatus !== "locked" || requestedBrowser) return;
    setRequestedBrowser(true);
    handleOpenAppBrowser();
  }, [entitlementStatus, requestedBrowser, supportsHubAuth]);

  // Web tier detection
  useEffect(() => {
    if (supportsHubAuth) {
      setIsPremium(true);
      return;
    }
    if (!isTauri) {
      const params = new URLSearchParams(window.location.search);
      setIsPremium(params.get("tier") === "premium");
      return;
    }
    setIsPremium(true);
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

  return {
    entitlementStatus,
    isPremium,
    entitlementDebug,
    displayName,
    avatarUrl,
    avatarUrlFallback,
    handleOpenAppBrowser,
    openProfile,
    refreshEntitlement,
  };
}
