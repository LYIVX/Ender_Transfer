import type { RefObject, DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { Button, Dropdown, Input, Panel } from "@enderfall/ui";
import type {
  ContextMenuEntry,
  DragPayload,
  FtpEntry,
  RenameState,
  SortBy,
  SortOrder,
  ViewMode,
} from "../types";
import { isTauri, viewModeOptions } from "../constants";
import {
  buildRemotePath,
  formatBytes,
  formatDate,
  isImageFile,
  isVideoFile,
} from "../utils";
import { IconEdit, IconTrash, getEntryTypeIcon, getViewModeIcon } from "../icons";
import PaneSortMenu from "./PaneSortMenu";

interface RemotePaneProps {
  paneRef: RefObject<HTMLDivElement | null>;
  softDragTarget: "local" | "remote" | null;
  connected: boolean;

  remotePath: string;
  remoteViewMode: ViewMode;
  remoteSortBy: SortBy;
  remoteSortOrder: SortOrder;
  remoteAddress: string;
  remoteSearch: string;
  filteredEntries: FtpEntry[];
  selectedRemote: string[];
  renameState: RenameState | null;

  setRemoteViewMode: (mode: ViewMode) => void;
  setRemoteSortBy: (sortBy: SortBy) => void;
  setRemoteSortOrder: (order: SortOrder) => void;
  setRemoteAddress: (addr: string) => void;
  setRemoteSearch: (search: string) => void;
  setRenameState: (fn: (prev: RenameState | null) => RenameState | null) => void;

  onRefresh: () => void;
  onJumpUp: () => void;
  onCreateNewFolder: () => void;
  onAddressSubmit: () => void;
  onDrop: (event: DragEvent) => void;
  onSelect: (index: number, key: string, event: MouseEvent) => void;
  onStartSoftDrag: (payload: DragPayload, event: PointerEvent) => void;
  onOpenEntry: (entry: ContextMenuEntry) => void;
  onContextMenu: (event: MouseEvent, entry: ContextMenuEntry) => void;
  onPaneContextMenu: (event: MouseEvent) => void;
  onStartRename: (entry: ContextMenuEntry) => void;
  onRenameKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCommitRename: () => void;
  onDelete: (target: { name: string; path: string; isDir: boolean }) => void;
}

const RemotePane = ({
  paneRef,
  softDragTarget,
  connected,
  remotePath,
  remoteViewMode,
  remoteSortBy,
  remoteSortOrder,
  remoteAddress,
  remoteSearch,
  filteredEntries,
  selectedRemote,
  renameState,
  setRemoteViewMode,
  setRemoteSortBy,
  setRemoteSortOrder,
  setRemoteAddress,
  setRemoteSearch,
  setRenameState,
  onRefresh,
  onJumpUp,
  onCreateNewFolder,
  onAddressSubmit,
  onDrop,
  onSelect,
  onStartSoftDrag,
  onOpenEntry,
  onContextMenu,
  onPaneContextMenu,
  onStartRename,
  onRenameKeyDown,
  onCommitRename,
  onDelete,
}: RemotePaneProps) => {
  const preventDragDefault = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    event.dataTransfer.effectAllowed = "copy";
  };

  const makeEntry = (entry: FtpEntry, isImage: boolean, isVideo: boolean): ContextMenuEntry => ({
    scope: "remote",
    name: entry.name,
    path: buildRemotePath(remotePath || "/", entry.name),
    isDir: entry.is_dir,
    isImage,
    isVideo,
  });

  return (
    <Panel
      variant="card"
      borderWidth={1}
      ref={paneRef}
      className={`pane pane-remote ${softDragTarget === "remote" ? "soft-drop" : ""}`}
      onDragEnter={preventDragDefault}
      onDragOver={preventDragDefault}
      onDragOverCapture={preventDragDefault}
      onDropCapture={(event) => {
        event.preventDefault();
        onDrop(event);
      }}
      onDrop={onDrop}
    >
      <div className="pane-header explorer-header">
        <div className="pane-title-row">
          <div>
            <div className="pane-title">Remote</div>
            <div className="pane-sub">FTP Server</div>
          </div>
          <div className="pane-actions">
            <Button onClick={onCreateNewFolder} disabled={!connected}>
              New folder
            </Button>
            <Button onClick={onRefresh} disabled={!connected}>
              Refresh
            </Button>
            <Button className="icon-btn" onClick={onJumpUp} disabled={!connected}>
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
                if (event.key === "Enter") onAddressSubmit();
              }}
              disabled={!connected}
            />
            <Button className="ghost" onClick={onAddressSubmit} disabled={!connected}>
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
        onDrop={onDrop}
        onContextMenu={(event) => {
          if (
            (event.target as HTMLElement).closest(".entry-card") ||
            (event.target as HTMLElement).closest(".table-row")
          ) {
            return;
          }
          onPaneContextMenu(event);
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
            ) : filteredEntries.length === 0 ? (
              <div className="empty-state">No items found.</div>
            ) : (
              filteredEntries.map((entry, index) => {
                const isSelected = selectedRemote.includes(entry.name);
                const isImage = !entry.is_dir && isImageFile(entry.name);
                const isVideo = !entry.is_dir && isVideoFile(entry.name);
                const entryIcon = getEntryTypeIcon({ isDir: entry.is_dir, isImage, isVideo });
                const isRenaming =
                  renameState?.scope === "remote" &&
                  renameState.path === buildRemotePath(remotePath || "/", entry.name);
                const ctx = makeEntry(entry, isImage, isVideo);
                return (
                  <Panel
                    key={entry.name}
                    variant="card"
                    borderWidth={1}
                    className={`table-row ${isSelected ? "selected" : ""}`}
                    onContextMenu={(event) => onContextMenu(event, ctx)}
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
                      onStartSoftDrag(
                        { source: "remote", paths: isSelected ? selectedRemote : [entry.name] },
                        event
                      );
                    }}
                    onClick={(event) => onSelect(index, entry.name, event)}
                    onDoubleClick={() => onOpenEntry(ctx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onOpenEntry(ctx);
                    }}
                  >
                    <span className="name-cell">
                      <span className={`entry-dot-icon ${entry.is_dir ? "dir" : isImage ? "image" : isVideo ? "video" : "file"}`}>
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
                          onKeyDown={onRenameKeyDown}
                          onClick={(event) => event.stopPropagation()}
                          onBlur={onCommitRename}
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
                          onStartRename(ctx);
                        }}
                        title="Rename"
                      >
                        <IconEdit />
                      </Button>
                      <Button
                        className="action-icon danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete({ name: entry.name, path: entry.name, isDir: entry.is_dir });
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
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state">No items found.</div>
        ) : (
          <div className={`entries-grid view-${remoteViewMode}`}>
            {filteredEntries.map((entry, index) => {
              const isSelected = selectedRemote.includes(entry.name);
              const layoutClass =
                remoteViewMode === "list" ? "list"
                : remoteViewMode === "content" ? "content"
                : remoteViewMode === "tiles" ? "tiles"
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
              const entryIcon = getEntryTypeIcon({ isDir: entry.is_dir, isImage, isVideo });
              const isRenaming =
                renameState?.scope === "remote" &&
                renameState.path === buildRemotePath(remotePath || "/", entry.name);
              const ctx = makeEntry(entry, isImage, isVideo);
              return (
                <div
                  key={entry.name}
                  className={`entry-card ${layoutClass} ${isSelected ? "selected" : ""}`}
                  onContextMenu={(event) => onContextMenu(event, ctx)}
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
                    onStartSoftDrag(
                      { source: "remote", paths: isSelected ? selectedRemote : [entry.name] },
                      event
                    );
                  }}
                  onClick={(event) => onSelect(index, entry.name, event)}
                  onDoubleClick={() => onOpenEntry(ctx)}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className={`entry-icon ${entry.is_dir ? "dir" : isImage ? "image" : isVideo ? "video" : "file"}`}
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
                        onKeyDown={onRenameKeyDown}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={onCommitRename}
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
                        onStartRename(ctx);
                      }}
                      title="Rename"
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      className="action-icon danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete({ name: entry.name, path: entry.name, isDir: entry.is_dir });
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
  );
};

export default RemotePane;
