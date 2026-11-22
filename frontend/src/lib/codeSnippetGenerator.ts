import type { Tab } from "../stores/appStore";
import { substitutePathVariables } from "./pathVariables";

export type CodeSnippetLang = "curl" | "fetch" | "python" | "axios";

export function generateSnippet(tab: Tab, lang: CodeSnippetLang): string {
  const method = (tab.method || "GET").toUpperCase();
  const rawUrl = tab.url || "https://api.example.com";
  const url = substitutePathVariables(rawUrl, tab.pathVariables);

  // Build headers record
  const headers: Record<string, string> = {};
  (tab.headers || []).forEach((h) => {
    if (h.enabled && h.key) headers[h.key] = h.value;
  });

  // Apply Auth
  if (tab.auth && tab.auth.type !== "none") {
    if (tab.auth.type === "bearer" && tab.auth.token) {
      headers["Authorization"] = `Bearer ${tab.auth.token}`;
    } else if (tab.auth.type === "basic" && (tab.auth.username || tab.auth.password)) {
      const creds = btoa(`${tab.auth.username || ""}:${tab.auth.password || ""}`);
      headers["Authorization"] = `Basic ${creds}`;
    } else if (tab.auth.type === "api_key" && tab.auth.key) {
      headers[tab.auth.key] = tab.auth.value || "";
    }
  }

  // Body content
  let bodyData: any = null;
  let bodyStr = "";
  if (tab.body && tab.body.type !== "none") {
    if (tab.body.type === "json") {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      bodyStr = tab.body.content || "{}";
      try {
        bodyData = JSON.parse(tab.body.content || "{}");
      } catch {
        bodyData = tab.body.content;
      }
    } else if (tab.body.type === "form") {
      headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded";
      bodyStr = tab.body.content || "";
    } else if (tab.body.type === "multipart") {
      bodyStr = tab.body.content || "";
      try {
        bodyData = JSON.parse(tab.body.content || "[]");
      } catch {
        bodyData = null;
      }
    } else if (tab.body.type === "raw") {
      bodyStr = tab.body.content || "";
    }
  }

  switch (lang) {
    case "curl": {
      let cmd = `curl -X ${method} "${url}"`;
      Object.entries(headers).forEach(([k, v]) => {
        cmd += ` \\\n  -H "${k}: ${v}"`;
      });
      if (tab.body?.type === "multipart" && Array.isArray(bodyData)) {
        bodyData.forEach((item: any) => {
          if (item && item.enabled && item.key) {
            if (item.type === "file") {
              cmd += ` \\\n  -F "${item.key}=@${item.value || item.filename || "file"}"`;
            } else {
              cmd += ` \\\n  -F "${item.key}=${item.value || ""}"`;
            }
          }
        });
      } else if (bodyStr && method !== "GET" && method !== "HEAD") {
        cmd += ` \\\n  -d '${bodyStr.replace(/'/g, "'\\''")}'`;
      }
      return cmd;
    }

    case "fetch": {
      const opts: Record<string, any> = { method };
      if (Object.keys(headers).length > 0) opts.headers = headers;
      if (bodyStr && method !== "GET" && method !== "HEAD") {
        opts.body = tab.body.type === "json" ? `JSON.stringify(${JSON.stringify(bodyData, null, 2)})` : JSON.stringify(bodyStr);
      }

      let code = `const url = "${url}";\n`;
      code += `const options = {\n  method: "${method}",\n`;
      if (Object.keys(headers).length > 0) {
        code += `  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, "\n  ")},\n`;
      }
      if (bodyStr && method !== "GET" && method !== "HEAD") {
        code += `  body: ${tab.body.type === "json" ? `JSON.stringify(${JSON.stringify(bodyData, null, 4).replace(/\n/g, "\n  ")})` : JSON.stringify(bodyStr)},\n`;
      }
      code += `};\n\n`;
      code += `try {\n  const response = await fetch(url, options);\n  const data = await response.json();\n  console.log(data);\n} catch (error) {\n  console.error(error);\n}`;
      return code;
    }

    case "python": {
      let code = `import requests\n\n`;
      code += `url = "${url}"\n\n`;
      if (Object.keys(headers).length > 0) {
        code += `headers = ${JSON.stringify(headers, null, 4)}\n\n`;
      } else {
        code += `headers = {}\n\n`;
      }

      let dataParam = "";
      if (bodyStr && method !== "GET" && method !== "HEAD") {
        if (tab.body.type === "json") {
          code += `payload = ${JSON.stringify(bodyData, null, 4)}\n\n`;
          dataParam = `, json=payload`;
        } else {
          code += `payload = ${JSON.stringify(bodyStr)}\n\n`;
          dataParam = `, data=payload`;
        }
      }

      code += `response = requests.request("${method}", url, headers=headers${dataParam})\n\n`;
      code += `print(response.status_code)\nprint(response.text)\n`;
      return code;
    }

    case "axios": {
      let code = `const axios = require('axios');\n\n`;
      code += `const config = {\n`;
      code += `  method: '${method.toLowerCase()}',\n`;
      code += `  url: '${url}',\n`;
      if (Object.keys(headers).length > 0) {
        code += `  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, "\n  ")},\n`;
      }
      if (bodyStr && method !== "GET" && method !== "HEAD") {
        code += `  data: ${JSON.stringify(bodyData || bodyStr, null, 4).replace(/\n/g, "\n  ")},\n`;
      }
      code += `};\n\n`;
      code += `axios(config)\n`;
      code += `  .then((response) => {\n    console.log(JSON.stringify(response.data));\n  })\n`;
      code += `  .catch((error) => {\n    console.log(error);\n  });\n`;
      return code;
    }
  }
}
