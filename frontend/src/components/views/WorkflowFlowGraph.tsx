import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Sliders,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckSquare,
  Workflow as WorkflowIcon,
  Download,
  RotateCcw,
  Zap,
} from "lucide-react";
import { cn, methodColor, statusClass } from "../../lib/cn";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { useToast } from "../ui/Toast";

// Step and Result types matching WorkflowStudioView
export interface StepAssertion {
  id?: string;
  type: "status_code" | "response_time" | "json_path" | "header";
  operator: "equals" | "not_equals" | "less_than" | "contains" | "exists" | "is_not_empty";
  target?: string;
  value: string;
}

export interface AssertionResult {
  type: string;
  target?: string;
  operator: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface StepResult {
  step_id?: string;
  step_name?: string;
  order_index?: number;
  status: "completed" | "failed" | "skipped";
  duration_ms?: number;
  response?: {
    status_code?: number;
    status_text?: string;
    headers?: Record<string, string>;
    body?: any;
    duration_ms?: number;
    size_bytes?: number;
  } | null;
  extracted_vars?: Record<string, string>;
  assertion_results?: AssertionResult[];
  error?: string | null;
}

export interface ExtractRule {
  var_name: string;
  json_path: string;
}

export interface WorkflowStep {
  id?: string;
  name: string;
  method: string;
  url: string;
  order_index?: number;
  configuration?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: any;
    auth?: any;
    enabled?: boolean;
    is_enabled?: boolean;
    wait_seconds?: number;
    assertions?: StepAssertion[];
    execution_mode?: "sequential" | "parallel";
  };
  extract_vars?: ExtractRule[];
}

export interface Workflow {
  id: string;
  workspace_id?: string;
  name: string;
  description?: string;
  steps?: WorkflowStep[];
  created_at?: string;
  updated_at?: string;
}

interface WorkflowFlowGraphProps {
  workflow: Workflow;
  steps: WorkflowStep[];
  results: StepResult[];
  running: boolean;
  runningStepIdx: number | null;
  activeVariables: Record<string, string>;
  onUpdateSteps: (steps: WorkflowStep[]) => Promise<boolean | void>;
  onRunWorkflow: () => void;
  onRunStep: (stepIndex: number, e?: React.MouseEvent) => void;
  onOpenStepInTab: (step: WorkflowStep, e: React.MouseEvent) => void;
  onConfigureStep: (stepIndex: number) => void;
  onAddBlankStep: () => void;
  onAddWaitStep: () => void;
  onImportStep: () => void;
}

// ── Node Data Types ──────────────────────────────────────────────────
interface StartNodeData extends Record<string, unknown> {
  workflowName: string;
  totalSteps: number;
  running: boolean;
  onRunAll: () => void;
}

interface StepNodeData extends Record<string, unknown> {
  index: number;
  step: WorkflowStep;
  result?: StepResult;
  isRunning: boolean;
  onRunStep: () => void;
  onConfigure: () => void;
  onOpenInTab: () => void;
  onToggleEnabled: () => void;
  onToggleParallel: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface EndNodeData extends Record<string, unknown> {
  totalSteps: number;
  results: StepResult[];
}

// ── 1. Start Node Component ──────────────────────────────────────────
function StartNode({ data }: NodeProps<Node<StartNodeData>>) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-s2)] shadow-xl p-3 w-80 text-left transition-all hover:border-[var(--border-mid)]">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-dim)]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--lime)] animate-ping" />
          <span className="text-xs font-bold text-[var(--lime)] uppercase tracking-wider flex items-center gap-1.5">
            <WorkflowIcon size={13} />
            <span>Workflow Trigger</span>
          </span>
        </div>
        <span className="text-[10px] font-mono text-[var(--tx-3)] bg-[var(--bg-s3)] px-1.5 py-0.5 rounded border border-[var(--border)]">
          {data.totalSteps} steps
        </span>
      </div>

      <div className="py-2.5 flex flex-col gap-1">
        <span className="text-xs font-semibold text-[var(--tx-1)] truncate">
          {data.workflowName}
        </span>
        <span className="text-[10px] text-[var(--tx-3)]">
          Manual execution trigger or chained pipeline start.
        </span>
      </div>

      <div className="pt-2 border-t border-[var(--border-dim)] flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onRunAll();
          }}
          disabled={data.running || data.totalSteps === 0}
          className="nodrag nopan flex items-center gap-1.5 px-3 py-1 rounded bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
        >
          {data.running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          <span>{data.running ? "Running…" : "Run Workflow"}</span>
        </button>
        <span className="text-[10px] font-mono text-[var(--tx-3)]">Ready</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[var(--lime)] !border-2 !border-[var(--bg-s1)] transition-transform hover:scale-125"
      />
    </div>
  );
}

// ── 2. Step Node Component ───────────────────────────────────────────
function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const { step, index, result, isRunning } = data;
  const cfg = step.configuration || {};
  const isEnabled = cfg.enabled !== false && cfg.is_enabled !== false;
  const isWait = step.method === "WAIT" || step.method === "DELAY";
  const assertions = cfg.assertions || [];
  const extractRules = step.extract_vars || [];

  return (
    <div
      className={cn(
        "rounded-xl border transition-all bg-[var(--bg-s2)] shadow-xl p-3 w-84 text-left group relative",
        result?.status === "completed"
          ? "border-[var(--ok)]/50 hover:border-[var(--ok)]"
          : result?.status === "failed"
          ? "border-[var(--err)]/50 hover:border-[var(--err)]"
          : "border-[var(--border)] hover:border-[var(--border-mid)]",
        !isEnabled && "opacity-50 border-dashed",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[var(--border-mid)] !border-2 !border-[var(--bg-s1)] transition-transform hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-dim)]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-xs font-bold text-[var(--tx-3)] bg-[var(--bg-s3)] w-5 h-5 flex items-center justify-center rounded border border-[var(--border)] shrink-0">
            {index + 1}
          </span>
          <span
            className={cn(
              "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
              isWait
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : cn(methodColor(step.method), "bg-[var(--bg-s3)] border border-[var(--border)]"),
            )}
          >
            {step.method}
          </span>
          <span className="text-xs font-semibold text-[var(--tx-1)] truncate flex-1" title={step.name}>
            {step.name}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {/* Toggle Sequential / Parallel */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleParallel();
            }}
            className={cn(
              "nodrag nopan flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors border",
              cfg.execution_mode === "parallel"
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 font-semibold"
                : "bg-[var(--bg-s3)] text-[var(--tx-3)] border-[var(--border)] hover:text-[var(--tx-1)]",
            )}
            title={`Execution: ${cfg.execution_mode === "parallel" ? "Parallel - click to make Sequential" : "Sequential - click to make Parallel"}`}
          >
            {cfg.execution_mode === "parallel" ? (
              <>
                <Zap size={9} className="text-amber-400 fill-amber-400" />
                <span>Parallel</span>
              </>
            ) : (
              <span>Seq</span>
            )}
          </button>

          {/* Enable / Disable */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleEnabled();
            }}
            className="nodrag nopan p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded transition-colors"
            title={isEnabled ? "Disable Step" : "Enable Step"}
          >
            {isEnabled ? <Eye size={12} /> : <EyeOff size={12} className="text-amber-400" />}
          </button>
        </div>
      </div>

      {/* URL or Duration */}
      <div className="py-2 flex flex-col gap-1">
        {isWait ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono">
            <Clock size={12} />
            <span>Pause for {cfg.wait_seconds ?? 1} second(s)</span>
          </div>
        ) : (
          <span className="font-mono text-[11px] text-[var(--tx-3)] truncate select-all" title={step.url}>
            {step.url || "https://"}
          </span>
        )}

        {/* Badges: Assertions & Extracted Vars */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {assertions.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <CheckSquare size={9} />
              <span>{assertions.length} assert{assertions.length > 1 ? "s" : ""}</span>
            </span>
          )}
          {extractRules.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
              <Sparkles size={9} />
              <span>{extractRules.length} var{extractRules.length > 1 ? "s" : ""}</span>
            </span>
          )}
        </div>
      </div>

      {/* Result Status Banner (if executed) */}
      {result && (
        <div
          className={cn(
            "p-1.5 mb-2 rounded border text-[11px] font-mono flex items-center justify-between",
            result.status === "completed"
              ? "bg-[var(--ok)]/10 text-[var(--ok)] border-[var(--ok)]/30"
              : result.status === "skipped"
              ? "bg-[var(--bg-s3)] text-[var(--tx-3)] border-[var(--border)]"
              : "bg-[var(--err)]/10 text-[var(--err)] border-[var(--err)]/30",
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            {result.status === "completed" ? (
              <CheckCircle2 size={12} className="shrink-0" />
            ) : result.status === "skipped" ? (
              <span className="text-[10px] font-bold">SKIPPED</span>
            ) : (
              <XCircle size={12} className="shrink-0" />
            )}
            {result.response?.status_code && (
              <span className={cn("px-1 py-0.2 rounded text-[10px]", statusClass(result.response.status_code))}>
                {result.response.status_code}
              </span>
            )}
            <span className="truncate">{result.status.toUpperCase()}</span>
          </div>
          {result.duration_ms !== undefined && (
            <span className="text-[10px] opacity-80 shrink-0">{Math.round(result.duration_ms)}ms</span>
          )}
        </div>
      )}

      {/* Quick Action Footer */}
      <div className="pt-2 border-t border-[var(--border-dim)] flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Run Single Step */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onRunStep();
            }}
            disabled={isRunning}
            className="nodrag nopan flex items-center gap-1 px-2 py-1 rounded bg-[var(--lime-soft)] text-[var(--lime)] text-[10px] font-semibold hover:bg-[var(--lime)] hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
            title="Execute just this step"
          >
            {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            <span>Run</span>
          </button>

          {/* Config Step */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onConfigure();
            }}
            className="nodrag nopan flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] text-[10px] font-medium transition-colors cursor-pointer hover:border-[var(--lime)]"
            title="Configure step headers, body, assertions & variables"
          >
            <Sliders size={10} />
            <span>Config</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-[var(--tx-3)]">
          {!isWait && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onOpenInTab();
              }}
              className="nodrag nopan p-1 hover:text-cyan-400 rounded transition-colors"
              title="Open step in Request workbench tab"
            >
              <ExternalLink size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDuplicate();
            }}
            className="nodrag nopan p-1 hover:text-[var(--tx-1)] rounded transition-colors"
            title="Duplicate step"
          >
            <Copy size={11} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete();
            }}
            className="nodrag nopan p-1 hover:text-[var(--err)] rounded transition-colors"
            title="Delete step"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[var(--border-mid)] !border-2 !border-[var(--bg-s1)] transition-transform hover:scale-125"
      />
    </div>
  );
}

// ── 3. End Node Component ─────────────────────────────────────────────
function EndNode({ data }: NodeProps<Node<EndNodeData>>) {
  const { results, totalSteps } = data;
  const passedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div className="rounded-xl border border-[var(--ok)]/40 bg-[var(--bg-s2)] shadow-xl p-3 w-80 text-left transition-all hover:border-[var(--ok)]">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[var(--ok)] !border-2 !border-[var(--bg-s1)] transition-transform hover:scale-125"
      />

      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-dim)]">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={15} className="text-[var(--ok)]" />
          <span className="text-xs font-bold text-[var(--ok)] uppercase tracking-wider">
            Workflow Finish
          </span>
        </div>
        <span className="text-[10px] font-mono text-[var(--tx-3)] bg-[var(--bg-s3)] px-1.5 py-0.5 rounded border border-[var(--border)]">
          Output & Exit
        </span>
      </div>

      <div className="py-2.5 flex flex-col gap-1 text-xs text-[var(--tx-3)]">
        {results.length > 0 ? (
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-[var(--ok)] font-semibold">{passedCount}/{totalSteps} Passed</span>
            {failedCount > 0 && <span className="text-[var(--err)] font-semibold">{failedCount} Failed</span>}
          </div>
        ) : (
          <span>Pipeline completes after all sequential nodes execute.</span>
        )}
      </div>

      <div className="pt-2 border-t border-[var(--border-dim)] flex items-center justify-between text-[10px] text-[var(--tx-3)] font-mono">
        <span>Assertions Validated</span>
        <span className="text-[var(--ok)]">● Done</span>
      </div>
    </div>
  );
}

// ── 4. Custom Workflow Edge with Variable Passing & Add Step ─────────
interface WorkflowEdgeData extends Record<string, unknown> {
  varNames?: string[];
  onInsertStepHere?: () => void;
}

function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps<Edge<WorkflowEdgeData>>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const varNames = data?.varNames || [];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, strokeWidth: 2, stroke: "var(--border-mid)" }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1.5 select-none"
        >
          {varNames.length > 0 && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono bg-purple-950/90 text-purple-300 border border-purple-500/40 shadow-lg"
              title={`Passes variables: ${varNames.map((v) => `{{${v}}}`).join(", ")}`}
            >
              <Sparkles size={9} />
              <span>{varNames.map((v) => `{{${v}}}`).join(", ")}</span>
            </div>
          )}
          {data?.onInsertStepHere && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onInsertStepHere?.();
              }}
              title="Insert step between these nodes"
              className="w-5 h-5 rounded-full bg-[var(--bg-s3)] border border-[var(--border)] hover:border-[var(--lime)] hover:text-[var(--lime)] flex items-center justify-center text-[10px] text-[var(--tx-3)] transition-all shadow-md cursor-pointer hover:scale-110"
            >
              <Plus size={10} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Node & Edge types registry
const nodeTypes: NodeTypes = {
  workflowStart: StartNode,
  workflowStep: StepNode,
  workflowEnd: EndNode,
};

const edgeTypes: EdgeTypes = {
  workflowEdge: WorkflowEdge,
};

// ── Main Graph Canvas Component (Internal) ───────────────────────────
function WorkflowFlowGraphInner({
  workflow,
  steps,
  results,
  running,
  runningStepIdx,
  onUpdateSteps,
  onRunWorkflow,
  onRunStep,
  onOpenStepInTab,
  onConfigureStep,
  onAddBlankStep,
  onAddWaitStep,
  onImportStep,
}: WorkflowFlowGraphProps) {
  const { toast } = useToast();
  const { fitView } = useReactFlow();

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  // Handlers for step operations
  const handleToggleStepEnabled = useCallback(
    async (idx: number) => {
      const current = [...steps];
      const target = current[idx];
      if (!target) return;
      const cfg = { ...(target.configuration || {}) };
      const currentlyEnabled = cfg.enabled !== false && cfg.is_enabled !== false;
      cfg.enabled = !currentlyEnabled;
      cfg.is_enabled = !currentlyEnabled;
      current[idx] = { ...target, configuration: cfg };
      await onUpdateSteps(current);
      toast(cfg.enabled ? `Enabled "${target.name}"` : `Skipped "${target.name}"`, "info");
    },
    [steps, onUpdateSteps, toast],
  );

  const handleToggleStepParallel = useCallback(
    async (idx: number) => {
      const current = [...steps];
      const target = current[idx];
      if (!target) return;
      const cfg = { ...(target.configuration || {}) };
      const nextMode = cfg.execution_mode === "parallel" ? "sequential" : "parallel";
      cfg.execution_mode = nextMode;
      current[idx] = { ...target, configuration: cfg };
      await onUpdateSteps(current);
      toast(
        nextMode === "parallel"
          ? `Set "${target.name}" to Parallel`
          : `Set "${target.name}" to Sequential`,
        "info",
      );
    },
    [steps, onUpdateSteps, toast],
  );

  const handleDuplicateStep = useCallback(
    async (idx: number) => {
      const current = [...steps];
      const original = current[idx];
      if (!original) return;
      const duplicate: WorkflowStep = {
        ...original,
        name: `${original.name} (Copy)`,
        order_index: idx + 1,
      };
      current.splice(idx + 1, 0, duplicate);
      await onUpdateSteps(current);
      toast(`Duplicated "${original.name}"`, "success");
    },
    [steps, onUpdateSteps, toast],
  );

  const handleDeleteStep = useCallback(
    async (idx: number) => {
      const current = [...steps];
      current.splice(idx, 1);
      await onUpdateSteps(current);
      toast("Step removed", "success");
    },
    [steps, onUpdateSteps, toast],
  );

  const handleMoveStep = useCallback(
    async (idx: number, direction: "up" | "down") => {
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= steps.length) return;
      const current = [...steps];
      const [item] = current.splice(idx, 1);
      current.splice(targetIdx, 0, item);
      await onUpdateSteps(current);
    },
    [steps, onUpdateSteps],
  );

  const handleInsertStepAt = useCallback(
    async (idx: number, isWait = false, isParallel = false) => {
      const current = [...steps];
      const newStep: WorkflowStep = isWait
        ? {
            name: `Wait 1s`,
            method: "WAIT",
            url: "",
            order_index: idx,
            configuration: { wait_seconds: 1, enabled: true, execution_mode: isParallel ? "parallel" : "sequential" },
          }
        : {
            name: `Step ${idx + 1}`,
            method: "GET",
            url: "https://",
            order_index: idx,
            configuration: { headers: {}, params: {}, enabled: true, execution_mode: isParallel ? "parallel" : "sequential" },
          };
      current.splice(idx, 0, newStep);
      await onUpdateSteps(current);
      onConfigureStep(idx);
      toast(isWait ? "Added delay node" : "Added step node", "success");
    },
    [steps, onUpdateSteps, onConfigureStep, toast],
  );

  // Generate Flow Nodes with support for Parallel Stages (horizontal branching)
  const flowNodes: Node[] = useMemo(() => {
    const list: Node[] = [];
    const CENTER_X = 400;
    const NODE_WIDTH = 340;
    const GAP_X = 40;
    const Y_STEP = 200;

    let current_y = 30;

    // 1. Start Node
    list.push({
      id: "node-start",
      type: "workflowStart",
      position: { x: CENTER_X, y: current_y },
      data: {
        workflowName: workflow.name,
        totalSteps: steps.length,
        running,
        onRunAll: onRunWorkflow,
      } as StartNodeData,
    });

    current_y += Y_STEP;

    // Partition steps into stages (consecutive parallel steps grouped together)
    interface StepStage {
      indices: number[];
      isParallel: boolean;
    }
    const stages: StepStage[] = [];
    let currentParallel: number[] = [];

    steps.forEach((step, idx) => {
      const isParallel = step.configuration?.execution_mode === "parallel";
      if (isParallel) {
        currentParallel.push(idx);
      } else {
        if (currentParallel.length > 0) {
          stages.push({ indices: currentParallel, isParallel: true });
          currentParallel = [];
        }
        stages.push({ indices: [idx], isParallel: false });
      }
    });

    if (currentParallel.length > 0) {
      stages.push({ indices: currentParallel, isParallel: true });
    }

    // 2. Position Step Nodes per stage
    stages.forEach((stage) => {
      const count = stage.indices.length;
      const totalW = count * NODE_WIDTH + (count - 1) * GAP_X;
      const startX = CENTER_X + NODE_WIDTH / 2 - totalW / 2;

      stage.indices.forEach((idx, offset) => {
        const xPos = startX + offset * (NODE_WIDTH + GAP_X);
        const step = steps[idx];

        list.push({
          id: `node-step-${idx}`,
          type: "workflowStep",
          position: { x: xPos, y: current_y },
          data: {
            index: idx,
            step,
            result: results[idx],
            isRunning: runningStepIdx === idx,
            onRunStep: () => onRunStep(idx),
            onConfigure: () => onConfigureStep(idx),
            onOpenInTab: () => onOpenStepInTab(step, {} as any),
            onToggleEnabled: () => handleToggleStepEnabled(idx),
            onToggleParallel: () => handleToggleStepParallel(idx),
            onDuplicate: () => handleDuplicateStep(idx),
            onMoveUp: () => handleMoveStep(idx, "up"),
            onMoveDown: () => handleMoveStep(idx, "down"),
            onDelete: () => handleDeleteStep(idx),
            canMoveUp: idx > 0,
            canMoveDown: idx < steps.length - 1,
          } as StepNodeData,
        });
      });

      current_y += Y_STEP;
    });

    // 3. End Node
    list.push({
      id: "node-end",
      type: "workflowEnd",
      position: { x: CENTER_X, y: current_y },
      data: {
        totalSteps: steps.length,
        results,
      } as EndNodeData,
    });

    return list;
  }, [
    workflow.name,
    steps,
    results,
    running,
    runningStepIdx,
    onRunWorkflow,
    onRunStep,
    onConfigureStep,
    onOpenStepInTab,
    handleToggleStepEnabled,
    handleToggleStepParallel,
    handleDuplicateStep,
    handleMoveStep,
    handleDeleteStep,
  ]);

  // Generate Flow Edges with Fork & Join for Parallel Stages
  const flowEdges: Edge[] = useMemo(() => {
    const list: Edge[] = [];

    if (steps.length === 0) {
      list.push({
        id: "edge-start-to-end",
        source: "node-start",
        target: "node-end",
        type: "workflowEdge",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-mid)" },
        data: {
          onInsertStepHere: () => handleInsertStepAt(0),
        },
      });
      return list;
    }

    // Partition steps into stages (matching flowNodes)
    interface StepStage {
      indices: number[];
      isParallel: boolean;
    }
    const stages: StepStage[] = [];
    let currentParallel: number[] = [];

    steps.forEach((step, idx) => {
      const isParallel = step.configuration?.execution_mode === "parallel";
      if (isParallel) {
        currentParallel.push(idx);
      } else {
        if (currentParallel.length > 0) {
          stages.push({ indices: currentParallel, isParallel: true });
          currentParallel = [];
        }
        stages.push({ indices: [idx], isParallel: false });
      }
    });

    if (currentParallel.length > 0) {
      stages.push({ indices: currentParallel, isParallel: true });
    }

    // 1. Edges from Start to all nodes in the first stage
    stages[0].indices.forEach((firstIdx) => {
      list.push({
        id: `edge-start-to-step-${firstIdx}`,
        source: "node-start",
        target: `node-step-${firstIdx}`,
        type: "workflowEdge",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--lime)" },
        data: {
          onInsertStepHere: () => handleInsertStepAt(0),
        },
      });
    });

    // 2. Edges between consecutive stages (Fork & Join)
    for (let s = 0; s < stages.length - 1; s++) {
      const currentStage = stages[s];
      const nextStage = stages[s + 1];

      // Extract variables passed from currentStage
      const extractedInStage = Array.from(
        new Set(
          currentStage.indices.flatMap((i) =>
            (steps[i]?.extract_vars || []).map((e) => e.var_name).filter(Boolean),
          ),
        ),
      );

      currentStage.indices.forEach((sourceIdx) => {
        nextStage.indices.forEach((targetIdx) => {
          list.push({
            id: `edge-step-${sourceIdx}-to-${targetIdx}`,
            source: `node-step-${sourceIdx}`,
            target: `node-step-${targetIdx}`,
            type: "workflowEdge",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-mid)" },
            data: {
              varNames: extractedInStage,
              onInsertStepHere: () => handleInsertStepAt(targetIdx),
            },
          });
        });
      });
    }

    // 3. Edges from last stage to End node
    const lastStage = stages[stages.length - 1];
    const lastExtracts = Array.from(
      new Set(
        lastStage.indices.flatMap((i) =>
          (steps[i]?.extract_vars || []).map((e) => e.var_name).filter(Boolean),
        ),
      ),
    );

    lastStage.indices.forEach((sourceIdx) => {
      list.push({
        id: `edge-step-${sourceIdx}-to-end`,
        source: `node-step-${sourceIdx}`,
        target: "node-end",
        type: "workflowEdge",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--ok)" },
        data: {
          varNames: lastExtracts,
        },
      });
    });

    return list;
  }, [steps, handleInsertStepAt]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync flowNodes / flowEdges when data changes
  useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  // Context Menu Handlers
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();

      if (node.id === "node-start") {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            {
              label: "Run Entire Workflow",
              icon: <Play size={13} className="text-[var(--lime)]" />,
              onSelect: () => onRunWorkflow(),
            },
            {
              label: "Insert Step at Beginning",
              icon: <Plus size={13} />,
              onSelect: () => handleInsertStepAt(0),
            },
            {
              label: "Insert Delay at Beginning",
              icon: <Clock size={13} className="text-amber-400" />,
              onSelect: () => handleInsertStepAt(0, true),
            },
          ],
        });
        return;
      }

      if (node.id.startsWith("node-step-")) {
        const stepIdx = parseInt(node.id.replace("node-step-", ""), 10);
        const step = steps[stepIdx];
        if (!step) return;

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            {
              label: "Run This Step Isolated",
              icon: <Play size={13} className="text-[var(--lime)]" />,
              onSelect: () => onRunStep(stepIdx),
            },
            {
              label: "Configure Step (Headers, Body, Assertions)",
              icon: <Sliders size={13} className="text-cyan-400" />,
              onSelect: () => onConfigureStep(stepIdx),
            },
            {
              label: step.configuration?.execution_mode === "parallel"
                ? "Switch to Sequential"
                : "Switch to Parallel",
              icon: (
                <Zap
                  size={13}
                  className={step.configuration?.execution_mode === "parallel" ? "" : "text-amber-400"}
                />
              ),
              onSelect: () => handleToggleStepParallel(stepIdx),
            },
            {
              label: "Open in Workbench Tab",
              icon: <ExternalLink size={13} />,
              onSelect: () => onOpenStepInTab(step, event),
            },
            { separator: true, label: "" },
            {
              label: "Insert Step After",
              icon: <Plus size={13} />,
              onSelect: () => handleInsertStepAt(stepIdx + 1),
            },
            {
              label: "Insert Delay After",
              icon: <Clock size={13} className="text-amber-400" />,
              onSelect: () => handleInsertStepAt(stepIdx + 1, true),
            },
            {
              label: "Toggle Enabled / Skipped",
              icon: <Eye size={13} />,
              onSelect: () => handleToggleStepEnabled(stepIdx),
            },
            {
              label: "Duplicate Step",
              icon: <Copy size={13} />,
              onSelect: () => handleDuplicateStep(stepIdx),
            },
            { separator: true, label: "" },
            {
              label: "Move Step Up",
              icon: <ArrowUp size={13} />,
              disabled: stepIdx === 0,
              onSelect: () => handleMoveStep(stepIdx, "up"),
            },
            {
              label: "Move Step Down",
              icon: <ArrowDown size={13} />,
              disabled: stepIdx === steps.length - 1,
              onSelect: () => handleMoveStep(stepIdx, "down"),
            },
            { separator: true, label: "" },
            {
              label: "Delete Step",
              icon: <Trash2 size={13} className="text-[var(--err)]" />,
              danger: true,
              onSelect: () => handleDeleteStep(stepIdx),
            },
          ],
        });
        return;
      }

      if (node.id === "node-end") {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            {
              label: "Add Step at End",
              icon: <Plus size={13} />,
              onSelect: () => handleInsertStepAt(steps.length),
            },
            {
              label: "Add Delay at End",
              icon: <Clock size={13} className="text-amber-400" />,
              onSelect: () => handleInsertStepAt(steps.length, true),
            },
            {
              label: "Run Workflow",
              icon: <Play size={13} className="text-[var(--lime)]" />,
              onSelect: () => onRunWorkflow(),
            },
          ],
        });
      }
    },
    [
      steps,
      onRunWorkflow,
      onRunStep,
      onConfigureStep,
      onOpenStepInTab,
      handleInsertStepAt,
      handleToggleStepEnabled,
      handleToggleStepParallel,
      handleDuplicateStep,
      handleMoveStep,
      handleDeleteStep,
    ],
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: "Add Sequential Step (⬇)",
            icon: <Plus size={13} className="text-[var(--lime)]" />,
            onSelect: onAddBlankStep,
          },
          {
            label: "Add Parallel Step",
            icon: <Zap size={13} className="text-amber-400" />,
            onSelect: () => handleInsertStepAt(steps.length, false, true),
          },
          {
            label: "Add Delay Step",
            icon: <Clock size={13} className="text-amber-400" />,
            onSelect: onAddWaitStep,
          },
          {
            label: "Import from Collection / History",
            icon: <Download size={13} className="text-cyan-400" />,
            onSelect: onImportStep,
          },
          { separator: true, label: "" },
          {
            label: "Run Full Workflow",
            icon: <Play size={13} className="text-[var(--lime)]" />,
            onSelect: onRunWorkflow,
          },
          {
            label: "Fit View",
            icon: <RotateCcw size={13} />,
            onSelect: () => fitView({ duration: 300 }),
          },
        ],
      });
    },
    [onAddBlankStep, onAddWaitStep, onImportStep, onRunWorkflow, fitView, handleInsertStepAt, steps.length],
  );

  return (
    <div className="w-full h-[calc(100vh-230px)] min-h-[580px] rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-s1)] relative select-none">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: "workflowEdge",
          animated: true,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="var(--border-dim)"
          gap={20}
          size={1.5}
          variant={BackgroundVariant.Dots}
          className="bg-[var(--bg-s1)]"
        />

        <Controls
          showInteractive={false}
          className="!bg-[var(--bg-s2)] !border !border-[var(--border)] !rounded-lg !shadow-lg [&>button]:!border-b [&>button]:!border-[var(--border)] [&>button]:!bg-[var(--bg-s2)] [&>button]:!text-[var(--tx-1)] hover:[&>button]:!bg-[var(--bg-s3)]"
        />

        <MiniMap
          className="!bg-[var(--bg-s2)] !border !border-[var(--border)] !rounded-lg !shadow-xl"
          nodeColor={(n) => {
            if (n.id === "node-start") return "var(--lime)";
            if (n.id === "node-end") return "var(--ok)";
            return "#6366f1";
          }}
          maskColor="rgba(0, 0, 0, 0.75)"
        />
      </ReactFlow>

      {/* Top Banner overlay with quick tips */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-s2)]/90 backdrop-blur-md border border-[var(--border)] text-[10px] text-[var(--tx-3)] shadow-sm">
          <Zap size={11} className="text-[var(--lime)]" />
          <span>Interactive ReactFlow: Drag nodes, right-click for Context Menu, click (+) on edges to insert steps.</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ── Export with ReactFlowProvider Wrapper ────────────────────────────
export function WorkflowFlowGraph(props: WorkflowFlowGraphProps) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
