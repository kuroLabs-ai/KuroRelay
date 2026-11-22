import React, { useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  FilePlus2,
  Filter,
  Folder,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useToast } from "../ui/Toast";
import type { FolderItem, RequestItem } from "../../stores/appStore";

interface Props {
  collectionName?: string;
  folders: FolderItem[];
  requests: RequestItem[];
  busy: boolean;
  onOpenRequest: (request: RequestItem) => void;
  onRenameRequest: (requestId: string, name: string) => Promise<boolean>;
  onDeleteRequest: (request: RequestItem) => Promise<boolean | void>;
  onStartCreateRequest: (folderId?: string) => void;
}

export const CollectionTableView: React.FC<Props> = ({
  folders,
  requests,
  busy,
  onOpenRequest,
  onRenameRequest,
  onDeleteRequest,
  onStartCreateRequest,
}) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("ALL");
  const [selectedFolder, setSelectedFolder] = useState<string>("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const folderMap = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  // Method breakdown counts
  const methodCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    requests.forEach((r) => {
      const m = (r.method || "GET").toUpperCase();
      counts[m] = (counts[m] || 0) + 1;
    });
    return counts;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Method filter
      if (selectedMethod !== "ALL" && (req.method || "GET").toUpperCase() !== selectedMethod) {
        return false;
      }
      // Folder filter
      if (selectedFolder !== "ALL") {
        const reqFolderId = req.folder_id ?? req.folderId ?? null;
        if (selectedFolder === "ROOT" && reqFolderId !== null) return false;
        if (selectedFolder !== "ROOT" && reqFolderId !== selectedFolder) return false;
      }
      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (req.name || "").toLowerCase().includes(q);
        const matchesUrl = (req.url || "").toLowerCase().includes(q);
        if (!matchesName && !matchesUrl) return false;
      }
      return true;
    });
  }, [requests, selectedMethod, selectedFolder, search]);

  const copyUrl = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast("URL copied to clipboard", "success");
  };

  const startRename = (req: RequestItem) => {
    setEditingId(req.id);
    setEditName(req.name);
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    await onRenameRequest(id, editName.trim());
    setEditingId(null);
  };

  const getMethodBadgeClass = (method: string) => {
    const m = (method || "GET").toUpperCase();
    switch (m) {
      case "GET":
        return "text-[var(--color-method-get)] bg-[var(--color-method-get)]/10 border-[var(--color-method-get)]/30";
      case "POST":
        return "text-[var(--color-method-post)] bg-[var(--color-method-post)]/10 border-[var(--color-method-post)]/30";
      case "PUT":
        return "text-[var(--color-method-put)] bg-[var(--color-method-put)]/10 border-[var(--color-method-put)]/30";
      case "DELETE":
        return "text-[var(--color-method-delete)] bg-[var(--color-method-delete)]/10 border-[var(--color-method-delete)]/30";
      case "PATCH":
        return "text-[var(--color-method-patch)] bg-[var(--color-method-patch)]/10 border-[var(--color-method-patch)]/30";
      default:
        return "text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)] border-[var(--color-border-subtle)]";
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--color-surface-canvas)]">
      {/* Search, Filters, and Statistics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests by name or URL..."
              className="w-full h-8 pl-7 pr-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-border-focus)] transition-colors"
            />
          </div>
        </div>

        {/* Method & Folder Filter Dropdowns */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-[var(--color-surface-panel)] p-0.5 rounded-lg border border-[var(--color-border-subtle)]">
            {(["ALL", "GET", "POST", "PUT", "DELETE"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMethod(m)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-colors cursor-pointer",
                  selectedMethod === m
                    ? "bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {folders.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-panel)] px-2 py-1 rounded-lg border border-[var(--color-border-subtle)] text-xs">
              <Folder size={12} className="text-[var(--color-text-muted)]" />
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="bg-transparent text-xs text-[var(--color-text-primary)] outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[var(--color-surface-panel)]">All Folders</option>
                <option value="ROOT" className="bg-[var(--color-surface-panel)]">Root Only</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[var(--color-surface-panel)]">{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => onStartCreateRequest(selectedFolder !== "ALL" && selectedFolder !== "ROOT" ? selectedFolder : undefined)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent-lime)] text-black font-semibold text-xs hover:bg-[var(--color-accent-lime-hover)] transition-colors cursor-pointer"
          >
            <FilePlus2 size={13} />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* Breakdown Pills */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/50 shrink-0 text-[10px] font-mono">
        <span className="text-[var(--color-text-muted)]">
          Showing {filteredRequests.length} of {requests.length} requests:
        </span>
        {Object.entries(methodCounts).map(([method, count]) => (
          <span
            key={method}
            className={cn(
              "px-1.5 py-0.5 rounded border font-semibold",
              getMethodBadgeClass(method)
            )}
          >
            {count} {method}
          </span>
        ))}
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto">
        {filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <Filter size={24} className="text-[var(--color-text-muted)]" />
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
              No requests match your current search or filter criteria.
            </p>
            {(search || selectedMethod !== "ALL" || selectedFolder !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedMethod("ALL");
                  setSelectedFolder("ALL");
                }}
                className="mt-1 text-xs text-[var(--color-accent-lime)] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-base)]/80 sticky top-0 backdrop-blur-sm z-10">
                <th className="py-2.5 px-4 w-20">Method</th>
                <th className="py-2.5 px-4">Request Name</th>
                <th className="py-2.5 px-4 w-36">Folder</th>
                <th className="py-2.5 px-4">Endpoint URL</th>
                <th className="py-2.5 px-4 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)] font-sans">
              {filteredRequests.map((req) => {
                const folderId = req.folder_id ?? req.folderId;
                const folderName = folderId ? folderMap.get(folderId) : null;
                const isEditing = editingId === req.id;

                return (
                  <tr
                    key={req.id}
                    className="hover:bg-[var(--color-surface-panel)]/50 transition-colors group"
                  >
                    {/* Method */}
                    <td className="py-2.5 px-4 font-mono">
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wide",
                          getMethodBadgeClass(req.method || "GET")
                        )}
                      >
                        {req.method || "GET"}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-4">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveRename(req.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => void saveRename(req.id)}
                          className="w-full px-2 py-0.5 rounded border border-[var(--color-border-focus)] bg-[var(--color-surface-base)] text-xs text-[var(--color-text-primary)] outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenRequest(req)}
                          className="font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent-lime)] text-left truncate max-w-md block transition-colors cursor-pointer"
                          title="Open request in tab"
                        >
                          {req.name}
                        </button>
                      )}
                    </td>

                    {/* Folder */}
                    <td className="py-2.5 px-4 text-[var(--color-text-muted)] text-[11px] truncate">
                      {folderName ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] text-[10px] font-mono text-[var(--color-text-secondary)]">
                          <Folder size={10} className="text-[var(--color-accent-lime)]" />
                          <span>{folderName}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono opacity-50">Root</span>
                      )}
                    </td>

                    {/* URL */}
                    <td className="py-2.5 px-4 font-mono text-[11px] text-[var(--color-text-muted)] truncate max-w-sm">
                      <span className="truncate block" title={req.url || ""}>
                        {req.url || "(No URL configured)"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => copyUrl(req.url || "")}
                          disabled={!req.url}
                          title="Copy URL"
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer disabled:opacity-30"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startRename(req)}
                          title="Rename request"
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenRequest(req)}
                          title="Open in Builder Tab"
                          className="p-1 rounded text-[var(--color-accent-lime)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
                        >
                          <ExternalLink size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteRequest(req)}
                          disabled={busy}
                          title="Delete request"
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
