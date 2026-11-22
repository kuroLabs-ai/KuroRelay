import { useState } from "react";
import {
  ExternalLink,
  BookOpen,
  Cpu,
  Terminal,
  HardDrive,
  Copy,
  Check,
  FolderOpen,
  Layers,
  Sparkles,
  Shield,
  Heart,
} from "lucide-react";
import { type SystemInfo, bridge } from "../../../bridge/client";
import { useToast } from "../../ui/Toast";

interface Props {
  systemInfo: SystemInfo | null;
}

export function AboutSettingsTab({ systemInfo }: Props) {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyPath = (path: string, key: string) => {
    navigator.clipboard.writeText(path);
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

  const handleOpenUrl = async (url: string) => {
    try {
      await bridge.openExternalUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* App Identity Banner */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-dim)] bg-gradient-to-br from-[var(--bg-s2)] via-[var(--bg-s3)] to-[var(--bg-s2)] p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="KuroRelay"
              className="h-9 w-9 object-contain rounded-lg drop-shadow-md border border-[var(--border-dim)]/50 bg-[var(--bg-s1)] p-0.5"
              onError={(e) => {
                // Fallback to text icon if image not available
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-[var(--tx-1)] font-mono">
                {systemInfo?.app_name ?? "KuroRelay"}
              </span>
              <span className="rounded-full bg-[var(--lime)]/15 border border-[var(--lime)]/30 px-2.5 py-0.5 text-[10px] font-bold text-[var(--lime)]">
                v{systemInfo?.version ?? "0.1.0"}
              </span>
              <span className="rounded-full bg-[var(--bg-s4)] border border-[var(--border-dim)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tx-2)]">
                {systemInfo?.release_channel ?? "Production"}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--tx-2)] leading-relaxed max-w-lg">
            {systemInfo?.tagline ?? "Desktop API Development, Testing & Automation Environment"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--tx-3)]">
            <span className="h-2 w-2 rounded-full bg-[var(--ok)] animate-pulse" />
            <span className="font-mono">Build {systemInfo?.build ?? "2026.11"}</span>
          </div>
          <span className="text-[10px] text-[var(--tx-3)] font-mono">Local-First Architecture</span>
        </div>
      </div>

      {/* KuroLabs Organization Spotlight */}
      <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] p-5 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-dim)]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--lime)]" />
            <h3 className="text-sm font-semibold text-[var(--tx-1)]">
              Crafted by KuroLabs
            </h3>
          </div>
          <button
            type="button"
            onClick={() => handleOpenUrl(systemInfo?.org_url ?? "https://github.com/kuroLabs-ai")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-dim)] bg-[var(--bg-s1)] hover:bg-[var(--bg-s3)] text-[11px] font-medium text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
          >
            <span>github.com/kuroLabs-ai</span>
            <ExternalLink size={11} />
          </button>
        </div>

        <p className="text-xs text-[var(--tx-2)] leading-relaxed">
          <strong>KuroLabs</strong> builds high-performance, developer-focused desktop instruments designed for speed, privacy, and sovereignty. We believe developer tools should run locally on your hardware without cloud locks or account friction.
        </p>
      </div>

      {/* Community & Resources (3 Cards Grid) */}
      <div className="space-y-3">
        <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--tx-3)]">
          Community & Resources
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {/* GitHub */}
          <button
            type="button"
            onClick={() => handleOpenUrl(systemInfo?.github_url ?? "https://github.com/kuroLabs-ai/KuroRelay")}
            className="flex flex-col text-left rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] p-3.5 hover:border-[var(--lime)]/60 hover:bg-[var(--bg-s3)] transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between text-[var(--tx-1)] mb-1.5">
              <div className="flex items-center gap-2 font-bold text-xs">
                <svg className="w-4 h-4 fill-current text-[var(--tx-2)] group-hover:text-[var(--tx-1)] transition-colors" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>GitHub</span>
              </div>
              <ExternalLink size={12} className="text-[var(--tx-3)] group-hover:text-[var(--tx-1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <span className="text-[10px] text-[var(--tx-3)]">
              Source code repository, changelogs, and issues.
            </span>
          </button>

          {/* Discord */}
          <button
            type="button"
            onClick={() => handleOpenUrl(systemInfo?.discord_url ?? "https://discord.gg/2pj9TuqWr")}
            className="flex flex-col text-left rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] p-3.5 hover:border-[#5865F2]/60 hover:bg-[var(--bg-s3)] transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between text-[var(--tx-1)] mb-1.5">
              <div className="flex items-center gap-2 font-bold text-xs">
                <svg className="w-4 h-4 fill-current text-[#5865F2]" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span>Discord</span>
              </div>
              <ExternalLink size={12} className="text-[var(--tx-3)] group-hover:text-[#5865F2] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <span className="text-[10px] text-[var(--tx-3)]">
              Developer community, feature requests, and feedback.
            </span>
          </button>

          {/* Docs */}
          <button
            type="button"
            onClick={() => handleOpenUrl(systemInfo?.docs_url ?? "https://github.com/KuroLabs/KuroRelay#documentation")}
            className="flex flex-col text-left rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] p-3.5 hover:border-[var(--lime)]/60 hover:bg-[var(--bg-s3)] transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between text-[var(--tx-1)] mb-1.5">
              <div className="flex items-center gap-2 font-bold text-xs">
                <BookOpen size={14} className="text-[var(--lime)]" />
                <span>Documentation</span>
              </div>
              <ExternalLink size={12} className="text-[var(--tx-3)] group-hover:text-[var(--tx-1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <span className="text-[10px] text-[var(--tx-3)]">
              Architecture blueprints, bridge contracts, and workflows.
            </span>
          </button>
        </div>
      </div>

      {/* System & Runtime Environment */}
      <div className="space-y-3">
        <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--tx-3)]">
          System & Runtime Environment
        </h4>
        <div className="overflow-hidden rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] divide-y divide-[var(--border-dim)]/50">
          {[
            {
              icon: <Cpu size={13} />,
              label: "Host OS & Architecture",
              value: `${systemInfo?.platform ?? "Windows"} (${systemInfo?.architecture ?? "x64"})`,
            },
            {
              icon: <Terminal size={13} />,
              label: "Python Runtime",
              value: `Python ${systemInfo?.python_version ?? "3.13"} · Async HTTPX Engine`,
            },
            {
              icon: <Layers size={13} />,
              label: "Desktop Shell",
              value: "PyWebView · Microsoft Edge WebView2",
            },
            {
              icon: <HardDrive size={13} />,
              label: "Database Engine",
              value: "SQLite (WAL Mode) · SQLAlchemy & Alembic",
              highlight: true,
            },
            {
              icon: <Shield size={13} />,
              label: "Credential Store",
              value: systemInfo?.keyring_status ?? "Windows Credential Manager",
            },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[var(--tx-3)] flex items-center gap-2.5 font-medium">
                {row.icon}
                {row.label}
              </span>
              <span
                className={`font-mono text-[11px] ${
                  row.highlight
                    ? "text-[var(--ok)] font-semibold flex items-center gap-1.5"
                    : "text-[var(--tx-1)]"
                }`}
              >
                {row.highlight && <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />}
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Application Storage Paths */}
      <div className="space-y-3">
        <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--tx-3)]">
          Application Paths
        </h4>
        <div className="space-y-2">
          {[
            { label: "User Data Directory", path: systemInfo?.data_dir ?? "", key: "data" },
            { label: "Database File", path: systemInfo?.database_path ?? "", key: "db" },
            { label: "Application Logs", path: systemInfo?.logs_dir ?? "", key: "logs" },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] px-4 py-2.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-3)]">
                  {item.label}
                </div>
                <div className="truncate font-mono text-[11px] text-[var(--tx-1)] mt-0.5" title={item.path}>
                  {item.path || "Loading…"}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyPath(item.path, item.key)}
                  title={`Copy ${item.label}`}
                  className="rounded p-1.5 text-[var(--tx-3)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
                >
                  {copiedKey === item.key ? (
                    <Check size={13} className="text-[var(--ok)]" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenPath(item.path)}
                  title={`Open in Explorer`}
                  className="rounded p-1.5 text-[var(--tx-3)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
                >
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* License and Attribution */}
      <div className="rounded-xl border border-[var(--border-dim)]/50 bg-[var(--bg-s2)]/40 p-4 text-[11px] text-[var(--tx-3)] text-center leading-relaxed">
        <div className="flex items-center justify-center gap-1.5 font-medium text-[var(--tx-2)] mb-1">
          <span>KuroRelay is free & open-source software crafted with</span>
          <Heart size={12} className="text-[var(--err)] fill-current inline" />
          <span>by KuroLabs</span>
        </div>
        <p className="text-[10px] text-[var(--tx-3)]">
          Licensed under Apache 2.0 / MIT Open Source License. Designed for Windows local-first engineering.
        </p>
      </div>
    </div>
  );
}
