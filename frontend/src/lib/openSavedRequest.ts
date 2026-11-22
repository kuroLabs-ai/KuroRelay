import { normalizeAuth, normalizeBody, normalizeKVPairs } from "./cn";
import type { RequestItem, Tab } from "../stores/appStore";

interface RequestTabActions {
  tabs: Tab[];
  openTab: (partial?: Partial<Tab>, allowDuplicate?: boolean) => string;
  setActiveTab: (id: string) => void;
  setActiveModule: (module: "request") => void;
}

type RequestProtocol = Tab["protocol"];

export function openSavedRequestInTab(
  request: RequestItem,
  collectionId: string,
  actions: RequestTabActions,
  onInvalidConfiguration: (message: string) => void,
  forceNewTab = false,
): boolean {
  const existing = actions.tabs.find((tab) => tab.savedRequestId === request.id);
  if (existing && !forceNewTab) {
    actions.setActiveTab(existing.id);
    actions.setActiveModule("request");
    return true;
  }

  let configuration = request.configuration ?? {};
  if (typeof configuration === "string") {
    try {
      configuration = JSON.parse(configuration);
    } catch {
      onInvalidConfiguration(`Could not open "${request.name}": saved request configuration is invalid`);
      return false;
    }
  }
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    configuration = {};
  }

  const method = (request.method || "GET").toUpperCase();
  const configuredProtocol = configuration.protocol;
  const protocol: RequestProtocol = isRequestProtocol(configuredProtocol)
    ? configuredProtocol
    : method === "WS"
      ? "websocket"
      : method === "GQL" || method === "GRAPHQL"
        ? "graphql"
        : method === "SSE"
          ? "sse"
          : "http";

  actions.openTab({
    name: request.name || "Saved Request",
    method,
    url: request.url || "",
    protocol,
    savedRequestId: request.id,
    collectionId: request.collectionId || request.collection_id || collectionId,
    params: normalizeKVPairs(configuration.params),
    headers: normalizeKVPairs(configuration.headers),
    body: normalizeBody(configuration.body),
    auth: normalizeAuth(configuration.auth),
    options: configuration.options || {},
    extractions: Array.isArray(configuration.extractions) ? configuration.extractions : [],
    isDirty: false,
  }, forceNewTab);
  actions.setActiveModule("request");
  return true;
}

function isRequestProtocol(value: unknown): value is RequestProtocol {
  return value === "http" || value === "websocket" || value === "graphql" || value === "sse";
}
