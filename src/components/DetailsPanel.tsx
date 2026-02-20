import { Panel } from "@enderfall/ui";
import { invoke } from "@tauri-apps/api/tauri";
import { isTauri, maxVideoPreviewBytes } from "../constants";
import { formatBytes, formatDate, isImageFile, isVideoFile, toImageKey, toVideoKey } from "../utils";

interface DetailsItem {
  scope: string;
  name: string;
  path: string;
  file?: File | null;
  size: number | null;
  modified: number | string | null;
  created: number | null;
  taken: number | null;
  dimensions: { width: number; height: number } | null;
  rating: number | null;
  tags: string[] | null;
  isDir: boolean;
}

interface DetailsPanelProps {
  detailsItem: DetailsItem | null;
  detailsRef: React.RefObject<HTMLDivElement | null>;
  imageCache: Record<string, string>;
  videoPreviewCache: Record<string, string>;
  videoPreviewErrors: Record<string, string>;
  setVideoPreviewCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setVideoPreviewErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

const DetailsPanel = ({
  detailsItem,
  detailsRef,
  imageCache,
  videoPreviewCache,
  videoPreviewErrors,
  setVideoPreviewCache,
  setVideoPreviewErrors,
}: DetailsPanelProps) => (
  <Panel variant="card" borderWidth={1} className="details-pane" ref={detailsRef}>
    <div className="section-title">Details</div>
    {detailsItem ? (
      <div className="details-content">
        {detailsItem.scope === "Local" && isImageFile(detailsItem.name) ? (
          <div className="details-preview">
            {imageCache[toImageKey(detailsItem.path, 512)] ? (
              <img src={imageCache[toImageKey(detailsItem.path, 512)]} alt="" />
            ) : (
              <div className="empty-state">Loading preview...</div>
            )}
          </div>
        ) : null}
        {detailsItem.scope === "Local" && isVideoFile(detailsItem.name) ? (
          <div className="details-preview video">
            {videoPreviewCache[toVideoKey(detailsItem.path, 0)] ? (
              <video
                src={videoPreviewCache[toVideoKey(detailsItem.path, 0)]}
                controls
                preload="metadata"
                onError={() => {
                  if (!isTauri) return;
                  const key = toVideoKey(detailsItem.path, 0);
                  if (videoPreviewErrors[key]) return;
                  invoke<string>("read_local_video_data", {
                    path: detailsItem.path,
                    maxBytes: maxVideoPreviewBytes,
                  })
                    .then((dataUrl) => {
                      setVideoPreviewCache((prev) => ({
                        ...prev,
                        [key]: dataUrl,
                      }));
                    })
                    .catch((error) => {
                      const message =
                        error instanceof Error ? error.message : String(error);
                      setVideoPreviewErrors((prev) => ({
                        ...prev,
                        [key]: message,
                      }));
                    });
                }}
              />
            ) : videoPreviewErrors[toVideoKey(detailsItem.path, 0)] === "too_large" ? (
              <div className="empty-state">
                Video too large for preview (over {Math.round(maxVideoPreviewBytes / 1_000_000)}MB).
              </div>
            ) : videoPreviewErrors[toVideoKey(detailsItem.path, 0)] ? (
              <div className="empty-state">Video preview unavailable.</div>
            ) : (
              <div className="empty-state">Loading preview...</div>
            )}
          </div>
        ) : null}
        <div className="details-name">{detailsItem.name}</div>
        <div className="details-scope">{detailsItem.scope}</div>
        <div className="details-row">
          <span>Type</span>
          <span>{detailsItem.isDir ? "Folder" : "File"}</span>
        </div>
        <div className="details-row">
          <span>Size</span>
          <span>{detailsItem.isDir ? "-" : formatBytes(detailsItem.size)}</span>
        </div>
        <div className="details-row">
          <span>Modified</span>
          <span>{formatDate(detailsItem.modified)}</span>
        </div>
        {detailsItem.created ? (
          <div className="details-row">
            <span>Created</span>
            <span>{formatDate(detailsItem.created)}</span>
          </div>
        ) : null}
        {detailsItem.taken ? (
          <div className="details-row">
            <span>Date taken</span>
            <span>{formatDate(detailsItem.taken)}</span>
          </div>
        ) : null}
        {detailsItem.dimensions ? (
          <div className="details-row">
            <span>Dimensions</span>
            <span>
              {detailsItem.dimensions.width} x {detailsItem.dimensions.height}
            </span>
          </div>
        ) : null}
        {detailsItem.rating ? (
          <div className="details-row">
            <span>Rating</span>
            <span>{detailsItem.rating}</span>
          </div>
        ) : null}
        {detailsItem.tags?.length ? (
          <div className="details-row">
            <span>Tags</span>
            <span>{detailsItem.tags.join(", ")}</span>
          </div>
        ) : null}
        <div className="details-row">
          <span>Path</span>
          <span className="details-path">
            {!isTauri && detailsItem.scope === "Local"
              ? detailsItem.name
              : detailsItem.path}
          </span>
        </div>
      </div>
    ) : (
      <div className="empty-state">Select an item to see details.</div>
    )}
  </Panel>
);

export default DetailsPanel;
export type { DetailsItem };
