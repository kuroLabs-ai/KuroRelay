import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Copy,
  Download,
  Upload,
  Search,
  Lock,
  Eye,
  EyeOff,
  FileText,
  Table as TableIcon,
  Layers,
  ChevronDown,
  Globe,
  Clipboard,
  RotateCcw,
  Palette,
  FileCode,
  ArrowUpDown,
  FilePlus,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { cn } from "../../lib/cn";
import { useToast } from "../ui/Toast";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { ENVIRONMENT_MOODS, type EnvironmentMood } from "../layout/EnvironmentSelector";
import { DYNAMIC_VARIABLES } from "../ui/VariableInput";
import {
  exportEnvironmentToEnv,
  exportEnvironmentToPostman,
  parseEnvText,
  parsePostmanEnvironment,
  getImportConflictKeys,
  planImportedVariables,
  type ImportConflictPolicy,
  type EnvVarItem,
  type EnvironmentModel,
} from "../../lib/environmentImportExport";

interface Props {
  sidebar?: boolean;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: "environment" | "variable";
  envId?: string;
  varItem?: EnvVarItem;
}

type SortOption = "name-asc" | "name-desc" | "mood" | "vars-count";
type ExportFormat = "env" | "postman";
type ExportDestination = "download" | "clipboard";

interface PendingImport {
  workspaceId: string;
  environmentName: string;
  targetEnvId: string | null;
  variables: EnvVarItem[];
}

interface PendingExport {
  workspaceId: string;
  environment: EnvironmentModel;
  format: ExportFormat;
  useCurrent: boolean;
  destination: ExportDestination;
}

function assertBridgeSuccess(result: { status?: string; error?: unknown }, fallback: string) {
  if (result?.status !== "ok") {
    const error = result?.error;
    const message =
      typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : fallback;
    throw new Error(message);
  }
}

// Fallback direct browser download helper
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Helper to get/set initial values dictionary for an environment (persisted in localStorage)
export const getInitialValuesMap = (envId: string): Record<string, string> => {
  try {
    const raw = localStorage.getItem(`kuro_env_init_vals_${envId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setInitialValueForVar = (envId: string, varKey: string, initialVal: string) => {
  try {
    const map = getInitialValuesMap(envId);
    map[varKey] = initialVal;
    localStorage.setItem(`kuro_env_init_vals_${envId}`, JSON.stringify(map));
  } catch {}
};

const renameInitialValueForVar = (envId: string, oldKey: string, newKey: string) => {
  const values = getInitialValuesMap(envId);
  if (Object.prototype.hasOwnProperty.call(values, oldKey)) {
    values[newKey] = values[oldKey];
    delete values[oldKey];
    try {
      localStorage.setItem(`kuro_env_init_vals_${envId}`, JSON.stringify(values));
    } catch {}
  }
};

export function EnvironmentsView({ sidebar = false }: Props) {
  const {
    activeWorkspaceId,
    activeEnvironmentId,
    setActiveEnvironment,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
    environments,
    setEnvironments,
    setEnvironmentVariables,
    setGlobalVariables,
    envColors,
    setEnvColor,
  } = useAppStore();

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [envSearch, setEnvSearch] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importConflictPolicy, setImportConflictPolicy] = useState<ImportConflictPolicy>("skip");
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null);
  const [includeExportSecrets, setIncludeExportSecrets] = useState(false);
  const loadRequestRef = useRef(0);

  // Sidebar inline rename state
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editingEnvNameDraft, setEditingEnvNameDraft] = useState("");

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: "environment",
  });
  const mergeTargetRef = useRef<string | null>(null);

  useEffect(() => {
    setPendingImport((current) =>
      current?.workspaceId === activeWorkspaceId ? current : null,
    );
    setPendingExport((current) =>
      current?.workspaceId === activeWorkspaceId ? current : null,
    );
    setCtxMenu((current) => ({ ...current, visible: false }));
  }, [activeWorkspaceId]);

  // Sync / load environments to global store
  const load = async () => {
    const workspaceId = activeWorkspaceId;
    if (!workspaceId) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await bridge.getEnvironments(workspaceId);
      assertBridgeSuccess(res, "Could not load environments");
      if (
        requestId !== loadRequestRef.current ||
        useAppStore.getState().activeWorkspaceId !== workspaceId
      ) return;
      let list: EnvironmentModel[] = (res as any)?.environments ?? [];

      // Ensure "Globals" environment exists
      let globalsEnv = list.find((e) => e.name.toLowerCase() === "globals");
      if (!globalsEnv) {
        const createRes = await bridge.createEnvironment({
          workspace_id: workspaceId,
          name: "Globals",
        });
        assertBridgeSuccess(createRes, "Could not create the Global Variables environment");
        if (
          requestId !== loadRequestRef.current ||
          useAppStore.getState().activeWorkspaceId !== workspaceId
        ) return;
        globalsEnv = (createRes as any)?.environment;
        if (globalsEnv) {
          list = [globalsEnv, ...list];
        }
      }

      // Update global store so both sidebar & main view update in real time
      setEnvironments(list);

      const activeEnv =
        list.find((e) => e.id === activeEnvironmentId) ||
        list.find((e) => e.is_active);
      if (activeEnv) {
        setActiveEnvironment(activeEnv.id);
        setEnvironmentVariables(activeEnv.variables || []);
      } else if (activeEnvironmentId) {
        setActiveEnvironment(null);
        setEnvironmentVariables([]);
      }

      // Sync global variables
      setGlobalVariables(globalsEnv?.variables || []);

      // If no selected environment, pick active or first non-global
      if (
        list.length > 0 &&
        (!selectedEnvironmentId || !list.some((environment) => environment.id === selectedEnvironmentId))
      ) {
        const first =
          list.find((e) => e.id === activeEnvironmentId) ||
          list.find((e) => e.name.toLowerCase() !== "globals") ||
          list[0];
        setSelectedEnvironmentId(first.id);
      }
    } catch (err) {
      if (requestId === loadRequestRef.current) {
        setLoadError(err instanceof Error ? err.message : "Could not load environments");
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeWorkspaceId]); // eslint-disable-line

  // Find currently selected environment from store
  const selectedEnv = useMemo(() => {
    return (environments as EnvironmentModel[]).find((e) => e.id === selectedEnvironmentId) || null;
  }, [environments, selectedEnvironmentId]);

  const globalsEnv = useMemo(() => {
    return (environments as EnvironmentModel[]).find((e) => e.name.toLowerCase() === "globals") || null;
  }, [environments]);

  // Standard environments (excluding Globals)
  const standardEnvs = useMemo(() => {
    return (environments as EnvironmentModel[]).filter((e) => e.name.toLowerCase() !== "globals");
  }, [environments]);

  // Create new environment
  const handleCreateEnv = async (name = "New Environment") => {
    if (!activeWorkspaceId) return;
    try {
      const res = await bridge.createEnvironment({
        workspace_id: activeWorkspaceId,
        name,
      });
      assertBridgeSuccess(res, "Could not create environment");
      const created = (res as any)?.environment;
      toast(`Created environment "${name}"`, "success");
      await load();
      if (created?.id) {
        setSelectedEnvironmentId(created.id);
      }
    } catch (err: any) {
      toast(err?.message || "Failed to create environment", "error");
    }
  };

  // Duplicate environment
  const handleDuplicateEnv = async (envId: string) => {
    try {
      const res = await bridge.duplicateEnvironment(envId);
      assertBridgeSuccess(res, "Could not duplicate environment");
      const duplicated = (res as any)?.environment;
      toast(`Duplicated environment "${duplicated?.name || "Copy"}"`, "success");
      await load();
      if (duplicated?.id) {
        setSelectedEnvironmentId(duplicated.id);
      }
    } catch (err: any) {
      toast(err?.message || "Failed to duplicate environment", "error");
    }
  };

  // Rename environment
  const handleRenameEnv = async (envId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setEditingEnvId(null);
      return;
    }
    const target = (environments as EnvironmentModel[]).find((e) => e.id === envId);
    if (target && target.name === trimmed) {
      setEditingEnvId(null);
      return;
    }
    try {
      const result = await bridge.updateEnvironment(envId, { name: trimmed });
      assertBridgeSuccess(result, "Could not rename environment");
      toast(`Renamed environment to "${trimmed}"`, "success");
      setEditingEnvId(null);
      await load();
    } catch (err: any) {
      toast(err?.message || "Failed to rename environment", "error");
    }
  };

  // Delete environment
  const handleDeleteEnv = async (envId: string) => {
    const target = (environments as EnvironmentModel[]).find((e) => e.id === envId);
    if (!target) return;
    if (target.name.toLowerCase() === "globals") {
      toast("The Global Variables environment cannot be deleted", "error");
      return;
    }
    if (!confirm(`Are you sure you want to delete environment "${target.name}"?`)) {
      return;
    }
    try {
      const result = await bridge.deleteEnvironment(envId);
      assertBridgeSuccess(result, "Could not delete environment");
      toast(`Deleted environment "${target.name}"`, "success");
      if (selectedEnvironmentId === envId) {
        setSelectedEnvironmentId(null);
      }
      if (activeEnvironmentId === envId) {
        setActiveEnvironment(null);
        setEnvironmentVariables([]);
      }
      await load();
    } catch (err: any) {
      toast(err?.message || "Failed to delete environment", "error");
    }
  };

  // Clear all variables in an environment
  const handleClearVariables = async (envId: string) => {
    const target = (environments as EnvironmentModel[]).find((e) => e.id === envId);
    if (!target) return;
    if (!confirm(`Are you sure you want to clear all ${target.variables.length} variables in "${target.name}"?`)) {
      return;
    }
    try {
      for (const v of target.variables) {
        const result = await bridge.deleteEnvironmentVariable(envId, v.id || v.key);
        assertBridgeSuccess(result, `Could not delete "${v.key}"`);
      }
      toast(`Cleared variables in "${target.name}"`, "success");
      await load();
    } catch (err: any) {
      toast(err?.message || "Failed to clear variables", "error");
    }
  };

  // Set active environment
  const handleSetActive = async (envId: string) => {
    try {
      const result = await bridge.updateEnvironment(envId, { is_active: true });
      assertBridgeSuccess(result, "Could not activate environment");
      setActiveEnvironment(envId);
      const target = (environments as EnvironmentModel[]).find((e) => e.id === envId);
      if (target) {
        setEnvironmentVariables(target.variables || []);
        toast(`Set "${target.name}" as active environment`, "success");
      }
      await load();
    } catch (err: any) {
      toast(err?.message || "Failed to set active environment", "error");
    }
  };

  // Merge / Append into current environment
  const handlePickMergeFile = async (targetEnvId: string) => {
    mergeTargetRef.current = targetEnvId;
    try {
      const res = await bridge.chooseFile();
      if (res && res.status === "ok" && res.file?.fileData) {
        const parts = res.file.fileData.split(",");
        const b64 = parts.length > 1 ? parts[1] : parts[0];
        const text = decodeURIComponent(escape(atob(b64)));
        await processImportText(text, res.file.name, targetEnvId);
        return;
      }
      if (res && res.status === "cancelled") return;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open the import file", "error");
    }

    mergeFileInputRef.current?.click();
  };

  // Import environment from file (.env or JSON) creating a new env
  const handleImportFile = async () => {
    if (!activeWorkspaceId) return;

    try {
      const res = await bridge.chooseFile();
      if (res && res.status === "ok" && res.file?.fileData) {
        const parts = res.file.fileData.split(",");
        const b64 = parts.length > 1 ? parts[1] : parts[0];
        const text = decodeURIComponent(escape(atob(b64)));
        await processImportText(text, res.file.name);
        return;
      }
      if (res && res.status === "cancelled") return;
    } catch {}

    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceId) return;
    try {
      const text = await file.text();
      await processImportText(text, file.name);
    } catch (err: any) {
      toast(err?.message || "Failed to read file", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const processImportText = async (
    content: string,
    filename = "imported.env",
    targetEnvId: string | null = null,
  ) => {
    if (!activeWorkspaceId) return;
    try {
      const postman = parsePostmanEnvironment(content);
      const parsedVars: EnvVarItem[] = postman?.variables ??
        parseEnvText(content).map((variable) => ({
          ...variable,
          initial_value: variable.value,
        }));
      if (parsedVars.length === 0) {
        toast("No valid variables found in the file", "error");
        return;
      }

      const target = targetEnvId
        ? (environments as EnvironmentModel[]).find((environment) => environment.id === targetEnvId)
        : undefined;
      if (targetEnvId && !target) {
        toast("The target environment no longer exists", "error");
        return;
      }
      const fallbackName = filename.replace(/\.(json|env|txt)$/i, "") || "Imported Environment";
      setImportConflictPolicy("skip");
      setPendingImport({
        workspaceId: activeWorkspaceId,
        environmentName: target ? target.name : (postman?.name || fallbackName),
        targetEnvId,
        variables: parsedVars,
      });
    } catch (err: any) {
      toast(err?.message || "Failed to import environment", "error");
    }
  };

  const handleMergeFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const targetEnvId = mergeTargetRef.current || selectedEnvironmentId;
    mergeTargetRef.current = null;
    if (!file || !targetEnvId) return;
    try {
      await processImportText(await file.text(), file.name, targetEnvId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read the merge file", "error");
    } finally {
      event.target.value = "";
    }
  };

  const applyImportPreview = async () => {
    if (!pendingImport || !activeWorkspaceId) return;
    if (pendingImport.workspaceId !== activeWorkspaceId) {
      toast("The active workspace changed; reopen the import preview", "error");
      setPendingImport(null);
      return;
    }
    const target = pendingImport.targetEnvId
      ? (environments as EnvironmentModel[]).find((environment) => environment.id === pendingImport.targetEnvId)
      : undefined;
    if (pendingImport.targetEnvId && !target) {
      toast("The target environment no longer exists", "error");
      setPendingImport(null);
      return;
    }
    const existingKeys = new Set((target?.variables || []).map((variable) => variable.key));
    const planned = planImportedVariables(
      pendingImport.variables,
      existingKeys,
      importConflictPolicy,
    );
    if (planned.length === 0) {
      toast("No variables will be imported with the selected conflict rule", "info");
      return;
    }

    let environmentId = target?.id;
    let createdEnvironment = false;
    let applied = 0;
    try {
      if (!environmentId) {
        const createResult = await bridge.createEnvironment({
          workspace_id: pendingImport.workspaceId,
          name: pendingImport.environmentName.trim(),
        });
        assertBridgeSuccess(createResult, "Could not create the imported environment");
        environmentId = (createResult as any)?.environment?.id;
        if (!environmentId) throw new Error("The new environment was not returned by the bridge");
        createdEnvironment = true;
      }

      for (const variable of planned) {
        const result = await bridge.setEnvironmentVariable({
          environment_id: environmentId,
          key: variable.key,
          value: variable.value,
          is_secret: Boolean(variable.is_secret),
          is_enabled: variable.is_enabled !== false,
        });
        assertBridgeSuccess(result, `Could not import "${variable.key}"`);
        setInitialValueForVar(
          environmentId,
          variable.key,
          variable.initial_value ?? variable.value,
        );
        applied += 1;
      }

      toast(
        `${target ? "Merged" : "Imported"} ${applied} variable${applied === 1 ? "" : "s"} ${target ? `into "${target.name}"` : `into "${pendingImport.environmentName}"`}`,
        "success",
      );
      setPendingImport(null);
      if (useAppStore.getState().activeWorkspaceId === pendingImport.workspaceId) {
        await load();
        if (createdEnvironment) setSelectedEnvironmentId(environmentId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      const partialMessage = applied > 0
        ? ` ${applied} of ${planned.length} variables were applied${createdEnvironment ? "; the partially imported environment was kept" : ""}.`
        : "";
      toast(`${message}.${partialMessage}`, "error");
      if (useAppStore.getState().activeWorkspaceId === pendingImport.workspaceId) {
        await load();
      }
    }
  };

  const performExport = async (request: PendingExport, includeSecrets: boolean) => {
    try {
      if (useAppStore.getState().activeWorkspaceId !== request.workspaceId) {
        throw new Error("The active workspace changed before export");
      }
      const hasSecrets = request.environment.variables.some((variable) => variable.is_secret);
      const initialValues = getInitialValuesMap(request.environment.id);
      const variables: EnvVarItem[] = [];

      for (const variable of request.environment.variables) {
        if (variable.is_secret && !includeSecrets) continue;

        let value = variable.value;
        if (variable.is_secret && includeSecrets) {
          const result = await bridge.getEnvironmentVariableSecret(
            request.environment.id,
            variable.id || variable.key,
          );
          assertBridgeSuccess(result, `Could not read secret "${variable.key}"`);
          value = result.value;
          if (!value) throw new Error(`Secret "${variable.key}" has no stored value`);
        }
        variables.push({ ...variable, value });
      }

      const exportEnv = { ...request.environment, variables };
      const content = request.format === "env"
        ? exportEnvironmentToEnv(exportEnv, request.useCurrent, initialValues)
        : exportEnvironmentToPostman(exportEnv, request.useCurrent, initialValues);
      const suffix = request.useCurrent ? "" : "_initial";
      const baseName = request.environment.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const filename = request.format === "env"
        ? `${baseName}${suffix}.env`
        : `${baseName}${suffix}.postman_environment.json`;

      if (request.destination === "clipboard") {
        await navigator.clipboard.writeText(content);
        toast(
          hasSecrets
            ? includeSecrets
              ? "Copied export including secret values"
              : "Copied export without secret variables"
            : "Copied environment export to clipboard",
          "success",
        );
        return;
      }

      try {
        const result = await bridge.saveFile(
          content,
          filename,
          request.format === "env" ? ["env", "txt"] : ["json"],
        );
        if (result?.status === "ok") {
          toast(
            hasSecrets
              ? `Exported "${filename}" ${includeSecrets ? "including secret values" : "without secret variables"}`
              : `Exported "${filename}"`,
            "success",
          );
          return;
        }
        if (result?.status === "cancelled") return;
      } catch {
        // Use the browser download when the native save dialog is unavailable.
      }

      downloadBlob(
        content,
        filename,
        request.format === "env" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8",
      );
      toast(
        hasSecrets
          ? `Exported "${filename}" ${includeSecrets ? "including secret values" : "without secret variables"}`
          : `Exported "${filename}"`,
        "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not export environment", "error");
    }
  };

  const requestExport = (request: Omit<PendingExport, "workspaceId">) => {
    const scopedRequest: PendingExport = {
      ...request,
      workspaceId: activeWorkspaceId || "",
    };
    if (scopedRequest.environment.variables.some((variable) => variable.is_secret)) {
      setIncludeExportSecrets(false);
      setPendingExport(scopedRequest);
      return;
    }
    void performExport(scopedRequest, false);
  };

  const pendingImportTarget = pendingImport?.targetEnvId
    ? (environments as EnvironmentModel[]).find((environment) => environment.id === pendingImport.targetEnvId)
    : undefined;
  const importExistingKeys = new Set((pendingImportTarget?.variables || []).map((variable) => variable.key));
  const importConflicts = pendingImport
    ? getImportConflictKeys(pendingImport.variables, importExistingKeys)
    : new Set<string>();
  const importDialog = pendingImport && pendingImport.workspaceId === activeWorkspaceId ? (
    <ImportPreviewDialog
      pending={pendingImport}
      existingKeys={importExistingKeys}
      conflicts={importConflicts}
      policy={importConflictPolicy}
      onPolicyChange={setImportConflictPolicy}
      onNameChange={(environmentName) =>
        setPendingImport((current) => current ? { ...current, environmentName } : current)
      }
      onClose={() => setPendingImport(null)}
      onApply={() => void applyImportPreview()}
    />
  ) : null;
  const exportDialog = pendingExport && pendingExport.workspaceId === activeWorkspaceId ? (
    <ExportSecretsDialog
      pending={pendingExport}
      includeSecrets={includeExportSecrets}
      onIncludeSecretsChange={setIncludeExportSecrets}
      onClose={() => setPendingExport(null)}
      onConfirm={() => {
        const request = pendingExport;
        const includeSecrets = includeExportSecrets;
        setPendingExport(null);
        void performExport(request, includeSecrets);
      }}
    />
  ) : null;

  // Open context menu
  const handleOpenEnvContextMenu = (e: React.MouseEvent, envId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSortMenuOpen(false);
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: "environment",
      envId,
    });
  };

  const handleOpenVarContextMenu = (e: React.MouseEvent, envId: string, varItem: EnvVarItem) => {
    e.preventDefault();
    e.stopPropagation();
    setSortMenuOpen(false);
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: "variable",
      envId,
      varItem,
    });
  };

  // Filtered and Sorted environments for sidebar list
  const filteredEnvs = useMemo(() => {
    let list = standardEnvs;
    if (envSearch.trim()) {
      const q = envSearch.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }

    const moodOrder = ["red", "amber", "green", "blue", "purple", "pink", "default"];

    return [...list].sort((a, b) => {
      if (sortOption === "name-asc") return a.name.localeCompare(b.name);
      if (sortOption === "name-desc") return b.name.localeCompare(a.name);
      if (sortOption === "vars-count") return (b.variables?.length || 0) - (a.variables?.length || 0);
      if (sortOption === "mood") {
        const ma = moodOrder.indexOf(envColors[a.id] || "default");
        const mb = moodOrder.indexOf(envColors[b.id] || "default");
        return ma - mb;
      }
      return 0;
    });
  }, [standardEnvs, envSearch, sortOption, envColors]);

  const ctxEnv = (environments as EnvironmentModel[]).find((e) => e.id === ctxMenu.envId);
  const closeContextMenu = () => setCtxMenu((current) => ({ ...current, visible: false }));
  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(successMessage, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not copy to clipboard", "error");
    }
  };
  const contextMenuItems: ContextMenuItem[] = (() => {
    if (!ctxMenu.visible) return [];

    if (ctxMenu.type === "environment" && ctxEnv) {
      const items: ContextMenuItem[] = [
        { label: ctxEnv.name, disabled: true },
      ];
      if (ctxEnv.name.toLowerCase() !== "globals") {
        items.push(
          {
            label: "Rename Environment",
            icon: <Edit2 size={12} />,
            onSelect: () => {
              setEditingEnvId(ctxEnv.id);
              setEditingEnvNameDraft(ctxEnv.name);
            },
          },
          ...(activeEnvironmentId !== ctxEnv.id
            ? [{
                label: "Set as Active",
                icon: <Check size={12} />,
                onSelect: () => void handleSetActive(ctxEnv.id),
              }]
            : []),
          {
            label: "Duplicate Environment",
            icon: <Copy size={12} />,
            onSelect: () => void handleDuplicateEnv(ctxEnv.id),
          },
          {
            label: "Merge .env into Environment…",
            icon: <FilePlus size={12} />,
            onSelect: () => void handlePickMergeFile(ctxEnv.id),
          },
          {
            label: "Environment Mood",
            icon: <Palette size={12} />,
            children: Object.values(ENVIRONMENT_MOODS).map((mood) => ({
              label: `${mood.badge}  ${mood.desc}`,
              icon: <span className="h-2 w-2 rounded-full" style={{ background: mood.color }} />,
              onSelect: () => {
                setEnvColor(ctxEnv.id, mood.id);
                toast(`Set mood to "${mood.label}"`, "success");
              },
            })),
          },
          { label: "", separator: true },
        );
      }

      items.push(
        {
          label: "Copy as .env",
          icon: <FileText size={12} />,
          onSelect: () => requestExport({
            environment: ctxEnv,
            format: "env",
            useCurrent: true,
            destination: "clipboard",
          }),
        },
        {
          label: "Copy as Postman JSON",
          icon: <FileCode size={12} />,
          onSelect: () => requestExport({
            environment: ctxEnv,
            format: "postman",
            useCurrent: true,
            destination: "clipboard",
          }),
        },
        { label: "", separator: true },
        {
          label: "Reset All to Initial Values",
          icon: <RotateCcw size={12} />,
          onSelect: async () => {
            if (ctxEnv.variables.length === 0) {
              toast("No variables to reset", "info");
              return;
            }
            if (!confirm(`Reset all variables in "${ctxEnv.name}" to their initial values?`)) return;
            try {
              const initialValues = getInitialValuesMap(ctxEnv.id);
              for (const variable of ctxEnv.variables) {
                let value = initialValues[variable.key] ?? variable.initial_value ?? variable.value;
                if (variable.is_secret && !value) {
                  const secret = await bridge.getEnvironmentVariableSecret(
                    ctxEnv.id,
                    variable.id || variable.key,
                  );
                  assertBridgeSuccess(secret, `Could not read secret "${variable.key}"`);
                  value = secret.value;
                }
                const result = await bridge.setEnvironmentVariable({
                  environment_id: ctxEnv.id,
                  key: variable.key,
                  value,
                  is_secret: variable.is_secret,
                  is_enabled: variable.is_enabled !== false,
                });
                assertBridgeSuccess(result, `Could not reset "${variable.key}"`);
              }
              toast(`Reset all variables in "${ctxEnv.name}"`, "success");
              await load();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not reset variables", "error");
            }
          },
        },
        {
          label: "Clear All Variables",
          icon: <RotateCcw size={12} />,
          onSelect: () => void handleClearVariables(ctxEnv.id),
        },
      );

      if (ctxEnv.name.toLowerCase() !== "globals") {
        items.push({
          label: "Delete Environment",
          icon: <Trash2 size={12} />,
          danger: true,
          onSelect: () => void handleDeleteEnv(ctxEnv.id),
        });
      }
      return items;
    }

    if (ctxMenu.type === "variable" && ctxMenu.varItem && ctxMenu.envId) {
      const variable = ctxMenu.varItem;
      const envId = ctxMenu.envId;
      return [
        { label: `{{${variable.key}}}`, disabled: true },
        {
          label: "Copy Variable Tag",
          icon: <Copy size={12} />,
          onSelect: () => void copyToClipboard(`{{${variable.key}}}`, `Copied {{${variable.key}}}`),
        },
        {
          label: "Copy Current Value",
          icon: <Clipboard size={12} />,
          onSelect: async () => {
            try {
              let value = variable.value;
              if (variable.is_secret) {
                const secret = await bridge.getEnvironmentVariableSecret(envId, variable.id || variable.key);
                assertBridgeSuccess(secret, `Could not read secret "${variable.key}"`);
                value = secret.value;
              }
              await copyToClipboard(value, `Copied current value of "${variable.key}"`);
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not copy variable value", "error");
            }
          },
        },
        {
          label: "Copy Initial Value",
          icon: <Clipboard size={12} />,
          onSelect: () => {
            const initialValues = getInitialValuesMap(envId);
            void copyToClipboard(
              initialValues[variable.key] ?? variable.initial_value ?? variable.value ?? "",
              `Copied initial value of "${variable.key}"`,
            );
          },
        },
        {
          label: "Reset to Initial Value",
          icon: <RotateCcw size={12} />,
          onSelect: async () => {
            try {
              const initialValues = getInitialValuesMap(envId);
              let value = initialValues[variable.key] ?? variable.initial_value ?? variable.value;
              if (variable.is_secret && !value) {
                const secret = await bridge.getEnvironmentVariableSecret(envId, variable.id || variable.key);
                assertBridgeSuccess(secret, `Could not read secret "${variable.key}"`);
                value = secret.value;
              }
              const result = await bridge.setEnvironmentVariable({
                environment_id: envId,
                key: variable.key,
                value,
                is_secret: variable.is_secret,
                is_enabled: variable.is_enabled !== false,
              });
              assertBridgeSuccess(result, `Could not reset "${variable.key}"`);
              toast(`Reset "${variable.key}" to its initial value`, "success");
              await load();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not reset variable", "error");
            }
          },
        },
        { label: "", separator: true },
        {
          label: variable.is_secret ? "Convert to Plain Text" : "Convert to Secret",
          icon: <Lock size={12} />,
          onSelect: async () => {
            try {
              let value = variable.value;
              if (variable.is_secret) {
                const secret = await bridge.getEnvironmentVariableSecret(envId, variable.id || variable.key);
                assertBridgeSuccess(secret, `Could not read secret "${variable.key}"`);
                value = secret.value;
              }
              if (!value) {
                toast("A non-empty value is required to make a variable secret", "error");
                return;
              }
              const result = await bridge.setEnvironmentVariable({
                environment_id: envId,
                key: variable.key,
                value,
                is_secret: !variable.is_secret,
                is_enabled: variable.is_enabled !== false,
              });
              assertBridgeSuccess(result, `Could not update "${variable.key}"`);
              toast(`Updated "${variable.key}"`, "success");
              await load();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not update variable", "error");
            }
          },
        },
        {
          label: variable.is_enabled === false ? "Enable Variable" : "Disable Variable",
          icon: <Check size={12} />,
          onSelect: async () => {
            try {
              const result = await bridge.setEnvironmentVariable({
                environment_id: envId,
                key: variable.key,
                value: variable.value,
                is_secret: variable.is_secret,
                is_enabled: variable.is_enabled === false,
              });
              assertBridgeSuccess(result, `Could not update "${variable.key}"`);
              toast(variable.is_enabled === false ? "Enabled variable" : "Disabled variable", "success");
              await load();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not update variable", "error");
            }
          },
        },
        {
          label: "Delete Variable",
          icon: <Trash2 size={12} />,
          danger: true,
          onSelect: async () => {
            try {
              const result = await bridge.deleteEnvironmentVariable(envId, variable.id || variable.key);
              assertBridgeSuccess(result, `Could not delete "${variable.key}"`);
              toast(`Deleted "${variable.key}"`, "success");
              await load();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not delete variable", "error");
            }
          },
        },
      ];
    }
    return [];
  })();

  // ── 1. SIDEBAR VIEW ────────────────────────────────────────────────────────
  if (sidebar) {
    return (
      <div className="flex flex-col h-full overflow-hidden select-none">
        <input
          ref={fileInputRef}
          type="file"
          accept=".env,.json,.txt"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <input
          ref={mergeFileInputRef}
          type="file"
          accept=".env,.json,.txt"
          className="hidden"
          onChange={handleMergeFileInputChange}
        />

        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-dim)] shrink-0 bg-[var(--bg-s1)]">
          <div className="flex items-center gap-1.5">
            <Layers size={13} className="text-[var(--lime)]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-2)]">
              Environments
            </span>
            <span className="text-[10px] text-[var(--tx-3)] font-mono">({standardEnvs.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleImportFile}
              title="Import environment (.env or JSON)"
              className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] rounded hover:bg-[var(--bg-s3)] transition-colors"
            >
              <Upload size={13} />
            </button>
            <button
              onClick={() => handleCreateEnv("New Environment")}
              title="New Environment"
              className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] rounded hover:bg-[var(--bg-s3)] transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Global Variables Tab (Pinned at Top) */}
        {globalsEnv && (
          <div
            onClick={() => setSelectedEnvironmentId(globalsEnv.id)}
            onContextMenu={(e) => handleOpenEnvContextMenu(e, globalsEnv.id)}
            className={cn(
              "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-b border-[var(--border-dim)] text-xs",
              selectedEnvironmentId === globalsEnv.id
                ? "bg-[var(--bg-s3)] text-cyan-400 font-semibold"
                : "text-[var(--tx-2)] hover:bg-[var(--bg-hover)]",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Globe size={13} className="text-cyan-400 shrink-0" />
              <span className="truncate">Global Variables</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-cyan-500/10 text-cyan-400 shrink-0">
              {globalsEnv.variables?.length || 0}
            </span>
          </div>
        )}

        {/* Filter & Sort Bar */}
        <div className="p-1.5 border-b border-[var(--border-dim)] bg-[var(--bg-base)] flex items-center gap-1">
          <div className="relative flex items-center flex-1">
            <Search size={11} className="absolute left-2 text-[var(--tx-3)] pointer-events-none" />
            <input
              type="text"
              placeholder="Filter..."
              value={envSearch}
              onChange={(e) => setEnvSearch(e.target.value)}
              className="w-full bg-[var(--bg-s2)] text-[var(--tx-1)] text-xs pl-6 pr-2 py-1 rounded-[var(--r-sm)] border border-[var(--border)] outline-none focus:border-[var(--lime)] transition-colors"
            />
            {envSearch && (
              <button
                onClick={() => setEnvSearch("")}
                className="absolute right-1.5 text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                <X size={10} />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              title="Sort Environments"
              className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s3)] border border-[var(--border)]"
            >
              <ArrowUpDown size={12} />
            </button>
            {sortMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-36 bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-md)] shadow-xl py-1 z-50 text-[11px]"
                onMouseLeave={() => setSortMenuOpen(false)}
              >
                <div className="px-2.5 py-0.5 text-[9px] uppercase font-bold text-[var(--tx-3)] tracking-wider">
                  Sort By
                </div>
                {[
                  { id: "name-asc", label: "Name (A-Z)" },
                  { id: "name-desc", label: "Name (Z-A)" },
                  { id: "mood", label: "Mood / Status" },
                  { id: "vars-count", label: "Variables Count" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSortOption(s.id as SortOption);
                      setSortMenuOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between w-full px-2.5 py-1 text-left hover:bg-[var(--bg-hover)]",
                      sortOption === s.id && "text-[var(--lime)] font-semibold",
                    )}
                  >
                    <span>{s.label}</span>
                    {sortOption === s.id && <Check size={11} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Environment List */}
        <div className="flex-1 overflow-auto py-1">
          {loadError ? (
            <div className="m-3 rounded-[var(--r-md)] border border-[var(--err)]/30 bg-[var(--err)]/5 p-3 text-center">
              <p className="text-xs text-[var(--err)]">{loadError}</p>
              <button
                onClick={() => void load()}
                className="mt-2 text-[11px] text-[var(--tx-2)] hover:text-[var(--lime)]"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="text-xs text-[var(--tx-3)] p-3 text-center">Loading environments…</div>
          ) : filteredEnvs.length === 0 ? (
            <div className="text-xs text-[var(--tx-3)] p-4 text-center">
              {envSearch ? "No matching environments" : "No environments created yet"}
            </div>
          ) : (
            filteredEnvs.map((env) => {
              const isSelected = selectedEnvironmentId === env.id;
              const isActive = activeEnvironmentId === env.id;
              const varCount = env.variables?.length || 0;
              const mood: EnvironmentMood = ENVIRONMENT_MOODS[envColors[env.id]] || ENVIRONMENT_MOODS.default;

              return (
                <div
                  key={env.id}
                  onClick={() => setSelectedEnvironmentId(env.id)}
                  onContextMenu={(e) => handleOpenEnvContextMenu(e, env.id)}
                  onDoubleClick={() => {
                    setEditingEnvId(env.id);
                    setEditingEnvNameDraft(env.name);
                  }}
                  className={cn(
                    "group flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors text-xs",
                    isSelected
                      ? "bg-[var(--bg-s3)] text-[var(--tx-1)] font-medium"
                      : "text-[var(--tx-2)] hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                    <span
                      title={isActive ? `Active Environment (${mood.desc})` : mood.desc}
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0 transition-transform",
                        isActive && "shadow-[0_0_6px]",
                      )}
                      style={{
                        background: mood.color,
                        boxShadow: isActive ? `0 0 6px ${mood.color}` : undefined,
                      }}
                    />

                    {editingEnvId === env.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingEnvNameDraft}
                        onChange={(e) => setEditingEnvNameDraft(e.target.value)}
                        onBlur={() => handleRenameEnv(env.id, editingEnvNameDraft)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameEnv(env.id, editingEnvNameDraft);
                          if (e.key === "Escape") setEditingEnvId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[var(--bg-s1)] text-[var(--tx-1)] text-xs px-1 py-0.5 rounded border border-[var(--lime)] outline-none w-full font-sans"
                      />
                    ) : (
                      <span className="truncate">{env.name}</span>
                    )}

                    {/* Mood Badge */}
                    {mood.id !== "default" && (
                      <span
                        className="text-[8px] font-bold px-1 py-0.2 rounded font-mono uppercase shrink-0"
                        style={{
                          background: mood.bg,
                          color: mood.text,
                          border: `1px solid ${mood.border}`,
                        }}
                      >
                        {mood.badge}
                      </span>
                    )}

                    <span className="text-[10px] text-[var(--tx-3)] font-mono shrink-0 ml-auto mr-1">
                      {varCount}
                    </span>
                  </div>

                  {/* Hover Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEnvId(env.id);
                        setEditingEnvNameDraft(env.name);
                      }}
                      title="Rename Environment"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s4)]"
                    >
                      <Edit2 size={11} />
                    </button>
                    {!isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetActive(env.id);
                        }}
                        title="Set Active"
                        className="p-1 text-[var(--tx-3)] hover:text-[var(--ok)] rounded hover:bg-[var(--bg-s4)]"
                      >
                        <Check size={11} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateEnv(env.id);
                      }}
                      title="Duplicate"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s4)]"
                    >
                      <Copy size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEnv(env.id);
                      }}
                      title="Delete"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] rounded hover:bg-[var(--bg-s4)]"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {ctxMenu.visible && ctxMenu.type === "environment" && contextMenuItems.length > 0 && (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={contextMenuItems}
            onClose={closeContextMenu}
          />
        )}
        {importDialog}
        {exportDialog}
      </div>
    );
  }

  // ── 2. MAIN WORKBENCH FULL VIEW ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-base)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".env,.json,.txt"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={mergeFileInputRef}
        type="file"
        accept=".env,.json,.txt"
        className="hidden"
        onChange={handleMergeFileInputChange}
      />

      {!selectedEnv && (loading || loadError) ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-s2)]",
            loadError ? "text-[var(--err)]" : "text-[var(--lime)]",
          )}>
            {loadError ? <AlertTriangle size={22} /> : <Layers size={22} className="animate-pulse" />}
          </div>
          <div className="max-w-sm">
            <h3 className="text-sm font-semibold text-[var(--tx-1)]">
              {loadError ? "Could not load environments" : "Loading environments"}
            </h3>
            <p className="mt-1 text-xs text-[var(--tx-3)]">
              {loadError || "Fetching environments for the active workspace…"}
            </p>
          </div>
          {loadError && (
            <button
              onClick={() => void load()}
              className="rounded-[var(--r-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--tx-2)] hover:border-[var(--lime)] hover:text-[var(--lime)]"
            >
              Retry
            </button>
          )}
        </div>
      ) : selectedEnv ? (
        <EnvironmentDetail
          env={selectedEnv}
          isGlobal={selectedEnv.name.toLowerCase() === "globals"}
          isActive={activeEnvironmentId === selectedEnv.id}
          colorTag={envColors[selectedEnv.id] || "default"}
          onSetColor={(c) => setEnvColor(selectedEnv.id, c)}
          onUpdateName={async (newName) => {
            await handleRenameEnv(selectedEnv.id, newName);
          }}
          onSetActive={() => handleSetActive(selectedEnv.id)}
          onDuplicate={() => handleDuplicateEnv(selectedEnv.id)}
          onDelete={() => handleDeleteEnv(selectedEnv.id)}
          onClearVariables={() => handleClearVariables(selectedEnv.id)}
          onMergeEnv={() => handlePickMergeFile(selectedEnv.id)}
          onRequestExport={(format, useCurrent, destination) =>
            requestExport({
              environment: selectedEnv,
              format,
              useCurrent,
              destination,
            })
          }
          onRefresh={load}
          onOpenVarContextMenu={handleOpenVarContextMenu}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3 select-none">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-s2)] border border-[var(--border)] flex items-center justify-center text-[var(--lime)]">
            <Layers size={24} />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            {loadError && (
              <div role="alert" className="mb-2 rounded border border-[var(--err)]/30 bg-[var(--err)]/5 p-3">
                <p className="text-xs text-[var(--err)]">{loadError}</p>
                <button
                  onClick={() => void load()}
                  className="mt-2 text-[11px] text-[var(--tx-2)] hover:text-[var(--lime)]"
                >
                  Retry
                </button>
              </div>
            )}
            <h3 className="text-sm font-semibold text-[var(--tx-1)]">
              {(environments as EnvironmentModel[]).length === 0 ? "No Environments Yet" : "No Environment Selected"}
            </h3>
            <p className="text-xs text-[var(--tx-3)]">
              Manage variables for different environments like Local, Staging, or Production to use
              with <code className="text-[var(--amber)] font-mono">{"{{variable_name}}"}</code> or
              dynamic variables like <code className="text-purple-400 font-mono">{"{{$guid}}"}</code> in
              your requests.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => handleCreateEnv("Development")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus size={13} /> Create Environment
            </button>
            <button
              onClick={handleImportFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-md)] bg-[var(--bg-s3)] text-[var(--tx-1)] border border-[var(--border)] text-xs font-medium hover:bg-[var(--bg-s4)] transition-colors"
            >
              <Upload size={13} /> Import .env or JSON
            </button>
          </div>
        </div>
      )}

      {ctxMenu.visible && ctxMenu.type === "variable" && contextMenuItems.length > 0 && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
      {importDialog}
      {exportDialog}
    </div>
  );
}

function ImportPreviewDialog({
  pending,
  existingKeys,
  conflicts,
  policy,
  onPolicyChange,
  onNameChange,
  onClose,
  onApply,
}: {
  pending: PendingImport;
  existingKeys: Set<string>;
  conflicts: Set<string>;
  policy: ImportConflictPolicy;
  onPolicyChange: (policy: ImportConflictPolicy) => void;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const seen = new Set<string>();
  const conflictCount = conflicts.size;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="environment-import-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-s2)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Upload size={15} className="text-[var(--lime)]" />
            <div>
              <h2 id="environment-import-title" className="text-sm font-semibold text-[var(--tx-1)]">
                {pending.targetEnvId ? "Review Environment Merge" : "Review Environment Import"}
              </h2>
              <p className="text-[10px] text-[var(--tx-3)]">
                {pending.variables.length} variables · {conflictCount} conflicting keys
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--tx-3)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)]">
            <X size={14} />
          </button>
        </header>

        <div className="flex flex-col gap-3 overflow-hidden p-4">
          {!pending.targetEnvId && (
            <label className="flex flex-col gap-1 text-[10px] font-medium text-[var(--tx-2)]">
              Environment name
              <input
                autoFocus
                value={pending.environmentName}
                onChange={(event) => onNameChange(event.target.value)}
                className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s3)] px-2.5 py-1.5 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)]"
              />
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-dim)] bg-[var(--bg-s1)] p-2.5">
            <div className="text-[10px] text-[var(--tx-2)]">
              <span className="font-semibold text-[var(--tx-1)]">When keys conflict</span>
              <span className="ml-1 text-[var(--tx-3)]">— applies to existing and duplicate input keys</span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <label className="flex cursor-pointer items-center gap-1.5 text-[var(--tx-2)]">
                <input
                  type="radio"
                  name="environment-import-conflict-policy"
                  checked={policy === "skip"}
                  onChange={() => onPolicyChange("skip")}
                  className="accent-[var(--lime)]"
                />
                Skip conflicts
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[var(--tx-2)]">
                <input
                  type="radio"
                  name="environment-import-conflict-policy"
                  checked={policy === "overwrite"}
                  onChange={() => onPolicyChange("overwrite")}
                  className="accent-[var(--lime)]"
                />
                Overwrite conflicts
              </label>
            </div>
          </div>

          <div className="overflow-auto rounded-[var(--r-md)] border border-[var(--border-dim)]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[var(--bg-s3)] text-[10px] uppercase tracking-wide text-[var(--tx-3)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Incoming value</th>
                  <th className="px-3 py-2 text-right font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {pending.variables.map((variable, index) => {
                  const duplicateInput = seen.has(variable.key);
                  seen.add(variable.key);
                  const conflict = existingKeys.has(variable.key) || duplicateInput;
                  const willSkip = policy === "skip" && conflict;
                  return (
                    <tr key={`${variable.key}-${index}`} className="border-t border-[var(--border-dim)]">
                      <td className="max-w-48 truncate px-3 py-2 font-mono text-[var(--lime)]">
                        {variable.key}
                      </td>
                      <td className="max-w-64 truncate px-3 py-2 font-mono text-[var(--tx-2)]">
                        {variable.is_secret ? "••••••••" : (variable.value || <span className="text-[var(--tx-3)]">empty</span>)}
                      </td>
                      <td className={cn(
                        "px-3 py-2 text-right text-[10px]",
                        willSkip ? "text-[var(--amber)]" : conflict ? "text-cyan-400" : "text-[var(--ok)]",
                      )}>
                        {willSkip ? "Skip" : conflict ? "Overwrite" : "Add"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-3">
          <p className="text-[10px] text-[var(--tx-3)]">
            Secret values are masked in this preview.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-[var(--r-sm)] px-3 py-1.5 text-xs text-[var(--tx-2)] hover:bg-[var(--bg-s3)]">
              Cancel
            </button>
            <button
              onClick={onApply}
              disabled={!pending.targetEnvId && !pending.environmentName.trim()}
              className="rounded-[var(--r-sm)] bg-[var(--lime)] px-3 py-1.5 text-xs font-semibold text-[var(--tx-inv)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending.targetEnvId ? "Apply Merge" : "Create Environment"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ExportSecretsDialog({
  pending,
  includeSecrets,
  onIncludeSecretsChange,
  onClose,
  onConfirm,
}: {
  pending: PendingExport;
  includeSecrets: boolean;
  onIncludeSecretsChange: (include: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const secretCount = pending.environment.variables.filter((variable) => variable.is_secret).length;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="environment-export-title"
        className="w-full max-w-md rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-s2)] shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-3">
          <ShieldAlert size={16} className="text-[var(--amber)]" />
          <h2 id="environment-export-title" className="text-sm font-semibold text-[var(--tx-1)]">
            Export secret variables?
          </h2>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs leading-relaxed text-[var(--tx-2)]">
            This environment contains {secretCount} secret variable{secretCount === 1 ? "" : "s"}.
            Exporting them writes their values in plain text to the file or clipboard.
          </p>
          <label className="flex cursor-pointer items-start gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-s3)] p-3">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(event) => onIncludeSecretsChange(event.target.checked)}
              className="mt-0.5 accent-[var(--lime)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-[var(--tx-1)]">Include secret values</span>
              <span className="text-[10px] text-[var(--tx-3)]">
                {includeSecrets
                  ? "Anyone with the exported content can read these values."
                  : "Secret variables will be omitted from the export."}
              </span>
            </span>
          </label>
          {includeSecrets && (
            <div className="flex items-start gap-2 text-[10px] text-[var(--amber)]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Review the destination before continuing. Secret values are not encrypted in exported files.</span>
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-3">
          <button onClick={onClose} className="rounded-[var(--r-sm)] px-3 py-1.5 text-xs text-[var(--tx-2)] hover:bg-[var(--bg-s3)]">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-[var(--r-sm)] bg-[var(--lime)] px-3 py-1.5 text-xs font-semibold text-[var(--tx-inv)] hover:opacity-90">
            {includeSecrets ? "Include & Continue" : "Continue without secrets"}
          </button>
        </footer>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detailed Environment Editor (Workbench Main Area with Initial vs Current Value)
// ─────────────────────────────────────────────────────────────────────────────
function EnvironmentDetail({
  env,
  isGlobal,
  isActive,
  colorTag,
  onSetColor,
  onUpdateName,
  onSetActive,
  onDuplicate,
  onDelete,
  onClearVariables,
  onMergeEnv,
  onRequestExport,
  onRefresh,
  onOpenVarContextMenu,
}: {
  env: EnvironmentModel;
  isGlobal: boolean;
  isActive: boolean;
  colorTag: string;
  onSetColor: (c: string) => void;
  onUpdateName: (name: string) => Promise<void>;
  onSetActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClearVariables: () => void;
  onMergeEnv: () => void;
  onRequestExport: (
    format: ExportFormat,
    useCurrent: boolean,
    destination: ExportDestination,
  ) => void;
  onRefresh: () => void;
  onOpenVarContextMenu: (e: React.MouseEvent, envId: string, varItem: EnvVarItem) => void;
}) {
  const { toast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(env.name);
  const [mode, setMode] = useState<"table" | "bulk">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [showDynamicHelp, setShowDynamicHelp] = useState(false);

  // Keep nameDraft in sync when selected env changes
  useEffect(() => {
    setNameDraft(env.name);
    setEditingName(false);
    setBulkText(exportEnvironmentToEnv(env));
  }, [env.id, env.name]); // eslint-disable-line

  const handleSaveName = async () => {
    if (nameDraft.trim() && nameDraft.trim() !== env.name) {
      await onUpdateName(nameDraft.trim());
    }
    setEditingName(false);
  };

  // Switch to bulk edit mode
  const handleOpenBulkEdit = () => {
    setBulkText(exportEnvironmentToEnv(env));
    setMode("bulk");
  };

  // Apply bulk text changes
  const handleApplyBulk = async () => {
    try {
      const parsed = parseEnvText(bulkText);
      const parsedKeys = new Set(parsed.map((p) => p.key));

      // Remove deleted
      for (const oldVar of env.variables) {
        if (!parsedKeys.has(oldVar.key)) {
          await bridge.deleteEnvironmentVariable(env.id, oldVar.id || oldVar.key);
        }
      }

      // Set new / updated
      for (const item of parsed) {
        const old = env.variables.find((v) => v.key === item.key);
        await bridge.setEnvironmentVariable({
          environment_id: env.id,
          key: item.key,
          value: item.value,
          is_secret: old?.is_secret ?? false,
          is_enabled: item.is_enabled,
        });
      }

      toast(`Saved ${parsed.length} variables`, "success");
      setMode("table");
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to save bulk variables", "error");
    }
  };

  // Stats calculation
  const totalCount = env.variables.length;
  const enabledCount = env.variables.filter((v) => v.is_enabled !== false).length;
  const secretCount = env.variables.filter((v) => v.is_secret).length;
  const currentMood: EnvironmentMood = ENVIRONMENT_MOODS[colorTag] || ENVIRONMENT_MOODS.default;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0 gap-3">
        {/* Left: Editable Name & Active Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mood / Color Tag Indicator Button */}
          {!isGlobal && (
            <div className="relative">
              <button
                onClick={() => setColorPickerOpen((v) => !v)}
                title="Change Environment Mood & Color"
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--r-sm)] border hover:opacity-85 transition-opacity"
                style={{
                  background: currentMood.bg,
                  borderColor: currentMood.border,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: currentMood.color }}
                />
                <span
                  className="text-[9px] font-bold font-mono uppercase"
                  style={{ color: currentMood.text }}
                >
                  {currentMood.badge}
                </span>
                <ChevronDown size={10} style={{ color: currentMood.text }} />
              </button>

              {colorPickerOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 z-50 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-md)] shadow-2xl flex flex-col w-56 text-xs animate-in fade-in zoom-in-95 duration-100"
                  onMouseLeave={() => setColorPickerOpen(false)}
                >
                  <div className="px-3 py-1 text-[9px] uppercase font-bold text-[var(--tx-3)] tracking-wider border-b border-[var(--border-dim)]">
                    Environment Mood
                  </div>
                  {Object.values(ENVIRONMENT_MOODS).map((m) => {
                    const isSelected = colorTag === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSetColor(m.id);
                          setColorPickerOpen(false);
                          toast(`Set mood to "${m.label}"`, "success");
                        }}
                        className={cn(
                          "flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors",
                          isSelected && "bg-[var(--bg-s3)] font-semibold text-[var(--tx-1)]",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: m.color }}
                          />
                          <span
                            className="text-[9px] font-bold px-1 py-0.2 rounded font-mono uppercase"
                            style={{
                              background: m.bg,
                              color: m.text,
                              border: `1px solid ${m.border}`,
                            }}
                          >
                            {m.badge}
                          </span>
                          <span className="text-[11px] text-[var(--tx-2)] truncate">{m.desc}</span>
                        </div>
                        {isSelected && <Check size={11} className="text-[var(--lime)] ml-1 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isGlobal && (
            <Globe size={16} className="text-cyan-400 shrink-0" />
          )}

          {editingName && !isGlobal ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="bg-[var(--bg-s3)] text-[var(--tx-1)] font-semibold text-sm px-2 py-0.5 rounded-[var(--r-sm)] border border-[var(--lime)] outline-none"
              />
              <button
                onClick={handleSaveName}
                className="p-1 text-[var(--ok)] hover:bg-[var(--bg-s3)] rounded"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="p-1 text-[var(--tx-3)] hover:bg-[var(--bg-s3)] rounded"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group min-w-0">
              <h2
                onDoubleClick={() => !isGlobal && setEditingName(true)}
                title={isGlobal ? "Global Variables" : "Double-click to rename"}
                className="text-sm font-semibold text-[var(--tx-1)] truncate cursor-pointer"
              >
                {isGlobal ? "Global Variables" : env.name}
              </h2>
              {!isGlobal && (
                <button
                  onClick={() => setEditingName(true)}
                  title="Rename environment"
                  className="text-[var(--tx-3)] hover:text-[var(--tx-1)] opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                >
                  <Edit2 size={12} />
                </button>
              )}
            </div>
          )}

          {/* Active Status Badge / Toggle */}
          {!isGlobal && (
            isActive ? (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border select-none"
                style={{
                  background: currentMood.bg,
                  color: currentMood.text,
                  borderColor: currentMood.border,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: currentMood.color }} />
                <span>Active ({currentMood.badge})</span>
              </span>
            ) : (
              <button
                onClick={onSetActive}
                className="flex items-center gap-1 text-[10px] text-[var(--tx-3)] hover:text-[var(--lime)] border border-[var(--border)] hover:border-[var(--lime)] px-2 py-0.5 rounded-[var(--r-sm)] transition-colors select-none"
              >
                <Check size={11} /> Set Active
              </button>
            )
          )}

          {isGlobal && (
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[10px] font-semibold select-none">
              Always Active (Workspace-wide)
            </span>
          )}

          {/* Stats Badges */}
          <span className="text-[10px] text-[var(--tx-3)] font-mono border-l border-[var(--border-dim)] pl-3 hidden sm:inline-block">
            {totalCount} vars · {enabledCount} enabled
            {secretCount > 0 ? ` · ${secretCount} secrets` : ""}
          </span>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Dynamic Variables helper button */}
          <button
            onClick={() => setShowDynamicHelp((v) => !v)}
            title="Dynamic Faker Variables ({{$guid}}, {{$timestamp}}, etc.)"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-[var(--r-sm)] text-purple-300 border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
          >
            <Sparkles size={11} />
            <span className="hidden sm:inline">Dynamic 🎲</span>
          </button>

          {/* Search (Table mode only) */}
          {mode === "table" && totalCount > 2 && (
            <div className="relative flex items-center">
              <Search size={11} className="absolute left-2 text-[var(--tx-3)] pointer-events-none" />
              <input
                type="text"
                placeholder="Filter variables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-s2)] text-[var(--tx-1)] text-xs pl-6 pr-2 py-1 rounded-[var(--r-sm)] border border-[var(--border)] outline-none focus:border-[var(--lime)] w-32 sm:w-44 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-[var(--r-sm)] bg-[var(--bg-s3)] border border-[var(--border)] text-xs">
            <button
              onClick={() => setMode("table")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-[var(--r-xs)] transition-colors",
                mode === "table"
                  ? "bg-[var(--bg-s5)] text-[var(--tx-1)] font-medium shadow-xs"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              <TableIcon size={12} /> Table
            </button>
            <button
              onClick={handleOpenBulkEdit}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-[var(--r-xs)] transition-colors",
                mode === "bulk"
                  ? "bg-[var(--bg-s5)] text-[var(--tx-1)] font-medium shadow-xs"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              <FileText size={12} /> Bulk Edit (.env)
            </button>
          </div>

          {/* Merge .env Button */}
          <button
            onClick={onMergeEnv}
            title="Merge / Append variables from .env file into this environment"
            className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-400 border border-cyan-500/30 rounded-[var(--r-sm)] hover:bg-cyan-500/10 transition-colors"
          >
            <FilePlus size={12} />
            <span className="hidden sm:inline">Merge .env</span>
          </button>

          {/* Duplicate Button */}
          {!isGlobal && (
            <button
              onClick={onDuplicate}
              title="Duplicate Environment"
              className="p-1.5 text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] rounded-[var(--r-sm)] transition-colors"
            >
              <Copy size={13} />
            </button>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              title="Export / Copy Environment"
              className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] rounded-[var(--r-sm)] border border-[var(--border)] transition-colors"
            >
              <Download size={12} />
              <span>Export</span>
              <ChevronDown size={10} />
            </button>

            {exportOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-md)] shadow-xl py-1 z-50 text-xs"
                onMouseLeave={() => setExportOpen(false)}
              >
                <div className="px-3 py-1 text-[9px] uppercase font-bold text-[var(--tx-3)] tracking-wider">
                  Download Files
                </div>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("env", true, "download");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <FileText size={12} className="text-[var(--lime)]" />
                  <span>Download .env (Current Values)</span>
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("env", false, "download");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <FileText size={12} className="text-cyan-400" />
                  <span>Download .env (Initial Values)</span>
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("postman", true, "download");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <Layers size={12} className="text-[var(--amber)]" />
                  <span>Download Postman JSON (Current)</span>
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("postman", false, "download");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <Layers size={12} className="text-cyan-400" />
                  <span>Download Postman JSON (Initial)</span>
                </button>

                <div className="my-1 border-b border-[var(--border-dim)]" />
                <div className="px-3 py-1 text-[9px] uppercase font-bold text-[var(--tx-3)] tracking-wider">
                  Copy to Clipboard
                </div>

                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("env", true, "clipboard");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <Clipboard size={12} />
                  <span>Copy as .env format</span>
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("postman", true, "clipboard");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <FileCode size={12} />
                  <span>Copy JSON (Current Values)</span>
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onRequestExport("postman", false, "clipboard");
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <FileCode size={12} />
                  <span>Copy JSON (Initial Values)</span>
                </button>

                <div className="my-1 border-b border-[var(--border-dim)]" />

                <button
                  onClick={() => {
                    setExportOpen(false);
                    onClearVariables();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[var(--amber)] hover:bg-[var(--bg-hover)] text-left"
                >
                  <RotateCcw size={12} />
                  <span>Clear All Variables</span>
                </button>
                {secretCount > 0 && (
                  <div className="flex items-start gap-1.5 px-3 py-2 text-[10px] text-[var(--amber)] border-t border-[var(--border-dim)]">
                    <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                    <span>Secret variables are excluded by default.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Delete Environment */}
          {!isGlobal && (
            <button
              onClick={onDelete}
              title="Delete Environment"
              className="p-1.5 text-[var(--tx-3)] hover:text-[var(--err)] hover:bg-[var(--bg-s3)] rounded-[var(--r-sm)] transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Variables Guide Banner */}
      {showDynamicHelp && (
        <div className="p-3 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] flex flex-col gap-2 animate-in fade-in duration-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
              <Sparkles size={13} />
              <span>Dynamic Faker Variables (Available in any URL, Header, or Body)</span>
            </div>
            <button onClick={() => setShowDynamicHelp(false)} className="text-[var(--tx-3)] hover:text-[var(--tx-1)]">
              <X size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DYNAMIC_VARIABLES.map((d) => (
              <div
                key={d.key}
                onClick={() => {
                  navigator.clipboard.writeText(`{{${d.key}}}`);
                  toast(`Copied {{${d.key}}}`, "success");
                }}
                className="p-2 rounded bg-[var(--bg-s3)] border border-[var(--border)] hover:border-purple-400/50 cursor-pointer transition-colors text-xs flex flex-col gap-0.5"
              >
                <span className="font-mono font-semibold text-purple-300">{`{{${d.key}}}`}</span>
                <span className="text-[10px] text-[var(--tx-2)]">{d.desc}</span>
                <span className="text-[9px] text-[var(--tx-3)] font-mono truncate">{d.example}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Content View ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {mode === "table" ? (
          <VariableTable
            envId={env.id}
            variables={env.variables}
            searchQuery={searchQuery}
            isActive={isActive}
            onRefresh={onRefresh}
            onOpenVarContextMenu={onOpenVarContextMenu}
          />
        ) : (
          <div className="flex flex-col h-full p-4 gap-3 bg-[var(--bg-base)]">
            <div className="flex items-center justify-between text-xs text-[var(--tx-3)]">
              <span>
                Edit variables as <code className="text-[var(--lime)] font-mono">KEY=VALUE</code>{" "}
                pairs. Comment out a variable with <code className="font-mono">#</code> or{" "}
                <code className="font-mono">//</code> to disable it.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMode("table")}
                  className="px-2.5 py-1 rounded-[var(--r-sm)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyBulk}
                  className="flex items-center gap-1 px-3 py-1 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] font-semibold hover:opacity-90 transition-opacity"
                >
                  <Check size={12} /> Apply Changes
                </button>
              </div>
            </div>
            <textarea
              className="flex-1 w-full bg-[var(--bg-s2)] text-[var(--tx-1)] font-mono text-xs p-3 rounded-[var(--r-md)] border border-[var(--border)] outline-none focus:border-[var(--lime)] resize-none transition-colors leading-relaxed"
              placeholder="KEY=value&#10;# DISABLED_KEY=value"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variable Table Component (Advanced Grid: Initial Value vs Current Value)
// ─────────────────────────────────────────────────────────────────────────────
function VariableTable({
  envId,
  variables,
  searchQuery,
  isActive,
  onRefresh,
  onOpenVarContextMenu,
}: {
  envId: string;
  variables: EnvVarItem[];
  searchQuery: string;
  isActive: boolean;
  onRefresh: () => void;
  onOpenVarContextMenu: (e: React.MouseEvent, envId: string, varItem: EnvVarItem) => void;
}) {
  const { toast } = useToast();
  const { setEnvironmentVariables, activeEnvironmentId } = useAppStore();

  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newInitVal, setNewInitVal] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Multi-select state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Filtered variables
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return variables;
    const q = searchQuery.toLowerCase();
    return variables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        (v.value && v.value.toLowerCase().includes(q)) ||
        (v.initial_value && v.initial_value.toLowerCase().includes(q)),
    );
  }, [variables, searchQuery]);

  // Sync variables to store if this environment is active
  const syncStore = (nextVars: EnvVarItem[]) => {
    if (isActive || activeEnvironmentId === envId) {
      setEnvironmentVariables(nextVars);
    }
  };

  // Toggle variable enabled status
  const handleToggleEnable = async (item: EnvVarItem) => {
    const isEnabled = item.is_enabled === false;
    try {
      await bridge.setEnvironmentVariable({
        environment_id: envId,
        key: item.key,
        value: item.value,
        is_secret: item.is_secret,
        is_enabled: isEnabled,
      });
      const next = variables.map((v) => (v.key === item.key ? { ...v, is_enabled: isEnabled } : v));
      syncStore(next);
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to update variable", "error");
    }
  };

  // Toggle variable secret mode
  const handleToggleSecret = async (item: EnvVarItem) => {
    const isSecret = !item.is_secret;
    try {
      const val = revealedSecrets[item.key] || item.value;
      if (isSecret && !val) {
        toast("Please provide a value before setting as secret", "error");
        return;
      }
      await bridge.setEnvironmentVariable({
        environment_id: envId,
        key: item.key,
        value: val,
        is_secret: isSecret,
        is_enabled: item.is_enabled !== false,
      });
      onRefresh();
      toast(`Variable "${item.key}" is now ${isSecret ? "secret" : "plain"}`, "success");
    } catch (err: any) {
      toast(err?.message || "Failed to toggle secret", "error");
    }
  };

  // Reveal / hide secret value
  const handleRevealSecret = async (item: EnvVarItem) => {
    if (revealedSecrets[item.key]) {
      setRevealedSecrets((prev) => {
        const next = { ...prev };
        delete next[item.key];
        return next;
      });
      return;
    }

    try {
      const res = await bridge.getEnvironmentVariableSecret(envId, item.id || item.key);
      const val = (res as any)?.value ?? "";
      setRevealedSecrets((prev) => ({ ...prev, [item.key]: val }));
    } catch (err: any) {
      toast(err?.message || "Could not read secret from storage", "error");
    }
  };

  // Save updated variable key or value
  const handleSaveCell = async (
    targetKey: string,
    patch: { key?: string; value?: string; initial_value?: string },
  ) => {
    const current = variables.find((v) => v.key === targetKey);
    if (!current) return;

    if (patch.initial_value !== undefined) {
      setInitialValueForVar(envId, targetKey, patch.initial_value);
      onRefresh();
      return;
    }

    const newK = patch.key !== undefined ? patch.key.trim() : current.key;
    const newV = patch.value !== undefined ? patch.value : (revealedSecrets[current.key] || current.value);

    if (!newK) {
      toast("Variable key cannot be empty", "error");
      return;
    }
    if (newK !== current.key && variables.some((variable) => variable.key === newK)) {
      toast(`A variable named "${newK}" already exists`, "error");
      return;
    }

    try {
      let value = newV;
      if (newK !== current.key) {
        if (current.is_secret && !value) {
          const secret = await bridge.getEnvironmentVariableSecret(envId, current.id || current.key);
          assertBridgeSuccess(secret, `Could not read secret "${current.key}"`);
          value = secret.value;
        }
        const created = await bridge.setEnvironmentVariable({
          environment_id: envId,
          key: newK,
          value,
          is_secret: current.is_secret,
          is_enabled: current.is_enabled !== false,
        });
        assertBridgeSuccess(created, `Could not create renamed variable "${newK}"`);
        try {
          const deleted = await bridge.deleteEnvironmentVariable(envId, current.id || current.key);
          assertBridgeSuccess(deleted, `Could not remove old variable "${current.key}"`);
        } catch (deleteError) {
          try {
            const rollback = await bridge.deleteEnvironmentVariable(
              envId,
              created.variable?.id || newK,
            );
            assertBridgeSuccess(rollback, `Could not roll back "${newK}"`);
          } catch {
            throw new Error(
              `Rename was only partially completed: "${current.key}" remains and "${newK}" may also exist.`,
            );
          }
          throw deleteError;
        }
        renameInitialValueForVar(envId, current.key, newK);
      } else {
        const result = await bridge.setEnvironmentVariable({
          environment_id: envId,
          key: newK,
          value,
          is_secret: current.is_secret,
          is_enabled: current.is_enabled !== false,
        });
        assertBridgeSuccess(result, `Could not save variable "${newK}"`);
      }
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to save variable", "error");
    }
  };

  // Reset Current to Initial
  const handleResetCurrentToInitial = async (item: EnvVarItem) => {
    const initVals = getInitialValuesMap(envId);
    const initVal = initVals[item.key] ?? item.initial_value ?? item.value;
    try {
      await bridge.setEnvironmentVariable({
        environment_id: envId,
        key: item.key,
        value: initVal,
        is_secret: item.is_secret,
        is_enabled: item.is_enabled !== false,
      });
      onRefresh();
      toast(`Reset "${item.key}" to initial value`, "success");
    } catch (err: any) {
      toast(err?.message || "Failed to reset value", "error");
    }
  };

  // Reset ALL variables to initial values
  const handleResetAllToInitial = async () => {
    if (!confirm("Reset all current values to their initial values?")) return;
    try {
      const initVals = getInitialValuesMap(envId);
      for (const item of variables) {
        const initVal = initVals[item.key] ?? item.initial_value ?? item.value;
        await bridge.setEnvironmentVariable({
          environment_id: envId,
          key: item.key,
          value: initVal,
          is_secret: item.is_secret,
          is_enabled: item.is_enabled !== false,
        });
      }
      toast("Reset all variables to initial values", "success");
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to reset variables", "error");
    }
  };

  // Bulk Reset Selected to Initial
  const handleBulkResetToInitial = async () => {
    try {
      const initVals = getInitialValuesMap(envId);
      for (const key of selectedKeys) {
        const item = variables.find((v) => v.key === key);
        if (item) {
          const initVal = initVals[item.key] ?? item.initial_value ?? item.value;
          await bridge.setEnvironmentVariable({
            environment_id: envId,
            key: item.key,
            value: initVal,
            is_secret: item.is_secret,
            is_enabled: item.is_enabled !== false,
          });
        }
      }
      toast(`Reset ${selectedKeys.size} variables to initial values`, "success");
      setSelectedKeys(new Set());
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to reset selected variables", "error");
    }
  };

  // Delete variable
  const handleDeleteVar = async (item: EnvVarItem) => {
    try {
      await bridge.deleteEnvironmentVariable(envId, item.id || item.key);
      const next = variables.filter((v) => v.key !== item.key);
      syncStore(next);
      onRefresh();
      toast(`Deleted variable "${item.key}"`, "success");
    } catch (err: any) {
      toast(err?.message || "Failed to delete variable", "error");
    }
  };

  // Copy variable as {{KEY}}
  const handleCopyVarTag = (key: string) => {
    const tag = `{{${key}}}`;
    navigator.clipboard.writeText(tag);
    setCopiedKey(key);
    toast(`Copied ${tag} to clipboard`, "success");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Add new variable
  const handleAddVar = async () => {
    if (!newKey.trim()) return;
    const k = newKey.trim();
    const v = newVal || newInitVal;

    try {
      await bridge.setEnvironmentVariable({
        environment_id: envId,
        key: k,
        value: v,
        is_secret: newSecret,
        is_enabled: true,
      });
      if (newInitVal.trim()) {
        setInitialValueForVar(envId, k, newInitVal.trim());
      }
      setNewKey("");
      setNewVal("");
      setNewInitVal("");
      setNewSecret(false);
      onRefresh();
      toast(`Added variable "${k}"`, "success");
    } catch (err: any) {
      toast(err?.message || "Failed to add variable", "error");
    }
  };

  // Multi-select handlers
  const handleToggleSelectAll = () => {
    if (selectedKeys.size === filtered.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filtered.map((v) => v.key)));
    }
  };

  const handleToggleSelectRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    if (!confirm(`Delete ${selectedKeys.size} selected variables?`)) return;

    try {
      for (const k of selectedKeys) {
        const item = variables.find((v) => v.key === k);
        if (item) {
          await bridge.deleteEnvironmentVariable(envId, item.id || item.key);
        }
      }
      toast(`Deleted ${selectedKeys.size} variables`, "success");
      setSelectedKeys(new Set());
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to delete selected", "error");
    }
  };

  // Bulk Enable/Disable
  const handleBulkToggle = async (enable: boolean) => {
    if (selectedKeys.size === 0) return;
    try {
      for (const k of selectedKeys) {
        const item = variables.find((v) => v.key === k);
        if (item) {
          await bridge.setEnvironmentVariable({
            environment_id: envId,
            key: item.key,
            value: item.value,
            is_secret: item.is_secret,
            is_enabled: enable,
          });
        }
      }
      toast(`${enable ? "Enabled" : "Disabled"} ${selectedKeys.size} variables`, "success");
      setSelectedKeys(new Set());
      onRefresh();
    } catch (err: any) {
      toast(err?.message || "Failed to update selected", "error");
    }
  };

  const allSelected = filtered.length > 0 && selectedKeys.size === filtered.length;

  return (
    <div className="p-4 flex flex-col gap-3 relative min-h-full">
      {/* Table toolbar */}
      <div className="flex items-center justify-between text-xs text-[var(--tx-3)]">
        <span className="font-mono text-[11px]">
          Current Value overrides Initial Value during request execution.
        </span>
        <button
          onClick={handleResetAllToInitial}
          title="Reset all current values to match initial values"
          className="flex items-center gap-1 text-[var(--tx-3)] hover:text-[var(--amber)] transition-colors text-[11px]"
        >
          <RotateCcw size={11} />
          <span>Reset All to Initial</span>
        </button>
      </div>

      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[var(--tx-3)] border-b border-[var(--border-dim)] bg-[var(--bg-s2)] select-none">
            <th className="w-8 py-2 px-2 text-center font-normal">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleSelectAll}
                title="Select all"
                className="cursor-pointer accent-[var(--lime)]"
              />
            </th>
            <th className="text-left py-2 px-3 font-normal w-1/4">Variable (Key)</th>
            <th className="text-left py-2 px-3 font-normal w-1/4">Initial Value (Shared)</th>
            <th className="text-left py-2 px-3 font-normal">Current Value (Active)</th>
            <th className="text-center py-2 px-2 font-normal w-24">Type</th>
            <th className="w-24 py-2 px-2 text-right font-normal">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item, idx) => {
            const isEnabled = item.is_enabled !== false;
            const isSecret = Boolean(item.is_secret);
            const isRevealed = Boolean(revealedSecrets[item.key]);
            const isRowSelected = selectedKeys.has(item.key);
            const displayVal = isSecret && !isRevealed ? "••••••••••••" : (revealedSecrets[item.key] || item.value);
            const initValMap = getInitialValuesMap(envId);
            const initVal = initValMap[item.key] ?? item.initial_value ?? item.value;

            return (
              <tr
                key={item.id || item.key || idx}
                onContextMenu={(e) => onOpenVarContextMenu(e, envId, item)}
                className={cn(
                  "border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)] group transition-colors",
                  !isEnabled && "opacity-55",
                  isRowSelected && "bg-[var(--lime)]/5",
                )}
              >
                {/* Row Select Checkbox */}
                <td className="py-1.5 px-2 text-center">
                  <input
                    type="checkbox"
                    checked={isRowSelected}
                    onChange={() => handleToggleSelectRow(item.key)}
                    className="cursor-pointer accent-[var(--lime)]"
                  />
                </td>

                {/* Variable Key */}
                <td className="py-1.5 px-3 font-mono">
                  <input
                    type="text"
                    defaultValue={item.key}
                    onBlur={(e) => {
                      if (e.target.value !== item.key) {
                        handleSaveCell(item.key, { key: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full bg-transparent text-[var(--lime)] font-semibold outline-none focus:bg-[var(--bg-s3)] focus:border-b focus:border-[var(--lime)] px-1 py-0.5 rounded transition-colors"
                  />
                </td>

                {/* Initial Value (Baseline / Shared) */}
                <td className="py-1.5 px-3 font-mono">
                  <input
                    type={isSecret && !isRevealed ? "password" : "text"}
                    defaultValue={initVal}
                    placeholder="Same as current"
                    onBlur={(e) => {
                      if (e.target.value !== initVal) {
                        handleSaveCell(item.key, { initial_value: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-full bg-transparent text-[var(--tx-3)] focus:text-[var(--tx-1)] outline-none px-1 py-0.5 rounded focus:bg-[var(--bg-s3)] focus:border-b focus:border-cyan-500 transition-colors"
                  />
                </td>

                {/* Current Value (Active Override) */}
                <td className="py-1.5 px-3 font-mono">
                  <div className="flex items-center gap-1.5">
                    <input
                      type={isSecret && !isRevealed ? "password" : "text"}
                      value={displayVal}
                      readOnly={isSecret && !isRevealed}
                      onChange={(e) => {
                        if (isSecret && isRevealed) {
                          setRevealedSecrets((prev) => ({ ...prev, [item.key]: e.target.value }));
                        }
                      }}
                      onBlur={(e) => {
                        if (isSecret && !isRevealed) return;
                        if (e.target.value !== item.value) {
                          handleSaveCell(item.key, { value: e.target.value });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={cn(
                        "w-full bg-transparent text-[var(--tx-1)] outline-none px-1 py-0.5 rounded transition-colors",
                        isSecret && !isRevealed
                          ? "text-[var(--tx-3)] cursor-not-allowed select-none"
                          : "focus:bg-[var(--bg-s3)] focus:border-b focus:border-[var(--lime)]",
                      )}
                    />
                    {isSecret && (
                      <button
                        onClick={() => handleRevealSecret(item)}
                        title={isRevealed ? "Hide Secret" : "Reveal Secret"}
                        className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] shrink-0 transition-colors"
                      >
                        {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    )}
                  </div>
                </td>

                {/* Type Badge (Default / Secret) */}
                <td className="py-1.5 px-2 text-center">
                  <button
                    onClick={() => handleToggleSecret(item)}
                    title={isSecret ? "Secret (encrypted in OS keyring)" : "Plain Text (click to make secret)"}
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors select-none",
                      isSecret
                        ? "bg-[var(--amber)]/15 text-[var(--amber)] border-[var(--amber)]/35 hover:bg-[var(--amber)]/25"
                        : "bg-[var(--bg-s3)] text-[var(--tx-3)] border-[var(--border)] hover:text-[var(--tx-1)]",
                    )}
                  >
                    {isSecret ? <Lock size={9} /> : null}
                    <span>{isSecret ? "Secret" : "Default"}</span>
                  </button>
                </td>

                {/* Actions */}
                <td className="py-1.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggleEnable(item)}
                      title={isEnabled ? "Disable variable" : "Enable variable"}
                      className={cn(
                        "p-1 rounded transition-colors",
                        isEnabled ? "text-[var(--ok)]" : "text-[var(--tx-3)]",
                      )}
                    >
                      <Check size={11} />
                    </button>
                    <button
                      onClick={() => handleResetCurrentToInitial(item)}
                      title="Reset current to initial value"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--amber)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                    >
                      <RotateCcw size={11} />
                    </button>
                    <button
                      onClick={() => handleCopyVarTag(item.key)}
                      title={`Copy {{${item.key}}}`}
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                    >
                      {copiedKey === item.key ? (
                        <Check size={11} className="text-[var(--ok)]" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteVar(item)}
                      title="Delete Variable"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Add New Variable Row ─────────────────────────────────── */}
      <div className="flex items-center gap-2 p-2 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-[var(--border)] mt-2">
        <input
          type="text"
          placeholder="VARIABLE_NAME"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newKey.trim()) handleAddVar();
          }}
          className="bg-[var(--bg-s3)] text-[var(--lime)] font-mono text-xs px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--border)] outline-none focus:border-[var(--lime)] w-1/4 transition-colors"
        />
        <input
          type={newSecret ? "password" : "text"}
          placeholder={newSecret ? "secret initial value..." : "Initial Value (Shared)"}
          value={newInitVal}
          onChange={(e) => setNewInitVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newKey.trim()) handleAddVar();
          }}
          className="bg-[var(--bg-s3)] text-[var(--tx-2)] font-mono text-xs px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--border)] outline-none focus:border-cyan-500 w-1/3 transition-colors"
        />
        <input
          type={newSecret ? "password" : "text"}
          placeholder={newSecret ? "secret value..." : "Current Value (Active)"}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newKey.trim()) handleAddVar();
          }}
          className="bg-[var(--bg-s3)] text-[var(--tx-1)] font-mono text-xs px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--border)] outline-none focus:border-[var(--lime)] flex-1 transition-colors"
        />

        {/* Secret Toggle */}
        <button
          type="button"
          onClick={() => setNewSecret((v) => !v)}
          title={newSecret ? "Save as Secret" : "Save as Plain Text"}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-[var(--r-sm)] text-xs border transition-colors select-none",
            newSecret
              ? "bg-[var(--amber)]/20 text-[var(--amber)] border-[var(--amber)]/40 font-semibold"
              : "bg-[var(--bg-s3)] text-[var(--tx-3)] border-[var(--border)] hover:text-[var(--tx-1)]",
          )}
        >
          <Lock size={11} />
          <span className="hidden sm:inline">Secret</span>
        </button>

        <button
          onClick={handleAddVar}
          disabled={!newKey.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed select-none"
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {/* ── Floating Multi-select Action Bar ─────────────────────── */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-s1)] border border-[var(--lime)] rounded-[var(--r-lg)] shadow-2xl px-4 py-2 flex items-center gap-3 text-xs animate-in slide-in-from-bottom-3 duration-150">
          <span className="font-semibold text-[var(--lime)] font-mono">
            {selectedKeys.size} selected
          </span>
          <div className="h-4 w-px bg-[var(--border)]" />
          <button
            onClick={() => handleBulkToggle(true)}
            className="flex items-center gap-1 text-[var(--tx-2)] hover:text-[var(--ok)] transition-colors"
          >
            <Check size={12} /> Enable
          </button>
          <button
            onClick={() => handleBulkToggle(false)}
            className="flex items-center gap-1 text-[var(--tx-2)] hover:text-[var(--amber)] transition-colors"
          >
            <X size={12} /> Disable
          </button>
          <button
            onClick={handleBulkResetToInitial}
            className="flex items-center gap-1 text-[var(--tx-2)] hover:text-cyan-400 transition-colors"
          >
            <RotateCcw size={12} /> Reset to Initial
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1 text-[var(--err)] font-semibold hover:opacity-85 transition-opacity"
          >
            <Trash2 size={12} /> Delete Selected
          </button>
          <button
            onClick={() => setSelectedKeys(new Set())}
            className="text-[var(--tx-3)] hover:text-[var(--tx-1)] ml-2 text-[11px]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
