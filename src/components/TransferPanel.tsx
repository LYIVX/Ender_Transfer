import { Button, Panel } from "@enderfall/ui";
import type { TransferItem } from "../types";
import { formatBytes } from "../utils";

interface TransferPanelProps {
  queue: TransferItem[];
  activeCount: number;
  connected: boolean;
  selectedLocal: string[];
  selectedRemote: string[];
  localPath: string;
  onUpload: () => void;
  onDownload: () => void;
  onRetryFailed: () => void;
  onClearCompleted: () => void;
  onCancelQueued: () => void;
  onClearAll: () => void;
  isTauri: boolean;
}

const TransferPanel = ({
  queue,
  activeCount,
  connected,
  selectedLocal,
  selectedRemote,
  localPath,
  onUpload,
  onDownload,
  onRetryFailed,
  onClearCompleted,
  onCancelQueued,
  onClearAll,
  isTauri,
}: TransferPanelProps) => (
  <div className="transfer-actions">
    <Panel variant="card" borderWidth={1} className="action-card">
      <div className="transfer-header">
        <Button
          className="primary transfer-button"
          onClick={onUpload}
          disabled={!connected || !selectedLocal.length}
        >
          Upload {"->"}
        </Button>
        <div className="action-title">Transfer</div>
        <Button
          className="primary ghost transfer-button"
          onClick={onDownload}
          disabled={
            !selectedRemote.length ||
            (isTauri ? !localPath || localPath === "this_pc" : false)
          }
        >
          Download {"<-"}
        </Button>
      </div>
      <div className="action-status">
        <span>Queue {queue.length} / Active {activeCount}</span>
        {queue.length > 0 && (
          <span className="queue-actions">
            {queue.some((i) => i.status === "error") && (
              <button type="button" className="queue-action-btn" title="Retry failed" onClick={onRetryFailed}>
                Retry
              </button>
            )}
            {queue.some((i) => i.status === "done") && (
              <button type="button" className="queue-action-btn" title="Clear completed" onClick={onClearCompleted}>
                Clear done
              </button>
            )}
            {queue.some((i) => i.status === "queued") && (
              <button type="button" className="queue-action-btn" title="Cancel queued" onClick={onCancelQueued}>
                Cancel
              </button>
            )}
            <button type="button" className="queue-action-btn" title="Clear all" onClick={onClearAll}>
              Clear all
            </button>
          </span>
        )}
      </div>
      <div className="transfer-queue">
        {queue.length === 0 ? (
          <div className="empty-state">No transfers yet.</div>
        ) : (
          queue.map((item) => {
            const total = item.total ?? 0;
            const progress = total
              ? Math.min(100, Math.round((item.transferred / total) * 100))
              : 0;
            return (
              <div key={item.id} className={`queue-item ${item.status}`}>
                <div>
                  <div className="queue-title">
                    {item.direction === "upload" ? "Upload" : "Download"} | {item.name}
                  </div>
                  <div className="queue-sub">
                    {item.status === "error"
                      ? item.message
                      : `${formatBytes(item.transferred)} / ${formatBytes(item.total ?? null)}`}
                  </div>
                </div>
                <div className="queue-meta">
                  <span className="queue-status">{item.status}</span>
                  <div className="progress">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${
                          item.total
                            ? progress
                            : item.status === "done"
                              ? 100
                              : 20
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  </div>
);

export default TransferPanel;
