import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useNodesState,
  type Edge,
  type Connection,
  type EdgeProps,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  FilePlus2,
  Folder,
  FolderKanban,
  FolderPlus,
  Link2Off,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  X,
} from "lucide-react";
import { cn, methodColor } from "../../lib/cn";
import { buildFolderTree, countFolders, type FolderNode } from "../../lib/collectionTree";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { useToast } from "../ui/Toast";
import type { CollectionItem, FolderItem, RequestItem } from "../../stores/appStore";

type CreateTarget = { kind: "folder" | "request"; parentId?: string };

type GraphData =
  | {
      kind: "collection";
      collection: CollectionItem;
      folderCount: number;
      requestCount: number;
      onStartCreate: (target: CreateTarget) => void;
    }
  | {
      kind: "folder";
      folder: FolderItem;
      parentNodeId: string;
      summary: string;
      busy: boolean;
      isEditing: boolean;
      editValue: string;
      onEditValueChange: (value: string) => void;
      onStartCreate: (target: CreateTarget) => void;
      onStartRename: (folder: FolderItem) => void;
      onSaveRename: (folderId: string) => void;
      onCancelRename: () => void;
      onDelete: (folder: FolderItem) => void;
    }
  | {
      kind: "request";
      request: RequestItem;
      parentNodeId: string;
      busy: boolean;
      isEditing: boolean;
      editValue: string;
      onEditValueChange: (value: string) => void;
      onStartRename: (request: RequestItem) => void;
      onSaveRename: (requestId: string) => void;
      onCancelRename: () => void;
      onDelete: (request: RequestItem) => void;
      onOpen: (request: RequestItem) => void;
    };

type FlowNode = Node<GraphData>;
type FlowEdgeData = {
  kind: "ownership" | "visual";
  onUnlink?: (edgeId: string) => void;
  onContextMenu?: (event: MouseEvent | React.MouseEvent, edgeId: string) => void;
};
type FlowEdge = Edge<FlowEdgeData>;

interface CollectionGraphProps {
  collection: CollectionItem;
  folders: FolderItem[];
  requests: RequestItem[];
  busy: boolean;
  onCreateFolder: (parentId: string | undefined, name: string) => Promise<boolean>;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
  onDeleteFolder: (folder: FolderItem) => void;
  onCreateRequest: (parentId: string | undefined, name: string) => Promise<boolean>;
  onRenameRequest: (requestId: string, name: string) => Promise<boolean>;
  onDeleteRequest: (request: RequestItem) => void;
  onOpenRequest: (request: RequestItem, forceNewTab?: boolean) => void;
  onDuplicateRequest: (request: RequestItem) => Promise<boolean>;
  onMoveRequest: (request: RequestItem, folderId?: string) => Promise<boolean>;
  onExportCollection: () => void;
}

const NODE_WIDTH = {
  collection: 270,
  folder: 255,
  request: 300,
} as const;
const NODE_HEIGHT = {
  collection: 118,
  folder: 112,
  request: 142,
} as const;
const COLUMN_GAP = 110;
const ROW_GAP = 60;

const graphNodeTypes: NodeTypes = {
  collection: CollectionNode,
  folder: FolderGraphNode,
  request: RequestGraphNode,
};
const graphEdgeTypes = { unlink: UnlinkEdge };

export const CollectionGraph: React.FC<CollectionGraphProps> = ({
  collection,
  folders,
  requests,
  busy,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateRequest,
  onRenameRequest,
  onDeleteRequest,
  onOpenRequest,
  onDuplicateRequest,
  onMoveRequest,
  onExportCollection,
}) => {
  const { toast } = useToast();
  const [creating, setCreating] = useState<CreateTarget | null>(null);
  const [newName, setNewName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editingRequestName, setEditingRequestName] = useState("");
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const fitViewRef = useRef<(() => void) | null>(null);
  const graphKey = `kurorelay:collection-graph:${collection.id}`;
  const graphEdgesKey = `kurorelay:collection-graph-edges:${collection.id}`;
  const foldersTree = useMemo(() => buildFolderTree(folders, collection.id), [folders, collection.id]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const edgeSaveFailureNotified = useRef(false);

  const startCreate = useCallback((target: CreateTarget) => {
    setCreating(target);
    setNewName("");
  }, []);

  const startRenameFolder = useCallback((folder: FolderItem) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  }, []);

  const startRenameRequest = useCallback((request: RequestItem) => {
    setEditingRequestId(request.id);
    setEditingRequestName(request.name);
  }, []);

  const saveFolderName = useCallback(async (folderId: string) => {
    if (!editingFolderName.trim() || busy) return;
    if (await onRenameFolder(folderId, editingFolderName.trim())) {
      setEditingFolderId(null);
      setEditingFolderName("");
    }
  }, [busy, editingFolderName, onRenameFolder]);

  const saveRequestName = useCallback(async (requestId: string) => {
    if (!editingRequestName.trim() || busy) return;
    if (await onRenameRequest(requestId, editingRequestName.trim())) {
      setEditingRequestId(null);
      setEditingRequestName("");
    }
  }, [busy, editingRequestName, onRenameRequest]);

  const requestNodes = useMemo(
    () =>
      createGraphNodes({
        collection,
        folders,
        requests,
        foldersTree,
        busy,
        startCreate,
        startRenameFolder,
        saveFolderName: (folderId) => void saveFolderName(folderId),
        cancelRenameFolder: () => setEditingFolderId(null),
        deleteFolder: onDeleteFolder,
        startRenameRequest,
        saveRequestName: (requestId) => void saveRequestName(requestId),
        cancelRenameRequest: () => setEditingRequestId(null),
        deleteRequest: onDeleteRequest,
        openRequest: onOpenRequest,
        editingFolderId,
        editingFolderName,
        setEditingFolderName,
        editingRequestId,
        editingRequestName,
        setEditingRequestName,
      }),
    [
      busy,
      collection,
      editingFolderId,
      editingFolderName,
      editingRequestId,
      editingRequestName,
      folders,
      foldersTree,
      onDeleteFolder,
      onDeleteRequest,
      onOpenRequest,
      saveFolderName,
      saveRequestName,
      startCreate,
      startRenameFolder,
      startRenameRequest,
      requests,
    ],
  );
  const initialFlow = useMemo(
    () => createFlowGraph(requestNodes, readSavedPositions(graphKey)),
    [graphKey, requestNodes],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialFlow.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(() =>
    readSavedEdges(graphEdgesKey, initialFlow.edges, initialFlow.nodes),
  );
  const knownParentIdsRef = useRef(
    new Map(
      initialFlow.nodes.flatMap((node) =>
        node.data.kind === "collection" ? [] : [[node.id, node.data.parentNodeId] as const],
      ),
    ),
  );
  const unlinkEdge = useCallback((edgeId: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
  }, []);
  const showEdgeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, edgeId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: "Unlink connection",
            icon: <Link2Off size={13} />,
            onSelect: () => unlinkEdge(edgeId),
          },
        ],
      });
    },
    [unlinkEdge],
  );
  const flowEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: {
          ...(edge.data ?? { kind: "visual" as const }),
          onUnlink: unlinkEdge,
          onContextMenu: showEdgeContextMenu,
        },
      })),
    [edges, showEdgeContextMenu, unlinkEdge],
  );
  const knownNodeIdsRef = useRef(new Set(initialFlow.nodes.map((node) => node.id)));

  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const next = initialFlow.nodes.map((node) => {
        const existing = currentById.get(node.id);
        return existing ? { ...node, position: existing.position } : node;
      });
      nodePositionsRef.current = Object.fromEntries(next.map((node) => [node.id, node.position]));
      return next;
    });
    const validNodeIds = new Set(initialFlow.nodes.map((node) => node.id));
    const newlyAddedNodes = initialFlow.nodes.filter((node) => !knownNodeIdsRef.current.has(node.id));
    const movedNodes = initialFlow.nodes.flatMap((node) => {
      if (node.data.kind === "collection") return [];
      const previousParentId = knownParentIdsRef.current.get(node.id);
      return previousParentId && previousParentId !== node.data.parentNodeId
        ? [{ node, previousParentId }]
        : [];
    });
    knownNodeIdsRef.current = validNodeIds;
    knownParentIdsRef.current = new Map(
      initialFlow.nodes.flatMap((node) =>
        node.data.kind === "collection" ? [] : [[node.id, node.data.parentNodeId] as const],
      ),
    );
    setEdges((current) => {
      let next = current.filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target));
      const edgeIds = new Set(next.map((edge) => edge.id));
      for (const { node, previousParentId } of movedNodes) {
        const oldEdgeId = `${previousParentId}->${node.id}`;
        if (!edgeIds.has(oldEdgeId)) continue;
        next = next.filter((edge) => edge.id !== oldEdgeId);
        edgeIds.delete(oldEdgeId);
        const newEdge = initialFlow.edges.find((edge) => edge.target === node.id);
        if (newEdge && !edgeIds.has(newEdge.id)) {
          next.push(newEdge);
          edgeIds.add(newEdge.id);
        }
      }
      for (const node of newlyAddedNodes) {
        const defaultEdge = initialFlow.edges.find((edge) => edge.target === node.id);
        if (defaultEdge && !edgeIds.has(defaultEdge.id)) {
          next.push(defaultEdge);
          edgeIds.add(defaultEdge.id);
        }
      }
      return next;
    });
  }, [initialFlow, setNodes]);

  useEffect(() => {
    try {
      localStorage.setItem(graphEdgesKey, JSON.stringify(edges));
      edgeSaveFailureNotified.current = false;
    } catch (error) {
      console.warn("Could not save collection graph connections", error);
      if (!edgeSaveFailureNotified.current) {
        toast("Could not save graph connections. Changes may not persist after closing the app.", "error");
        edgeSaveFailureNotified.current = true;
      }
    }
  }, [edges, graphEdgesKey, toast]);

  const openContextMenu = useCallback((event: MouseEvent | React.MouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  }, []);

  const moveRequestAndLink = useCallback(
    async (request: RequestItem, folderId?: string) => {
      if (!(await onMoveRequest(request, folderId))) return false;
      const source = folderId ? `folder-${folderId}` : `collection-${collection.id}`;
      const target = `request-${request.id}`;
      setEdges((current) => {
        const withoutPreviousOwnership = current.filter(
          (edge) => edge.target !== target || edge.data?.kind !== "ownership",
        );
        return addEdge(createGraphEdge(source, target, "ownership"), withoutPreviousOwnership);
      });
      return true;
    },
    [collection.id, onMoveRequest],
  );

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem(graphKey);
    } catch (error) {
      console.warn("Could not reset collection graph layout", error);
    }
    nodePositionsRef.current = {};
    const positions = layoutNodes(requestNodes);
    setNodes((current) =>
      current.map((node) => ({ ...node, position: positions[node.id] ?? node.position })),
    );
    fitViewRef.current?.();
  }, [graphKey, requestNodes, setNodes]);

  const showNodeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, node: FlowNode) => {
      const data = node.data;
      if (data.kind === "collection") {
        openContextMenu(event, [
          { label: "New root folder", icon: <FolderPlus size={13} />, onSelect: () => startCreate({ kind: "folder" }) },
          { label: "New root request", icon: <FilePlus2 size={13} />, onSelect: () => startCreate({ kind: "request" }) },
          { separator: true, label: "" },
          { label: "Export collection", icon: <Download size={13} />, onSelect: onExportCollection },
        ]);
        return;
      }
      if (data.kind === "folder") {
        openContextMenu(event, [
          { label: "New nested folder", icon: <FolderPlus size={13} />, onSelect: () => startCreate({ kind: "folder", parentId: data.folder.id }) },
          { label: "New request", icon: <FilePlus2 size={13} />, onSelect: () => startCreate({ kind: "request", parentId: data.folder.id }) },
          { separator: true, label: "" },
          { label: "Rename", icon: <Pencil size={13} />, disabled: busy, onSelect: () => startRenameFolder(data.folder) },
          { label: "Delete", icon: <Trash2 size={13} />, danger: true, disabled: busy, onSelect: () => onDeleteFolder(data.folder) },
        ]);
        return;
      }
      openContextMenu(event, [
        { label: "Open request", icon: <ExternalLink size={13} />, onSelect: () => onOpenRequest(data.request) },
        { label: "Open in new tab", icon: <Plus size={13} />, onSelect: () => onOpenRequest(data.request, true) },
        { label: "Duplicate request", icon: <Copy size={13} />, disabled: busy, onSelect: () => void onDuplicateRequest(data.request) },
        {
          label: "Move to folder",
          icon: <Folder size={13} />,
          disabled: busy,
          children: buildMoveMenuItems(data.request, folders, moveRequestAndLink),
        },
        { separator: true, label: "" },
        { label: "Rename", icon: <Pencil size={13} />, disabled: busy, onSelect: () => startRenameRequest(data.request) },
        { label: "Delete", icon: <Trash2 size={13} />, danger: true, disabled: busy, onSelect: () => onDeleteRequest(data.request) },
      ]);
    },
    [
      busy,
      folders,
      onDeleteFolder,
      onDeleteRequest,
      onDuplicateRequest,
      onExportCollection,
      moveRequestAndLink,
      onOpenRequest,
      openContextMenu,
      startCreate,
      startRenameFolder,
      startRenameRequest,
    ],
  );

  const showPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    openContextMenu(event, [
      { label: "New root folder", icon: <FolderPlus size={13} />, onSelect: () => startCreate({ kind: "folder" }) },
      { label: "New root request", icon: <FilePlus2 size={13} />, onSelect: () => startCreate({ kind: "request" }) },
      { separator: true, label: "" },
      { label: "Fit graph to view", icon: <Redo2 size={13} />, onSelect: () => fitViewRef.current?.() },
      { label: "Reset node layout", icon: <Redo2 size={13} />, onSelect: resetLayout },
    ]);
  }, [openContextMenu, resetLayout, startCreate]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;

    if (
      sourceNode.data.kind === "request" &&
      (targetNode.data.kind === "folder" || targetNode.data.kind === "collection")
    ) {
      void moveRequestAndLink(
        sourceNode.data.request,
        targetNode.data.kind === "folder" ? targetNode.data.folder.id : undefined,
      );
      return;
    }
    if (
      targetNode.data.kind === "request" &&
      (sourceNode.data.kind === "folder" || sourceNode.data.kind === "collection")
    ) {
      void moveRequestAndLink(
        targetNode.data.request,
        sourceNode.data.kind === "folder" ? sourceNode.data.folder.id : undefined,
      );
      return;
    }

    const edge = createGraphEdge(connection.source, connection.target, "visual");
    setEdges((current) =>
      addEdge(
        {
          ...edge,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        },
        current,
      ),
    );
  }, [moveRequestAndLink, nodes]);

  const handleNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, draggedNode: FlowNode) => {
    const positions = {
      ...nodePositionsRef.current,
      [draggedNode.id]: draggedNode.position,
    };
    nodePositionsRef.current = positions;
    try {
      localStorage.setItem(graphKey, JSON.stringify(positions));
    } catch (error) {
      console.warn("Could not save collection graph layout", error);
    }
  }, [graphKey]);

  const handleCreate = async () => {
    if (!creating || !newName.trim() || busy) return;
    const created = creating.kind === "folder"
      ? await onCreateFolder(creating.parentId, newName.trim())
      : await onCreateRequest(creating.parentId, newName.trim());
    if (created) {
      setCreating(null);
      setNewName("");
    }
  };

  const createTargetName = creating?.parentId
    ? folders.find((folder) => folder.id === creating.parentId)?.name ?? "folder"
    : collection.name;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--color-text-muted)]">
            Node graph
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
            {nodes.length} nodes · {edges.length} connections
          </span>
          <span className="hidden md:inline text-[10px] text-[var(--color-text-muted)]">
            Drag nodes to arrange · scroll to zoom · drag canvas to pan
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => startCreate({ kind: "folder" })}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
          >
            <FolderPlus size={12} /> Folder
          </button>
          <button
            onClick={() => startCreate({ kind: "request" })}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
          >
            <FilePlus2 size={12} /> Request
          </button>
        </div>
      </div>

      {creating && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]">
          {creating.kind === "folder" ? (
            <Folder size={13} className="text-[var(--color-accent-lime)] shrink-0" />
          ) : (
            <FilePlus2 size={13} className="text-[var(--color-accent-lime)] shrink-0" />
          )}
          <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">
            New {creating.kind} in {createTargetName}
          </span>
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
              if (event.key === "Escape") setCreating(null);
            }}
            placeholder={`${creating.kind === "folder" ? "Folder" : "Request"} name...`}
            className="nodrag flex-1 max-w-xs bg-[var(--color-surface-canvas)] border border-[var(--color-border-subtle)] rounded-[var(--r-sm)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={busy || !newName.trim()}
            className="p-1 text-[var(--color-status-success)] disabled:opacity-40"
            title={`Create ${creating.kind}`}
          >
            <Check size={13} />
          </button>
          <button onClick={() => setCreating(null)} className="p-1 text-[var(--color-text-muted)]" title="Cancel">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="collection-flow flex-1 min-h-0 bg-[var(--color-surface-canvas)]">
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={graphNodeTypes}
          edgeTypes={graphEdgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          isValidConnection={(connection) => connection.source !== connection.target}
          onInit={(instance) => {
            fitViewRef.current = () => void instance.fitView({ padding: 0.18 });
          }}
          onNodeContextMenu={showNodeContextMenu}
          onPaneContextMenu={showPaneContextMenu}
          onNodeDragStop={handleNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.25}
          maxZoom={1.75}
          defaultEdgeOptions={{
            type: "unlink",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-accent-lime)" },
            style: { stroke: "var(--color-border-hover)", strokeWidth: 1.5 },
            interactionWidth: 0,
            selectable: false,
            focusable: false,
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="var(--color-border-subtle)"
          />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              const data = node.data as GraphData;
              if (data.kind === "collection") return "var(--color-accent-lime)";
              if (data.kind === "folder") return "var(--color-text-secondary)";
              return "var(--color-accent-lime)";
            }}
            maskColor="rgba(0, 0, 0, 0.75)"
          />
        </ReactFlow>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};

function CollectionNode({ data }: NodeProps<FlowNode>) {
  if (data.kind !== "collection") return null;
  return (
    <div className="w-full overflow-hidden rounded-[var(--r-md)] border border-[var(--color-accent-lime)]/40 bg-[var(--color-surface-panel)] shadow-lg shadow-black/20">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-accent-lime-dim)]">
        <FolderKanban size={14} className="text-[var(--color-accent-lime)]" />
        <span className="text-[9px] uppercase tracking-wider font-mono font-semibold text-[var(--color-accent-lime)]">
          Collection
        </span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-accent-lime)]" />
      </div>
      <div className="px-3 py-2">
        <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate" title={data.collection.name}>
          {data.collection.name}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-[var(--color-text-muted)]">
          <span>{data.folderCount} folders</span>
          <span>·</span>
          <span>{data.requestCount} requests</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          <NodeAction onClick={() => data.onStartCreate({ kind: "folder" })} title="Add root folder">
            <FolderPlus size={11} /> Folder
          </NodeAction>
          <NodeAction onClick={() => data.onStartCreate({ kind: "request" })} title="Add root request">
            <FilePlus2 size={11} /> Request
          </NodeAction>
        </div>
      </div>
    </div>
  );
}

function FolderGraphNode({ data }: NodeProps<FlowNode>) {
  if (data.kind !== "folder") return null;
  return (
    <div className="w-full overflow-hidden rounded-[var(--r-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] shadow-md shadow-black/15">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]">
        <Folder size={13} className="text-[var(--color-accent-lime)] shrink-0" />
        <span className="text-[9px] uppercase tracking-wider font-mono text-[var(--color-text-muted)]">Folder</span>
        <div className="ml-auto flex items-center gap-1">
          <NodeIconAction onClick={() => data.onStartCreate({ kind: "folder", parentId: data.folder.id })} title="Add nested folder">
            <FolderPlus size={12} />
          </NodeIconAction>
          <NodeIconAction onClick={() => data.onStartCreate({ kind: "request", parentId: data.folder.id })} title="Add request to folder">
            <FilePlus2 size={12} />
          </NodeIconAction>
          <NodeIconAction onClick={() => data.onStartRename(data.folder)} disabled={data.busy} title="Rename folder">
            <Pencil size={11} />
          </NodeIconAction>
          <NodeIconAction onClick={() => data.onDelete(data.folder)} disabled={data.busy} title="Delete folder">
            <Trash2 size={11} />
          </NodeIconAction>
        </div>
      </div>
      <div className="px-3 py-2">
        {data.isEditing ? (
          <InlineNodeName
            value={data.editValue}
            onChange={data.onEditValueChange}
            onSave={() => data.onSaveRename(data.folder.id)}
            onCancel={data.onCancelRename}
            disabled={data.busy}
          />
        ) : (
          <>
            <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate" title={data.folder.name}>
              {data.folder.name}
            </div>
            <div className="mt-1 text-[10px] font-mono text-[var(--color-text-muted)] truncate">{data.summary}</div>
          </>
        )}
      </div>
    </div>
  );
}

function RequestGraphNode({ data }: NodeProps<FlowNode>) {
  if (data.kind !== "request") return null;
  return (
    <div className="w-full overflow-hidden rounded-[var(--r-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] shadow-md shadow-black/15">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]">
        <span className={cn("text-[10px] font-mono font-bold", methodColor(data.request.method || "GET"))}>
          {data.request.method || "GET"}
        </span>
        <span className="text-[9px] uppercase tracking-wider font-mono text-[var(--color-text-muted)]">Request</span>
        <div className="ml-auto flex items-center gap-1">
          <NodeIconAction onClick={() => data.onStartRename(data.request)} disabled={data.busy} title="Rename request">
            <Pencil size={11} />
          </NodeIconAction>
          <NodeIconAction onClick={() => data.onDelete(data.request)} disabled={data.busy} title="Delete request">
            <Trash2 size={11} />
          </NodeIconAction>
        </div>
      </div>
      <div className="px-3 py-2">
        {data.isEditing ? (
          <InlineNodeName
            value={data.editValue}
            onChange={data.onEditValueChange}
            onSave={() => data.onSaveRename(data.request.id)}
            onCancel={data.onCancelRename}
            disabled={data.busy}
          />
        ) : (
          <>
            <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate" title={data.request.name}>
              {data.request.name}
            </div>
            <div className="mt-1 text-[10px] font-mono text-[var(--color-text-muted)] truncate" title={data.request.url}>
              {data.request.url || "(no URL)"}
            </div>
            <button
              onClick={() => data.onOpen(data.request)}
              className="nodrag nopan mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--color-accent-lime)] hover:text-[var(--color-accent-lime-hover)]"
              title="Open in Request Builder"
            >
              <ExternalLink size={10} /> Open request
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UnlinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  interactionWidth = 0,
  data,
}: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="nodrag nopan pointer-events-auto absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] text-[var(--color-text-muted)] hover:border-[var(--color-status-error)] hover:text-[var(--color-status-error)]"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          title="Unlink connection"
          aria-label="Unlink connection"
          onClick={(event) => {
            event.stopPropagation();
            data?.onUnlink?.(id);
          }}
          onContextMenu={(event) => {
            data?.onContextMenu?.(event, id);
          }}
        >
          <Link2Off size={9} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

function InlineNodeName({
  value,
  onChange,
  onSave,
  onCancel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div className="nodrag flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSave();
          if (event.key === "Escape") onCancel();
        }}
        className="nodrag min-w-0 flex-1 bg-[var(--color-surface-canvas)] border border-[var(--color-border-focus)] rounded-[var(--r-sm)] px-1.5 py-1 text-xs text-[var(--color-text-primary)] outline-none"
      />
      <NodeIconAction onClick={onSave} disabled={disabled || !value.trim()} title="Save name">
        <Check size={12} className="text-[var(--color-status-success)]" />
      </NodeIconAction>
      <NodeIconAction onClick={onCancel} title="Cancel">
        <X size={12} />
      </NodeIconAction>
    </div>
  );
}

function NodeAction({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="nodrag nopan inline-flex items-center gap-1 px-1.5 py-1 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-lime)]"
    >
      {children}
    </button>
  );
}

function NodeIconAction({
  children,
  onClick,
  title,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="nodrag nopan p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent-lime)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function createGraphNodes({
  collection,
  folders,
  requests,
  foldersTree,
  busy,
  startCreate,
  startRenameFolder,
  saveFolderName,
  cancelRenameFolder,
  deleteFolder,
  startRenameRequest,
  saveRequestName,
  cancelRenameRequest,
  deleteRequest,
  openRequest,
  editingFolderId,
  editingFolderName,
  setEditingFolderName,
  editingRequestId,
  editingRequestName,
  setEditingRequestName,
}: {
  collection: CollectionItem;
  folders: FolderItem[];
  requests: RequestItem[];
  foldersTree: FolderNode[];
  busy: boolean;
  startCreate: (target: CreateTarget) => void;
  startRenameFolder: (folder: FolderItem) => void;
  saveFolderName: (folderId: string) => void;
  cancelRenameFolder: () => void;
  deleteFolder: (folder: FolderItem) => void;
  startRenameRequest: (request: RequestItem) => void;
  saveRequestName: (requestId: string) => void;
  cancelRenameRequest: () => void;
  deleteRequest: (request: RequestItem) => void;
  openRequest: (request: RequestItem) => void;
  editingFolderId: string | null;
  editingFolderName: string;
  setEditingFolderName: (value: string) => void;
  editingRequestId: string | null;
  editingRequestName: string;
  setEditingRequestName: (value: string) => void;
}): FlowNode[] {
  const rootId = `collection-${collection.id}`;
  const folderIds = new Set(folders.map((folder) => folder.id));
  const flowNodes: FlowNode[] = [
    {
      id: rootId,
      type: "collection",
      position: { x: 0, y: 0 },
      style: { width: NODE_WIDTH.collection, minHeight: NODE_HEIGHT.collection },
      data: {
        kind: "collection",
        collection,
        folderCount: countFolders(foldersTree),
        requestCount: requests.length,
        onStartCreate: startCreate,
      },
    },
    ...folders.map((folder) => {
      const parentId = folder.parent_id ?? folder.parent_folder_id;
      return {
        id: `folder-${folder.id}`,
        type: "folder",
        position: { x: 0, y: 0 },
        style: { width: NODE_WIDTH.folder, minHeight: NODE_HEIGHT.folder },
        data: {
          kind: "folder" as const,
          folder,
          parentNodeId: parentId && folderIds.has(parentId) ? `folder-${parentId}` : rootId,
          summary: getFolderSummary(folder.id, folders, requests),
          busy,
          isEditing: editingFolderId === folder.id,
          editValue: editingFolderName,
          onEditValueChange: setEditingFolderName,
          onStartCreate: (target: CreateTarget) => startCreate({ ...target, parentId: target.parentId ?? folder.id }),
          onStartRename: startRenameFolder,
          onSaveRename: saveFolderName,
          onCancelRename: cancelRenameFolder,
          onDelete: deleteFolder,
        },
      };
    }),
    ...requests.map((request) => {
      const parentFolderId = request.folder_id ?? request.folderId;
      return {
        id: `request-${request.id}`,
        type: "request",
        position: { x: 0, y: 0 },
        style: { width: NODE_WIDTH.request, minHeight: NODE_HEIGHT.request },
        data: {
          kind: "request" as const,
          request,
          parentNodeId: parentFolderId && folderIds.has(parentFolderId) ? `folder-${parentFolderId}` : rootId,
          busy,
          isEditing: editingRequestId === request.id,
          editValue: editingRequestName,
          onEditValueChange: setEditingRequestName,
          onStartRename: startRenameRequest,
          onSaveRename: saveRequestName,
          onCancelRename: cancelRenameRequest,
          onDelete: deleteRequest,
          onOpen: openRequest,
        },
      };
    }),
  ];

  const positions = layoutNodes(flowNodes);
  return flowNodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position }));
}

function createFlowGraph(
  nodes: FlowNode[],
  savedPositions: Record<string, { x: number; y: number }>,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const positionedNodes = nodes.map((node) => ({
    ...node,
    position: savedPositions[node.id] ?? node.position,
  }));
  return {
    nodes: positionedNodes,
    edges: positionedNodes.flatMap((node) => {
      if (node.data.kind === "collection") return [];
      return [createGraphEdge(node.data.parentNodeId, node.id, "ownership")];
    }),
  };
}

function createGraphEdge(source: string, target: string, kind: FlowEdgeData["kind"]): FlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: "unlink",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-accent-lime)" },
    style: { stroke: "var(--color-border-hover)", strokeWidth: 1.5 },
    interactionWidth: 0,
    selectable: false,
    focusable: false,
    data: { kind },
  };
}

function readSavedEdges(
  key: string,
  fallback: FlowEdge[],
  nodes: FlowNode[],
): FlowEdge[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return fallback;
    const validNodeIds = new Set(nodes.map((node) => node.id));
    const ownershipEdgeIds = new Set(fallback.map((edge) => edge.id));
    const edges: FlowEdge[] = [];
    const edgeIds = new Set<string>();
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const candidate = value as Record<string, unknown>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.source !== "string" ||
        typeof candidate.target !== "string" ||
        candidate.source === candidate.target ||
        !validNodeIds.has(candidate.source) ||
        !validNodeIds.has(candidate.target) ||
        edgeIds.has(candidate.id)
      ) {
        continue;
      }
      edgeIds.add(candidate.id);
      const savedData =
        candidate.data && typeof candidate.data === "object"
          ? candidate.data as Record<string, unknown>
          : null;
      const kind =
        savedData?.kind === "ownership" || savedData?.kind === "visual"
          ? savedData.kind
          : ownershipEdgeIds.has(candidate.id)
            ? "ownership"
            : "visual";
      edges.push({
        ...createGraphEdge(candidate.source, candidate.target, kind),
        id: candidate.id,
      });
    }
    return edges;
  } catch (error) {
    console.warn("Could not read saved collection graph connections", error);
    return fallback;
  }
}

function buildMoveMenuItems(
  request: RequestItem,
  folders: FolderItem[],
  onMove: (request: RequestItem, folderId?: string) => Promise<boolean>,
): ContextMenuItem[] {
  const currentFolderId = request.folder_id ?? request.folderId;
  const collectionId = request.collection_id ?? request.collectionId ?? "";
  const folderItems: ContextMenuItem[] = [];
  const append = (folderNodes: FolderNode[], parentPath = "") => {
    for (const folder of folderNodes) {
      const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
      folderItems.push({
        label: path,
        icon: <Folder size={12} />,
        disabled: currentFolderId === folder.id,
        onSelect: () => void onMove(request, folder.id),
      });
      append(folder.children, path);
    }
  };
  append(buildFolderTree(folders, collectionId));
  return [
    {
      label: "Collection root",
      icon: <FolderKanban size={12} />,
      disabled: !currentFolderId,
      onSelect: () => void onMove(request),
    },
    ...(folderItems.length ? [{ separator: true, label: "" }, ...folderItems] : []),
  ];
}

function layoutNodes(nodes: FlowNode[]): Record<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    if (node.data.kind === "collection") continue;
    const children = childrenByParent.get(node.data.parentNodeId) ?? [];
    children.push(node);
    childrenByParent.set(node.data.parentNodeId, children);
  }
  const root = nodes.find((node) => node.type === "collection");
  if (!root) return {};

  const positions: Record<string, { x: number; y: number }> = {};
  let nextLeafY = 36;
  const place = (node: FlowNode, depth: number): number => {
    const children = childrenByParent.get(node.id) ?? [];
    let centerY: number;
    if (!children.length) {
      const height = node.style?.minHeight as number ?? NODE_HEIGHT.request;
      centerY = nextLeafY + height / 2;
      nextLeafY += height + ROW_GAP;
    } else {
      const centers = children.map((child) => place(byId.get(child.id)!, depth + 1));
      centerY = centers.reduce((sum, center) => sum + center, 0) / centers.length;
    }
    const height = node.style?.minHeight as number ?? NODE_HEIGHT.request;
    positions[node.id] = {
      x: 36 + depth * (NODE_WIDTH.request + COLUMN_GAP),
      y: Math.max(24, centerY - height / 2),
    };
    return centerY;
  };
  place(root, 0);
  return positions;
}

function readSavedPositions(key: string): Record<string, { x: number; y: number }> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, position]) =>
          position &&
          typeof position === "object" &&
          Number.isFinite((position as { x?: number }).x) &&
          Number.isFinite((position as { y?: number }).y),
      ),
    ) as Record<string, { x: number; y: number }>;
  } catch (error) {
    console.warn("Could not read saved collection graph layout", error);
    return {};
  }
}

function getFolderSummary(folderId: string, folders: FolderItem[], requests: RequestItem[]): string {
  const folderCount = folders.filter(
    (folder) => (folder.parent_id ?? folder.parent_folder_id) === folderId,
  ).length;
  const requestCount = requests.filter(
    (request) => (request.folder_id ?? request.folderId) === folderId,
  ).length;
  return `${folderCount} ${folderCount === 1 ? "folder" : "folders"} · ${requestCount} ${
    requestCount === 1 ? "request" : "requests"
  }`;
}
