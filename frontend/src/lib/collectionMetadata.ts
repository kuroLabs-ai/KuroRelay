import type { KVPair } from "../bridge/client";

export interface CollectionAuth {
  type: "none" | "bearer" | "basic" | "api_key";
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  addTo?: "header" | "query";
}

export interface CollectionMetadata {
  about: string;
  auth: CollectionAuth;
  headers: KVPair[];
}

export function parseCollectionMetadata(rawDescription: string | null | undefined): CollectionMetadata {
  const defaultMeta: CollectionMetadata = {
    about: rawDescription || "",
    auth: { type: "none" },
    headers: [],
  };

  if (!rawDescription || typeof rawDescription !== "string") {
    return defaultMeta;
  }

  const trimmed = rawDescription.trim();
  if (!trimmed.startsWith("{")) {
    return defaultMeta;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return {
        about: typeof parsed.about === "string" ? parsed.about : "",
        auth: parsed.auth && typeof parsed.auth === "object" ? parsed.auth : { type: "none" },
        headers: Array.isArray(parsed.headers) ? parsed.headers : [],
      };
    }
  } catch {
    // If invalid JSON, treat as raw about text
  }

  return defaultMeta;
}

export function serializeCollectionMetadata(meta: CollectionMetadata): string {
  // If no auth and no headers, just store plain text about
  if (
    (!meta.auth || meta.auth.type === "none") &&
    (!meta.headers || meta.headers.length === 0)
  ) {
    return meta.about || "";
  }

  return JSON.stringify({
    _kuroMeta: true,
    about: meta.about || "",
    auth: meta.auth || { type: "none" },
    headers: meta.headers || [],
  });
}
