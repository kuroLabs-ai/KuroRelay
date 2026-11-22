export interface ParsedCurl {
  url: string;
  method: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  body: {
    type: "none" | "json" | "raw" | "form" | "multipart";
    content?: string;
  };
  auth: {
    type: "none" | "bearer" | "basic" | "api_key";
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
  options: {
    verify_ssl?: boolean;
    follow_redirects?: boolean;
    timeout_ms?: number;
    allow_private_network?: boolean;
  };
}

/**
 * Checks if a string looks like a cURL command.
 */
export function isCurlCommand(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  return (
    trimmed.startsWith("curl ") ||
    trimmed.startsWith("curl\n") ||
    trimmed.startsWith("curl\r\n") ||
    trimmed.startsWith("curl.exe ") ||
    trimmed.startsWith("curl.exe\n") ||
    trimmed.startsWith("curl.exe\r\n")
  );
}

/**
 * Tokenizes a shell command string into array of arguments,
 * respecting single quotes, double quotes, and escaped characters.
 */
function tokenizeCommand(cmd: string): string[] {
  // Normalize line continuations (Windows ` and bash \)
  const cleaned = cmd
    .replace(/\\[\r\n]+/g, " ")
    .replace(/`[\r\n]+/g, " ")
    .trim();

  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let isEscaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (isEscaped) {
      current += char;
      isEscaped = false;
      continue;
    }

    if (char === "\\" && !inSingleQuote) {
      isEscaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parses cURL command arguments into KuroRelay request structure.
 */
export function parseCurlCommand(rawCommand: string): ParsedCurl | null {
  if (!isCurlCommand(rawCommand)) return null;

  const tokens = tokenizeCommand(rawCommand);
  if (tokens.length === 0) return null;

  // Discard leading "curl" or "curl.exe"
  if (tokens[0] === "curl" || tokens[0] === "curl.exe") {
    tokens.shift();
  }

  let method = "GET";
  let url = "";
  const headers: Array<{ key: string; value: string; enabled: boolean }> = [];
  const params: Array<{ key: string; value: string; enabled: boolean }> = [];
  const bodyParts: string[] = [];
  const formParts: Array<{ key: string; value: string }> = [];
  let hasExplicitMethod = false;

  let authType: "none" | "bearer" | "basic" | "api_key" = "none";
  let authToken: string | undefined;
  let authUsername: string | undefined;
  let authPassword: string | undefined;
  let authKey: string | undefined;
  let authValue: string | undefined;

  let verifySsl = true;
  let followRedirects = true;
  let timeoutMs = 30000;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Method: -X, --request
    if (token === "-X" || token === "--request") {
      if (i + 1 < tokens.length) {
        method = tokens[++i].toUpperCase();
        hasExplicitMethod = true;
      }
      continue;
    }

    // Headers: -H, --header
    if (token === "-H" || token === "--header") {
      if (i + 1 < tokens.length) {
        const headerStr = tokens[++i];
        const separatorIdx = headerStr.indexOf(":");
        if (separatorIdx > 0) {
          const key = headerStr.slice(0, separatorIdx).trim();
          const value = headerStr.slice(separatorIdx + 1).trim();

          // Check if Authorization Bearer
          if (key.toLowerCase() === "authorization" && value.toLowerCase().startsWith("bearer ")) {
            authType = "bearer";
            authToken = value.slice(7).trim();
          } else if (key.toLowerCase() === "x-api-key") {
            authType = "api_key";
            authKey = key;
            authValue = value;
          } else {
            headers.push({ key, value, enabled: true });
          }
        }
      }
      continue;
    }

    // Basic Auth: -u, --user
    if (token === "-u" || token === "--user") {
      if (i + 1 < tokens.length) {
        const userPass = tokens[++i];
        const colonIdx = userPass.indexOf(":");
        if (colonIdx >= 0) {
          authType = "basic";
          authUsername = userPass.slice(0, colonIdx);
          authPassword = userPass.slice(colonIdx + 1);
        } else {
          authType = "basic";
          authUsername = userPass;
          authPassword = "";
        }
      }
      continue;
    }

    // Data / Body: -d, --data, --data-raw, --data-binary, --data-ascii
    if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary" ||
      token === "--data-ascii"
    ) {
      if (!hasExplicitMethod) {
        method = "POST";
      }
      if (i + 1 < tokens.length) {
        bodyParts.push(tokens[++i]);
      }
      continue;
    }

    // Form data: -F, --form
    if (token === "-F" || token === "--form") {
      if (!hasExplicitMethod) {
        method = "POST";
      }
      if (i + 1 < tokens.length) {
        const formStr = tokens[++i];
        const eqIdx = formStr.indexOf("=");
        if (eqIdx > 0) {
          formParts.push({
            key: formStr.slice(0, eqIdx).trim(),
            value: formStr.slice(eqIdx + 1).trim(),
          });
        }
      }
      continue;
    }

    // Location / Redirects: -L, --location
    if (token === "-L" || token === "--location") {
      followRedirects = true;
      continue;
    }

    // Insecure SSL: -k, --insecure
    if (token === "-k" || token === "--insecure") {
      verifySsl = false;
      continue;
    }

    // Timeout: -m, --max-time
    if (token === "-m" || token === "--max-time") {
      if (i + 1 < tokens.length) {
        const sec = parseFloat(tokens[++i]);
        if (!isNaN(sec) && sec > 0) {
          timeoutMs = Math.round(sec * 1000);
        }
      }
      continue;
    }

    // URL flag: --url
    if (token === "--url") {
      if (i + 1 < tokens.length) {
        url = tokens[++i];
      }
      continue;
    }

    // Positional URL (starts with http:// or https:// or any non-flag token not already consumed)
    if (!token.startsWith("-") && !url) {
      url = token;
    }
  }

  if (!url) return null;

  // Split query params from URL if present
  let cleanUrl = url;
  try {
    const parsedUrl = new URL(url.startsWith("http") ? url : `http://${url}`);
    if (parsedUrl.search) {
      parsedUrl.searchParams.forEach((val, key) => {
        params.push({ key, value: val, enabled: true });
      });
      cleanUrl = url.split("?")[0];
    }
  } catch {
    // If not standard URL syntax, leave as is
  }

  // Determine body format
  let body: ParsedCurl["body"] = { type: "none" };
  if (formParts.length > 0) {
    body = {
      type: "form",
      content: JSON.stringify(formParts.map((p) => ({ ...p, enabled: true }))),
    };
  } else if (bodyParts.length > 0) {
    const rawData = bodyParts.join("&");
    try {
      const parsed = JSON.parse(rawData);
      body = {
        type: "json",
        content: JSON.stringify(parsed, null, 2),
      };
    } catch {
      body = {
        type: "raw",
        content: rawData,
      };
    }
  }

  return {
    url: cleanUrl,
    method,
    headers,
    params,
    body,
    auth: {
      type: authType,
      token: authToken,
      username: authUsername,
      password: authPassword,
      key: authKey,
      value: authValue,
    },
    options: {
      verify_ssl: verifySsl,
      follow_redirects: followRedirects,
      timeout_ms: timeoutMs,
      allow_private_network: false,
    },
  };
}
