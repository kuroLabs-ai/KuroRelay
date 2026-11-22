export interface EnvVarItem {
  id?: string;
  key: string;
  value: string; // Current Value
  initial_value?: string; // Initial Value (baseline)
  is_secret?: boolean;
  is_enabled?: boolean;
}

export interface EnvironmentModel {
  id: string;
  name: string;
  is_active?: boolean;
  variables: EnvVarItem[];
}

/**
 * Export environment as a standard .env formatted string.
 */
export function exportEnvironmentToEnv(
  env: EnvironmentModel,
  useCurrentValue = true,
  initialValues: Record<string, string> = {},
): string {
  const lines: string[] = [`# Environment: ${env.name}`, ""];
  for (const v of env.variables) {
    if (!v.key) continue;
    const prefix = v.is_enabled === false ? "# " : "";
    const val = (useCurrentValue ? v.value : (initialValues[v.key] ?? v.initial_value ?? v.value)) || "";
    // Wrap value in quotes if it contains spaces, newlines, or quotes
    const needsQuotes = /[\s"#]/.test(val);
    const escaped = needsQuotes ? `"${val.replace(/"/g, '\\"')}"` : val;
    lines.push(`${prefix}${v.key}=${escaped}`);
  }
  return lines.join("\n");
}

/**
 * Export environment as Postman Environment JSON format.
 */
export function exportEnvironmentToPostman(
  env: EnvironmentModel,
  useCurrentValue = true,
  initialValues: Record<string, string> = {},
): string {
  const postmanFormat = {
    id: env.id,
    name: env.name,
    values: env.variables.map((v) => ({
      key: v.key,
      value: (useCurrentValue ? v.value : (initialValues[v.key] ?? v.initial_value ?? v.value)) || "",
      type: v.is_secret ? "secret" : "default",
      enabled: v.is_enabled !== false,
    })),
    _postman_variable_scope: "environment",
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: "KuroRelay",
  };
  return JSON.stringify(postmanFormat, null, 2);
}

export type ImportConflictPolicy = "overwrite" | "skip";

export function getImportConflictKeys(
  variables: EnvVarItem[],
  existingKeys: Iterable<string> = [],
): Set<string> {
  const conflicts = new Set<string>();
  const seen = new Set<string>();
  const existing = new Set(existingKeys);

  for (const variable of variables) {
    if (existing.has(variable.key) || seen.has(variable.key)) {
      conflicts.add(variable.key);
    }
    seen.add(variable.key);
  }

  return conflicts;
}

export function planImportedVariables(
  variables: EnvVarItem[],
  existingKeys: Iterable<string>,
  policy: ImportConflictPolicy,
): EnvVarItem[] {
  const existing = new Set(existingKeys);
  const planned = new Map<string, EnvVarItem>();

  for (const variable of variables) {
    if (policy === "skip" && (existing.has(variable.key) || planned.has(variable.key))) {
      continue;
    }
    planned.set(variable.key, variable);
  }

  return [...planned.values()];
}

/**
 * Parse .env or key-value text lines.
 */
export function parseEnvText(text: string): { key: string; value: string; is_enabled: boolean }[] {
  const result: { key: string; value: string; is_enabled: boolean }[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let isEnabled = true;
    let content = trimmed;

    // Check if line is commented out
    if (content.startsWith("#") || content.startsWith("//")) {
      content = content.replace(/^(#|\/\/)\s*/, "").trim();
      isEnabled = false;
    }

    // Try finding delimiter = or :
    let eqIdx = content.indexOf("=");
    if (eqIdx === -1) {
      eqIdx = content.indexOf(":");
    }

    if (eqIdx === -1) {
      continue;
    }

    const rawKey = content.slice(0, eqIdx).trim();
    let rawVal = content.slice(eqIdx + 1).trim();

    // Strip wrapping quotes
    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      rawVal = rawVal.slice(1, -1).replace(/\\"/g, '"');
    }

    if (rawKey) {
      result.push({
        key: rawKey,
        value: rawVal,
        is_enabled: isEnabled,
      });
    }
  }

  return result;
}

/**
 * Try parsing text as Postman Environment JSON. Returns null if not valid.
 */
export function parsePostmanEnvironment(
  raw: string
): { name?: string; variables: EnvVarItem[] } | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.values)) {
      const vars: EnvVarItem[] = parsed.values
        .filter((item: any) => item && typeof item.key === "string" && item.key.trim())
        .map((item: any) => ({
          key: item.key.trim(),
          value: typeof item.value === "string" ? item.value : String(item.value ?? ""),
          initial_value: typeof item.value === "string" ? item.value : String(item.value ?? ""),
          is_secret: item.type === "secret",
          is_enabled: item.enabled !== false,
        }));
      return {
        name: typeof parsed.name === "string" ? parsed.name : undefined,
        variables: vars,
      };
    }
  } catch {
    // not JSON
  }
  return null;
}
