import { useState, useEffect } from "react";
import {
  Database,
  Trash2,
  FolderOpen,
  Copy,
  Check,
  HardDrive,
  Layers,
  FileCode,
  History,
  RotateCw,
  Sparkles,
  Archive,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { SettingsState } from "./types";
import {
  SettingSection,
  SettingRow,
  SettingToggle,
  SettingInput,
} from "./SettingControls";
import {
  bridge,
  type StorageStats,
  type SystemInfo,
  type BackupInfo,
} from "../../../bridge/client";
import { useToast } from "../../ui/Toast";

interface Props {
  settings: SettingsState;
  onUpdate: (key: string, value: string) => void;
  systemInfo: SystemInfo | null;
}

export function StorageSettingsTab({ settings, onUpdate, systemInfo }: Props) {
  const { toast } = useToast();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Backup states
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupLabel, setBackupLabel] = useState("");
  const [showBackupInput, setShowBackupInput] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const autoSaveHistory = (settings.auto_save_history || "true") === "true";
  const redactSensitive = (settings.redact_sensitive_headers || "true") === "true";

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await bridge.getStorageStats();
      if (res.status === "ok" && res.stats) {
        setStats(res.stats);
      }
    } catch (err) {
      console.error("Failed to fetch storage stats", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const res = await bridge.listDatabaseBackups();
      if (res.status === "ok" && Array.isArray(res.backups)) {
        setBackups(res.backups);
      }
    } catch (err) {
      console.error("Failed to fetch backups list", err);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadBackups();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast("Path copied to clipboard", "info", 2000);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenPath = async (path: string) => {
    try {
      const res = await bridge.openPathInExplorer(path);
      if (res.status !== "ok") {
        toast("Could not open path in Explorer", "error");
      }
    } catch {
      toast("Failed to open Explorer", "error");
    }
  };

  const handleOpenDataFolder = async (subfolder?: string) => {
    try {
      const res = await bridge.openDataFolder(subfolder);
      if (res.status !== "ok") {
        toast("Could not open directory", "error");
      }
    } catch {
      toast("Failed to open folder", "error");
    }
  };

  const handleVacuum = async () => {
    setVacuuming(true);
    try {
      const res = await bridge.vacuumDatabase();
      if (res.status === "ok") {
        toast("Database optimized and compacted successfully", "success");
        await loadStats();
      } else {
        toast(res.message || "Vacuum failed", "error");
      }
    } catch {
      toast("Failed to optimize database", "error");
    } finally {
      setVacuuming(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await bridge.createDatabaseBackup(backupLabel.trim() || undefined);
      if (res.status === "ok") {
        toast("Database backup snapshot created successfully", "success");
        setBackupLabel("");
        setShowBackupInput(false);
        await loadBackups();
      } else {
        toast(res.message || "Backup failed", "error");
      }
    } catch {
      toast("Error creating database backup", "error");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setRestoringBackup(filename);
    try {
      const res = await bridge.restoreDatabaseBackup(filename);
      if (res.status === "ok") {
        toast("Database restored successfully! Snapshot created prior to restore.", "success");
        setConfirmRestore(null);
        await loadStats();
        await loadBackups();
      } else {
        toast(res.message || "Restore failed", "error");
      }
    } catch {
      toast("Error restoring database", "error");
    } finally {
      setRestoringBackup(null);
    }
  };

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const res = await bridge.clearRequestHistory();
      if (res.status === "ok") {
        toast(`Cleared ${res.deleted_count ?? 0} history records`, "success");
        setConfirmClearHistory(false);
        await loadStats();
      } else {
        toast("Failed to clear request history", "error");
      }
    } catch {
      toast("Error clearing history", "error");
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage & Database Metrics Card */}
      <div className="rounded-xl border border-[var(--border-dim)] bg-gradient-to-br from-[var(--bg-s2)] to-[var(--bg-s3)] p-5">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-dim)]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--lime)]/10 text-[var(--lime)]">
              <Database size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--tx-1)]">Local SQLite Database</h3>
              <p className="text-[11px] text-[var(--tx-3)] font-mono truncate max-w-sm">
                {stats?.database_path || systemInfo?.database_path || "kurorelay.db"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStats}
              disabled={loadingStats}
              title="Refresh database metrics"
              className="p-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
            >
              <RotateCw size={13} className={loadingStats ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={handleVacuum}
              disabled={vacuuming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--lime)]/30 bg-[var(--lime)]/10 hover:bg-[var(--lime)]/20 text-[var(--lime)] text-xs font-medium transition-colors cursor-pointer"
            >
              <Sparkles size={13} />
              <span>{vacuuming ? "Optimizing…" : "Compact DB"}</span>
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg border border-[var(--border-dim)]/50 bg-[var(--bg-s1)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--tx-3)] uppercase font-medium">
              <HardDrive size={11} />
              <span>Size on Disk</span>
            </div>
            <div className="text-base font-semibold text-[var(--tx-1)] font-mono mt-1">
              {stats?.size_formatted || "—"}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-dim)]/50 bg-[var(--bg-s1)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--tx-3)] uppercase font-medium">
              <Layers size={11} />
              <span>Collections</span>
            </div>
            <div className="text-base font-semibold text-[var(--tx-1)] font-mono mt-1">
              {stats?.collection_count ?? "—"}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-dim)]/50 bg-[var(--bg-s1)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--tx-3)] uppercase font-medium">
              <FileCode size={11} />
              <span>Saved Requests</span>
            </div>
            <div className="text-base font-semibold text-[var(--tx-1)] font-mono mt-1">
              {stats?.request_count ?? "—"}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-dim)]/50 bg-[var(--bg-s1)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--tx-3)] uppercase font-medium">
              <History size={11} />
              <span>History Entries</span>
            </div>
            <div className="text-base font-semibold text-[var(--tx-1)] font-mono mt-1">
              {stats?.history_count ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Database Backups Section */}
      <SettingSection
        title="Automated & Manual Backups"
        description="Point-in-time SQLite snapshots stored locally in your AppData directory. The system retains the last 15 backups."
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-dim)]/60">
          <div className="flex items-center gap-2">
            <Archive size={15} className="text-[var(--lime)]" />
            <span className="text-xs font-semibold text-[var(--tx-1)]">
              {backups.length} {backups.length === 1 ? "Backup" : "Backups"} Available
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadBackups}
              disabled={loadingBackups}
              title="Refresh backups"
              className="p-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
            >
              <RefreshCw size={12} className={loadingBackups ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => handleOpenDataFolder("backups")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] hover:bg-[var(--bg-s2)] text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
            >
              <FolderOpen size={12} />
              <span>Open Backups Folder</span>
            </button>
            {!showBackupInput ? (
              <button
                type="button"
                onClick={() => setShowBackupInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--lime)]/30 bg-[var(--lime)]/10 hover:bg-[var(--lime)]/20 text-[var(--lime)] text-xs font-medium transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>Create Backup</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Create Backup Input bar */}
        {showBackupInput && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-[var(--lime)]/30 bg-[var(--lime)]/5">
            <input
              type="text"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              placeholder="Optional tag (e.g. pre-migration, v2-release)…"
              className="flex-1 bg-[var(--bg-s1)] border border-[var(--border-dim)] rounded-md px-3 py-1.5 text-xs text-[var(--tx-1)] focus:outline-none focus:border-[var(--lime)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateBackup();
                if (e.key === "Escape") setShowBackupInput(false);
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="px-3 py-1.5 rounded-md bg-[var(--lime)] text-black font-semibold text-xs hover:bg-[var(--lime)]/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              {creatingBackup ? "Creating…" : "Save Snapshot"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBackupInput(false);
                setBackupLabel("");
              }}
              className="px-2.5 py-1.5 rounded-md border border-[var(--border-dim)] bg-[var(--bg-s1)] text-[var(--tx-3)] hover:text-[var(--tx-1)] text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Backups List */}
        <div className="space-y-2 mt-2">
          {backups.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--tx-3)] border border-dashed border-[var(--border-dim)] rounded-lg">
              No backups created yet. Click "Create Backup" to save a point-in-time copy.
            </div>
          ) : (
            backups.map((b) => {
              const isConfirming = confirmRestore === b.filename;
              const isRestoring = restoringBackup === b.filename;

              return (
                <div
                  key={b.filename}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[var(--tx-1)] truncate font-medium">
                      {b.filename}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--tx-3)] mt-0.5">
                      <span>{b.size_formatted}</span>
                      <span>•</span>
                      <span>
                        {new Date(b.created_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(b.path, b.filename)}
                      title="Copy backup file path"
                      className="p-1.5 rounded border border-[var(--border-dim)] bg-[var(--bg-s2)] text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
                    >
                      {copiedKey === b.filename ? (
                        <Check size={12} className="text-[var(--ok)]" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>

                    {!isConfirming ? (
                      <button
                        type="button"
                        onClick={() => setConfirmRestore(b.filename)}
                        className="px-2.5 py-1 rounded border border-[var(--border-dim)] bg-[var(--bg-s2)] hover:border-[var(--lime)]/50 hover:text-[var(--lime)] text-[var(--tx-2)] text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        Restore…
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-[var(--bg-s2)] p-1 rounded border border-[var(--border-dim)]">
                        <ShieldAlert size={12} className="text-amber-400 shrink-0" />
                        <span className="text-[10px] text-amber-300">Replace DB?</span>
                        <button
                          type="button"
                          onClick={() => handleRestoreBackup(b.filename)}
                          disabled={isRestoring}
                          className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[10px] transition-colors cursor-pointer"
                        >
                          {isRestoring ? "…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRestore(null)}
                          className="px-1.5 py-0.5 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] text-[10px] transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SettingSection>

      {/* History Retention & Privacy */}
      <SettingSection
        title="History Retention & Privacy"
        description="Configure how executed requests and responses are recorded in the local audit log."
      >
        <SettingRow
          label="Auto-Save Executed Requests"
          description="Automatically log outgoing HTTP requests and received responses to the History timeline."
        >
          <SettingToggle
            checked={autoSaveHistory}
            onChange={(checked) => onUpdate("auto_save_history", String(checked))}
          />
        </SettingRow>

        <SettingRow
          label="Maximum History Capacity"
          description="Older records beyond this count are automatically purged to prevent unbounded database growth."
        >
          <SettingInput
            type="number"
            value={settings.max_history_records || "500"}
            onChange={(val) => onUpdate("max_history_records", val)}
            className="w-24 text-center"
          />
        </SettingRow>

        <SettingRow
          label="Redact Sensitive Authorization Headers"
          description="Mask tokens and passwords in headers (e.g. Authorization, X-API-Key) before saving to local history."
        >
          <SettingToggle
            checked={redactSensitive}
            onChange={(checked) => onUpdate("redact_sensitive_headers", String(checked))}
          />
        </SettingRow>

        <SettingRow
          label="Clear Request History"
          description="Permanently delete all logged requests, response bodies, and timings across this workspace."
        >
          {!confirmClearHistory ? (
            <button
              type="button"
              onClick={() => setConfirmClearHistory(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--err)]/40 bg-[var(--err)]/10 hover:bg-[var(--err)]/20 text-[var(--err)] text-xs font-medium transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Clear History…</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--err)] font-medium">Are you sure?</span>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={clearingHistory}
                className="px-2.5 py-1 rounded bg-[var(--err)] text-white text-xs font-semibold hover:bg-red-600 transition-colors cursor-pointer"
              >
                {clearingHistory ? "Clearing…" : "Yes, Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="px-2.5 py-1 rounded border border-[var(--border-dim)] bg-[var(--bg-s1)] text-[var(--tx-2)] text-xs hover:text-[var(--tx-1)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </SettingRow>
      </SettingSection>

      {/* Local Storage Locations */}
      <SettingSection
        title="Local File System Locations"
        description="Direct paths on your Windows disk where application data, database files, snapshots, and diagnostic logs are stored."
      >
        {[
          {
            key: "data",
            label: "User Data Directory",
            path: systemInfo?.data_dir || "",
            subfolder: undefined,
            isDir: true,
          },
          {
            key: "database",
            label: "SQLite Database File",
            path: systemInfo?.database_path || "",
            subfolder: undefined,
            isDir: false,
          },
          {
            key: "backups",
            label: "Database Backups Directory",
            path: systemInfo?.backups_dir || (systemInfo?.data_dir ? `${systemInfo.data_dir}\\backups` : ""),
            subfolder: "backups",
            isDir: true,
          },
          {
            key: "logs",
            label: "Application Logs Directory",
            path: systemInfo?.logs_dir || (systemInfo?.data_dir ? `${systemInfo.data_dir}\\logs` : ""),
            subfolder: "logs",
            isDir: true,
          },
          {
            key: "certs",
            label: "SSL & Client Certificates Directory",
            path: systemInfo?.certs_dir || (systemInfo?.data_dir ? `${systemInfo.data_dir}\\certificates` : ""),
            subfolder: "certificates",
            isDir: true,
          },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)]"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase text-[var(--tx-3)] tracking-wider">
                {item.label}
              </div>
              <div className="text-xs font-mono text-[var(--tx-1)] truncate mt-0.5" title={item.path}>
                {item.path || "Loading…"}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(item.path, item.key)}
                title="Copy Path"
                className="p-1.5 rounded-md border border-[var(--border-dim)] bg-[var(--bg-s2)] text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors cursor-pointer"
              >
                {copiedKey === item.key ? (
                  <Check size={13} className="text-[var(--ok)]" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (item.subfolder) {
                    handleOpenDataFolder(item.subfolder);
                  } else {
                    handleOpenPath(item.path);
                  }
                }}
                title="Open in Windows Explorer"
                className="p-1.5 rounded-md border border-[var(--border-dim)] bg-[var(--bg-s2)] text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors cursor-pointer"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          </div>
        ))}
      </SettingSection>
    </div>
  );
}
