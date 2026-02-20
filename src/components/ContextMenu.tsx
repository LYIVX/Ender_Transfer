import { Button, Modal, SideMenu, SideMenuSubmenu } from "@enderfall/ui";
import {
  FiChevronRight,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiArrowDown,
  FiCopy,
  FiEye,
  FiFileText,
  FiFolder,
  FiInfo,
  FiPlus,
  FiScissors,
} from "react-icons/fi";
import type { ContextMenuEntry, ContextMenuState, ClipboardState, SortBy, SortOrder, ViewMode } from "../types";
import { viewModeOptions, sortPrimaryOptions, sortMoreOptions, sortOrderOptions } from "../constants";
import { handleEllipsisTooltip, clearEllipsisTooltip } from "../utils";
import { IconEdit, IconTrash, IconStar, IconChevronDown, getEntryTypeIcon, getViewModeIcon, getSortByIcon, getSortOrderIcon } from "../icons";

interface ContextMenuProps {
  contextMenu: ContextMenuState;
  onClose: () => void;
  resetKey: string;
  // Entry-level actions
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCopyPath: () => void;
  onProperties: () => void;
  onOpenWith: () => void;
  onNewFolder: () => void;
  onNewTextFile: () => void;
  // Pane-level actions
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // View/sort
  contextViewMode: ViewMode | null;
  onViewModeChange: (scope: "local" | "remote", mode: ViewMode) => void;
  onSortByChange: (value: SortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
  contextPaneSortOpen: boolean;
  onContextPaneSortOpenChange: (open: boolean) => void;
  // State
  contextScope: "local" | "remote" | null;
  contextEntry: ContextMenuEntry | null;
  contextCanOpen: boolean;
  contextCanCreate: boolean;
  contextCanPaste: boolean;
  contextDisableLocalActions: boolean;
  // Bookmark
  localBookmarks: { path: string }[];
  isPremium: boolean;
  onToggleBookmark: (path: string) => void;
  // Properties pane-level
  localPath: string;
  isTauri: boolean;
  addLog: (level: string, message: string) => void;
  onPaneProperties: () => void;
}

const ContextMenuComponent = ({
  contextMenu,
  onClose,
  resetKey,
  onOpen,
  onRename,
  onDelete,
  onCut,
  onCopy,
  onPaste,
  onCopyPath,
  onProperties,
  onOpenWith,
  onNewFolder,
  onNewTextFile,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  contextViewMode,
  onViewModeChange,
  onSortByChange,
  onSortOrderChange,
  contextPaneSortOpen,
  onContextPaneSortOpenChange,
  contextScope,
  contextEntry,
  contextCanOpen,
  contextCanCreate,
  contextCanPaste,
  contextDisableLocalActions,
  localBookmarks,
  isPremium,
  onToggleBookmark,
  localPath,
  isTauri,
  addLog,
  onPaneProperties,
}: ContextMenuProps) => (
  <Modal isOpen={true} onClose={onClose} title="" className="context-menu">
    {contextMenu.kind === "pane" ? (
      <SideMenu resetKey={resetKey}>
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
                  if (contextScope) {
                    onViewModeChange(contextScope, item.value);
                  }
                  onClose();
                }}
              >
                <span className="context-menu-icon">{getViewModeIcon(item.value)}</span>
                <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>{item.label}</span>
              </button>
            ))}
          </SideMenuSubmenu>
          <SideMenuSubmenu
            id="pane-sort"
            className="context-menu-submenu"
            panelClassName="context-menu-submenu-panel"
            enableViewportFlip
            onOpenChange={onContextPaneSortOpenChange}
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
            <SideMenu resetKey={`${resetKey}-sort-${contextPaneSortOpen ? "open" : "closed"}`}>
              {sortPrimaryOptions.map((item) => (
                <button
                  key={item.value}
                  className="context-menu-item"
                  type="button"
                  onClick={() => {
                    onSortByChange(item.value);
                    onClose();
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
                      onSortByChange(item.value);
                      onClose();
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
                      onSortOrderChange(item.value);
                      onClose();
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
              disabled={!canUndo}
              onClick={onUndo}
            >
              <span className="context-menu-icon"><FiCornerUpLeft /></span>
              <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Undo</span>
            </button>
            <button
              className="context-menu-item inline"
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
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
              onClick={onNewFolder}
            >
              <span className="context-menu-icon"><FiFolder /></span>
              <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Folder</span>
            </button>
            <button
              className="context-menu-item"
              type="button"
              disabled={!contextCanCreate}
              onClick={onNewTextFile}
            >
              <span className="context-menu-icon"><FiFileText /></span>
              <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Text document</span>
            </button>
          </SideMenuSubmenu>
          {contextCanPaste ? (
            <button
              className="context-menu-item"
              type="button"
              onClick={onPaste}
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
            onClick={onPaneProperties}
          >
            <span className="context-menu-icon"><FiInfo /></span>
            <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Properties</span>
            <span className="context-menu-shortcut">Alt+Enter</span>
          </button>
        </div>
      </SideMenu>
    ) : (
      <SideMenu resetKey={resetKey}>
        <div className="context-menu-toolbar">
          <button
            className="context-menu-tool"
            type="button"
            disabled={contextDisableLocalActions}
            onClick={onCut}
          >
            <FiScissors />
            <span>Cut</span>
          </button>
          <button
            className="context-menu-tool"
            type="button"
            disabled={contextDisableLocalActions}
            onClick={onCopy}
          >
            <FiCopy />
            <span>Copy</span>
          </button>
          <button
            className="context-menu-tool"
            type="button"
            disabled={contextDisableLocalActions}
            onClick={onRename}
          >
            <IconEdit />
            <span>Rename</span>
          </button>
          <button
            className="context-menu-tool danger"
            type="button"
            disabled={contextDisableLocalActions}
            onClick={onDelete}
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
            onClick={onOpen}
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
              onClick={onOpen}
            >
              <span className="context-menu-icon"><FiCopy /></span>
              <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Default app</span>
            </button>
            <button
              className="context-menu-item"
              type="button"
              onClick={onOpenWith}
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
                onToggleBookmark(contextEntry.path);
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
            onClick={onCopyPath}
          >
            <span className="context-menu-icon"><FiCopy /></span>
            <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Copy as path</span>
            <span className="context-menu-shortcut">Ctrl+Shift+C</span>
          </button>
          <button
            className="context-menu-item"
            type="button"
            onClick={onProperties}
          >
            <span className="context-menu-icon"><FiInfo /></span>
            <span className="context-menu-label" onMouseEnter={handleEllipsisTooltip} onMouseLeave={clearEllipsisTooltip}>Properties</span>
            <span className="context-menu-shortcut">Alt+Enter</span>
          </button>
        </div>
      </SideMenu>
    )}
  </Modal>
);

export default ContextMenuComponent;
