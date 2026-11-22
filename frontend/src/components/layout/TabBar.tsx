import React, { useState, useEffect, useRef } from "react";
import { Plus, X, Copy, XCircle, ArrowRight } from "lucide-react";
import { useAppStore, type Tab } from "../../stores/appStore";
import { cn, methodColor } from "../../lib/cn";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { ContextMenu } from "../ui/ContextMenu";

export const TabBar: React.FC<{ onRequestCloseTabs: (ids: string[]) => void }> = ({
  onRequestCloseTabs,
}) => {
  const { tabs, activeTabId, setActiveTab, openTab, reorderTabs } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    tab: Tab | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    tab: null,
  });

  const draggedTabId = useRef<string | null>(null);
  const lastDragTargetId = useRef<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      draggedTabId.current = null;
      lastDragTargetId.current = null;
      setDragOverTabId(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tab,
    });
  };

  const handleDuplicate = (tab: Tab) => {
    openTab({
      name: `${tab.name} (Copy)`,
      method: tab.method,
      url: tab.url,
      protocol: tab.protocol,
      params: tab.params,
      headers: tab.headers,
      body: tab.body,
      auth: tab.auth,
      options: tab.options,
    });
    setContextMenu((p) => ({ ...p, visible: false }));
  };

  const handleCloseOthers = (id: string) => {
    setActiveTab(id);
    onRequestCloseTabs(tabs.filter((tab) => tab.id !== id).map((tab) => tab.id));
    setContextMenu((p) => ({ ...p, visible: false }));
  };

  const handleCloseToRight = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx !== -1) {
      onRequestCloseTabs(tabs.slice(idx + 1).map((tab) => tab.id));
    }
    setContextMenu((p) => ({ ...p, visible: false }));
  };

  return (
    <div
      className="flex items-center shrink-0 select-none relative justify-between"
      style={{
        height: 34,
        background: "var(--color-surface-base)",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}
    >
      <div className="flex items-center overflow-x-auto flex-1 h-full min-w-0">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              onMouseDown={(event) => {
                if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
                draggedTabId.current = tab.id;
                lastDragTargetId.current = null;
              }}
              onMouseMove={() => {
                const sourceId = draggedTabId.current;
                if (sourceId && sourceId !== tab.id) {
                  setDragOverTabId(tab.id);
                  if (lastDragTargetId.current !== tab.id) {
                    reorderTabs(sourceId, tab.id);
                    lastDragTargetId.current = tab.id;
                  }
                }
              }}
              className={cn(
                "group flex items-center gap-1.5 px-3 h-full shrink-0 cursor-grab active:cursor-grabbing transition-colors relative max-w-[220px]",
                active
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
              )}
              style={{
                background: active ? "var(--color-surface-canvas)" : "transparent",
                borderRight: "1px solid var(--color-border-subtle)",
                borderLeft: dragOverTabId === tab.id ? "2px solid var(--color-accent-lime)" : undefined,
              }}
            >
              {/* Active top border highlight (Accent Lime) */}
              {active && (
                <span
                  className="absolute inset-x-0 top-0"
                  style={{ height: 2, background: "var(--color-accent-lime)", borderRadius: "0 0 2px 2px" }}
                />
              )}

              {/* Method / Protocol badge */}
              <span
                className={cn(
                  "font-mono shrink-0",
                  tab.protocol === "websocket"
                    ? "text-[var(--color-method-ws)]"
                    : tab.protocol === "graphql"
                    ? "text-[var(--color-method-graphql)]"
                    : tab.protocol === "sse"
                    ? "text-[var(--color-accent-lime)]"
                    : methodColor(tab.method || "GET")
                )}
                style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em" }}
              >
                {tab.protocol === "websocket"
                  ? "WS"
                  : tab.protocol === "graphql"
                  ? "GQL"
                  : tab.protocol === "sse"
                  ? "SSE"
                  : (tab.method || "GET").length > 4
                  ? (tab.method || "GET").slice(0, 3)
                  : tab.method || "GET"}
              </span>

              {/* Tab name */}
              <span
                className="truncate"
                style={{ fontSize: 12, maxWidth: 140, minWidth: 0 }}
              >
                {tab.name || "Untitled"}
              </span>

              {/* Dirty indicator */}
              {tab.isDirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--color-status-warning)" }}
                  title="Unsaved changes"
                />
              )}

              {/* Close button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRequestCloseTabs([tab.id]); }}
                className={cn(
                  "shrink-0 flex items-center justify-center rounded transition-colors ml-auto",
                  "opacity-0 group-hover:opacity-100",
                  active && "opacity-100"
                )}
                style={{ width: 16, height: 16, color: "var(--tx-3)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--tx-1)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--tx-3)"}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {/* New tab */}
        <button
          onClick={() => openTab()}
          className="flex items-center justify-center shrink-0 transition-colors"
          style={{ width: 32, height: "100%", color: "var(--tx-3)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tx-1)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tx-3)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          title="New tab (Ctrl+N)"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Right side: Environment Selector */}
      <EnvironmentSelector />

      {/* Tab Context Menu */}
      {contextMenu.visible && contextMenu.tab && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu((current) => ({ ...current, visible: false }))}
          items={[
            {
              label: "Duplicate Tab",
              icon: <Copy size={13} />,
              tone: "lime",
              onSelect: () => handleDuplicate(contextMenu.tab!),
            },
            { label: "", separator: true },
            {
              label: "Close Tab",
              icon: <X size={13} />,
              onSelect: () => onRequestCloseTabs([contextMenu.tab!.id]),
            },
            {
              label: "Close Other Tabs",
              icon: <XCircle size={13} />,
              disabled: tabs.length <= 1,
              onSelect: () => handleCloseOthers(contextMenu.tab!.id),
            },
            {
              label: "Close Tabs to Right",
              icon: <ArrowRight size={13} />,
              disabled: tabs[tabs.length - 1]?.id === contextMenu.tab.id,
              onSelect: () => handleCloseToRight(contextMenu.tab!.id),
            },
          ]}
        />
      )}
    </div>
  );
};
