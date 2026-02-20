import { Panel } from "@enderfall/ui";
import type { LogEntry } from "../types";

interface ActivityLogProps {
  logs: LogEntry[];
}

const ActivityLog = ({ logs }: ActivityLogProps) => (
  <Panel variant="card" borderWidth={1} className="activity-card activity-pane">
    <div className="section-title">Activity</div>
    {logs.length === 0 ? (
      <div className="empty-state">Actions will appear here.</div>
    ) : (
      <div className="log-list">
        {logs.map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`} className={`log-row ${entry.level}`}>
            <span className="log-time">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    )}
  </Panel>
);

export default ActivityLog;
