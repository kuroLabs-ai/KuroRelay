import React, { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  Search,
  Check,
  Zap,
  Minus,
  Square,
  X,
  Database,
  FolderKanban,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge, type Workspace } from "../../bridge/client";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { useDropdown } from "../../lib/useDropdown";
import { useKuroStore } from "../../stores/kuroStore";

export const TitleBar: React.FC = () => {
  const {
    activeWorkspaceId,
    setActiveWorkspace,
    activeEnvironmentId,
    setActiveEnvironment,
    environments,
    setEnvironments,
    setActiveModule,
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
  } = useAppStore();

  const { isDrawerOpen, toggleDrawer, agentStatus } = useKuroStore();

  const [, setWorkspaces] = useState<Workspace[]>([]);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sqliteLatency, setSqliteLatency] = useState<number | null>(0);

  const wsDropdown = useDropdown({
    isOpen: wsDropdownOpen,
    onClose: () => {
      setWsDropdownOpen(false);
    },
  });

  const envDropdown = useDropdown({
    isOpen: envDropdownOpen,
    onClose: () => setEnvDropdownOpen(false),
  });

  // Ping SQLite engine periodically to measure real latency
  const measurePing = useCallback(async () => {
    const start = performance.now();
    try {
      await bridge.ping();
      const elapsed = Math.round(performance.now() - start);
      setSqliteLatency(elapsed);
    } catch {
      setSqliteLatency(null);
    }
  }, []);

  useEffect(() => {
    measurePing();
    const timer = setInterval(measurePing, 8000);
    return () => clearInterval(timer);
  }, [measurePing]);

  // Global Ctrl+P for Command Palette (Ctrl+K is used by Kuro Copilot)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p" && e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadWorkspaces = () => {
    bridge
      .getWorkspaces()
      .then((res: any) => {
        const list: Workspace[] = res?.workspaces ?? [];
        setWorkspaces(list);
        if (list.length > 0 && !activeWorkspaceId) {
          setActiveWorkspace(list[0].id);
        }
      })
      .catch(console.error);
  };

  const loadEnvironments = (wsId: string) => {
    bridge
      .getEnvironments(wsId)
      .then((res: any) => {
        const envs = res?.environments || [];
        setEnvironments(envs);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadWorkspaces();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (activeWorkspaceId) {
      loadEnvironments(activeWorkspaceId);
    }
  }, [activeWorkspaceId]); // eslint-disable-line

  const currentEnv = environments.find(
    (e: any) => e.id === activeEnvironmentId || (!activeEnvironmentId && e.is_active)
  );
  const currentCollection = collections.find((c) => c.id === selectedCollectionId) ?? collections[0];

  const [isMaximized, setIsMaximized] = useState(true);

  useEffect(() => {
    bridge.getWindowState().then((res) => {
      if (res?.status === "ok" && res.state?.is_maximized !== undefined) {
        setIsMaximized(!!res.state.is_maximized);
      }
    }).catch(() => {});
  }, []);

  const handleMinimize = async () => {
    try {
      await bridge.minimizeWindow();
    } catch (e) {
      console.warn("Minimize window failed", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const res = await bridge.maximizeWindow();
      if (res?.status === "ok" && typeof res.maximized === "boolean") {
        setIsMaximized(res.maximized);
      } else {
        setIsMaximized((prev) => !prev);
      }
    } catch (e) {
      console.warn("Maximize window failed", e);
    }
  };

  const handleTitleBarDoubleClick = (e: React.MouseEvent) => {
    // Avoid triggering maximize if clicking inside an interactive element
    if ((e.target as HTMLElement).closest(".no-drag")) {
      return;
    }
    handleMaximize();
  };

  const handleClose = async () => {
    try {
      await bridge.closeWindow();
    } catch (e) {
      console.warn("Close window failed", e);
    }
  };

  return (
    <>
      <header
        onDoubleClick={handleTitleBarDoubleClick}
        className="pywebview-drag-region flex items-center justify-between px-3 shrink-0 select-none z-40 cursor-default"
        style={{
          height: 36,
          background: "#0f1115",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        {/* ── Left: Brand Mascot & Selectors (no-drag) ── */}
        <div className="no-drag flex items-center gap-2 min-w-0">
          {/* App Logo & Title */}
          <div
            onClick={() => setActiveModule("collections")}
            className="flex items-center gap-2 shrink-0 pr-2 border-r border-[var(--color-border-subtle)] cursor-pointer"
            title="KuroRelay Home"
          >
            <div className="w-5 h-5 rounded-[var(--r-sm)] bg-[#1a1a1f] border border-[#2a2a30] flex items-center justify-center text-[var(--color-accent-lime)] shadow-sm">
              <Zap size={11} className="fill-[var(--color-accent-lime)]" />
            </div>
            <span className="font-mono text-xs font-bold text-[var(--color-text-primary)] tracking-wide">
              KuroRelay
            </span>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-panel)] px-1.5 py-0.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)]">
              v2.0
            </span>
          </div>

          {/* Collection Selector Dropdown */}
          <div
            className="relative"
            ref={wsDropdown.ref}
            onMouseEnter={wsDropdown.onMouseEnter}
            onMouseLeave={wsDropdown.onMouseLeave}
          >
            <button
              onClick={() => {
                setWsDropdownOpen((v) => !v);
                setEnvDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--r-sm)] hover:bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors text-xs cursor-pointer"
            >
              <FolderKanban size={12} className="text-[var(--color-accent-lime)]" />
              <span className="max-w-[130px] truncate font-medium">
                {currentCollection ? currentCollection.name : "Collection"}
              </span>
              <ChevronDown size={11} className="text-[var(--color-text-muted)]" />
            </button>

            {wsDropdownOpen && (
              <div
                className="absolute left-0 top-full mt-1 w-56 rounded-[var(--r-md)] py-1 shadow-2xl bg-[var(--color-surface-modal)] border border-[var(--color-border-subtle)] z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold font-mono">
                  Collections
                </div>
                {collections.length > 0 ? (
                  collections.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => {
                        setSelectedCollectionId(col.id);
                        setWsDropdownOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] text-left cursor-pointer"
                    >
                      <span className="truncate">{col.name}</span>
                      {(col.id === currentCollection?.id) && (
                        <Check size={12} className="text-[var(--color-accent-lime)] shrink-0" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-2.5 py-2 text-xs text-[var(--color-text-muted)]">No collections found</div>
                )}

                <div className="border-t border-[var(--color-border-subtle)] mt-1 pt-1">
                  <button
                    onClick={() => {
                      setActiveModule("collections");
                      setWsDropdownOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 text-left text-xs text-[var(--color-accent-lime)] hover:bg-[var(--color-surface-elevated)] cursor-pointer"
                  >
                    Manage Collections
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Environment Selector Dropdown */}
          <div
            className="relative"
            ref={envDropdown.ref}
            onMouseEnter={envDropdown.onMouseEnter}
            onMouseLeave={envDropdown.onMouseLeave}
          >
            <button
              onClick={() => {
                setEnvDropdownOpen((v) => !v);
                setWsDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--r-sm)] hover:bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors text-xs"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  currentEnv ? "bg-[var(--color-status-success)]" : "bg-[var(--color-text-muted)]"
                }`}
              />
              <span className="max-w-[120px] truncate font-mono text-[11px]">
                Env: {currentEnv ? currentEnv.name : "None (Globals)"}
              </span>
              <ChevronDown size={11} className="text-[var(--color-text-muted)]" />
            </button>

            {envDropdownOpen && (
              <div
                className="absolute left-0 top-full mt-1 w-52 rounded-[var(--r-md)] py-1 shadow-2xl bg-[var(--color-surface-modal)] border border-[var(--color-border-subtle)] z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold font-mono">
                  Active Environment
                </div>
                <button
                  onClick={() => {
                    setActiveEnvironment(null);
                    setEnvDropdownOpen(false);
                  }}
                  className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] text-left"
                >
                  <span>No Environment (Globals only)</span>
                  {!activeEnvironmentId && (
                    <Check size={12} className="text-[var(--color-status-success)] shrink-0" />
                  )}
                </button>
                {environments.map((env: any) => (
                  <button
                    key={env.id}
                    onClick={() => {
                      setActiveEnvironment(env.id);
                      setEnvDropdownOpen(false);
                    }}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] text-left"
                  >
                    <span className="truncate">{env.name}</span>
                    {env.id === activeEnvironmentId && (
                      <Check size={12} className="text-[var(--color-status-success)] shrink-0" />
                    )}
                  </button>
                ))}

                <div className="border-t border-[var(--color-border-subtle)] mt-1 pt-1 px-1">
                  <button
                    onClick={() => {
                      setEnvDropdownOpen(false);
                      setActiveModule("environments");
                    }}
                    className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-[var(--color-accent-lime)] hover:bg-[var(--color-surface-elevated)] rounded-[var(--r-sm)]"
                  >
                    Manage Environments...
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Search / Jump to (Ctrl+K) (no-drag) ── */}
        <div className="no-drag flex items-center justify-center flex-1 max-w-[340px] px-2">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center justify-between w-full h-[24px] px-2.5 rounded-[var(--r-sm)] bg-[var(--color-surface-panel)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] transition-all text-xs"
          >
            <div className="flex items-center gap-1.5">
              <Search size={11} />
              <span className="text-[11px]">Quick Search / Jump to...</span>
            </div>
            <kbd className="font-mono text-[9px] bg-[var(--color-surface-elevated)] px-1 py-0.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]">
              Ctrl+Shift+P
            </kbd>
          </button>
        </div>

        {/* ── Right: Local Engine Status & Window Controls (no-drag) ── */}
        <div className="no-drag flex items-center gap-3 shrink-0">
          {/* Kuro AI Toggle Button */}
          <button
            onClick={toggleDrawer}
            title="Kuro AI Copilot (Ctrl+K)"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border ${
              isDrawerOpen
                ? "bg-[var(--color-accent-lime)]/15 border-[var(--color-accent-lime)] text-[var(--color-accent-lime)] shadow-[0_0_12px_rgba(184,255,52,0.15)]"
                : "bg-[var(--color-surface-panel)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-lime)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <img
              src="/logo.png"
              alt="Kuro"
              className={`w-3.5 h-3.5 rounded-full object-cover shrink-0 ${
                agentStatus !== "idle" ? "animate-pulse ring-1 ring-amber-400" : ""
              }`}
            />
            <span>Kuro</span>
            {agentStatus !== "idle" && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* SQLite Indicator */}
          <div
            onClick={measurePing}
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--r-sm)] bg-[#121c16] border border-[#1b3d27] text-[var(--color-status-success)] text-[11px] font-mono cursor-pointer"
            title="Click to test SQLite bridge ping"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-success)] animate-pulse" />
            <Database size={11} />
            <span>SQLite: {sqliteLatency !== null ? `${sqliteLatency}ms` : "Offline"}</span>
          </div>

          {/* 100% Offline Tag */}
          {/* <div
            className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--r-sm)] bg-[var(--color-accent-lime-dim)] border border-[#b8ff34]/30 text-[var(--color-accent-lime)] text-[10px] font-bold font-mono uppercase tracking-wide"
            title="Local-First Native Architecture. Zero cloud dependency."
          >
            <Globe2 size={10} />
            <span>100% Offline</span>
          </div> */}

          {/* Frameless Windows Titlebar Control Buttons */}
          <div className="flex items-center border-l border-[var(--color-border-subtle)] pl-2">
            <button
              title="Minimize"
              onClick={handleMinimize}
              className="w-7 h-6 flex items-center justify-center rounded-[var(--r-sm)] hover:bg-[var(--color-surface-panel)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
            >
              <Minus size={11} />
            </button>
            <button
              title={isMaximized ? "Restore Down" : "Maximize"}
              onClick={handleMaximize}
              className="w-7 h-6 flex items-center justify-center rounded-[var(--r-sm)] hover:bg-[var(--color-surface-panel)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="2.5" y="0.5" width="7" height="7" rx="0.5" />
                  <path d="M0.5 2.5V9.5H7.5" />
                </svg>
              ) : (
                <Square size={10} />
              )}
            </button>
            <button
              title="Close Application"
              onClick={handleClose}
              className="w-7 h-6 flex items-center justify-center rounded-[var(--r-sm)] hover:bg-[#e81123] text-[var(--color-text-muted)] hover:text-white transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Global Command Palette */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </>
  );
};
