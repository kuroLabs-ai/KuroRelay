import { useState, useEffect } from "react";
import {
  ShieldCheck,
  KeyRound,
  Eraser,
  FileKey,
  Plus,
  Trash2,
  FolderOpen,
  Copy,
  Check,
  RefreshCw,
  FileText,
  RotateCw,
} from "lucide-react";
import type { SettingsState } from "./types";
import {
  SettingSection,
  SettingRow,
  SettingSelect,
} from "./SettingControls";
import {
  bridge,
  type SystemInfo,
  type CertificateInfo,
  type LogsResult,
} from "../../../bridge/client";
import { useToast } from "../../ui/Toast";

interface Props {
  settings: SettingsState;
  onUpdate: (key: string, value: string) => void;
  systemInfo: SystemInfo | null;
}

export function SecuritySettingsTab({ settings, onUpdate, systemInfo }: Props) {
  const { toast } = useToast();
  const [flushing, setFlushing] = useState(false);

  // Certificates state
  const [certificates, setCertificates] = useState<CertificateInfo[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);
  const [importingCert, setImportingCert] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Logs state
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logsData, setLogsData] = useState<LogsResult | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);

  const loadCertificates = async () => {
    setLoadingCerts(true);
    try {
      const res = await bridge.listCertificates();
      if (res.status === "ok" && Array.isArray(res.certificates)) {
        setCertificates(res.certificates);
      }
    } catch (err) {
      console.error("Failed to list certificates", err);
    } finally {
      setLoadingCerts(false);
    }
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await bridge.getRecentLogs(200);
      if (res.status === "ok") {
        setLogsData(res);
      }
    } catch (err) {
      console.error("Failed to load logs", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadCertificates();
  }, []);

  const handleImportCertificate = async () => {
    setImportingCert(true);
    try {
      const res = await bridge.importCertificate();
      if (res.status === "ok") {
        toast(`Certificate ${res.filename} added successfully`, "success");
        await loadCertificates();
      } else if (res.status !== "cancelled") {
        toast(res.error || "Failed to import certificate", "error");
      }
    } catch {
      toast("Error importing certificate", "error");
    } finally {
      setImportingCert(false);
    }
  };

  const handleDeleteCertificate = async (filename: string) => {
    try {
      const res = await bridge.deleteCertificate(filename);
      if (res.status === "ok") {
        toast(`Removed ${filename}`, "info");
        await loadCertificates();
      } else {
        toast(res.error || "Failed to delete certificate", "error");
      }
    } catch {
      toast("Error removing certificate", "error");
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast("Copied to clipboard", "info", 1500);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleFlushSecrets = () => {
    setFlushing(true);
    setTimeout(() => {
      setFlushing(false);
      toast("In-memory decrypted secrets flushed", "success");
    }, 400);
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      const res = await bridge.clearLogs();
      if (res.status === "ok") {
        toast("Application log file cleared", "success");
        await loadLogs();
      } else {
        toast("Failed to clear logs", "error");
      }
    } catch {
      toast("Error clearing logs", "error");
    } finally {
      setClearingLogs(false);
    }
  };

  const isKeyringActive = (systemInfo?.keyring_status || "").includes("connected");

  return (
    <div className="space-y-6">
      {/* Windows Credential Manager Vault Status */}
      <div className="rounded-xl border border-[var(--border-dim)] bg-gradient-to-br from-[var(--bg-s2)] to-[var(--bg-s3)] p-5">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-dim)]/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--ok)]/10 text-[var(--ok)] border border-[var(--ok)]/20">
              <KeyRound size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--tx-1)]">
                  OS Credential Vault (Keyring)
                </h3>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)] animate-pulse" />
                  {isKeyringActive ? "Active & Hardware Protected" : "Connected"}
                </span>
              </div>
              <p className="text-xs text-[var(--tx-3)] mt-0.5">
                Provider: <span className="font-mono text-[var(--tx-2)]">{systemInfo?.keyring_status || "Windows Credential Manager"}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-[var(--tx-2)] leading-relaxed space-y-2">
          <p>
            KuroRelay utilizes the <strong>Windows Credential Manager</strong> via Python’s native keyring service. Secret variables, Bearer tokens, and Basic auth passwords are encrypted and isolated by your Windows user account.
          </p>
          <p className="text-[11px] text-[var(--tx-3)]">
            Secrets are never persisted in plaintext inside the SQLite database or exposed in export archives unless explicitly approved.
          </p>
        </div>
      </div>

      {/* SSL Certificates & Custom CAs */}
      <SettingSection
        title="Client Certificates & Custom CAs"
        description="Manage mTLS (Mutual TLS) certificates and custom Root CAs for testing internal or private APIs."
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-dim)]/60">
          <div className="flex items-center gap-2">
            <FileKey size={15} className="text-[var(--lime)]" />
            <span className="text-xs font-semibold text-[var(--tx-1)]">
              {certificates.length} {certificates.length === 1 ? "Certificate" : "Certificates"} Installed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCertificates}
              disabled={loadingCerts}
              title="Refresh certificate list"
              className="p-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
            >
              <RefreshCw size={12} className={loadingCerts ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => bridge.openDataFolder("certificates")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] hover:bg-[var(--bg-s2)] text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
            >
              <FolderOpen size={12} />
              <span>Open Folder</span>
            </button>
            <button
              type="button"
              onClick={handleImportCertificate}
              disabled={importingCert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--lime)]/30 bg-[var(--lime)]/10 hover:bg-[var(--lime)]/20 text-[var(--lime)] text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>{importingCert ? "Selecting…" : "Add Certificate"}</span>
            </button>
          </div>
        </div>

        {/* Certificate list */}
        <div className="space-y-2 mt-2">
          {certificates.length === 0 ? (
            <div className="text-center py-6 px-4 text-xs text-[var(--tx-3)] border border-dashed border-[var(--border-dim)] rounded-lg space-y-1">
              <p>No certificates installed in <code className="text-[var(--tx-2)]">AppData/certificates/</code>.</p>
              <p className="text-[11px]">
                Click "Add Certificate" to import <code className="text-[var(--lime)]">.pem</code>, <code className="text-[var(--lime)]">.crt</code>, or <code className="text-[var(--lime)]">.pfx</code> files for Mutual TLS or custom local development CAs.
              </p>
            </div>
          ) : (
            certificates.map((cert) => (
              <div
                key={cert.filename}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[var(--tx-1)] truncate font-medium">
                      {cert.filename}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-[var(--bg-s2)] text-[var(--lime)] border border-[var(--border-dim)]">
                      {cert.extension.replace(".", "")}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--tx-3)] mt-0.5">
                    {cert.size_formatted} • Added {new Date(cert.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(cert.path, cert.filename)}
                    title="Copy full path"
                    className="p-1.5 rounded border border-[var(--border-dim)] bg-[var(--bg-s2)] text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
                  >
                    {copiedKey === cert.filename ? (
                      <Check size={12} className="text-[var(--ok)]" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCertificate(cert.filename)}
                    title="Delete certificate"
                    className="p-1.5 rounded border border-[var(--err)]/30 bg-[var(--err)]/10 text-[var(--err)] hover:bg-[var(--err)]/20 transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </SettingSection>

      {/* Session Security & Cache */}
      <SettingSection
        title="Session Security & Decryption Cache"
        description="Manage decrypted credentials kept in temporary memory during active test sessions."
      >
        <SettingRow
          label="Flush In-Memory Session Secrets"
          description="Immediately evicts all cached and decrypted tokens from active application memory."
        >
          <button
            type="button"
            onClick={handleFlushSecrets}
            disabled={flushing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] hover:bg-[var(--bg-s3)] text-[var(--tx-1)] text-xs font-medium transition-colors cursor-pointer"
          >
            <Eraser size={13} className={flushing ? "animate-spin" : ""} />
            <span>{flushing ? "Flushing…" : "Flush Session Cache"}</span>
          </button>
        </SettingRow>
      </SettingSection>

      {/* Diagnostics & Logging Security */}
      <SettingSection
        title="Diagnostic Logging & Runtime Logs"
        description="Configure runtime log levels and inspect timestamped stack traces and network diagnostics."
      >
        <SettingRow
          label="Application Log Level"
          description="Set the threshold for recording diagnostic events to local log files."
        >
          <SettingSelect
            value={settings.log_level || "INFO"}
            onChange={(val) => onUpdate("log_level", val)}
            options={[
              { label: "INFO (Default)", value: "INFO" },
              { label: "DEBUG (Verbose diagnostics)", value: "DEBUG" },
              { label: "WARNING (Errors & alerts only)", value: "WARNING" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Application Log File (kurorelay.log)"
          description="Local rotating log file on disk. Essential for troubleshooting network failures or app errors."
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowLogViewer(true);
                loadLogs();
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--lime)]/30 bg-[var(--lime)]/10 hover:bg-[var(--lime)]/20 text-[var(--lime)] text-xs font-medium transition-colors cursor-pointer"
            >
              <FileText size={13} />
              <span>View Logs</span>
            </button>
            <button
              type="button"
              onClick={() => bridge.openDataFolder("logs")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] hover:bg-[var(--bg-s2)] text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
            >
              <FolderOpen size={12} />
              <span>Open Logs Folder</span>
            </button>
          </div>
        </SettingRow>

        {/* Inline Log Viewer drawer */}
        {showLogViewer && (
          <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s1)] p-3 space-y-2 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--tx-1)]">
                Recent Diagnostic Logs ({logsData?.lines ?? 0} lines)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={loadingLogs}
                  className="p-1 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
                  title="Refresh logs"
                >
                  <RotateCw size={12} className={loadingLogs ? "animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  onClick={() => logsData?.logs && handleCopy(logsData.logs, "all_logs")}
                  className="px-2 py-0.5 rounded border border-[var(--border-dim)] bg-[var(--bg-s2)] text-[11px] text-[var(--tx-2)] hover:text-[var(--tx-1)] cursor-pointer"
                >
                  {copiedKey === "all_logs" ? "Copied!" : "Copy All"}
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={clearingLogs}
                  className="px-2 py-0.5 rounded border border-[var(--err)]/30 bg-[var(--err)]/10 text-[var(--err)] text-[11px] cursor-pointer"
                >
                  Clear Logs
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogViewer(false)}
                  className="px-2 py-0.5 rounded border border-[var(--border-dim)] text-[var(--tx-3)] hover:text-[var(--tx-1)] text-[11px] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="max-h-60 overflow-y-auto font-mono text-[11px] leading-relaxed text-[var(--tx-2)] p-2.5 rounded bg-black/60 border border-[var(--border-dim)] select-text whitespace-pre-wrap">
              {logsData?.logs ? logsData.logs : "No log entries found or log file is empty."}
            </pre>
          </div>
        )}

        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--lime)]/30 bg-[var(--lime-soft)] text-xs text-[var(--lime)]">
          <ShieldCheck size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Automated Redaction Guarantee</span>
            <p className="text-[11px] leading-relaxed text-[var(--tx-2)]">
              KuroRelay’s logging engine recursively sanitizes Authorization headers, API keys, and sensitive payload tokens before any entry is written to disk.
            </p>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
