import { useEffect, type PointerEvent as ReactPointerEvent } from "react";

export function useResizeHandles(refs: {
  shellRef: React.RefObject<HTMLElement | null>;
  workspaceRef: React.RefObject<HTMLElement | null>;
  sidebarRef: React.RefObject<HTMLDivElement | null>;
  detailsRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { shellRef, workspaceRef, sidebarRef, detailsRef } = refs;

  // Restore saved layout dimensions on mount
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

  return { startResize, startResizeVertical };
}
