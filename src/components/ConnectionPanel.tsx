import { Button, Dropdown, Input, Panel, Toggle } from "@enderfall/ui";
import type { FtpBookmark } from "../types";
import { isTauri } from "../constants";
import { IconLock, IconUnlock, IconChevronDown } from "../icons";

interface ConnectionPanelProps {
  host: string;
  setHost: (value: string) => void;
  port: number;
  setPort: (value: number) => void;
  protocol: "ftp" | "sftp";
  setProtocol: (value: "ftp" | "sftp") => void;
  sftpPort: number;
  setSftpPort: (value: number) => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  connected: boolean;
  connecting: boolean;
  connectionDetailOpen: boolean;
  setConnectionDetailOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  savePassword: boolean;
  setSavePassword: (value: boolean) => void;
  ftpBookmarks: FtpBookmark[];
  selectedFtpBookmark: string;
  isPremium: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onBookmarkSelect: (value: string) => void;
  onDeleteBookmark: (name: string) => void;
  onSaveBookmark: () => void;
  addLog: (level: string, message: string) => void;
}

const ConnectionPanel = ({
  host,
  setHost,
  port,
  setPort,
  protocol,
  setProtocol,
  sftpPort,
  setSftpPort,
  username,
  setUsername,
  password,
  setPassword,
  connected,
  connecting,
  connectionDetailOpen,
  setConnectionDetailOpen,
  savePassword,
  setSavePassword,
  ftpBookmarks,
  selectedFtpBookmark,
  isPremium,
  onConnect,
  onDisconnect,
  onBookmarkSelect,
  onDeleteBookmark,
  onSaveBookmark,
  addLog,
}: ConnectionPanelProps) => {
  const selectedFtp = ftpBookmarks.find((item) => item.name === selectedFtpBookmark) ?? null;

  return (
    <header className="topbar explorer-topbar">
      <Panel variant="card" borderWidth={1} className="connection-card compact">
        <div className="connection-header">
          <div className="section-title">Connection</div>
          <Button
            variant="ghost"
            className="connection-toggle-button"
            onClick={() => setConnectionDetailOpen((prev: boolean) => !prev)}
            aria-expanded={connectionDetailOpen}
            type="button"
          >
            {connectionDetailOpen ? "Hide" : "Show"}
          </Button>
        </div>
        <div className={connectionDetailOpen ? "connection-body" : "connection-body is-collapsed"}>
          <div className="connection-grid">
            <label>
              Host
              <Input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="ftp.example.com"
              />
            </label>
            <label>
              Port
              <Input
                type="number"
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </label>
            <label>
              Protocol
              <Dropdown
                variant="bookmark"
                layout="field"
                value={protocol}
                onChange={(value) => {
                  const next = value as "ftp" | "sftp";
                  if (isTauri && next === "sftp") {
                    addLog("error", "SFTP is available in the web app only.");
                    return;
                  }
                  setProtocol(next);
                }}
                sections={[
                  {
                    options: [
                      { value: "ftp", label: "FTP" },
                      {
                        value: "sftp",
                        label: isTauri ? "SFTP (web only)" : "SFTP",
                      },
                    ],
                  },
                ]}
              />
            </label>
            {protocol === "sftp" && !isTauri ? (
              <label>
                SFTP Port
                <Input
                  type="number"
                  value={sftpPort}
                  onChange={(event) => setSftpPort(Number(event.target.value))}
                />
              </label>
            ) : null}
            <label>
              Username
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="anonymous"
              />
            </label>
            <label>
              Password
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="connection-toggle">
              <Toggle
                checked={savePassword}
                onChange={(event) => setSavePassword(event.target.checked)}
                label="Save password"
              />
            </div>
          </div>
        </div>

        <div className={connectionDetailOpen ? "connection-body" : "connection-body is-collapsed"}>
          <div className="connection-actions">
            <div className="connection-actions-main">
              <div className="connection-bookmarks">
                <Dropdown
                  variant="bookmark"
                  label="Bookmarks"
                  value={selectedFtpBookmark}
                  placeholder="Select a saved connection"
                  sections={[
                    {
                      options: ftpBookmarks.map((item) => ({
                        value: item.name,
                        label: item.name,
                        meta: item,
                      })),
                    },
                  ]}
                  onChange={(next, option) => onBookmarkSelect(option?.value ?? next)}
                  renderTriggerIcon={
                    selectedFtp ? (selectedFtp.password ? <IconUnlock /> : <IconLock />) : <IconLock />
                  }
                  renderItemIcon={(option) => {
                    const item = option.meta as FtpBookmark | undefined;
                    return item?.password ? <IconUnlock /> : <IconLock />;
                  }}
                  caret={<IconChevronDown />}
                  emptyLabel="No saved connections."
                  emptyClassName="side-muted"
                />
              </div>
              <Button
                className="primary"
                onClick={onConnect}
                disabled={connecting || connected}
              >
                {connecting ? "Connecting..." : "Connect"}
              </Button>
              <Button onClick={onDisconnect} disabled={!connected}>
                Disconnect
              </Button>
              <Button
                onClick={onSaveBookmark}
                disabled={!isPremium}
                title={!isPremium ? "Premium required" : "Save bookmark"}
              >
                Save Bookmark
              </Button>
              <Button
                onClick={() => onDeleteBookmark(selectedFtpBookmark)}
                disabled={!selectedFtpBookmark}
                title="Delete selected bookmark"
              >
                Delete Bookmark
              </Button>
            </div>
            <div className={`status-pill ${connected ? "online" : "offline"}`}>
              {connected ? "Connected" : "Disconnected"}
            </div>
          </div>
        </div>
      </Panel>
    </header>
  );
};

export default ConnectionPanel;
