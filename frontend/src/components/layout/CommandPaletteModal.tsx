import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Search,
  FolderKanban,
  Clock,
  Layers,
  GitBranch,
  Settings,
  Server,
  FileCode,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useAppStore, type Module } from "../../stores/appStore";
import { cn, methodColor } from "../../lib/cn";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navigation" | "Requests" | "History" | "Workflows";
  icon: React.ElementType;
  iconColor?: string;
  badge?: string;
  onSelect: () => void;
}

export const CommandPaletteModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    setActiveModule,
    collections,
    history,
    workflows,
    openTab,
    tabs,
    setActiveTab,
    setSelectedWorkflowId,
  } = useAppStore();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build items list
  const allItems = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];

    // 1. Navigation Actions
    const navs: Array<{ label: string; module: Module; icon: React.ElementType }> = [
      { label: "Go to Collections", module: "collections", icon: FolderKanban },
      { label: "Go to History", module: "history", icon: Clock },
      { label: "Go to Environments", module: "environments", icon: Layers },
      { label: "Go to Workflow Studio", module: "workflows", icon: GitBranch },
      { label: "Go to Mock Server", module: "mock", icon: Server },
      { label: "Go to Settings", module: "settings", icon: Settings },
    ];

    navs.forEach((n) => {
      list.push({
        id: `nav-${n.module}`,
        title: n.label,
        category: "Navigation",
        icon: n.icon,
        iconColor: "text-[var(--color-accent-lime)]",
        onSelect: () => {
          setActiveModule(n.module);
          onClose();
        },
      });
    });

    // 2. Collection Requests
    collections.forEach((col) => {
      const colRequests = col.requests || [];
      colRequests.forEach((req) => {
        list.push({
          id: `req-${req.id}`,
          title: req.name || "Untitled Request",
          subtitle: `${col.name} • ${req.url || ""}`,
          category: "Requests",
          icon: FileCode,
          badge: req.method || "GET",
          onSelect: () => {
            const existing = tabs.find((t) => t.savedRequestId === req.id);
            if (existing) {
              setActiveTab(existing.id);
            } else {
              openTab({
                name: req.name,
                method: req.method || "GET",
                url: req.url || "",
                savedRequestId: req.id,
                collectionId: col.id,
              });
            }
            onClose();
          },
        });
      });

      // Folders
      (col.folders || []).forEach((f) => {
        (f.requests || []).forEach((req) => {
          list.push({
            id: `req-${req.id}`,
            title: req.name || "Untitled Request",
            subtitle: `${col.name} / ${f.name} • ${req.url || ""}`,
            category: "Requests",
            icon: FileCode,
            badge: req.method || "GET",
            onSelect: () => {
              const existing = tabs.find((t) => t.savedRequestId === req.id);
              if (existing) {
                setActiveTab(existing.id);
              } else {
                openTab({
                  name: req.name,
                  method: req.method || "GET",
                  url: req.url || "",
                  savedRequestId: req.id,
                  collectionId: col.id,
                });
              }
              onClose();
            },
          });
        });
      });
    });

    // 3. Workflows
    (workflows || []).forEach((wf: any) => {
      list.push({
        id: `wf-${wf.id}`,
        title: wf.name || "Untitled Workflow",
        subtitle: `${wf.step_count || 0} steps`,
        category: "Workflows",
        icon: GitBranch,
        iconColor: "text-[var(--color-accent-lime)]",
        onSelect: () => {
          setSelectedWorkflowId(wf.id);
          setActiveModule("workflows");
          onClose();
        },
      });
    });

    // 4. Recent History
    (history || []).slice(0, 10).forEach((h) => {
      list.push({
        id: `hist-${h.id}`,
        title: h.url || "Request",
        subtitle: `Status: ${h.statusCode ?? "—"} • ${h.durationMs ?? 0}ms`,
        category: "History",
        icon: Clock,
        badge: h.method || "GET",
        onSelect: () => {
          openTab({
            name: `${h.method} ${h.url.slice(0, 30)}`,
            method: h.method,
            url: h.url,
          });
          onClose();
        },
      });
    });

    return list;
  }, [collections, history, workflows, tabs, setActiveModule, openTab, setActiveTab, setSelectedWorkflowId, onClose]);

  // Filtered by search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 25);
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q) ||
          (item.badge && item.badge.toLowerCase().includes(q))
      )
      .slice(0, 25);
  }, [allItems, query]);

  // Reset index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].onSelect();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/65 backdrop-blur-[2px] animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-[var(--r-md)] bg-[var(--color-surface-modal)] border border-[var(--color-border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[460px] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] shrink-0">
          <Search size={15} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, requests, workflows, history..."
            className="flex-1 bg-transparent text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] font-mono"
          />
          <kbd className="font-mono text-[10px] bg-[var(--color-surface-elevated)] px-1.5 py-0.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              No matching results for "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-[var(--r-sm)] cursor-pointer text-xs transition-colors",
                    active
                      ? "bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] border border-[var(--color-accent-lime)]/40"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={14} className={item.iconColor || "text-[var(--color-text-muted)]"} />
                    {item.badge && (
                      <span
                        className={cn("font-mono text-[10px] font-bold shrink-0", methodColor(item.badge))}
                      >
                        {item.badge}
                      </span>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate text-[var(--color-text-primary)]">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="text-[10px] text-[var(--color-text-muted)] truncate font-mono">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[9.5px] uppercase tracking-wider font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-panel)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]">
                      {item.category}
                    </span>
                    {active && <ArrowRight size={12} className="text-[var(--color-accent-lime)]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] text-[10.5px] text-[var(--color-text-muted)] font-mono shrink-0">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div className="flex items-center gap-1 text-[var(--color-accent-lime)]">
            <Zap size={10} />
            <span>KuroRelay Instant Index</span>
          </div>
        </div>
      </div>
    </div>
  );
};
