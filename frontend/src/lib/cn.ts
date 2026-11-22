import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function methodColor(method: string): string {
  const map: Record<string, string> = {
    GET: "method-GET",
    POST: "method-POST",
    PUT: "method-PUT",
    PATCH: "method-PATCH",
    DELETE: "method-DELETE",
    WS: "method-WS",
    WEBSOCKET: "method-WS",
    GRAPHQL: "method-GRAPHQL",
    GQL: "method-GRAPHQL",
    SSE: "method-SSE",
    HEAD: "method-HEAD",
    OPTIONS: "method-OPTIONS",
  };
  return map[method.toUpperCase()] ?? "method-GET";
}

export function statusClass(code: number): string {
  if (code < 200) return "status-1xx";
  if (code < 300) return "status-2xx";
  if (code < 400) return "status-3xx";
  if (code < 500) return "status-4xx";
  return "status-5xx";
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function normalizeKVPairs(val: unknown): { key: string; value: string; enabled: boolean; description?: string }[] {
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (item && typeof item === "object") {
        return {
          key: String((item as any).key ?? ""),
          value: String((item as any).value ?? ""),
          enabled: (item as any).enabled !== false,
          description: (item as any).description ? String((item as any).description) : undefined,
        };
      }
      return { key: "", value: "", enabled: true };
    });
  }
  if (val && typeof val === "object") {
    return Object.entries(val as Record<string, unknown>).map(([key, value]) => ({
      key: String(key),
      value: String(value ?? ""),
      enabled: true,
    }));
  }
  return [];
}

export function normalizeBody(val: unknown): { type: "none" | "json" | "raw" | "form" | "multipart"; content?: string } {
  if (val && typeof val === "object") {
    const b = val as Record<string, unknown>;
    const rawType = String(b.type ?? "none").toLowerCase();
    const type = ["none", "json", "raw", "form", "multipart"].includes(rawType)
      ? (rawType as "none" | "json" | "raw" | "form" | "multipart")
      : "json";
    const content =
      typeof b.content === "string"
        ? b.content
        : typeof b.data === "string"
        ? b.data
        : b.data
        ? JSON.stringify(b.data, null, 2)
        : typeof b.content === "object" && b.content !== null
        ? JSON.stringify(b.content, null, 2)
        : "";
    return { type, content };
  }
  if (typeof val === "string" && val.trim()) {
    return { type: "raw", content: val };
  }
  return { type: "none" };
}

export function normalizeAuth(val: unknown): {
  type: "none" | "bearer" | "basic" | "api_key";
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  configuration?: Record<string, string>;
} {
  if (val && typeof val === "object") {
    const a = val as Record<string, unknown>;
    const rawType = String(a.type ?? "none").toLowerCase();
    const type = ["none", "bearer", "basic", "api_key"].includes(rawType)
      ? (rawType as "none" | "bearer" | "basic" | "api_key")
      : "none";
    return {
      type,
      token: a.token ? String(a.token) : undefined,
      username: a.username ? String(a.username) : undefined,
      password: a.password ? String(a.password) : undefined,
      key: a.key ? String(a.key) : undefined,
      value: a.value ? String(a.value) : undefined,
      configuration: typeof a.configuration === "object" ? (a.configuration as Record<string, string>) : undefined,
    };
  }
  return { type: "none" };
}

export function buildUrlWithParams(
  baseUrl: string,
  pairs: Array<{ key: string; value: string; enabled: boolean }>
): string {
  const qIdx = baseUrl.indexOf("?");
  const base = qIdx !== -1 ? baseUrl.slice(0, qIdx) : baseUrl;
  const enabledPairs = pairs.filter((p) => p.enabled && p.key);
  if (enabledPairs.length === 0) return base;
  const searchParams = new URLSearchParams();
  enabledPairs.forEach((p) => searchParams.append(p.key, p.value));
  return `${base}?${searchParams.toString()}`;
}

export function parseParamsFromUrl(
  url: string,
  currentPairs: Array<{ key: string; value: string; enabled: boolean }> = []
): Array<{ key: string; value: string; enabled: boolean }> {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) {
    const disabled = currentPairs.filter((p) => !p.enabled);
    return disabled;
  }
  const queryStr = url.slice(qIdx + 1);
  const searchParams = new URLSearchParams(queryStr);
  const result: Array<{ key: string; value: string; enabled: boolean }> = [];
  searchParams.forEach((value, key) => {
    result.push({ key, value, enabled: true });
  });
  // Preserve disabled pairs
  currentPairs.filter((p) => !p.enabled).forEach((p) => result.push(p));
  return result;
}
