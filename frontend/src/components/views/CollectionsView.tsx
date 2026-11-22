import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Key, RefreshCw, Shield, Table2, Upload, Workflow } from "lucide-react";
import { bridge } from "../../bridge/client";
import {
  getCollectionLoadVersion,
  invalidateCollectionLoads,
  loadCollectionsWithFolders,
} from "../../lib/collectionData";
import { exportCollectionJson } from "../../lib/collectionImportExport";
import { parseCollectionMetadata } from "../../lib/collectionMetadata";
import { openSavedRequestInTab } from "../../lib/openSavedRequest";
import { useAppStore, type FolderItem, type RequestItem } from "../../stores/appStore";
import { CollectionGraph } from "./CollectionGraph";
import { CollectionTableView } from "./CollectionTableView";
import { CollectionAuthModal } from "./CollectionAuthModal";
import { ImportCollectionModal } from "./ImportCollectionModal";
import { useToast } from "../ui/Toast";
import { cn } from "../../lib/cn";

interface CollectionDetails {
  collectionId: string;
  revision: number;
  folders: FolderItem[];
  requests: RequestItem[];
}

interface LoadError {
  workspaceId: string | null;
  message: string;
}

export const CollectionsView: React.FC = () => {
  const {
    activeWorkspaceId,
    collections,
    collectionsLoadedWorkspaceId,
    selectedCollectionId,
    setActiveWorkspace,
    setActiveModule,
    setCollectionsForWorkspace,
    tabs,
    openTab,
    setActiveTab,
    updateTab,
  } = useAppStore();
  const { toast } = useToast();
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [detailsError, setDetailsError] = useState<{ collectionId: string; revision: number; message: string } | null>(null);
  const [details, setDetails] = useState<CollectionDetails | null>(null);
  const [detailsRevision, setDetailsRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noWorkspace, setNoWorkspace] = useState(false);
  const [viewMode, setViewMode] = useState<"graph" | "table">("graph");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const collectionLoadId = useRef(0);

  const activeCollections =
    activeWorkspaceId && collectionsLoadedWorkspaceId === activeWorkspaceId ? collections : [];
  const selectedCollection = activeCollections.find((collection) => collection.id === selectedCollectionId) ?? null;

  const refreshCollections = useCallback(
    async (workspaceId: string, showSpinner = false): Promise<boolean> => {
      const requestId = ++collectionLoadId.current;
      const version = getCollectionLoadVersion(workspaceId);
      if (showSpinner) setRefreshing(true);
      try {
        const loadedCollections = await loadCollectionsWithFolders(workspaceId);
        if (
          requestId !== collectionLoadId.current ||
          version !== getCollectionLoadVersion(workspaceId)
        ) return false;
        setCollectionsForWorkspace(workspaceId, loadedCollections);
        setLoadError(null);
        setNoWorkspace(false);
        return true;
      } catch (error) {
        if (
          requestId !== collectionLoadId.current ||
          version !== getCollectionLoadVersion(workspaceId)
        ) return false;
        const message = error instanceof Error ? error.message : "Could not load collections";
        setLoadError({ workspaceId, message });
        toast(message, "error");
        return false;
      } finally {
        if (requestId === collectionLoadId.current && showSpinner) setRefreshing(false);
      }
    },
    [setCollectionsForWorkspace, toast],
  );

  const updateCurrentDetails = useCallback(
    (collectionId: string, update: (current: CollectionDetails) => CollectionDetails) => {
      const state = useAppStore.getState();
      const storedCollection = state.collections.find((item) => item.id === collectionId);
      const currentDetails = details?.collectionId === collectionId ? details : null;
      if (!storedCollection && !currentDetails) return;
      const next = update({
        collectionId,
        revision: currentDetails?.revision ?? detailsRevision,
        folders: storedCollection?.folders ?? currentDetails?.folders ?? [],
        requests: storedCollection?.requests ?? currentDetails?.requests ?? [],
      });
      setDetails(next);
      if (activeWorkspaceId) {
        invalidateCollectionLoads(activeWorkspaceId);
        setCollectionsForWorkspace(
          activeWorkspaceId,
          state.collections.map((item) =>
            item.id === collectionId
              ? { ...item, folders: next.folders, requests: next.requests }
              : item,
          ),
        );
      }
    },
    [activeWorkspaceId, details, detailsRevision, setCollectionsForWorkspace],
  );

  useEffect(() => {
    if (activeWorkspaceId) {
      void refreshCollections(activeWorkspaceId);
      return;
    }

    let isCurrent = true;
    bridge
      .getWorkspaces()
      .then((result) => {
        if (!isCurrent) return;
        if (result.status !== "ok") throw new Error("Could not load workspaces");
        const workspace = result.workspaces?.[0];
        if (workspace) {
          setActiveWorkspace(workspace.id);
          return;
        }
        setNoWorkspace(true);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        const message = error instanceof Error ? error.message : "Could not load workspaces";
        setLoadError({ workspaceId: null, message });
        toast(message, "error");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeWorkspaceId, refreshCollections, setActiveWorkspace, toast]);

  const selectedCollectionIdForDetails = selectedCollection?.id;
  useEffect(() => {
    if (!selectedCollectionIdForDetails) return;
    let isCurrent = true;
    const collectionId = selectedCollectionIdForDetails;
    const revision = detailsRevision;

    Promise.all([bridge.getCollectionFolders(collectionId), bridge.getCollectionRequests(collectionId)])
      .then(([folderResult, requestResult]) => {
        if (!isCurrent) return;
        if (folderResult.status !== "ok") throw new Error("Could not load collection folders");
        if (requestResult.status !== "ok") throw new Error("Could not load saved requests");
        setDetails({
          collectionId,
          revision,
          folders: folderResult.folders ?? [],
          requests: requestResult.requests ?? [],
        });
        setDetailsError(null);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        const message = error instanceof Error ? error.message : "Could not load collection data";
        setDetailsError({ collectionId, revision, message });
        toast(message, "error");
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedCollectionIdForDetails, detailsRevision, toast]);

  const selectedDetails = useMemo(
    () =>
      selectedCollection && details?.collectionId === selectedCollection.id
        ? {
            ...details,
            folders: selectedCollection.folders ?? details.folders,
            requests: selectedCollection.requests ?? details.requests,
          }
        : null,
    [details, selectedCollection],
  );
  const isLoadingCollections =
    (!activeWorkspaceId && !noWorkspace) ||
    (!!activeWorkspaceId && collectionsLoadedWorkspaceId !== activeWorkspaceId &&
      loadError?.workspaceId !== activeWorkspaceId);
  const isLoadingDetails = !!selectedCollection && !selectedDetails &&
    !(detailsError?.collectionId === selectedCollection.id && detailsError.revision === detailsRevision);

  const onCreateFolder = useCallback(
    async (parentId: string | undefined, name: string) => {
      if (!activeWorkspaceId || !selectedCollection || busy) return false;
      setBusy(true);
      try {
        const result = await bridge.createCollectionFolder({
          collection_id: selectedCollection.id,
          name,
          parent_id: parentId,
        });
        if (result.status !== "ok" || !result.folder?.id) {
          throw new Error("Could not create folder");
        }
        const folder: FolderItem = {
          id: result.folder.id,
          collection_id: selectedCollection.id,
          parent_id: parentId ?? null,
          name: result.folder.name ?? name,
        };
        updateCurrentDetails(selectedCollection.id, (current) => ({
          ...current,
          folders: [...current.folders, folder],
        }));
        void refreshCollections(activeWorkspaceId);
        toast("Folder created", "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not create folder", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails],
  );

  const onRenameFolder = useCallback(
    async (folderId: string, name: string) => {
      if (!activeWorkspaceId || busy) return false;
      setBusy(true);
      try {
        const result = await bridge.updateCollectionFolder(folderId, { name });
        if (result.status !== "ok") throw new Error("Could not rename folder");
        updateCurrentDetails(selectedCollection?.id ?? "", (current) => ({
          ...current,
          folders: current.folders.map((folder) =>
            folder.id === folderId ? { ...folder, name } : folder,
          ),
        }));
        void refreshCollections(activeWorkspaceId);
        toast("Folder renamed", "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not rename folder", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails],
  );

  const onDeleteFolder = useCallback(
    async (folder: FolderItem) => {
      if (!activeWorkspaceId || busy) return;
      if (!window.confirm(`Delete "${folder.name}" and its nested folders and saved requests?`)) return;
      setBusy(true);
      try {
        const result = await bridge.deleteCollectionFolder(folder.id);
        if (result.status !== "ok") throw new Error("Could not delete folder");
        updateCurrentDetails(selectedCollection?.id ?? "", (current) => {
          const deletedIds = getNestedFolderIds(folder.id, current.folders);
          return {
            ...current,
            folders: current.folders.filter((item) => !deletedIds.has(item.id)),
            requests: current.requests.filter(
              (request) => !deletedIds.has(request.folder_id ?? request.folderId ?? ""),
            ),
          };
        });
        void refreshCollections(activeWorkspaceId);
        toast("Folder deleted", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not delete folder", "error");
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails],
  );

  const onCreateRequest = useCallback(
    async (parentId: string | undefined, name: string) => {
      if (!activeWorkspaceId || !selectedCollection || busy) return false;
      setBusy(true);
      try {
        const result = await bridge.saveRequest({
          workspace_id: activeWorkspaceId,
          collection_id: selectedCollection.id,
          folder_id: parentId,
          name,
          method: "GET",
          url: "",
          configuration: { protocol: "http" },
        });
        if (result.status !== "ok" || !result.request?.id) {
          throw new Error("Could not create request");
        }
        updateCurrentDetails(selectedCollection.id, (current) => ({
          ...current,
          requests: [...current.requests, result.request],
        }));
        void refreshCollections(activeWorkspaceId);
        toast("Request created", "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not create request", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails],
  );

  const onRenameRequest = useCallback(
    async (requestId: string, name: string) => {
      if (!activeWorkspaceId || busy) return false;
      setBusy(true);
      try {
        const result = await bridge.updateSavedRequest(requestId, { name });
        if (result.status !== "ok") throw new Error("Could not rename request");
        useAppStore.getState().tabs
          .filter((tab) => tab.savedRequestId === requestId)
          .forEach((tab) => updateTab(tab.id, { name }));
        updateCurrentDetails(selectedCollection?.id ?? "", (current) => ({
          ...current,
          requests: current.requests.map((request) =>
            request.id === requestId ? { ...request, name } : request,
          ),
        }));
        void refreshCollections(activeWorkspaceId);
        toast("Request renamed", "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not rename request", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails, updateTab],
  );

  const onDeleteRequest = useCallback(
    async (request: RequestItem) => {
      if (!activeWorkspaceId || busy) return;
      if (!window.confirm(`Delete request "${request.name}"?`)) return;
      setBusy(true);
      try {
        const result = await bridge.deleteSavedRequest(request.id);
        if (result.status !== "ok") throw new Error("Could not delete request");
        tabs
          .filter((tab) => tab.savedRequestId === request.id)
          .forEach((tab) =>
            updateTab(tab.id, { savedRequestId: undefined, collectionId: undefined, isDirty: true }),
          );
        updateCurrentDetails(selectedCollection?.id ?? "", (current) => ({
          ...current,
          requests: current.requests.filter((item) => item.id !== request.id),
        }));
        void refreshCollections(activeWorkspaceId);
        toast("Request deleted", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not delete request", "error");
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, tabs, toast, updateCurrentDetails, updateTab],
  );

  const onDuplicateRequest = useCallback(
    async (request: RequestItem) => {
      if (!activeWorkspaceId || !selectedCollection || busy) return false;
      setBusy(true);
      try {
        const result = await bridge.saveRequest({
          workspace_id: activeWorkspaceId,
          collection_id: selectedCollection.id,
          folder_id: request.folder_id ?? request.folderId,
          name: `${request.name} (Copy)`,
          method: request.method || "GET",
          url: request.url || "",
          configuration: readRequestConfiguration(request),
        });
        if (result.status !== "ok" || !result.request?.id) {
          throw new Error("Could not duplicate request");
        }
        updateCurrentDetails(selectedCollection.id, (current) => ({
          ...current,
          requests: [...current.requests, result.request],
        }));
        void refreshCollections(activeWorkspaceId);
        toast("Request duplicated", "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not duplicate request", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails],
  );

  const onMoveRequest = useCallback(
    async (request: RequestItem, folderId?: string) => {
      if (!activeWorkspaceId || !selectedCollection || busy) return false;
      setBusy(true);
      try {
        const result = await bridge.updateSavedRequest(request.id, { folder_id: folderId ?? null });
        if (result.status !== "ok") throw new Error("Could not move request");
        updateCurrentDetails(selectedCollection.id, (current) => ({
          ...current,
          requests: current.requests.map((item) =>
            item.id === request.id
              ? { ...item, folder_id: folderId, folderId }
              : item,
          ),
        }));
        void refreshCollections(activeWorkspaceId);
        toast(folderId ? "Request moved" : "Request moved to collection root", "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not move request", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspaceId, busy, refreshCollections, selectedCollection, toast, updateCurrentDetails],
  );

  const openRequest = useCallback(
    (request: RequestItem, forceNewTab = false) => {
      openSavedRequestInTab(
        request,
        selectedCollection?.id ?? request.collectionId ?? request.collection_id ?? "",
        { tabs, openTab, setActiveTab, setActiveModule },
        (message) => toast(message, "error"),
        forceNewTab,
      );
    },
    [openTab, selectedCollection?.id, setActiveModule, setActiveTab, tabs, toast],
  );

  const exportSelectedCollection = useCallback(async () => {
    if (!selectedCollection || !selectedDetails) return;
    try {
      const exported = await exportCollectionJson({
        ...selectedCollection,
        folders: selectedDetails.folders,
        requests: selectedDetails.requests,
      });
      if (exported) toast("Collection exported", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not export collection", "error");
    }
  }, [selectedCollection, selectedDetails, toast]);

  const pageMessage = useMemo(() => {
    if (
      activeWorkspaceId &&
      collectionsLoadedWorkspaceId !== activeWorkspaceId &&
      loadError?.workspaceId === activeWorkspaceId
    ) return loadError.message;
    if (!activeWorkspaceId && loadError?.workspaceId === null) return loadError.message;
    return null;
  }, [activeWorkspaceId, collectionsLoadedWorkspaceId, loadError]);

  const collectionMeta = useMemo(
    () => parseCollectionMetadata(selectedCollection?.description),
    [selectedCollection?.description]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--color-surface-canvas)]">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[var(--color-accent-lime-dim)] text-[var(--color-accent-lime)] shrink-0">
            <Workflow size={15} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                {selectedCollection?.name ?? "Collections"}
              </h1>
              {collectionMeta.auth.type !== "none" && (
                <span
                  title={`Inherited Auth: ${collectionMeta.auth.type}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-[var(--color-accent-lime-dim)] text-[var(--color-accent-lime)] text-[9px] font-mono font-semibold"
                >
                  <Key size={9} />
                  <span>{collectionMeta.auth.type.toUpperCase()}</span>
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
              {selectedDetails
                ? `${selectedDetails.folders.length} folders · ${selectedDetails.requests.length} requests`
                : isLoadingCollections || isLoadingDetails
                  ? "Loading collection data…"
                  : "Select a collection to view its structure"}
            </p>
          </div>
        </div>

        {/* Center: Dual View Mode Switcher */}
        {selectedCollection && (
          <div className="flex items-center bg-[var(--color-surface-panel)] p-0.5 rounded-lg border border-[var(--color-border-subtle)]">
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors",
                viewMode === "graph"
                  ? "bg-[var(--color-surface-elevated)] text-[var(--color-accent-lime)] shadow-sm font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Workflow size={12} />
              <span>Graph View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors",
                viewMode === "table"
                  ? "bg-[var(--color-surface-elevated)] text-[var(--color-accent-lime)] shadow-sm font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Table2 size={12} />
              <span>Table View</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedCollection && (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-colors cursor-pointer"
              title="Configure Inherited Auth & Default Headers"
            >
              <Shield size={12} className={collectionMeta.auth.type !== "none" ? "text-[var(--color-accent-lime)]" : ""} />
              <span>Auth & Headers</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            disabled={!activeWorkspaceId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] disabled:opacity-40 transition-colors cursor-pointer"
            title="Import collection (Postman, OpenAPI, KuroRelay)"
          >
            <Upload size={12} />
            <span>Import</span>
          </button>

          <button
            type="button"
            onClick={() => void exportSelectedCollection()}
            disabled={!selectedDetails}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] disabled:opacity-40 transition-colors cursor-pointer"
            title="Export selected collection to JSON"
          >
            <Download size={12} />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule("request")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-colors cursor-pointer"
            title="Go to Request Builder tabs"
          >
            <FileText size={12} />
            <span>Request Tabs</span>
          </button>

          <button
            type="button"
            onClick={() => activeWorkspaceId && void refreshCollections(activeWorkspaceId, true)}
            disabled={!activeWorkspaceId || refreshing}
            className="p-1.5 rounded-[var(--r-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-40 transition-colors cursor-pointer"
            title="Refresh collection data"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {pageMessage ? (
        <LoadErrorPanel message={pageMessage} onRetry={() => {
          if (activeWorkspaceId) void refreshCollections(activeWorkspaceId, true);
        }} />
      ) : isLoadingCollections ? (
        <CollectionGraphSkeleton />
      ) : noWorkspace ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-[var(--color-text-muted)]">
          No workspace is available. Create one from the workspace menu to get started.
        </div>
      ) : !activeCollections.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Workflow size={32} className="text-[var(--color-text-muted)]" />
          <div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">No collections yet</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Create a collection or import an existing Postman or OpenAPI file.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent-lime)] text-black font-semibold text-xs hover:bg-[var(--color-accent-lime-hover)] transition-colors cursor-pointer mt-1"
          >
            <Upload size={13} />
            <span>Import Collection</span>
          </button>
        </div>
      ) : !selectedCollection ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
          Choose a collection from the sidebar to inspect its endpoints.
        </div>
      ) : selectedDetails ? (
        viewMode === "table" ? (
          <CollectionTableView
            key={selectedCollection.id}
            collectionName={selectedCollection.name}
            folders={selectedDetails.folders}
            requests={selectedDetails.requests}
            busy={busy}
            onOpenRequest={openRequest}
            onRenameRequest={onRenameRequest}
            onDeleteRequest={onDeleteRequest}
            onStartCreateRequest={(folderId) => onCreateRequest(folderId, "New Request")}
          />
        ) : (
          <CollectionGraph
            key={selectedCollection.id}
            collection={selectedCollection}
            folders={selectedDetails.folders}
            requests={selectedDetails.requests}
            busy={busy}
            onCreateFolder={onCreateFolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            onCreateRequest={onCreateRequest}
            onRenameRequest={onRenameRequest}
            onDeleteRequest={onDeleteRequest}
            onOpenRequest={openRequest}
            onDuplicateRequest={onDuplicateRequest}
            onMoveRequest={onMoveRequest}
            onExportCollection={exportSelectedCollection}
          />
        )
      ) : detailsError?.collectionId === selectedCollection.id &&
        detailsError.revision === detailsRevision ? (
        <LoadErrorPanel
          message={detailsError.message}
          onRetry={() => setDetailsRevision((revision) => revision + 1)}
        />
      ) : isLoadingDetails ? (
        <CollectionGraphSkeleton />
      ) : null}

      {/* Collection-Level Auth & Headers Modal */}
      {selectedCollection && (
        <CollectionAuthModal
          collection={selectedCollection}
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSaved={(newDesc) => {
            if (activeWorkspaceId) {
              setCollectionsForWorkspace(
                activeWorkspaceId,
                collections.map((c) =>
                  c.id === selectedCollection.id ? { ...c, description: newDesc } : c
                )
              );
            }
          }}
        />
      )}

      {/* Fast Import Modal (Postman / OpenAPI / KuroRelay) */}
      {activeWorkspaceId && (
        <ImportCollectionModal
          workspaceId={activeWorkspaceId}
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImportSuccess={() => {
            void refreshCollections(activeWorkspaceId, true);
          }}
        />
      )}
    </div>
  );
};

function getNestedFolderIds(folderId: string, folders: FolderItem[]): Set<string> {
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      const parentId = folder.parent_id ?? folder.parent_folder_id;
      if (parentId && ids.has(parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function readRequestConfiguration(request: RequestItem): object {
  let configuration = request.configuration ?? {};
  if (typeof configuration === "string") {
    try {
      configuration = JSON.parse(configuration);
    } catch {
      throw new Error(`Could not duplicate "${request.name}": saved request configuration is invalid`);
    }
  }
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new Error(`Could not duplicate "${request.name}": saved request configuration is invalid`);
  }
  return configuration;
}

function CollectionGraphSkeleton() {
  return (
    <div role="status" aria-label="Loading collection graph" className="flex-1 min-h-0 overflow-hidden p-8">
      <div className="flex items-center gap-10 h-full min-w-max">
        {[0, 1, 2].map((column) => (
          <div key={column} className="flex flex-col gap-6">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="w-60 h-24 rounded-[var(--r-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-3 animate-pulse"
              >
                <div className="w-20 h-2 rounded bg-[var(--color-surface-elevated)]" />
                <div className="mt-4 w-36 h-2.5 rounded bg-[var(--color-surface-elevated)]" />
                <div className="mt-2 w-24 h-2 rounded bg-[var(--color-surface-elevated)]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs text-[var(--color-status-error)]">{message}</p>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        Retry
      </button>
    </div>
  );
}
