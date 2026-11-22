import React, { useCallback, useEffect, useRef, useState } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { StatusBar } from "./components/layout/StatusBar";
import { ActivityBar } from "./components/layout/ActivityBar";
import { Sidebar } from "./components/layout/Sidebar";
import { useAppStore, type Module, type Tab } from "./stores/appStore";
import { bridge } from "./bridge/client";

// View panels
import { CollectionsView } from "./components/views/CollectionsView";
import { RequestBuilderView } from "./components/views/RequestBuilderView";
import { EnvironmentsView } from "./components/views/EnvironmentsView";
import { HistoryView } from "./components/views/HistoryView";
import { WorkflowStudioView } from "./components/views/WorkflowStudioView";
import { MockServerView } from "./components/views/MockServerView";
import { SettingsView } from "./components/views/SettingsView";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { SaveRequestModal } from "./components/request/SaveRequestModal";
import { useToast } from "./components/ui/Toast";
import { KuroCopilotDrawer } from "./components/kuro/KuroCopilotDrawer";
import { hydrateKuroStoreFromSqlite } from "./stores/kuroStore";
import {
  invalidateCollectionLoads,
  loadCollectionsWithFolders,
} from "./lib/collectionData";

const MIN_SIDEBAR = 180;
const COLLAPSE_AT = 100;

export function App() {
  const {
    sidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    setSidebarOpen,
    toggleSidebar,
    activeModule,
    setActiveModule,
    tabs,
    activeTabId,
    activeWorkspaceId,
    setActiveWorkspace,
    openTab,
    closeTab,
    setActiveTab,
    updateTab,
    setCollectionsForWorkspace,
  } = useAppStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const sidebarHiddenForModule =
    activeModule === "history" ||
    activeModule === "mock";
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [closeQueue, setCloseQueue] = useState<string[]>([]);
  const [savingCloseTabId, setSavingCloseTabId] = useState<string | null>(null);
  const { toast } = useToast();
  const closingTab = tabs.find((tab) => tab.id === closeQueue[0]);

  const processCloseQueue = useCallback((requestedIds: string[]) => {
    const remaining = [...new Set(requestedIds)];
    while (remaining.length > 0) {
      const tabId = remaining[0];
      const tab = useAppStore.getState().tabs.find((item) => item.id === tabId);
      if (!tab) {
        remaining.shift();
        continue;
      }
      if (tab.isDirty) {
        setCloseQueue(remaining);
        return;
      }
      closeTab(tabId);
      remaining.shift();
    }
    setCloseQueue([]);
  }, [closeTab, setCloseQueue]);

  const requestCloseTabs = useCallback((ids: string[]) => {
    processCloseQueue(ids);
  }, [processCloseQueue]);

  const finishCurrentClose = useCallback((shouldClose: boolean) => {
    const [currentId, ...remaining] = closeQueue;
    if (shouldClose && currentId) closeTab(currentId);
    processCloseQueue(remaining);
  }, [closeQueue, closeTab, processCloseQueue]);

  const saveExistingTab = useCallback(async (tab: Tab): Promise<boolean> => {
    if (!tab.savedRequestId) return false;
    try {
      const config = {
        protocol: tab.protocol,
        params: tab.params,
        headers: tab.headers,
        body: tab.body,
        auth: tab.auth,
        options: tab.options,
      };
      const result = await bridge.updateSavedRequest(tab.savedRequestId, {
        name: tab.name,
        method: tab.method,
        url: tab.url,
        configuration: config,
      });
      if (result.status !== "ok") throw new Error("Could not save request");
      updateTab(tab.id, { isDirty: false });
      if (activeWorkspaceId) {
        invalidateCollectionLoads(activeWorkspaceId);
        void loadCollectionsWithFolders(activeWorkspaceId)
          .then((loadedCollections) => setCollectionsForWorkspace(activeWorkspaceId, loadedCollections))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Could not refresh the collection";
            toast(`Request saved, but ${message.toLowerCase()}`, "warning");
          });
      }
      toast(`Saved "${tab.name}"`, "success");
      return true;
    } catch (error) {
      console.error("Save error", error);
      toast(error instanceof Error ? error.message : "Failed to save request", "error");
      return false;
    }
  }, [activeWorkspaceId, setCollectionsForWorkspace, toast, updateTab]);

  // ── Global Save Logic (Ctrl+S or Save Button) ─────────────────────
  const handleGlobalSave = useCallback(async () => {
    if (activeModule === "mock") {
      window.dispatchEvent(new Event("kurorelay:save-mock-routes"));
      return;
    }
    if (!activeTab) return;
    if (activeTab.savedRequestId) {
      await saveExistingTab(activeTab);
    } else {
      setSaveModalOpen(true);
    }
  }, [activeModule, activeTab, saveExistingTab, setSaveModalOpen]);

  const handleSaveBeforeClose = useCallback(async () => {
    const tabId = closeQueue[0];
    if (!tabId) return;
    const tab = useAppStore.getState().tabs.find((item) => item.id === tabId);
    if (!tab) {
      finishCurrentClose(false);
      return;
    }
    if (tab.savedRequestId) {
      setSavingCloseTabId(tab.id);
      const saved = await saveExistingTab(tab);
      setSavingCloseTabId(null);
      if (saved) finishCurrentClose(true);
      return;
    }
    setActiveTab(tab.id);
    setSaveModalOpen(true);
  }, [closeQueue, finishCurrentClose, saveExistingTab, setActiveTab, setSaveModalOpen]);

  // \u2500\u2500 Global Keyboard Shortcuts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    // Ordered list of modules for Ctrl+Alt+Arrow cycling
    const MODULE_ORDER: Module[] = [
      "request",
      "collections",
      "environments",
      "history",
      "workflows",
      "mock",
      "settings",
    ];

    // Ctrl+Alt+<digit> -> jump straight to a module
    const MODULE_HOTKEYS: Record<string, Module> = {
      "1": "request",
      "2": "collections",
      "3": "environments",
      "4": "history",
      "5": "workflows",
      "6": "mock",
      "7": "settings",
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (saveModalOpen) return;

      if (closeQueue.length > 0) {
        if (e.key === "Escape" && !savingCloseTabId) setCloseQueue([]);
        return;
      }

      // Don't intercept if inside input/textarea unless it's Ctrl+S or Ctrl+Enter
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // \u2500\u2500 Ctrl + Enter: Send the active HTTP request \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (
          !saveModalOpen &&
          (activeModule === "collections" || activeModule === "request") &&
          activeTab?.protocol === "http"
        ) {
          e.preventDefault();
          window.dispatchEvent(new Event("kurorelay:send-request"));
        }
        return;
      }

      // \u2500\u2500 Ctrl + S: Save \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleGlobalSave();
        return;
      }

      // \u2500\u2500 Ctrl + N: New Tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !isInput) {
        e.preventDefault();
        openTab();
        return;
      }

      // \u2500\u2500 Ctrl + W: Close Active Tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w" && !e.shiftKey) {
        if (activeTabId && !saveModalOpen) {
          e.preventDefault();
          requestCloseTabs([activeTabId]);
        }
        return;
      }

      // \u2500\u2500 Ctrl + \: Toggle Sidebar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        if (!sidebarHiddenForModule) {
          e.preventDefault();
          toggleSidebar();
        }
        return;
      }

      // \u2500\u2500 Ctrl + D: Duplicate active tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && !isInput) {
        if (activeTab) {
          e.preventDefault();
          openTab({
            name: activeTab.name + " (copy)",
            method: activeTab.method,
            url: activeTab.url,
            protocol: activeTab.protocol,
            params: [...activeTab.params],
            headers: [...activeTab.headers],
            body: { ...activeTab.body },
            auth: { ...activeTab.auth },
            options: { ...activeTab.options },
          });
          setActiveModule("request");
        }
        return;
      }

      // \u2500\u2500 Ctrl + L: Focus URL bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l" && !isInput) {
        e.preventDefault();
        if (activeModule !== "request") setActiveModule("request");
        setTimeout(() => {
          const urlInput = document.querySelector<HTMLInputElement>(
            "input[data-url-bar], input[placeholder*='http'], input[placeholder*='URL']"
          );
          if (urlInput) {
            urlInput.focus();
            urlInput.select();
          }
        }, 50);
        return;
      }

      // \u2500\u2500 Ctrl + Tab / Ctrl + Shift + Tab: Cycle through tabs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length > 1) {
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
          const nextIndex = e.shiftKey
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : (currentIndex + 1) % tabs.length;
          setActiveTab(tabs[nextIndex].id);
          if (activeModule !== "request") setActiveModule("request");
        }
        return;
      }

      // \u2500\u2500 Ctrl + Alt + Arrow: Cycle through modules \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        const currentIdx = MODULE_ORDER.indexOf(activeModule);
        const nextIdx =
          e.key === "ArrowRight"
            ? (currentIdx + 1) % MODULE_ORDER.length
            : (currentIdx - 1 + MODULE_ORDER.length) % MODULE_ORDER.length;
        setActiveModule(MODULE_ORDER[nextIdx]);
        return;
      }

      // \u2500\u2500 Ctrl + Alt + <1-7>: Jump directly to a module \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && e.altKey && !isInput) {
        const mod = MODULE_HOTKEYS[e.key];
        if (mod) {
          e.preventDefault();
          setActiveModule(mod);
          return;
        }
      }

      // \u2500\u2500 Ctrl + <1-9>: Jump to tab by number \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !isInput) {
        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= 9 && tabs.length > 0) {
          const targetTab = tabs[digit - 1];
          if (targetTab) {
            e.preventDefault();
            setActiveTab(targetTab.id);
            setActiveModule("request");
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleGlobalSave,
    activeTabId,
    activeTab,
    activeModule,
    setActiveModule,
    sidebarHiddenForModule,
    saveModalOpen,
    closeQueue.length,
    savingCloseTabId,
    requestCloseTabs,
    openTab,
    toggleSidebar,
    tabs,
    setActiveTab,
  ]);

  // ── Bootstrap Workspace on mount ──────────────────────────────────
  useEffect(() => {
    // Restore Kuro Copilot credentials and models from SQLite
    hydrateKuroStoreFromSqlite();

    // Restore persisted layout / sidebar width from AppData
    bridge.getWindowState().then((res) => {
      if (res?.status === "ok" && res.state) {
        if (typeof res.state.sidebar_width === "number" && res.state.sidebar_width >= MIN_SIDEBAR) {
          setSidebarWidth(res.state.sidebar_width);
        }
      }
    }).catch(() => {});

    if (activeWorkspaceId) return;
    let isCurrent = true;
    bridge.getWorkspaces().then((res: any) => {
      const list = res?.workspaces || [];
      if (isCurrent && list.length > 0 && !activeWorkspaceId) {
        setActiveWorkspace(list[0].id);
      }
    }).catch(console.error);
    return () => {
      isCurrent = false;
    };
  }, [activeWorkspaceId, setActiveWorkspace, setSidebarWidth]);

  // Persist layout metrics on window unload
  useEffect(() => {
    const handleUnload = () => {
      bridge.saveWindowState({
        sidebar_width: sidebarWidth,
        layout: { active_module: activeModule },
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [sidebarWidth, activeModule]);

  // ── Horizontal sidebar drag ───────────────────────────────────────
  const dragRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  const handleSidebarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = sidebarOpen ? sidebarWidth : 0;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - startXRef.current;
      const rawW = startWRef.current + delta;
      if (rawW < COLLAPSE_AT) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
        setSidebarWidth(Math.max(MIN_SIDEBAR, Math.min(500, rawW)));
      }
    };
    const onUp = () => { dragRef.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarOpen, sidebarWidth, setSidebarOpen, setSidebarWidth]);

  // Which view fills the full workbench area
  const isFullscreenModule = [
    "collections",
    "environments",
    "history",
    "workflows",
    "mock",
    "settings",
  ].includes(activeModule);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: "var(--color-surface-canvas)" }}>
      {/* 1. Windows Title Bar (36px) */}
      <TitleBar />

      {/* 2. Middle Body: Activity Bar + Sidebar + Main Workbench */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity Bar (48px) */}
        <ActivityBar sidebarToggleHidden={sidebarHiddenForModule} />

        {/* Sidebar */}
        {!sidebarHiddenForModule && sidebarOpen && (
          <div
            className="flex flex-col shrink-0 overflow-hidden"
            style={{ width: sidebarWidth, borderRight: "1px solid var(--color-border-subtle)", background: "var(--color-surface-sidebar)" }}
          >
            <Sidebar />
          </div>
        )}

        {/* Sidebar resize handle */}
        {!sidebarHiddenForModule && (
          <div
            className="resize-handle resize-handle-h"
            onMouseDown={handleSidebarDragStart}
            style={{ width: 4, cursor: "col-resize" }}
          />
        )}

        {/* Main Workbench */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <ErrorBoundary fallbackTitle="Workbench Error">
            {/* Full-screen module views */}
            {activeModule === "collections" && <CollectionsView />}
            {activeModule === "environments" && <EnvironmentsView />}
            {activeModule === "history" && <HistoryView />}
            {activeModule === "workflows" && <WorkflowStudioView />}
            {activeModule === "mock" && <MockServerView />}
            {activeModule === "settings" && <SettingsView />}

            {/* Request Builder workbench */}
            {!isFullscreenModule && (
              <RequestBuilderView
                onOpenSaveModal={() => setSaveModalOpen(true)}
                onRequestCloseTabs={requestCloseTabs}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>

      {/* 3. Bottom Status Dock (24px) */}
      <StatusBar />

      {/* Kuro AI Copilot Drawer (global overlay) */}
      <ErrorBoundary fallbackTitle="Kuro Copilot Error">
        <KuroCopilotDrawer />
      </ErrorBoundary>

      {/* Save Request Modal */}
      <SaveRequestModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSaved={(savedTabId) => {
          if (closeQueue[0] === savedTabId) finishCurrentClose(true);
        }}
        tab={activeTab}
      />

      {closingTab && !saveModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 select-none"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingCloseTabId) setCloseQueue([]);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !savingCloseTabId) setCloseQueue([]);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-dirty-tab-title"
            className="w-full max-w-sm rounded-[var(--r-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-modal)] p-4 shadow-2xl"
          >
            <h2 id="close-dirty-tab-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              Save changes to “{closingTab.name}”?
            </h2>
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              This request has unsaved changes.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCloseQueue([])}
                disabled={!!savingCloseTabId}
                className="rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={() => finishCurrentClose(true)}
                disabled={!!savingCloseTabId}
                className="rounded-[var(--r-sm)] px-3 py-1.5 text-xs text-[var(--color-status-error)] hover:bg-[var(--color-status-error-dim)]"
              >
                Discard
              </button>
              <button
                onClick={() => void handleSaveBeforeClose()}
                disabled={!!savingCloseTabId}
                className="rounded-[var(--r-sm)] bg-[var(--color-accent-lime)] px-3 py-1.5 text-xs font-semibold text-[var(--color-surface-canvas)] hover:opacity-90"
              >
                {savingCloseTabId ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
