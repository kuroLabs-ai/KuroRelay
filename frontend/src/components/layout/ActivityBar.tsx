import React from "react";
import {
  FolderKanban,
  Send,
  Layers,
  GitBranch,
  Clock,
  Server,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useAppStore, type Module } from "../../stores/appStore";
import { cn } from "../../lib/cn";

const NAV: { id: Module; icon: React.ElementType; label: string }[] = [
  { id: "collections", icon: FolderKanban, label: "Collections" },
  { id: "request",     icon: Send,         label: "Request Builder" },
  { id: "environments", icon: Layers,       label: "Environments" },
  { id: "history",     icon: Clock,        label: "History" },
  { id: "workflows",   icon: GitBranch,    label: "Workflow Studio" },
  { id: "mock",        icon: Server,       label: "Mock Server" },
];

export const ActivityBar: React.FC<{ sidebarToggleHidden?: boolean }> = ({ sidebarToggleHidden = false }) => {
  const { activeModule, setActiveModule, sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className="flex flex-col items-center py-2 shrink-0 z-30 select-none"
      style={{
        width: 48,
        background: "var(--color-surface-activity)",
        borderRight: "1px solid var(--color-border-subtle)",
      }}
    >
      {!sidebarToggleHidden && (
        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className={cn(
            "w-9 h-8 flex items-center justify-center rounded mb-3 transition-colors",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-panel)]"
          )}
        >
          {sidebarOpen ? (
            <PanelLeftClose size={15} strokeWidth={1.6} />
          ) : (
            <PanelLeft size={15} strokeWidth={1.6} />
          )}
        </button>
      )}

      {/* Divider */}
      <div
        style={{
          width: 24,
          height: 1,
          background: "var(--color-border-subtle)",
          marginBottom: 8,
        }}
      />

      {/* Nav items */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {NAV.map(({ id, icon: Icon, label }) => {
          const active = activeModule === id;
          return (
            <button
              key={id}
              title={label}
              onClick={() => {
                setActiveModule(id);
                if (!sidebarOpen && id !== "history" && id !== "mock" && id !== "settings") {
                  toggleSidebar();
                }
              }}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-100 cursor-pointer"
              style={{
                color: active
                  ? "var(--color-text-primary)"
                  : "var(--color-text-muted)",
                background: active
                  ? "var(--color-surface-panel)"
                  : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--color-surface-panel)";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--color-text-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = active
                  ? "var(--color-surface-panel)"
                  : "transparent";
                (e.currentTarget as HTMLElement).style.color = active
                  ? "var(--color-text-primary)"
                  : "var(--color-text-muted)";
              }}
            >
              {/* Active left indicator (lime accent) */}
              {active && (
                <span
                  className="absolute left-0 inset-y-1.5 rounded-r"
                  style={{ width: 2, background: "var(--color-accent-lime)" }}
                />
              )}
              <Icon size={17} strokeWidth={1.6} />
            </button>
          );
        })}
      </div>

      {/* Settings pinned to bottom */}
      <div
        style={{
          width: 24,
          height: 1,
          background: "var(--color-border-subtle)",
          marginBottom: 8,
        }}
      />
      {(() => {
        const active = activeModule === "settings";
        return (
          <button
            title="Settings"
            onClick={() => {
              setActiveModule("settings");
              if (!sidebarOpen) {
                toggleSidebar();
              }
            }}
            className="relative w-9 h-9 flex items-center justify-center rounded transition-all"
            style={{
              color: active
                ? "var(--color-text-primary)"
                : "var(--color-text-muted)",
              background: active
                ? "var(--color-surface-panel)"
                : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--color-surface-panel)";
                (e.currentTarget as HTMLElement).style.color =
                  "var(--color-text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = active
                ? "var(--color-surface-panel)"
                : "transparent";
              (e.currentTarget as HTMLElement).style.color = active
                ? "var(--color-text-primary)"
                : "var(--color-text-muted)";
            }}
          >
            {active && (
              <span
                className="absolute left-0 inset-y-1.5 rounded-r"
                style={{ width: 2, background: "var(--color-accent-lime)" }}
              />
            )}
            <Settings size={17} strokeWidth={1.6} />
          </button>
        );
      })()}
    </aside>
  );
};
