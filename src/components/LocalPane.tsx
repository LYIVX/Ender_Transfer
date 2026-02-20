import type { RefObject, ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { Button, Dropdown, Input, Panel } from "@enderfall/ui";
import type {
  ContextMenuEntry,
  DragPayload,
  Favorite,
  LocalEntry,
  RenameState,
  SortBy,
  SortOrder,
  ViewMode,
} from "../types";
import { isTauri, viewModeOptions } from "../constants";
import {
  formatBytes,
  formatDate,
  getExtension,
  isImageFile,
  isVideoFile,
  toFileUri,
  toImageKey,
  toVideoKey,
  viewThumbSize,
} from "../utils";
import { IconEdit, IconStar, IconTrash, getEntryTypeIcon, getViewModeIcon } from "../icons";
import PaneSortMenu from "./PaneSortMenu";

interface LocalPaneProps {
  paneRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  softDragTarget: "local" | "remote" | null;

  localPath: string;
  localViewMode: ViewMode;
  localSortBy: SortBy;
  localSortOrder: SortOrder;
  localAddress: string;
  localSearch: string;
  filteredEntries: LocalEntry[];
  selectedLocal: string[];
  localBookmarks: Favorite[];
  imageCache: Record<string, string>;
  videoThumbCache: Record<string, string>;
  renameState: RenameState | null;
  isPremium: boolean;
  dragPayloadRef: RefObject<DragPayload | null>;

  setLocalViewMode: (mode: ViewMode) => void;
  setLocalSortBy: (sortBy: SortBy) => void;
  setLocalSortOrder: (order: SortOrder) => void;
  setLocalAddress: (addr: string) => void;
  setLocalSearch: (search: string) => void;
  setRenameState: (fn: (prev: RenameState | null) => RenameState | null) => void;

  onRefresh: () => void;
  onJumpUp: () => void;
  onCreateNewFolder: () => void;
  onOpenLocalFolder: () => void;
  onPickFiles: (event: ChangeEvent<HTMLInputElement>) => void;
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
  onAddBookmark: (paths: string[]) => Promise<void>;
  onRemoveBookmark: (path: string) => void;
  addLog: (level: string, message: string) => void;
}

const LocalPane = ({
  paneRef,
  fileInputRef,
  softDragTarget,
  localPath,
  localViewMode,
  localSortBy,
  localSortOrder,
  localAddress,
  localSearch,
  filteredEntries,
  selectedLocal,
  localBookmarks,
  imageCache,
  videoThumbCache,
  renameState,
  isPremium,
  dragPayloadRef,
  setLocalViewMode,
  setLocalSortBy,
  setLocalSortOrder,
  setLocalAddress,
  setLocalSearch,
  setRenameState,
  onRefresh,
  onJumpUp,
  onCreateNewFolder,
  onOpenLocalFolder,
  onPickFiles,
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
  onAddBookmark,
  onRemoveBookmark,
  addLog,
}: LocalPaneProps) => {
  const preventDragDefault = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    event.dataTransfer.effectAllowed = "copy";
  };

  const makeEntry = (entry: LocalEntry, isImage: boolean, isVideo: boolean): ContextMenuEntry => ({
    scope: "local",
    name: entry.name,
    path: entry.path,
    isDir: entry.is_dir,
    isImage,
    isVideo,
  });

  return (
    <Panel
      variant="card"
      borderWidth={1}
      ref={paneRef}
      className={`pane pane-local ${softDragTarget === "local" ? "soft-drop" : ""}`}
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
            <div className="pane-title">Local</div>
            <div className="pane-sub">{isTauri ? "This PC" : "Browser files"}</div>
          </div>
          <div className="pane-actions">
            {isTauri ? (
              <>
                <Button
                  onClick={onCreateNewFolder}
                  disabled={!localPath || localPath === "this_pc"}
                >
                  New folder
                </Button>
                <Button onClick={onRefresh} disabled={!localPath}>
                  Refresh
                </Button>
                <Button
                  className="icon-btn"
                  onClick={onJumpUp}
                  disabled={!localPath || localPath === "this_pc"}
                >
                  Up
                </Button>
              </>
            ) : (
              <Button onClick={onOpenLocalFolder}>Add files</Button>
            )}
            <Dropdown
              variant="bookmark"
              layout="field"
              label="View"
              triggerLabel="View"
              value={localViewMode}
              onChange={(next) => setLocalViewMode(next as ViewMode)}
              renderItemIcon={(option) => getViewModeIcon(option.value as ViewMode)}
              renderTriggerIcon={getViewModeIcon(localViewMode)}
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
              sortBy={localSortBy}
              sortOrder={localSortOrder}
              onSortBy={setLocalSortBy}
              onSortOrder={setLocalSortOrder}
            />
          </div>
        </div>

        <div className="address-row">
          <div className="address-input">
            <Input
              value={localAddress}
              onChange={(event) => setLocalAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAddressSubmit();
              }}
              disabled={!isTauri}
            />
            <Button className="ghost" onClick={onAddressSubmit} disabled={!isTauri}>
              Go
            </Button>
          </div>
          <div className="search-row">
            <Input
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder="Search local"
            />
          </div>
        </div>
        {!isTauri ? (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onPickFiles}
            hidden
          />
        ) : null}
      </div>

      <div
        className={`pane-body view-${localViewMode}`}
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
        {localViewMode === "details" ? (
          <>
            <Panel variant="highlight" borderWidth={1} className="table-row table-head">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
              <span>Actions</span>
            </Panel>
            {filteredEntries.length === 0 ? (
              <div className="empty-state">No items found.</div>
            ) : (
              filteredEntries.map((entry, index) => {
                const isSelected = selectedLocal.includes(entry.path);
                const isPinned = localBookmarks.some((item) => item.path === entry.path);
                const isImage = !entry.is_dir && isImageFile(entry.name);
                const isVideo = !entry.is_dir && isVideoFile(entry.name);
                const entryIcon = getEntryTypeIcon({ isDir: entry.is_dir, isImage, isVideo });
                const isRenaming = renameState?.scope === "local" && renameState.path === entry.path;
                const ctx = makeEntry(entry, isImage, isVideo);
                return (
                  <Panel
                    key={entry.path}
                    variant="card"
                    borderWidth={1}
                    className={`table-row ${isSelected ? "selected" : ""}`}
                    onContextMenu={(event) => onContextMenu(event, ctx)}
                    draggable={!isTauri}
                    onDragStart={(event) => {
                      const payload: DragPayload = {
                        source: "local",
                        paths: isSelected ? selectedLocal : [entry.path],
                      };
                      dragPayloadRef.current = payload;
                      if (isTauri && import.meta.env.DEV) {
                        addLog("info", `Drag start local (${payload.paths.length})`);
                      }
                      event.dataTransfer.setData("application/json", JSON.stringify(payload));
                      event.dataTransfer.setData("text/plain", payload.paths.join("\n"));
                      if (!isTauri) {
                        event.dataTransfer.setData(
                          "text/uri-list",
                          payload.paths.map(toFileUri).join("\n")
                        );
                      }
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onPointerDown={(event) => {
                      onStartSoftDrag(
                        { source: "local", paths: isSelected ? selectedLocal : [entry.path] },
                        event
                      );
                    }}
                    onDragEnd={() => { dragPayloadRef.current = null; }}
                    onClick={(event) => onSelect(index, entry.path, event)}
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
                      {entry.is_dir ? (
                        <Button
                          className={`pin-btn ${isPinned ? "pinned" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isPremium && !isPinned) {
                              addLog("info", "Premium required to save bookmarks.");
                              return;
                            }
                            if (isPinned) {
                              onRemoveBookmark(entry.path);
                            } else {
                              onAddBookmark([entry.path]).catch(() => null);
                            }
                          }}
                          disabled={!isPremium && !isPinned}
                          title={isPinned ? "Unpin" : "Pin"}
                        >
                          <IconStar />
                        </Button>
                      ) : null}
                      <Button
                        className="action-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStartRename(ctx);
                        }}
                        disabled={localPath === "this_pc"}
                        title="Rename"
                      >
                        <IconEdit />
                      </Button>
                      <Button
                        className="action-icon danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete({ name: entry.name, path: entry.path, isDir: entry.is_dir });
                        }}
                        disabled={localPath === "this_pc"}
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
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state">No items found.</div>
        ) : (
          <div className={`entries-grid view-${localViewMode}`}>
            {filteredEntries.map((entry, index) => {
              const isSelected = selectedLocal.includes(entry.path);
              const layoutClass =
                localViewMode === "list" ? "list"
                : localViewMode === "content" ? "content"
                : localViewMode === "tiles" ? "tiles"
                : "grid";
              const showMeta =
                localViewMode === "list" ||
                localViewMode === "tiles" ||
                localViewMode === "content";
              const metaText = entry.is_dir
                ? "Folder"
                : localViewMode === "list"
                  ? formatBytes(entry.size ?? null)
                  : `${formatBytes(entry.size ?? null)} - ${formatDate(entry.modified ?? null)}`;
              const isImage = !entry.is_dir && isImageFile(entry.name);
              const isVideo = !entry.is_dir && isVideoFile(entry.name);
              const entryIcon = getEntryTypeIcon({ isDir: entry.is_dir, isImage, isVideo });
              const isPinned = entry.is_dir
                ? localBookmarks.some((item) => item.path === entry.path)
                : false;
              const disableLocalActions = localPath === "this_pc";
              const isRenaming = renameState?.scope === "local" && renameState.path === entry.path;
              const thumbSize = viewThumbSize(localViewMode);
              const thumbnailSrc = isImage
                ? imageCache[toImageKey(entry.path, thumbSize)] ?? ""
                : "";
              const videoThumbSrc = isVideo
                ? videoThumbCache[toVideoKey(entry.path, thumbSize)] ?? ""
                : "";
              const ctx = makeEntry(entry, isImage, isVideo);
              return (
                <div
                  key={entry.path}
                  className={`entry-card ${layoutClass} ${isSelected ? "selected" : ""}`}
                  onContextMenu={(event) => onContextMenu(event, ctx)}
                  draggable={!isTauri}
                  onDragStart={(event) => {
                    const payload: DragPayload = {
                      source: "local",
                      paths: isSelected ? selectedLocal : [entry.path],
                    };
                    dragPayloadRef.current = payload;
                    if (isTauri && import.meta.env.DEV) {
                      addLog("info", `Drag start local (${payload.paths.length})`);
                    }
                    event.dataTransfer.setData("application/json", JSON.stringify(payload));
                    event.dataTransfer.setData("text/plain", payload.paths.join("\n"));
                    if (!isTauri) {
                      event.dataTransfer.setData(
                        "text/uri-list",
                        payload.paths.map(toFileUri).join("\n")
                      );
                    }
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onPointerDown={(event) => {
                    onStartSoftDrag(
                      { source: "local", paths: isSelected ? selectedLocal : [entry.path] },
                      event
                    );
                  }}
                  onDragEnd={() => { dragPayloadRef.current = null; }}
                  onClick={(event) => onSelect(index, entry.path, event)}
                  onDoubleClick={() => onOpenEntry(ctx)}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className={`entry-icon ${entry.is_dir ? "dir" : isImage ? "image" : isVideo ? "video" : "file"}`}
                  >
                    {thumbnailSrc ? (
                      <img src={thumbnailSrc} alt="" className="entry-thumb" />
                    ) : null}
                    {!thumbnailSrc && videoThumbSrc ? (
                      <img src={videoThumbSrc} alt="" className="entry-thumb" />
                    ) : null}
                    {!thumbnailSrc && !videoThumbSrc ? (
                      <span className="entry-icon-symbol">{entryIcon}</span>
                    ) : null}
                    {isVideo ? <span className="entry-play" /> : null}
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
                    {entry.is_dir ? (
                      <Button
                        className={`pin-btn ${isPinned ? "pinned" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isPremium && !isPinned) {
                            addLog("info", "Premium required to save bookmarks.");
                            return;
                          }
                          if (isPinned) {
                            onRemoveBookmark(entry.path);
                          } else {
                            onAddBookmark([entry.path]).catch(() => null);
                          }
                        }}
                        disabled={!isPremium && !isPinned}
                        title={isPinned ? "Unpin" : "Pin"}
                      >
                        <IconStar />
                      </Button>
                    ) : null}
                    <Button
                      className="action-icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        onStartRename(ctx);
                      }}
                      disabled={disableLocalActions}
                      title="Rename"
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      className="action-icon danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete({ name: entry.name, path: entry.path, isDir: entry.is_dir });
                      }}
                      disabled={disableLocalActions}
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

export default LocalPane;
