import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Layers, Check, Eye } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { QuickEnvironmentModal } from "./QuickEnvironmentModal";
import { useDropdown } from "../../lib/useDropdown";
import { useToast } from "../ui/Toast";

interface EnvironmentItem {
  id: string;
  name: string;
  is_active?: boolean;
  variables?: Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>;
}

export interface EnvironmentMood {
  id: string;
  badge: string;
  label: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export const ENVIRONMENT_MOODS: Record<string, EnvironmentMood> = {
  green: {
    id: "green",
    badge: "DEV",
    label: "Development",
    desc: "Development / Local",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.15)",
    border: "rgba(16, 185, 129, 0.4)",
    text: "#10b981",
  },
  amber: {
    id: "amber",
    badge: "STAG",
    label: "Staging",
    desc: "Staging / Pre-prod",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.15)",
    border: "rgba(245, 158, 11, 0.4)",
    text: "#f59e0b",
  },
  red: {
    id: "red",
    badge: "PROD",
    label: "Production ⚠️",
    desc: "Production (Live Database)",
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.18)",
    border: "rgba(239, 68, 68, 0.5)",
    text: "#ef4444",
  },
  blue: {
    id: "blue",
    badge: "TEST",
    label: "Testing",
    desc: "Testing / QA",
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.15)",
    border: "rgba(99, 102, 241, 0.4)",
    text: "#818cf8",
  },
  purple: {
    id: "purple",
    badge: "UAT",
    label: "Preview",
    desc: "Preview / UAT",
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.15)",
    border: "rgba(139, 92, 246, 0.4)",
    text: "#8b5cf6",
  },
  pink: {
    id: "pink",
    badge: "MOCK",
    label: "Mock",
    desc: "Mock / Sandbox",
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.15)",
    border: "rgba(236, 72, 153, 0.4)",
    text: "#ec4899",
  },
  default: {
    id: "default",
    badge: "ENV",
    label: "Default",
    desc: "Default Environment",
    color: "var(--lime)",
    bg: "rgba(163, 230, 53, 0.12)",
    border: "rgba(163, 230, 53, 0.35)",
    text: "var(--lime)",
  },
};

export const COLOR_MAP: Record<string, string> = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#6366f1",
  purple: "#8b5cf6",
  pink: "#ec4899",
  default: "var(--lime)",
};

export const EnvironmentSelector: React.FC = () => {
  const {
    activeWorkspaceId,
    activeEnvironmentId,
    setActiveEnvironment,
    setEnvironmentVariables,
    envColors,
  } = useAppStore();

  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const dropdown = useDropdown({ isOpen: open, onClose: () => setOpen(false) });
  const { toast } = useToast();
  const loadRequestRef = useRef(0);

  const loadEnvironments = useCallback(() => {
    if (!activeWorkspaceId) return;
    const workspaceId = activeWorkspaceId;
    const requestId = ++loadRequestRef.current;
    bridge
      .getEnvironments(workspaceId)
      .then((res: any) => {
        if (
          requestId !== loadRequestRef.current ||
          useAppStore.getState().activeWorkspaceId !== workspaceId
        ) return;
        if (res?.status !== "ok") {
          const error = res?.error;
          const message = typeof error === "string"
            ? error
            : error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message
              : "Could not load environments";
          throw new Error(message);
        }
        const list = res?.environments || [];
        setEnvironments(list);
        setLoadedWorkspaceId(workspaceId);
        const currentId = useAppStore.getState().activeEnvironmentId;
        const validCurrent = list.find((environment: EnvironmentItem) => environment.id === currentId);
        const defaultActive = validCurrent || list.find((environment: EnvironmentItem) => environment.is_active);
        if (defaultActive?.id !== currentId) setActiveEnvironment(defaultActive?.id || null);
        setEnvironmentVariables(defaultActive?.variables || []);
      })
      .catch((error) => {
        if (requestId === loadRequestRef.current) {
          toast(error instanceof Error ? error.message : "Could not load environments", "error");
        }
      });
  }, [activeWorkspaceId, setActiveEnvironment, setEnvironmentVariables, toast]);

  useEffect(() => {
    loadEnvironments();
  }, [loadEnvironments]);

  const visibleEnvironments = loadedWorkspaceId === activeWorkspaceId ? environments : [];
  const activeEnv = visibleEnvironments.find((e) => e.id === activeEnvironmentId);
  const activeMood = activeEnv ? (ENVIRONMENT_MOODS[envColors[activeEnv.id]] || ENVIRONMENT_MOODS.default) : null;
  const isProd = activeMood?.id === "red";

  const handleSelect = (env: EnvironmentItem | null) => {
    if (!env) {
      setActiveEnvironment(null);
      setEnvironmentVariables([]);
      setOpen(false);
      return;
    }

    setActiveEnvironment(env.id);
    setEnvironmentVariables(env.variables || []);
    bridge.updateEnvironment(env.id, { is_active: true }).catch(console.error);
    setOpen(false);
  };

  return (
    <div
      ref={dropdown.ref}
      onMouseEnter={dropdown.onMouseEnter}
      onMouseLeave={dropdown.onMouseLeave}
      className="relative shrink-0 flex items-center pr-2 gap-1"
    >
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-dim)]"
        style={
          activeMood && activeMood.id !== "default"
            ? { borderColor: activeMood.border, background: activeMood.bg }
            : undefined
        }
        title={isProd ? "⚠️ PRODUCTION ENVIRONMENT ACTIVE" : "Select Active Environment"}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: activeMood ? activeMood.color : "var(--tx-3)",
            boxShadow: activeMood ? `0 0 6px ${activeMood.color}` : undefined,
          }}
        />
        <Layers size={12} className="text-[var(--tx-3)] shrink-0" />
        <span
          className="max-w-[120px] truncate text-[11px] font-medium"
          style={{ color: activeMood && activeMood.id !== "default" ? activeMood.text : "var(--tx-2)" }}
        >
          {activeEnv ? activeEnv.name : "No Environment"}
        </span>

        {/* Mood Badge */}
        {activeMood && activeMood.id !== "default" && (
          <span
            className="text-[9px] font-bold px-1 py-0.2 rounded font-mono select-none"
            style={{
              background: activeMood.color,
              color: "#fff",
            }}
          >
            {activeMood.badge}
          </span>
        )}

        <ChevronDown size={10} className="text-[var(--tx-3)] shrink-0 ml-0.5" />
      </button>

      {/* Quick Eye Button */}
      {activeEnv && (
        <button
          onClick={() => setQuickModalOpen(true)}
          className="p-1 rounded text-[var(--tx-3)] hover:text-[var(--lime)] hover:bg-[var(--bg-hover)] transition-colors"
          title={`Quick View/Edit ${activeEnv.name} variables`}
        >
          <Eye size={12} />
        </button>
      )}

      {open && (
        <div className="absolute right-2 top-full mt-1 z-50 rounded-[var(--r-md)] py-1 shadow-2xl bg-[var(--bg-s2)] border border-[var(--border)] min-w-[185px] text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1 text-[9px] uppercase font-bold tracking-wider text-[var(--tx-3)] border-b border-[var(--border-dim)]">
            Environments
          </div>

          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-left text-[11px] text-[var(--tx-2)] hover:text-[var(--tx-1)]"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--tx-3)]" />
              <span>No Environment</span>
            </span>
            {!activeEnvironmentId && <Check size={12} className="text-[var(--lime)]" />}
          </button>

          {visibleEnvironments.map((env) => {
            const mood = ENVIRONMENT_MOODS[envColors[env.id]] || ENVIRONMENT_MOODS.default;
            return (
              <button
                key={env.id}
                onClick={() => handleSelect(env)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-left text-[11px] text-[var(--tx-2)] hover:text-[var(--tx-1)] group"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: mood.color }}
                  />
                  <span className="truncate">{env.name}</span>
                  {mood.id !== "default" && (
                    <span
                      className="text-[8px] font-bold px-1 py-0.2 rounded font-mono uppercase"
                      style={{ background: mood.bg, color: mood.text, border: `1px solid ${mood.border}` }}
                    >
                      {mood.badge}
                    </span>
                  )}
                </span>
                {env.id === activeEnvironmentId && <Check size={12} className="text-[var(--lime)]" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Quick Environment Modal */}
      {activeEnv && (
        <QuickEnvironmentModal
          isOpen={quickModalOpen}
          onClose={() => setQuickModalOpen(false)}
          environment={activeEnv}
          onRefresh={loadEnvironments}
        />
      )}
    </div>
  );
};
