import { Button, Panel } from "@enderfall/ui";
import { FiFolderPlus } from "react-icons/fi";
import type { Favorite } from "../types";
import { isTauri } from "../constants";
import { getPlaceIcon, IconStar, IconTrash } from "../icons";

interface SidebarProps {
  sidebarRef: React.RefObject<HTMLDivElement | null>;
  localPath: string;
  favorites: Favorite[];
  localBookmarks: Favorite[];
  isPremium: boolean;
  onRefreshLocal: (path: string) => void;
  onOpenLocalFolder: () => void;
  onRemoveBookmark: (path: string) => void;
  onBookmarksDrop: (event: React.DragEvent) => void;
}

const Sidebar = ({
  sidebarRef,
  localPath,
  favorites,
  localBookmarks,
  isPremium,
  onRefreshLocal,
  onOpenLocalFolder,
  onRemoveBookmark,
  onBookmarksDrop,
}: SidebarProps) => {
  const preventDefaultDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  return (
    <Panel
      variant="card"
      borderWidth={1}
      className="sidebar"
      ref={sidebarRef}
      onDragEnter={preventDefaultDrag}
      onDragOver={preventDefaultDrag}
      onDrop={onBookmarksDrop}
      onDragEnterCapture={preventDefaultDrag}
      onDragOverCapture={preventDefaultDrag}
    >
      <div className="side-section">
        <div className="side-title">Places</div>
        {isTauri ? (
          <>
            <Button
              className={`side-item ${localPath === "this_pc" ? "active" : ""}`}
              onClick={() => onRefreshLocal("this_pc")}
            >
              <span className="side-item-icon">{getPlaceIcon("This PC")}</span>
              <span className="side-item-label">This PC</span>
            </Button>
            {favorites.map((item) => (
              <Button
                key={item.path}
                className={`side-item ${localPath === item.path ? "active" : ""}`}
                onClick={() => onRefreshLocal(item.path)}
              >
                <span className="side-item-icon">{getPlaceIcon(item.label)}</span>
                <span className="side-item-label">{item.label}</span>
              </Button>
            ))}
            <Button className="side-item ghost" onClick={onOpenLocalFolder}>
              <span className="side-item-icon"><FiFolderPlus /></span>
              <span className="side-item-label">Browse...</span>
            </Button>
          </>
        ) : (
          <Button className="side-item ghost" onClick={onOpenLocalFolder}>
            <span className="side-item-icon"><FiFolderPlus /></span>
            <span className="side-item-label">Add files...</span>
          </Button>
        )}
      </div>

      <div
        className="side-section"
        onDragEnter={preventDefaultDrag}
        onDragOver={preventDefaultDrag}
        onDrop={onBookmarksDrop}
        onDragEnterCapture={preventDefaultDrag}
        onDragOverCapture={preventDefaultDrag}
        onDropCapture={onBookmarksDrop}
      >
        <div className="side-title">Bookmarks</div>
        {!isTauri ? (
          <div className="side-muted">Bookmarks are available in the desktop app.</div>
        ) : !isPremium ? (
          <div className="side-muted">Premium required to save bookmarks.</div>
        ) : localBookmarks.length === 0 ? (
          <div className="side-muted">Drag local folders here.</div>
        ) : (
          localBookmarks.map((item) => (
            <div key={item.path} className="side-bookmark">
              <Button
                className={`side-item ${localPath === item.path ? "active" : ""}`}
                onClick={() => onRefreshLocal(item.path)}
              >
                <span className="side-item-icon"><IconStar /></span>
                <span className="side-item-label">{item.label}</span>
              </Button>
              <Button
                className="side-item remove"
                onClick={() => onRemoveBookmark(item.path)}
                title="Remove"
              >
                <IconTrash />
              </Button>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
};

export default Sidebar;
