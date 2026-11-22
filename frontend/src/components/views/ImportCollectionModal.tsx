import React, { useState } from "react";
import { CheckCircle2, FileCode, FileUp, Sparkles, UploadCloud, X } from "lucide-react";
import { importCollectionFromJson } from "../../lib/collectionImportExport";
import { useToast } from "../ui/Toast";

interface Props {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (collectionName: string) => void;
}

export const ImportCollectionModal: React.FC<Props> = ({
  workspaceId,
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [pastedJson, setPastedJson] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const detectedFormat = (() => {
    const text = (pastedJson || "").trim();
    if (!text) return null;
    if (text.includes("openapi") || text.includes("swagger")) {
      return "OpenAPI 3.0 / Swagger Specification";
    }
    if (text.includes('"item"') && text.includes('"info"')) {
      return "Postman Collection v2.0 / v2.1";
    }
    if (text.includes("kurorelay-collection")) {
      return "KuroRelay Native Collection";
    }
    return "Unknown Format (Will validate on import)";
  })();

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const executeImport = async () => {
    if (!workspaceId) {
      toast("No active workspace selected", "error");
      return;
    }

    setImporting(true);
    try {
      let content = pastedJson.trim();
      if (activeTab === "file") {
        if (!selectedFile) {
          toast("Please choose or drop a collection file first", "warning");
          setImporting(false);
          return;
        }
        content = await selectedFile.text();
      }

      if (!content) {
        toast("No content to import", "warning");
        setImporting(false);
        return;
      }

      const result = await importCollectionFromJson(content, workspaceId);
      toast(`Successfully imported "${result.name}" with ${result.count} requests!`, "success");
      onImportSuccess(result.name);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to import collection", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-accent-lime-dim)] text-[var(--color-accent-lime)]">
              <FileUp size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Import Collection
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Postman v2.1, OpenAPI 3.0 / Swagger, or KuroRelay JSON
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center px-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0 gap-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab("file")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "file"
                ? "border-[var(--color-accent-lime)] text-[var(--color-accent-lime)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <UploadCloud size={13} />
            <span>Upload File</span>
          </button>
          <button
            onClick={() => setActiveTab("paste")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "paste"
                ? "border-[var(--color-accent-lime)] text-[var(--color-accent-lime)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <FileCode size={13} />
            <span>Paste JSON</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {activeTab === "file" ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                isDragging
                  ? "border-[var(--color-accent-lime)] bg-[var(--color-accent-lime-dim)]"
                  : selectedFile
                  ? "border-[var(--color-accent-lime)]/50 bg-[var(--color-surface-elevated)]"
                  : "border-[var(--color-border-subtle)] hover:border-[var(--color-border-hover)] bg-[var(--color-surface-base)]"
              }`}
              onClick={() => document.getElementById("collection-file-input")?.click()}
            >
              <input
                id="collection-file-input"
                type="file"
                accept=".json,.kuro.json,.yaml,.yml"
                className="hidden"
                onChange={handleFileSelect}
              />
              <UploadCloud
                size={32}
                className={
                  selectedFile
                    ? "text-[var(--color-accent-lime)]"
                    : "text-[var(--color-text-muted)]"
                }
              />
              {selectedFile ? (
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Click to change file
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Drag and drop your collection file here, or click to browse
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1 font-mono">
                    Supports .json, .kuro.json, postman_collection.json, openapi.json
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)]">Raw JSON Payload</span>
                {detectedFormat && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-[var(--color-accent-lime)]">
                    <Sparkles size={11} /> {detectedFormat}
                  </span>
                )}
              </div>
              <textarea
                rows={8}
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='Paste Postman JSON, OpenAPI specification, or KuroRelay export here: {"info": {...}, "item": [...]}'
                className="w-full p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)] leading-relaxed resize-none"
              />
            </div>
          )}

          {/* Formats Info Banner */}
          <div className="p-3 rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] flex items-start gap-2 text-[11px] text-[var(--color-text-muted)]">
            <CheckCircle2 size={14} className="text-[var(--color-accent-lime)] shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-[var(--color-text-secondary)]">
                Instant Auto-Converter:
              </span>{" "}
              Postman folders, request bodies, query params, and OpenAPI tag structures are parsed and saved directly into your local database.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={executeImport}
            disabled={importing || (activeTab === "file" && !selectedFile) || (activeTab === "paste" && !pastedJson.trim())}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--color-accent-lime)] text-black font-semibold text-xs hover:bg-[var(--color-accent-lime-hover)] transition-colors cursor-pointer disabled:opacity-40"
          >
            <FileUp size={13} />
            <span>{importing ? "Importing…" : "Import Collection"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
