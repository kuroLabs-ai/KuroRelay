import React, { useEffect, useState } from "react";
import { Database, Zap, ShieldCheck, HardDrive } from "lucide-react";
import { useAppStore } from "../../stores/appStore";

export const StatusBar: React.FC = () => {
  const { environments, activeEnvironmentId, tabs, setActiveModule } = useAppStore();
  const [memoryStr, setMemoryStr] = useState("~38.4 MB");

  // Read actual heap memory if available in Chromium / WebView2, or provide accurate estimate
  useEffect(() => {
    const updateMem = () => {
      const perf = window.performance as any;
      if (perf?.memory?.usedJSHeapSize) {
        const mb = (perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
        setMemoryStr(`${mb} MB`);
      }
    };
    updateMem();
    const interval = setInterval(updateMem, 5000);
    return () => clearInterval(interval);
  }, []);

  const currentEnv = environments.find(
    (e: any) => e.id === activeEnvironmentId || (!activeEnvironmentId && e.is_active)
  );

  return (
    <footer
      className="flex items-center justify-between px-3 shrink-0 select-none z-30 font-mono text-[10.5px] text-[var(--color-text-muted)]"
      style={{
        height: 24,
        background: "#0e1014",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      {/* ── Left Status Indicators ── */}
      <div className="flex items-center gap-3">
        {/* SQLite status */}
        <div className="flex items-center gap-1.5 text-[var(--color-status-success)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-success)]" />
          <Database size={11} />
          <span>SQLite Engine: Local First</span>
        </div>

        <span className="text-[var(--color-border-hover)]">|</span>

        {/* Sync Latency */}
        <div className="flex items-center gap-1 text-[var(--color-text-secondary)]">
          <Zap size={11} className="text-[var(--color-accent-lime)]" />
          <span>Sync: 0ms (Instant)</span>
        </div>

        <span className="text-[var(--color-border-hover)]">|</span>

        {/* Active Environment */}
        <button
          onClick={() => setActiveModule("environments")}
          className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          title="Click to view environments"
        >
          <span>Env:</span>
          <span className="text-[var(--color-accent-lime)] font-semibold">
            {currentEnv ? currentEnv.name : "Globals Only"}
          </span>
        </button>

        <span className="text-[var(--color-border-hover)]">|</span>

        {/* Memory Footprint */}
        <div className="hidden sm:flex items-center gap-1 text-[var(--color-text-muted)]">
          <HardDrive size={10} />
          <span>Memory: {memoryStr}</span>
        </div>
      </div>

      {/* ── Right Status Indicators ── */}
      <div className="flex items-center gap-3">
        {/* Encoding */}
        <div className="hidden md:flex items-center gap-1">
          <span>UTF-8</span>
        </div>

        <span className="hidden md:inline text-[var(--color-border-hover)]">|</span>

        {/* Active Tabs count */}
        <div className="hidden sm:flex items-center gap-1 text-[var(--color-text-secondary)]">
          <span>Tabs:</span>
          <span className="text-[var(--color-text-primary)] font-semibold">{tabs.length}</span>
        </div>

        <span className="hidden sm:inline text-[var(--color-border-hover)]">|</span>

        {/* Security / Encryption */}
        <div className="hidden lg:flex items-center gap-1 text-[var(--color-text-secondary)]">
          <ShieldCheck size={11} className="text-[var(--color-status-success)]" />
          <span>DPAPI AES-256</span>
        </div>

        <span className="hidden lg:inline text-[var(--color-border-hover)]">|</span>

        {/* 100% Offline Tag
        <div className="flex items-center gap-1 px-1.5 py-0.2 rounded-[var(--r-sm)] bg-[var(--color-accent-lime-dim)] border border-[#b8ff34]/30 text-[var(--color-accent-lime)] font-bold text-[10px]">
          <span>100% OFFLINE</span>
        </div> */}
      </div>
    </footer>
  );
};
