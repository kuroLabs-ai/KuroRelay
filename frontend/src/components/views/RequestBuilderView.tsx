import React, { useRef } from "react";
import {
  Columns2,
  Rows2,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { TabBar } from "../layout/TabBar";
import { WorkbenchEmptyState } from "../layout/WorkbenchEmptyState";
import { URLBar } from "../request/URLBar";
import { RequestConfigTabs } from "../request/RequestConfigTabs";
import { ResponseInspector } from "../response/ResponseInspector";
import { GraphQLPanel } from "../protocols/GraphQLPanel";
import { WebSocketPanel } from "../protocols/WebSocketPanel";
import { SSEPanel } from "../protocols/SSEPanel";
import { ErrorBoundary } from "../ui/ErrorBoundary";

export const RequestBuilderView: React.FC<{
  onOpenSaveModal: () => void;
  onRequestCloseTabs: (ids: string[]) => void;
}> = ({ onOpenSaveModal, onRequestCloseTabs }) => {
  const {
    tabs,
    activeTabId,
    requestSplitPct,
    setRequestSplitPct,
    requestSplitOrientation,
    setRequestSplitOrientation,
  } = useAppStore();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const splitRef = useRef<HTMLDivElement>(null);

  const isHorizontal = requestSplitOrientation === "horizontal";

  const handleSplitDragStart = (event: React.MouseEvent) => {
    event.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const onMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      let pct: number;
      if (isHorizontal) {
        pct = Math.min(80, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      } else {
        pct = Math.min(80, Math.max(20, ((moveEvent.clientY - rect.top) / rect.height) * 100));
      }
      setRequestSplitPct(pct);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleOrientation = () => {
    setRequestSplitOrientation(isHorizontal ? "vertical" : "horizontal");
  };

  const handleResetSplit = () => {
    setRequestSplitPct(50);
  };

  const handleMaximizeResponse = () => {
    setRequestSplitPct(20);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[var(--color-surface-canvas)]">
      <TabBar onRequestCloseTabs={onRequestCloseTabs} />

      {!activeTab || tabs.length === 0 ? (
        <WorkbenchEmptyState />
      ) : (
        <>
          <div
            className="shrink-0"
            style={{ borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-surface-base)" }}
          >
            <URLBar onOpenSaveModal={onOpenSaveModal} />
          </div>

          {activeTab.protocol === "graphql" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <GraphQLPanel />
            </div>
          )}
          {activeTab.protocol === "websocket" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <WebSocketPanel />
            </div>
          )}
          {activeTab.protocol === "sse" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <SSEPanel />
            </div>
          )}
          {activeTab.protocol === "http" && (
            <div
              ref={splitRef}
              className={`flex flex-1 min-h-0 overflow-hidden ${
                isHorizontal ? "flex-row" : "flex-col"
              }`}
            >
              {/* Request Configuration Panel */}
              <div
                className="overflow-auto min-w-0 min-h-0"
                style={
                  isHorizontal
                    ? { width: `${requestSplitPct}%`, background: "var(--color-surface-canvas)" }
                    : { height: `${requestSplitPct}%`, background: "var(--color-surface-canvas)" }
                }
              >
                <ErrorBoundary fallbackTitle="Request Configuration Error">
                  <RequestConfigTabs />
                </ErrorBoundary>
              </div>

              {/* Resize Handle with Quick Split Controls */}
              <div
                className={`group relative shrink-0 flex items-center justify-center transition-colors cursor-pointer select-none ${
                  isHorizontal
                    ? "w-2 hover:w-2 hover:bg-[var(--lime)]/30 bg-[var(--color-border-subtle)]"
                    : "h-2 hover:h-2 hover:bg-[var(--lime)]/30 bg-[var(--color-border-subtle)]"
                }`}
                onMouseDown={handleSplitDragStart}
                role="separator"
                aria-label="Resize request and response panels"
                aria-orientation={isHorizontal ? "vertical" : "horizontal"}
                tabIndex={0}
              >
                {/* Visual handle indicator pill */}
                <div
                  className={`rounded-full bg-[var(--border)] group-hover:bg-[var(--lime)] transition-colors ${
                    isHorizontal ? "w-1 h-8" : "w-8 h-1"
                  }`}
                />

                {/* Floating Layout Switcher Pills */}
                <div
                  className={`absolute opacity-0 group-hover:opacity-100 transition-opacity z-30 flex items-center gap-1 p-0.5 rounded-md bg-[var(--bg-s1)] border border-[var(--border-dim)] shadow-xl ${
                    isHorizontal ? "top-2 left-3 flex-col" : "right-3 top-[-14px]"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={toggleOrientation}
                    title={isHorizontal ? "Switch to Stacked (Top/Bottom)" : "Switch to Side-by-Side (Left/Right)"}
                    className="p-1 rounded text-[var(--tx-3)] hover:text-[var(--lime)] hover:bg-[var(--bg-s2)] transition-colors"
                  >
                    {isHorizontal ? <Rows2 size={12} /> : <Columns2 size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSplit}
                    title="Reset to 50/50"
                    className="p-1 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s2)] transition-colors"
                  >
                    <RotateCcw size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={handleMaximizeResponse}
                    title="Expand Response (Maximize)"
                    className="p-1 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s2)] transition-colors"
                  >
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>

              {/* Response Inspector Panel */}
              <div
                className="overflow-auto flex-1 min-w-0 min-h-0"
                style={{ background: "var(--color-surface-canvas)" }}
              >
                <ErrorBoundary fallbackTitle="Response Inspector Error">
                  <ResponseInspector />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
