import React, { useEffect, useState } from "react";
import { ChevronDown, Check, FolderKanban } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge, type Workspace } from "../../bridge/client";
import { EnvironmentsView } from "../views/EnvironmentsView";
import { WorkflowStudioView } from "../views/WorkflowStudioView";
import { RequestSidebar } from "./RequestSidebar";
import { CollectionsSidebar } from "./CollectionsSidebar";
import { SettingsSidebar } from "./SettingsSidebar";
import { useDropdown } from "../../lib/useDropdown";

export const Sidebar: React.FC = () => {
  const {
    activeModule,
    activeWorkspaceId,
    setActiveWorkspace,
    setActiveModule,
    collections,
    collectionsLoadedWorkspaceId,
    selectedCollectionId,
    setSelectedCollectionId,
  } = useAppStore();
  const [, setWorkspaces] = useState<Workspace[]>([]);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const workspaceDropdown = useDropdown({
    isOpen: wsDropdownOpen,
    onClose: () => {
      setWsDropdownOpen(false);
    },
  });

  const loadWorkspaces = () => {
    bridge.getWorkspaces().then((res: any) => {
      const list: Workspace[] = res?.workspaces ?? [];
      setWorkspaces(list);
      if (list.length > 0 && !activeWorkspaceId) {
        setActiveWorkspace(list[0].id);
      }
    }).catch(console.error);
  };

  useEffect(() => {
    loadWorkspaces();
  }, []); // eslint-disable-line

  const collectionsReady = !!activeWorkspaceId && collectionsLoadedWorkspaceId === activeWorkspaceId;
  const currentCollections = collectionsReady ? collections : [];
  const currentCollection = currentCollections.find((collection) => collection.id === selectedCollectionId) ?? currentCollections[0];

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Collection Selector across pages (except settings) */}
      {activeModule !== "settings" && (
        <div
          ref={workspaceDropdown.ref}
          onMouseEnter={workspaceDropdown.onMouseEnter}
          onMouseLeave={workspaceDropdown.onMouseLeave}
          className="relative px-2 py-1.5 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0"
        >
          <button
            onClick={() => setWsDropdownOpen((v) => !v)}
            className="flex items-center justify-between w-full px-2 py-1 rounded hover:bg-[var(--bg-s3)] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderKanban size={13} className="text-[var(--lime)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--tx-1)] truncate">
                {!activeWorkspaceId
                  ? "Select workspace"
                  : !collectionsReady
                    ? "Loading collections..."
                    : currentCollection?.name ?? "Select collection"}
              </span>
            </div>
            <ChevronDown size={11} className="text-[var(--tx-3)] shrink-0 ml-1" />
          </button>

          {wsDropdownOpen && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 rounded py-1 shadow-2xl bg-[var(--bg-s4)] border border-[var(--border)]">
              <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-[var(--tx-3)] font-semibold">
                Collections
              </div>
              {!activeWorkspaceId ? (
                <div className="px-2.5 py-2 text-xs text-[var(--tx-3)]">Select a workspace to view collections</div>
              ) : !collectionsReady ? (
                <div className="px-2.5 py-2 text-xs text-[var(--tx-3)]">Loading collections...</div>
              ) : currentCollections.length > 0 ? (
                currentCollections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setWsDropdownOpen(false);
                    }}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left cursor-pointer"
                  >
                    <span className="truncate">{collection.name}</span>
                    {collection.id === currentCollection?.id && (
                      <Check size={12} className="text-[var(--lime)] shrink-0" />
                    )}
                  </button>
                ))
              ) : (
                <>
                  <div className="px-2.5 py-2 text-xs text-[var(--tx-3)]">No collections in this workspace</div>
                  <button
                    onClick={() => {
                      setActiveModule("collections");
                      setWsDropdownOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 text-left text-xs text-[var(--lime)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    Open Collections
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Module Content */}
      <div className="flex-1 overflow-hidden">
        {activeModule === "collections" && <CollectionsSidebar />}
        {activeModule === "request" && <RequestSidebar />}
        {activeModule === "environments" && <EnvironmentsView sidebar />}
        {activeModule === "workflows" && <WorkflowStudioView sidebar />}
        {activeModule === "settings" && <SettingsSidebar />}
        {!["collections", "request", "environments", "workflows", "settings"].includes(activeModule) && (
          <div className="flex flex-col h-full items-center justify-center gap-2 text-[var(--tx-3)] p-4 text-center">
            <span style={{ fontSize: 11 }}>
              {activeModule === "mock" ? "Mock routes are managed in the Mock Server page" : "No sidebar panel for this module"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
