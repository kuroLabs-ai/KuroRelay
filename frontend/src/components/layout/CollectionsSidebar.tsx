import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  FolderInput,
  Pencil,
  Plus,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { bridge } from "../../bridge/client";
import {
  getCollectionLoadVersion,
  invalidateCollectionLoads,
  loadCollectionsWithFolders,
} from "../../lib/collectionData";
import { exportCollectionJson } from "../../lib/collectionImportExport";
import { buildFolderTree, type FolderNode } from "../../lib/collectionTree";
import { openSavedRequestInTab } from "../../lib/openSavedRequest";
import { cn, methodColor } from "../../lib/cn";
import { useAppStore, type CollectionItem, type FolderItem, type RequestItem } from "../../stores/appStore";
import { useToast } from "../ui/Toast";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";

type EditingName = { id: string; value: string } | null;
type FolderTarget = { collectionId: string; parentId?: string } | null;
type RequestTarget = { collectionId: string; folderId?: string } | null;
type ContextTarget = (
  | { x: number; y: number; kind: "empty" }
  | {
      x: number;
      y: number;
      collectionId: string;
      kind: "collection" | "folder" | "request";
      itemId?: string;
    }
) | null;
type ContextTargetInput = ContextTarget extends infer Target
  ? Target extends null
    ? never
    : Omit<Target, "x" | "y">
  : never;

export const CollectionsSidebar: React.FC<{
  selectedOnly?: boolean;
  openCreatedRequests?: boolean;
}> = ({ selectedOnly = false, openCreatedRequests = false }) => {
  const {
    activeWorkspaceId,
    collections,
    collectionsLoadedWorkspaceId,
    selectedCollectionId,
    activeTabId,
    tabs,
    setCollectionsForWorkspace,
    setSelectedCollectionId,
    openTab,
    setActiveTab,
    setActiveModule,
    updateTab,
  } = useAppStore();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState<FolderTarget>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingRequest, setCreatingRequest] = useState<RequestTarget>(null);
  const [newRequestName, setNewRequestName] = useState("");
  const [editingCollection, setEditingCollection] = useState<EditingName>(null);
  const [editingFolder, setEditingFolder] = useState<EditingName>(null);
  const [editingRequest, setEditingRequest] = useState<EditingName>(null);
  const [busy, setBusy] = useState(false);
  const [contextTarget, setContextTarget] = useState<ContextTarget>(null);
  const isLoading = !activeWorkspaceId || collectionsLoadedWorkspaceId !== activeWorkspaceId;

  const refreshCollections = async (workspaceId: string) => {
    const version = getCollectionLoadVersion(workspaceId);
    const updatedCollections = await loadCollectionsWithFolders(workspaceId);
    if (version !== getCollectionLoadVersion(workspaceId)) return;
    setCollectionsForWorkspace(workspaceId, updatedCollections);
  };

  const refreshSelectedCollection = async () => {
    if (!activeWorkspaceId || refreshing) return;
    setRefreshing(true);
    try {
      await refreshCollections(activeWorkspaceId);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not refresh collection", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const updateCollection = (collectionId: string, update: (collection: CollectionItem) => CollectionItem) => {
    if (!activeWorkspaceId) return;
    invalidateCollectionLoads(activeWorkspaceId);
    const currentCollections = useAppStore.getState().collections;
    setCollectionsForWorkspace(
      activeWorkspaceId,
      currentCollections.map((collection) =>
        collection.id === collectionId ? update(collection) : collection,
      ),
    );
  };

  const showContextMenu = (event: React.MouseEvent, target: ContextTargetInput) => {
    event.preventDefault();
    event.stopPropagation();
    setContextTarget({
      ...target,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const toggle = (id: string) => {
    setExpanded((current) => ({ ...current, [id]: !(current[id] ?? true) }));
  };

  const startCreateCollection = () => {
    setCreatingCollection(true);
    setNewCollectionName("");
  };

  const createCollection = async () => {
    if (!activeWorkspaceId || !newCollectionName.trim() || busy) return;
    setBusy(true);
    try {
      const result = await bridge.createCollection({
        workspace_id: activeWorkspaceId,
        name: newCollectionName.trim(),
      });
      if (result.status !== "ok" || !result.collection?.id) {
        throw new Error("Could not create collection");
      }
      setCreatingCollection(false);
      setNewCollectionName("");
      setSelectedCollectionId(result.collection.id);
      setExpanded((current) => ({ ...current, [result.collection.id]: true }));
      invalidateCollectionLoads(activeWorkspaceId);
      setCollectionsForWorkspace(activeWorkspaceId, [
        ...useAppStore.getState().collections,
        { ...result.collection, id: result.collection.id, name: result.collection.name ?? newCollectionName.trim() },
      ]);
      await refreshCollections(activeWorkspaceId);
      toast("Collection created", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create collection", "error");
    } finally {
      setBusy(false);
    }
  };

  const renameCollection = async () => {
    if (!activeWorkspaceId || !editingCollection?.value.trim() || busy) return;
    setBusy(true);
    try {
      const result = await bridge.updateCollection(editingCollection.id, {
        name: editingCollection.value.trim(),
      });
      if (result.status !== "ok") throw new Error("Could not rename collection");
      setEditingCollection(null);
      updateCollection(editingCollection.id, (collection) => ({
        ...collection,
        name: editingCollection.value.trim(),
      }));
      await refreshCollections(activeWorkspaceId);
      toast("Collection renamed", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not rename collection", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteCollection = async (collection: CollectionItem) => {
    if (
      !activeWorkspaceId ||
      busy ||
      !window.confirm(`Delete "${collection.name}" and all its folders and saved requests?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.deleteCollection(collection.id);
      if (result.status !== "ok") throw new Error("Could not delete collection");
      if (selectedCollectionId === collection.id) setSelectedCollectionId(null);
      invalidateCollectionLoads(activeWorkspaceId);
      setCollectionsForWorkspace(
        activeWorkspaceId,
        useAppStore.getState().collections.filter((item) => item.id !== collection.id),
      );
      await refreshCollections(activeWorkspaceId);
      toast("Collection deleted", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete collection", "error");
    } finally {
      setBusy(false);
    }
  };

  const startCreateFolder = (collectionId: string, parentId?: string) => {
    setCreatingFolder({ collectionId, parentId });
    setNewFolderName("");
    setSelectedCollectionId(collectionId);
    setExpanded((current) => ({
      ...current,
      [collectionId]: true,
      ...(parentId ? { [parentId]: true } : {}),
    }));
  };

  const createFolder = async () => {
    if (!activeWorkspaceId || !creatingFolder || !newFolderName.trim() || busy) return;
    setBusy(true);
    try {
      const result = await bridge.createCollectionFolder({
        collection_id: creatingFolder.collectionId,
        parent_id: creatingFolder.parentId,
        name: newFolderName.trim(),
      });
      if (result.status !== "ok" || !result.folder?.id) throw new Error("Could not create folder");
      setCreatingFolder(null);
      setNewFolderName("");
      setExpanded((current) => ({ ...current, [result.folder.id]: true }));
      updateCollection(creatingFolder.collectionId, (collection) => ({
        ...collection,
        folders: [
          ...(collection.folders ?? []),
          {
            id: result.folder.id,
            collection_id: creatingFolder.collectionId,
            parent_id: creatingFolder.parentId ?? null,
            name: result.folder.name ?? newFolderName.trim(),
          },
        ],
      }));
      await refreshCollections(activeWorkspaceId);
      toast("Folder created", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create folder", "error");
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = async () => {
    if (!activeWorkspaceId || !editingFolder?.value.trim() || busy) return;
    const collectionId = collections.find((collection) =>
      collection.folders?.some((folder) => folder.id === editingFolder.id),
    )?.id;
    if (!collectionId) {
      toast("Could not find the folder's collection", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.updateCollectionFolder(editingFolder.id, {
        name: editingFolder.value.trim(),
      });
      if (result.status !== "ok") throw new Error("Could not rename folder");
      setEditingFolder(null);
      updateCollection(collectionId, (collection) => ({
        ...collection,
        folders: (collection.folders ?? []).map((folder) =>
          folder.id === editingFolder.id ? { ...folder, name: editingFolder.value.trim() } : folder,
        ),
      }));
      await refreshCollections(activeWorkspaceId);
      toast("Folder renamed", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not rename folder", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (folder: FolderItem) => {
    const ownerCollection = collections.find((item) =>
      item.folders?.some((candidate) => candidate.id === folder.id),
    );
    const collectionId = folder.collection_id ?? folder.collectionId ?? ownerCollection?.id;
    if (
      !activeWorkspaceId ||
      busy ||
      !window.confirm(`Delete "${folder.name}" and its nested folders and saved requests?`)
    ) {
      return;
    }
    if (!collectionId) {
      toast("Could not find the folder's collection", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.deleteCollectionFolder(folder.id);
      if (result.status !== "ok") throw new Error("Could not delete folder");
      const deletedIds = getNestedFolderIds(folder.id, ownerCollection?.folders ?? []);
      updateCollection(collectionId, (collection) => ({
        ...collection,
        folders: (collection.folders ?? []).filter((item) => !deletedIds.has(item.id)),
        requests: (collection.requests ?? []).filter(
          (request) => !deletedIds.has(request.folder_id ?? request.folderId ?? ""),
        ),
      }));
      await refreshCollections(activeWorkspaceId);
      toast("Folder deleted", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete folder", "error");
    } finally {
      setBusy(false);
    }
  };

  const startCreateRequest = (collectionId: string, folderId?: string) => {
    setCreatingRequest({ collectionId, folderId });
    setNewRequestName("New Request");
    setSelectedCollectionId(collectionId);
    setExpanded((current) => ({
      ...current,
      [collectionId]: true,
      ...(folderId ? { [folderId]: true } : {}),
    }));
  };

  const createRequest = async () => {
    if (!activeWorkspaceId || !creatingRequest || !newRequestName.trim() || busy) return;
    setBusy(true);
    try {
      const result = await bridge.saveRequest({
        workspace_id: activeWorkspaceId,
        collection_id: creatingRequest.collectionId,
        folder_id: creatingRequest.folderId,
        name: newRequestName.trim(),
        method: "GET",
        url: "",
        configuration: { protocol: "http" },
      });
      if (result.status !== "ok" || !result.request?.id) throw new Error("Could not create request");
      setCreatingRequest(null);
      setNewRequestName("");
      updateCollection(creatingRequest.collectionId, (collection) => ({
        ...collection,
        requests: [...(collection.requests ?? []), result.request],
      }));
      await refreshCollections(activeWorkspaceId);
      if (openCreatedRequests) openRequest(result.request, creatingRequest.collectionId);
      toast("Request created", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create request", "error");
    } finally {
      setBusy(false);
    }
  };

  const renameRequest = async () => {
    if (!activeWorkspaceId || !editingRequest?.value.trim() || busy) return;
    const collectionId = collections.find((collection) =>
      collection.requests?.some((request) => request.id === editingRequest.id),
    )?.id;
    if (!collectionId) {
      toast("Could not find the request's collection", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.updateSavedRequest(editingRequest.id, {
        name: editingRequest.value.trim(),
      });
      if (result.status !== "ok") throw new Error("Could not rename request");
      useAppStore.getState().tabs
        .filter((tab) => tab.savedRequestId === editingRequest.id)
        .forEach((tab) => updateTab(tab.id, { name: editingRequest.value.trim() }));
      setEditingRequest(null);
      updateCollection(collectionId, (collection) => ({
        ...collection,
        requests: (collection.requests ?? []).map((request) =>
          request.id === editingRequest.id
            ? { ...request, name: editingRequest.value.trim() }
            : request,
        ),
      }));
      await refreshCollections(activeWorkspaceId);
      toast("Request renamed", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not rename request", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteRequest = async (request: RequestItem) => {
    if (!activeWorkspaceId || busy || !window.confirm(`Delete request "${request.name}"?`)) return;
    setBusy(true);
    try {
      const result = await bridge.deleteSavedRequest(request.id);
      if (result.status !== "ok") throw new Error("Could not delete request");
      tabs
        .filter((tab) => tab.savedRequestId === request.id)
        .forEach((tab) =>
          updateTab(tab.id, { savedRequestId: undefined, collectionId: undefined, isDirty: true }),
        );
      const collectionId = collections.find((collection) =>
        collection.requests?.some((item) => item.id === request.id),
      )?.id;
      if (collectionId) {
        updateCollection(collectionId, (collection) => ({
          ...collection,
          requests: (collection.requests ?? []).filter((item) => item.id !== request.id),
        }));
      }
      await refreshCollections(activeWorkspaceId);
      toast("Request deleted", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete request", "error");
    } finally {
      setBusy(false);
    }
  };

  const duplicateRequest = async (request: RequestItem, collectionId: string) => {
    if (!activeWorkspaceId || busy) return;
    setBusy(true);
    try {
      const result = await bridge.saveRequest({
        workspace_id: activeWorkspaceId,
        collection_id: collectionId,
        folder_id: request.folder_id ?? request.folderId,
        name: `${request.name} (Copy)`,
        method: request.method || "GET",
        url: request.url || "",
        configuration: readRequestConfiguration(request),
      });
      if (result.status !== "ok" || !result.request?.id) throw new Error("Could not duplicate request");
      updateCollection(collectionId, (collection) => ({
        ...collection,
        requests: [...(collection.requests ?? []), result.request],
      }));
      await refreshCollections(activeWorkspaceId);
      toast("Request duplicated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not duplicate request", "error");
    } finally {
      setBusy(false);
    }
  };

  const moveRequest = async (request: RequestItem, collectionId: string, folderId?: string) => {
    if (!activeWorkspaceId || busy) return;
    setBusy(true);
    try {
      const result = await bridge.updateSavedRequest(request.id, { folder_id: folderId ?? null });
      if (result.status !== "ok") throw new Error("Could not move request");
      updateCollection(collectionId, (collection) => ({
        ...collection,
        requests: (collection.requests ?? []).map((item) =>
          item.id === request.id ? { ...item, folder_id: folderId, folderId } : item,
        ),
      }));
      await refreshCollections(activeWorkspaceId);
      toast(folderId ? "Request moved" : "Request moved to collection root", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not move request", "error");
    } finally {
      setBusy(false);
    }
  };

  const openRequest = (request: RequestItem, collectionId: string, forceNewTab = false) => {
    setSelectedCollectionId(collectionId);
    openSavedRequestInTab(
      request,
      collectionId,
      { tabs, openTab, setActiveTab, setActiveModule },
      (message) => toast(message, "error"),
      forceNewTab,
    );
  };

  const currentContextCollection = contextTarget && contextTarget.kind !== "empty"
    ? collections.find((collection) => collection.id === contextTarget.collectionId)
    : undefined;
  const currentContextFolder = contextTarget?.kind === "folder"
    ? currentContextCollection?.folders?.find((folder) => folder.id === contextTarget.itemId)
    : undefined;
  const currentContextRequest = contextTarget?.kind === "request"
    ? currentContextCollection?.requests?.find((request) => request.id === contextTarget.itemId)
    : undefined;
  const contextMenuItems: ContextMenuItem[] = contextTarget?.kind === "empty"
    ? [
        { label: "New collection", icon: <FolderPlus size={13} />, onSelect: startCreateCollection },
        ...(selectedOnly && collections.length > 0
          ? [{ label: "Open Collections", icon: <FolderKanban size={13} />, onSelect: () => setActiveModule("collections") }]
          : []),
      ]
    : !contextTarget || !currentContextCollection
    ? []
    : contextTarget.kind === "collection"
      ? [
          { label: "New folder", icon: <FolderPlus size={13} />, onSelect: () => startCreateFolder(currentContextCollection.id) },
          { label: "New request", icon: <FilePlus2 size={13} />, onSelect: () => startCreateRequest(currentContextCollection.id) },
          { separator: true, label: "" },
          { label: "Rename", icon: <Pencil size={13} />, disabled: busy, onSelect: () => setEditingCollection({ id: currentContextCollection.id, value: currentContextCollection.name }) },
          {
            label: "Export collection",
            icon: <Download size={13} />,
            onSelect: () => {
              void exportCollectionJson(currentContextCollection)
                .then((exported) => exported && toast("Collection exported", "success"))
                .catch((error: unknown) => toast(error instanceof Error ? error.message : "Could not export collection", "error"));
            },
          },
          { label: "Delete", icon: <Trash2 size={13} />, danger: true, disabled: busy, onSelect: () => void deleteCollection(currentContextCollection) },
        ]
      : currentContextFolder
        ? [
            { label: "New nested folder", icon: <FolderPlus size={13} />, onSelect: () => startCreateFolder(currentContextCollection.id, currentContextFolder.id) },
            { label: "New request", icon: <FilePlus2 size={13} />, onSelect: () => startCreateRequest(currentContextCollection.id, currentContextFolder.id) },
            { separator: true, label: "" },
            { label: "Rename", icon: <Pencil size={13} />, disabled: busy, onSelect: () => setEditingFolder({ id: currentContextFolder.id, value: currentContextFolder.name }) },
            { label: "Delete", icon: <Trash2 size={13} />, danger: true, disabled: busy, onSelect: () => void deleteFolder(currentContextFolder) },
          ]
        : currentContextRequest
          ? [
              { label: "Open request", icon: <ExternalLink size={13} />, onSelect: () => openRequest(currentContextRequest, currentContextCollection.id) },
              { label: "Open in new tab", icon: <Plus size={13} />, onSelect: () => openRequest(currentContextRequest, currentContextCollection.id, true) },
              { label: "Duplicate request", icon: <Copy size={13} />, disabled: busy, onSelect: () => void duplicateRequest(currentContextRequest, currentContextCollection.id) },
              {
                label: "Move to folder",
                icon: <FolderInput size={13} />,
                disabled: busy,
                children: buildSidebarMoveItems(currentContextRequest, currentContextCollection, moveRequest),
              },
              { separator: true, label: "" },
              { label: "Rename", icon: <Pencil size={13} />, disabled: busy, onSelect: () => setEditingRequest({ id: currentContextRequest.id, value: currentContextRequest.name }) },
              { label: "Delete", icon: <Trash2 size={13} />, danger: true, disabled: busy, onSelect: () => void deleteRequest(currentContextRequest) },
            ]
          : [];

  const renderRequests = (requests: RequestItem[], collectionId: string) =>
    requests
      .filter((request) => !filter.trim() || matchesRequest(request, filter.trim().toLowerCase()))
      .map((request) => {
      const isEditing = editingRequest?.id === request.id;
      const isActive = tabs.some((tab) => tab.id === activeTabId && tab.savedRequestId === request.id);
      return (
        <div
          key={request.id}
          onContextMenu={(event) => showContextMenu(event, {
            collectionId,
            kind: "request",
            itemId: request.id,
          })}
          className={cn(
            "group flex items-center min-h-7 rounded-[var(--r-sm)] border border-transparent",
            isActive
              ? "bg-[var(--color-surface-elevated)] border-[var(--color-border-hover)]"
              : "hover:bg-[var(--color-surface-elevated)]",
          )}
        >
          {isEditing ? (
            <input
              autoFocus
              value={editingRequest.value}
              onChange={(event) => setEditingRequest({ id: request.id, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") void renameRequest();
                if (event.key === "Escape") setEditingRequest(null);
              }}
              className="min-w-0 flex-1 mx-2 bg-[var(--color-surface-canvas)] border border-[var(--color-border-focus)] rounded px-1.5 py-0.5 text-[11px] text-[var(--color-text-primary)] outline-none"
            />
          ) : (
            <button
              onClick={() => openRequest(request, collectionId)}
              className="flex items-center gap-1.5 min-w-0 flex-1 px-2 py-1 text-left"
              title={`${request.method || "GET"} ${request.url || ""}${selectedOnly ? " · Right-click for actions" : ""}`}
            >
              <span className={cn("text-[9px] font-mono font-bold shrink-0", methodColor(request.method || "GET"))}>
                {request.method || "GET"}
              </span>
              <span className="truncate text-[11px] text-[var(--color-text-secondary)]">{request.name}</span>
            </button>
          )}
          {isEditing ? (
            <>
              <button
                onClick={() => void renameRequest()}
                disabled={busy || !editingRequest.value.trim()}
                className="p-1 text-[var(--color-status-success)] disabled:opacity-40"
                title="Save request name"
              >
                <Check size={11} />
              </button>
              <button onClick={() => setEditingRequest(null)} className="p-1 text-[var(--color-text-muted)]" title="Cancel">
                <X size={11} />
              </button>
            </>
          ) : !selectedOnly ? (
            <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => setEditingRequest({ id: request.id, value: request.name })}
                disabled={busy}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                title="Rename request"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => void deleteRequest(request)}
                disabled={busy}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] disabled:opacity-40"
                title="Delete request"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ) : null}
        </div>
      );
      });

  const renderFolders = (folders: FolderNode[], collection: CollectionItem): React.ReactNode =>
    folders.map((folder) => {
      const isExpanded = !!filter.trim() || (expanded[folder.id] ?? true);
      const isEditing = editingFolder?.id === folder.id;
      const folderRequests = (collection.requests ?? []).filter(
        (request) => (request.folder_id ?? request.folderId) === folder.id,
      );
      if (
        filter.trim() &&
        !folder.name.toLowerCase().includes(filter.trim().toLowerCase()) &&
        !folderRequests.some((request) => matchesRequest(request, filter.trim().toLowerCase())) &&
        !folder.children.length
      ) {
        return null;
      }
      return (
        <div key={folder.id} className="flex flex-col">
          <div
            className="group flex items-center min-h-7 rounded-[var(--r-sm)] hover:bg-[var(--color-surface-elevated)]"
            onContextMenu={(event) => showContextMenu(event, {
              collectionId: collection.id,
              kind: "folder",
              itemId: folder.id,
            })}
          >
            <button
              onClick={() => {
                setSelectedCollectionId(collection.id);
                toggle(folder.id);
              }}
              className="flex items-center gap-1.5 min-w-0 flex-1 px-2 py-1 text-left text-[11px] text-[var(--color-text-secondary)]"
              title={selectedOnly ? `${folder.name} · Right-click for actions` : folder.name}
            >
              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {isExpanded ? (
                <FolderOpen size={12} className="shrink-0 text-[var(--color-accent-lime)]" />
              ) : (
                <Folder size={12} className="shrink-0 text-[var(--color-accent-lime)]" />
              )}
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto text-[9px] font-mono text-[var(--color-text-muted)]">{folderRequests.length}</span>
            </button>
            {!selectedOnly && (
            <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => startCreateFolder(collection.id, folder.id)}
                disabled={busy}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                title="Add nested folder"
              >
                <FolderPlus size={10} />
              </button>
              <button
                onClick={() => startCreateRequest(collection.id, folder.id)}
                disabled={busy}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                title="Add request to folder"
              >
                <FilePlus2 size={10} />
              </button>
              <button
                onClick={() => setEditingFolder({ id: folder.id, value: folder.name })}
                disabled={busy}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                title="Rename folder"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => void deleteFolder(folder)}
                disabled={busy}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] disabled:opacity-40"
                title="Delete folder"
              >
                <Trash2 size={10} />
              </button>
            </div>
            )}
          </div>
          {isEditing && (
            <InlineName
              value={editingFolder.value}
              onChange={(value) => setEditingFolder({ id: folder.id, value })}
              onSave={renameFolder}
              onCancel={() => setEditingFolder(null)}
              disabled={busy}
              placeholder="Folder name"
            />
          )}
          {creatingFolder?.collectionId === collection.id && creatingFolder.parentId === folder.id && (
            <InlineName
              value={newFolderName}
              onChange={setNewFolderName}
              onSave={createFolder}
              onCancel={() => setCreatingFolder(null)}
              disabled={busy}
              placeholder="New folder"
            />
          )}
          {creatingRequest?.collectionId === collection.id && creatingRequest.folderId === folder.id && (
            <InlineName
              value={newRequestName}
              onChange={setNewRequestName}
              onSave={createRequest}
              onCancel={() => setCreatingRequest(null)}
              disabled={busy}
              placeholder="New request"
            />
          )}
          {isExpanded && (
            <div className="ml-3 border-l border-[var(--color-border-subtle)] pl-2">
              {renderRequests(folderRequests, collection.id)}
              {renderFolders(folder.children, collection)}
            </div>
          )}
        </div>
      );
    });

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
  const visibleCollections = selectedOnly
    ? selectedCollection ? [selectedCollection] : []
    : collections;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--color-surface-sidebar)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {selectedOnly ? (
            <FileText size={13} className="text-[var(--color-accent-lime)] shrink-0" />
          ) : (
            <FolderKanban size={13} className="text-[var(--color-accent-lime)] shrink-0" />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] font-mono">
            {selectedOnly ? "Requests" : "Collections"}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
            ({isLoading ? "…" : selectedOnly ? selectedCollection?.requests?.length ?? 0 : collections.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {selectedOnly && (
            <button
              onClick={() => void refreshSelectedCollection()}
              disabled={!activeWorkspaceId || refreshing || busy}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded hover:bg-[var(--color-surface-panel)] disabled:opacity-40"
              title="Refresh collection"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
          {!selectedOnly && (
            <button
              onClick={startCreateCollection}
              disabled={!activeWorkspaceId || busy}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] rounded hover:bg-[var(--color-surface-panel)] disabled:opacity-40"
              title="New collection"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      {selectedOnly && (
        <div className="p-2 border-b border-[var(--color-border-subtle)]">
          <div className="relative flex items-center">
            <Search size={11} className="absolute left-2 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              className="w-full bg-[var(--color-surface-panel)] border border-[var(--color-border-subtle)] rounded-[var(--r-sm)] px-2 py-1 pl-6 pr-6 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-border-focus)] font-mono"
              placeholder="Filter collection..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            {!!filter && (
              <button
                onClick={() => setFilter("")}
                className="absolute right-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                title="Clear filter"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>
      )}

      {creatingCollection && (
        <InlineName
          value={newCollectionName}
          onChange={setNewCollectionName}
          onSave={createCollection}
          onCancel={() => setCreatingCollection(false)}
          disabled={busy}
          placeholder="New collection"
        />
      )}

      <div
        className="flex-1 overflow-y-auto p-1 space-y-0.5"
        onContextMenu={(event) => {
          if (!isLoading && !creatingCollection && visibleCollections.length === 0) {
            showContextMenu(event, { kind: "empty" });
          }
        }}
      >
        {isLoading ? (
          <CollectionSidebarSkeleton />
        ) : visibleCollections.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
            <span>
              {selectedOnly && collections.length > 0
                ? "Select a collection in Collections to browse its requests."
                : selectedOnly
                  ? "No collections yet. Right-click here to create one."
                  : "No collections yet. Create a collection to get started."}
            </span>
            {selectedOnly && collections.length > 0 && (
              <button
                onClick={() => setActiveModule("collections")}
                className="text-[var(--color-accent-lime)] hover:text-[var(--color-accent-lime-hover)]"
              >
                Open Collections
              </button>
            )}
          </div>
        ) : (
          visibleCollections.map((collection) => {
            const isExpanded = !!filter.trim() || (expanded[collection.id] ?? true);
            const isSelected = selectedCollectionId === collection.id;
            const isEditing = editingCollection?.id === collection.id;
            const fullFolderTree = buildFolderTree(collection.folders ?? [], collection.id);
            const folders = filter.trim()
              ? filterFolderTree(fullFolderTree, collection.requests ?? [], filter.trim().toLowerCase())
              : fullFolderTree;
            const rootRequests = (collection.requests ?? []).filter(
              (request) => !(request.folder_id ?? request.folderId),
            ).filter((request) => !filter.trim() || matchesRequest(request, filter.trim().toLowerCase()));

            return (
              <div key={collection.id} className="flex flex-col">
                <div
                  onContextMenu={(event) => showContextMenu(event, {
                    collectionId: collection.id,
                    kind: "collection",
                  })}
                  className={cn(
                    "group flex items-center min-h-8 rounded-[var(--r-sm)] border border-transparent",
                    isSelected
                      ? "bg-[var(--color-surface-elevated)] border-[var(--color-border-hover)]"
                      : "hover:bg-[var(--color-surface-elevated)]",
                  )}
                >
                  <button
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      toggle(collection.id);
                    }}
                    className="flex items-center gap-1.5 min-w-0 flex-1 px-2 py-1 text-left text-xs text-[var(--color-text-primary)]"
                    title={selectedOnly ? `${collection.name} · Right-click for actions` : collection.name}
                  >
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <FolderKanban size={13} className="shrink-0 text-[var(--color-accent-lime)]" />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingCollection.value}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setEditingCollection({ id: collection.id, value: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void renameCollection();
                          if (event.key === "Escape") setEditingCollection(null);
                        }}
                        className="min-w-0 w-full bg-[var(--color-surface-canvas)] border border-[var(--color-border-focus)] rounded px-1.5 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <span className="truncate font-medium">{collection.name}</span>
                    )}
                  </button>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => void renameCollection()}
                        disabled={busy || !editingCollection.value.trim()}
                        className="p-1 text-[var(--color-status-success)] disabled:opacity-40"
                        title="Save collection name"
                      >
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditingCollection(null)} className="p-1 text-[var(--color-text-muted)]" title="Cancel">
                        <X size={12} />
                      </button>
                    </>
                  ) : !selectedOnly ? (
                    <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => startCreateFolder(collection.id)}
                        disabled={busy}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                        title="Add folder"
                      >
                        <FolderPlus size={11} />
                      </button>
                      <button
                        onClick={() => startCreateRequest(collection.id)}
                        disabled={busy}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                        title="Add request"
                      >
                        <FilePlus2 size={11} />
                      </button>
                      <button
                        onClick={() => setEditingCollection({ id: collection.id, value: collection.name })}
                        disabled={busy}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
                        title="Rename collection"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => void deleteCollection(collection)}
                        disabled={busy}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] disabled:opacity-40"
                        title="Delete collection"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ) : null}
                </div>

                {isExpanded && (
                  <div className="ml-3 border-l border-[var(--color-border-subtle)] pl-2">
                    {creatingFolder?.collectionId === collection.id && !creatingFolder.parentId && (
                      <InlineName
                        value={newFolderName}
                        onChange={setNewFolderName}
                        onSave={createFolder}
                        onCancel={() => setCreatingFolder(null)}
                        disabled={busy}
                        placeholder="New folder"
                      />
                    )}
                    {creatingRequest?.collectionId === collection.id && !creatingRequest.folderId && (
                      <InlineName
                        value={newRequestName}
                        onChange={setNewRequestName}
                        onSave={createRequest}
                        onCancel={() => setCreatingRequest(null)}
                        disabled={busy}
                        placeholder="New request"
                      />
                    )}
                    {renderRequests(rootRequests, collection.id)}
                    {renderFolders(folders, collection)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {contextTarget && contextMenuItems.length > 0 && (
        <ContextMenu
          x={contextTarget.x}
          y={contextTarget.y}
          items={contextMenuItems}
          onClose={() => setContextTarget(null)}
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

function filterFolderTree(
  folders: FolderNode[],
  requests: RequestItem[],
  query: string,
): FolderNode[] {
  return folders.flatMap((folder) => {
    const children = filterFolderTree(folder.children, requests, query);
    const hasMatchingRequest = requests.some(
      (request) =>
        (request.folder_id ?? request.folderId) === folder.id &&
        matchesRequest(request, query),
    );
    if (folder.name.toLowerCase().includes(query)) return [folder];
    if (hasMatchingRequest || children.length > 0) return [{ ...folder, children }];
    return [];
  });
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

function matchesRequest(request: RequestItem, query: string): boolean {
  return [request.name, request.method, request.url].some((value) =>
    value?.toLowerCase().includes(query),
  );
}

function buildSidebarMoveItems(
  request: RequestItem,
  collection: CollectionItem,
  onMove: (request: RequestItem, collectionId: string, folderId?: string) => Promise<void>,
): ContextMenuItem[] {
  const currentFolderId = request.folder_id ?? request.folderId;
  const folders: ContextMenuItem[] = [];
  const append = (nodes: FolderNode[], parentPath = "") => {
    for (const folder of nodes) {
      const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
      folders.push({
        label: path,
        icon: <Folder size={12} />,
        disabled: currentFolderId === folder.id,
        onSelect: () => void onMove(request, collection.id, folder.id),
      });
      append(folder.children, path);
    }
  };
  append(buildFolderTree(collection.folders ?? [], collection.id));
  return [
    {
      label: "Collection root",
      icon: <FolderKanban size={12} />,
      disabled: !currentFolderId,
      onSelect: () => void onMove(request, collection.id),
    },
    ...(folders.length ? [{ separator: true, label: "" }, ...folders] : []),
  ];
}

function InlineName({
  value,
  onChange,
  onSave,
  onCancel,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-1 p-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]">
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSave();
          if (event.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="min-w-0 flex-1 bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
      />
      <button onClick={onSave} disabled={disabled || !value.trim()} className="p-1 text-[var(--color-status-success)] disabled:opacity-40" title="Save">
        <Check size={12} />
      </button>
      <button onClick={onCancel} className="p-1 text-[var(--color-text-muted)]" title="Cancel">
        <X size={12} />
      </button>
    </div>
  );
}

function CollectionSidebarSkeleton() {
  return (
    <div role="status" aria-label="Loading collections" className="p-2 space-y-2">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-2 h-7" style={{ paddingLeft: (row % 2) * 14 }}>
          <div className="w-3 h-3 rounded-sm bg-[var(--color-surface-elevated)] animate-pulse" />
          <div className="w-4 h-4 rounded-sm bg-[var(--color-surface-elevated)] animate-pulse" />
          <div
            className="h-2.5 rounded bg-[var(--color-surface-elevated)] animate-pulse"
            style={{ width: `${80 + row * 16}px` }}
          />
        </div>
      ))}
    </div>
  );
}
