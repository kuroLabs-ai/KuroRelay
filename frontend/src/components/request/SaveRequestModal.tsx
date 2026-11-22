import React, { useState, useEffect } from "react";
import { X, Bookmark, Plus, Check } from "lucide-react";
import { useAppStore, type Tab } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { useToast } from "../ui/Toast";
import {
  invalidateCollectionLoads,
  loadCollectionsWithFolders,
} from "../../lib/collectionData";

interface SaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (tabId: string) => void;
  tab: Tab | undefined;
}

export const SaveRequestModal: React.FC<SaveRequestModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  tab,
}) => {
  const {
    collections,
    selectedCollectionId: activeSelectedCollectionId,
    setCollectionsForWorkspace,
    setSelectedCollectionId: setGlobalSelectedCollectionId,
    activeWorkspaceId,
    updateTab,
  } = useAppStore();
  const { toast } = useToast();

  const [reqName, setReqName] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [creatingColInline, setCreatingColInline] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && tab) {
      const defaultName =
        tab.name && tab.name !== "New Request"
          ? tab.name
          : tab.url
          ? `${tab.method} ${tab.url.slice(0, 36)}`
          : "New Request";
      setReqName(defaultName);

      // Default collection selection
      const initialColId =
        tab.collectionId ||
        (collections.some((collection) => collection.id === activeSelectedCollectionId)
          ? activeSelectedCollectionId ?? ""
          : collections[0]?.id ?? "");
      setSelectedCollectionId(initialColId);
      setSelectedFolderId("");
      setCreatingColInline(collections.length === 0);
      setNewColName("");
    }
  }, [isOpen, tab, collections, activeSelectedCollectionId]);

  if (!isOpen || !tab) return null;

  const currentCollection = collections.find((c) => c.id === selectedCollectionId);
  const folders = currentCollection?.folders || [];

  const handleCreateCollection = async () => {
    if (!newColName.trim() || !activeWorkspaceId) return;
    try {
      const res = await bridge.createCollection({
        workspace_id: activeWorkspaceId,
        name: newColName.trim(),
      }) as any;
      if (res?.status !== "ok" || !res.collection?.id) {
        throw new Error(res?.error?.message || "Could not create collection");
      }
      const createdCol = (res as any)?.collection;
      invalidateCollectionLoads(activeWorkspaceId);
      const cols = await loadCollectionsWithFolders(activeWorkspaceId);
      setCollectionsForWorkspace(activeWorkspaceId, cols);
      if (createdCol?.id) {
        setSelectedCollectionId(createdCol.id);
        setGlobalSelectedCollectionId(createdCol.id);
      } else if (cols.length > 0) {
        setSelectedCollectionId(cols[cols.length - 1].id);
        setGlobalSelectedCollectionId(cols[cols.length - 1].id);
      }
      setCreatingColInline(false);
      setNewColName("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create collection", "error");
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!reqName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let targetCollectionId = selectedCollectionId;
      if (creatingColInline) {
        if (!newColName.trim() || !activeWorkspaceId) {
          throw new Error("Enter a collection name before saving");
        }
        const collectionResult: any = await bridge.createCollection({
          workspace_id: activeWorkspaceId,
          name: newColName.trim(),
        });
        if (collectionResult?.status !== "ok" || !collectionResult.collection?.id) {
          throw new Error(collectionResult?.error?.message || "Could not create collection");
        }
        targetCollectionId = collectionResult.collection.id;
      }

      if (!targetCollectionId && collections.length > 0) {
        targetCollectionId = collections.some((collection) => collection.id === activeSelectedCollectionId)
          ? activeSelectedCollectionId ?? collections[0].id
          : collections[0].id;
      }

      const config = {
        protocol: tab.protocol,
        params: tab.params,
        headers: tab.headers,
        body: tab.body,
        auth: tab.auth,
        options: tab.options,
        extractions: tab.extractions,
      };

      const res: any = await bridge.saveRequest({
        workspace_id: activeWorkspaceId ?? undefined,
        collection_id: targetCollectionId || undefined,
        folder_id: selectedFolderId || undefined,
        name: reqName.trim(),
        method: tab.method,
        url: tab.url,
        configuration: config,
      });

      const saved = res?.request;
      if (res?.status !== "ok" || !saved) {
        throw new Error(res?.error?.message || "Could not save request");
      }
      updateTab(tab.id, {
        savedRequestId: saved.id,
        collectionId: saved.collection_id,
        name: saved.name,
        isDirty: false,
      });

      if (activeWorkspaceId) {
        setGlobalSelectedCollectionId(targetCollectionId);
        invalidateCollectionLoads(activeWorkspaceId);
        try {
          const updatedCollections = await loadCollectionsWithFolders(activeWorkspaceId);
          setCollectionsForWorkspace(activeWorkspaceId, updatedCollections);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not refresh the collection";
          toast(`Request saved, but ${message.toLowerCase()}`, "warning");
        }
      }
      toast(`Saved "${saved.name}" to collection`, "success");
      onSaved?.(tab.id);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save request", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-none">
      <div
        className="w-full max-w-md bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !isSubmitting) onClose();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-dim)] bg-[var(--bg-s1)]">
          <div className="flex items-center gap-2">
            <Bookmark size={15} className="text-[var(--lime)]" />
            <h3 className="text-xs font-semibold text-[var(--tx-1)]">Save Request to Collection</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s3)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-4 flex flex-col gap-4 text-xs">
          {/* Request Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[var(--tx-2)]">Request Name</label>
            <input
              autoFocus
              className="bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)] transition-colors"
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              placeholder="e.g. Get User Profile"
            />
          </div>

          {/* Collection Selector */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-[var(--tx-2)]">Target Collection</label>
              {!creatingColInline && (
                <button
                  type="button"
                  onClick={() => setCreatingColInline(true)}
                  className="flex items-center gap-1 text-[11px] text-[var(--lime)] hover:underline"
                >
                  <Plus size={11} /> New Collection
                </button>
              )}
            </div>

            {creatingColInline ? (
              <div className="flex items-center gap-1.5 bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-sm)] p-1.5">
                <input
                  autoFocus
                  className="bg-transparent border-none text-xs text-[var(--tx-1)] outline-none flex-1 px-1"
                  placeholder="New collection name..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateCollection();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateCollection}
                  disabled={!newColName.trim()}
                  className="px-2 py-0.5 text-[10px] bg-[var(--lime)] text-[var(--tx-inv)] font-semibold rounded disabled:opacity-50"
                >
                  Create
                </button>
                {collections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCreatingColInline(false)}
                    className="px-1.5 py-0.5 text-[10px] text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <select
                className="bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)] transition-colors"
                value={selectedCollectionId}
                onChange={(e) => {
                  setSelectedCollectionId(e.target.value);
                  setSelectedFolderId("");
                }}
              >
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Folder Selector (if selected collection has folders) */}
          {!creatingColInline && folders.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[var(--tx-2)]">Folder (Optional)</label>
              <select
                className="bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)] transition-colors"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
              >
                <option value="">Root (No folder)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-dim)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-[var(--r-sm)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reqName.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Check size={13} />
              <span>{isSubmitting ? "Saving..." : "Save to Collection"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
