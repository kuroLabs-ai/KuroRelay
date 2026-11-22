import type { KVPair } from "../bridge/client";

/**
 * Extracts path variable keys from a URL string (e.g. ":id" or "{id}").
 * Only parses the path component before the query string "?" or hash "#".
 */
export function extractPathVariables(url: string): string[] {
  if (!url) return [];
  const pathPart = url.split("?")[0].split("#")[0];
  const keys: string[] = [];

  // Match :key preceded by '/' (to avoid matching protocol https:)
  const colonMatches = pathPart.matchAll(/(?<=\/):([a-zA-Z0-9_]+)/g);
  for (const m of colonMatches) {
    if (m[1] && !keys.includes(m[1])) {
      keys.push(m[1]);
    }
  }

  // Match {key}
  const braceMatches = pathPart.matchAll(/\{([a-zA-Z0-9_]+)\}/g);
  for (const m of braceMatches) {
    if (m[1] && !keys.includes(m[1])) {
      keys.push(m[1]);
    }
  }

  return keys;
}

/**
 * Syncs extracted path variable keys with existing path variable pairs.
 * Preserves user-entered values for existing keys.
 */
export function syncPathVariables(
  extractedKeys: string[],
  existingPairs: KVPair[] = []
): KVPair[] {
  const existingMap = new Map<string, KVPair>();
  for (const p of existingPairs) {
    if (p.key) existingMap.set(p.key, p);
  }

  return extractedKeys.map((key) => {
    const existing = existingMap.get(key);
    return {
      key,
      value: existing ? existing.value : "",
      enabled: existing ? existing.enabled : true,
    };
  });
}

/**
 * Interpolates path variable values into a URL.
 */
export function substitutePathVariables(
  url: string,
  pathVariables: KVPair[] = []
): string {
  if (!url || !pathVariables.length) return url;

  let substituted = url;
  for (const pv of pathVariables) {
    if (!pv.enabled || !pv.key || pv.value === undefined || pv.value === "") continue;
    const key = pv.key;
    const val = encodeURIComponent(pv.value);

    // Replace /:key with /val
    substituted = substituted.replace(new RegExp(`/:${key}(?=[/?#]|$)`, "g"), `/${val}`);
    // Replace {key} with val
    substituted = substituted.replace(new RegExp(`\\{${key}\\}`, "g"), val);
  }

  return substituted;
}
