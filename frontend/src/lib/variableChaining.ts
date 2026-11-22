export interface ExtractionRule {
  id: string;
  enabled: boolean;
  source: "body_json" | "header" | "status";
  path: string; // e.g. "data.token", "items[0].id", "Authorization"
  variableName: string; // e.g. "BEARER_TOKEN"
  targetScope: "environment" | "global";
}

/**
 * Resolves dot-notation & array indexed paths like "data.user.roles[0].name" from an object.
 */
export function getByPath(obj: any, path: string): any {
  if (obj === null || obj === undefined || !path) return undefined;

  // Normalize array syntax: data[0].name -> data.0.name
  const normalizedPath = path
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/^\./, "");

  const parts = normalizedPath.split(".");
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Extracts a value from a response object according to an ExtractionRule.
 */
export function extractValueFromResponse(rule: ExtractionRule, response: any): string | null {
  if (!response || !rule.enabled) return null;

  // Unpack KuroRelay response structure
  const respData = response.response || response;
  const rawBodyObj = respData.body;
  const bodyData =
    rawBodyObj && typeof rawBodyObj === "object" && "data" in rawBodyObj
      ? (rawBodyObj as any).data
      : rawBodyObj;

  const headers = respData.headers || {};
  const statusCode = respData.status_code ?? response.status_code;

  if (rule.source === "status") {
    return statusCode != null ? String(statusCode) : null;
  }

  if (rule.source === "header") {
    const targetKey = rule.path.trim().toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === targetKey) {
        return typeof v === "string" ? v : String(v);
      }
    }
    return null;
  }

  if (rule.source === "body_json") {
    // If bodyData is a string, try JSON.parse
    let parsedBody = bodyData;
    if (typeof bodyData === "string") {
      try {
        parsedBody = JSON.parse(bodyData);
      } catch {
        return null;
      }
    }

    if (!parsedBody || typeof parsedBody !== "object") return null;

    const val = getByPath(parsedBody, rule.path.trim());
    if (val === undefined || val === null) return null;

    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  }

  return null;
}
