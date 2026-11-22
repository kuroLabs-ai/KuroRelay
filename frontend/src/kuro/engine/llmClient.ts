// ─────────────────────────────────────────────────────────────
// Kuro Engine — Multi-Provider LLM Client with Native Tool Calling & Streaming
// ─────────────────────────────────────────────────────────────

import { KURO_PROVIDERS, type KuroProviderId, type KuroToolDef, type KuroMessage } from "./types";

export interface ModelFetchResult {
  provider: KuroProviderId;
  models: string[];
  error?: string;
}

// ── 1. Live Models Query ───────────────────────────────────────
export async function fetchProviderModels(
  provider: KuroProviderId,
  apiKey?: string,
  customBaseUrl?: string
): Promise<ModelFetchResult> {
  const meta = KURO_PROVIDERS[provider];
  const baseUrl = (customBaseUrl?.trim() || meta.defaultBaseUrl).replace(/\/+$/, "");

  try {
    if (provider === "google") {
      if (!apiKey) return { provider, models: meta.defaultModels };
      const url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawList: Array<{ name: string; supportedGenerationMethods?: string[] }> = data?.models || [];
      const filtered = rawList
        .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((id) => id.includes("gemini") && !id.includes("vision"));

      return {
        provider,
        models: filtered.length > 0 ? filtered : meta.defaultModels,
      };
    }

    if (provider === "openai" || provider === "groq" || provider === "openrouter" || provider === "custom") {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey?.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://kurorelay.local";
        headers["X-Title"] = "KuroRelay";
      }

      const res = await fetch(`${baseUrl}/models`, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawList: Array<{ id: string }> = data?.data || [];
      const modelIds = rawList.map((m) => m.id);
      return {
        provider,
        models: modelIds.length > 0 ? modelIds : meta.defaultModels,
      };
    }

    if (provider === "ollama") {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
      const data = await res.json();
      const rawList: Array<{ name: string }> = data?.models || [];
      const modelNames = rawList.map((m) => m.name);
      return {
        provider,
        models: modelNames.length > 0 ? modelNames : meta.defaultModels,
      };
    }

    if (provider === "anthropic") {
      return { provider, models: meta.defaultModels };
    }

    return { provider, models: meta.defaultModels };
  } catch (err: any) {
    return {
      provider,
      models: meta.defaultModels,
      error: err.message || String(err),
    };
  }
}

// ── 2. Tool Formatters ─────────────────────────────────────────

export function formatOpenAITools(tools: KuroToolDef[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function formatGeminiTools(tools: KuroToolDef[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: "OBJECT",
          properties: Object.fromEntries(
            Object.entries(t.parameters.properties).map(([k, prop]) => {
              const geminiType =
                prop.type === "number"
                  ? "NUMBER"
                  : prop.type === "boolean"
                  ? "BOOLEAN"
                  : prop.type === "array"
                  ? "ARRAY"
                  : "STRING";
              return [
                k,
                {
                  type: geminiType,
                  description: prop.description,
                },
              ];
            })
          ),
          required: t.parameters.required || [],
        },
      })),
    },
  ];
}

export function formatAnthropicTools(tools: KuroToolDef[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onToolCallDetected?: (call: { id: string; name: string; arguments: Record<string, any> }) => void;
}

export interface ChatResponse {
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, any> }>;
  rawParts?: any[];
  error?: string;
}

// ── 3. Universal LLM Caller ────────────────────────────────────
export async function callLLM(
  provider: KuroProviderId,
  model: string,
  apiKey: string | undefined,
  baseUrl: string | undefined,
  systemPrompt: string,
  messages: KuroMessage[],
  tools: KuroToolDef[],
  temperature = 0.4,
  callbacks?: StreamCallbacks
): Promise<ChatResponse> {
  const meta = KURO_PROVIDERS[provider];
  const resolvedBaseUrl = (baseUrl?.trim() || meta.defaultBaseUrl).replace(/\/+$/, "");

  // Dispatch by Provider
  if (provider === "google") {
    return callGoogleGemini(resolvedBaseUrl, model, apiKey, systemPrompt, messages, tools, temperature, callbacks);
  }

  if (provider === "anthropic") {
    return callAnthropic(resolvedBaseUrl, model, apiKey, systemPrompt, messages, tools, temperature, callbacks);
  }

  return callOpenAICompatible(provider, resolvedBaseUrl, model, apiKey, systemPrompt, messages, tools, temperature, callbacks);
}

// ── Google Gemini Implementation ──────────────────────────────
async function callGoogleGemini(
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  systemPrompt: string,
  messages: KuroMessage[],
  tools: KuroToolDef[],
  temperature: number,
  callbacks?: StreamCallbacks
): Promise<ChatResponse> {
  if (!apiKey?.trim()) {
    throw new Error("Google Gemini API key is missing. Please set it in Kuro Settings.");
  }

  const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  // Build Gemini contents with proper multi-turn function calling
  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "assistant") {
      if (m.rawParts && m.rawParts.length > 0) {
        // Preserve original model parts with exact thought signatures and function calls
        contents.push({
          role: "model",
          parts: m.rawParts,
        });
      } else {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.toolCalls && m.toolCalls.length > 0) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        contents.push({
          role: "model",
          parts: parts.length > 0 ? parts : [{ text: "Executing tools..." }],
        });
      }
    } else if (m.role === "tool") {
      // In Google Gemini Generative Language API, function responses MUST be sent under role: "user"
      if (m.toolResults && m.toolResults.length > 0) {
        const functionParts = m.toolResults.map((tr) => ({
          functionResponse: {
            name: tr.toolName,
            response: {
              output: tr.success ? tr.result : { error: tr.error },
            },
          },
        }));
        contents.push({
          role: "user",
          parts: functionParts,
        });
      } else {
        contents.push({
          role: "user",
          parts: [{ text: m.content || "Tool executed." }],
        });
      }
    } else {
      contents.push({
        role: "user",
        parts: [{ text: m.content || "" }],
      });
    }
  }

  const payload: any = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    tools: formatGeminiTools(tools),
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",
      },
    },
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
    },
  };

  let res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData?.error?.message || "";

    // Automatic fallback if high demand (503 / 429) on preview models
    if ((res.status === 503 || res.status === 429 || errMsg.includes("high demand")) && model !== "gemini-1.5-flash") {
      console.warn(`[Kuro] ${model} is experiencing high demand, automatically falling back to gemini-1.5-flash...`);
      const fallbackEndpoint = `${baseUrl}/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const fallbackRes = await fetch(fallbackEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (fallbackRes.ok) {
        res = fallbackRes;
      } else {
        throw new Error(errMsg || `Gemini error HTTP ${res.status}`);
      }
    } else {
      throw new Error(errMsg || `Gemini error HTTP ${res.status}`);
    }
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: any[] = candidate?.content?.parts || [];
  let text = "";
  const detectedCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

  for (const p of parts) {
    if (p.text) text += p.text;
    if (p.functionCall) {
      detectedCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args || {},
      });
    }
  }

  // Also parse any fallback textual directives if emitted in prose
  const textualCalls = parseToolCallsFromText(text);
  for (const tc of textualCalls) {
    if (!detectedCalls.some((c) => c.name === tc.name || c.name.endsWith(`:${tc.name}`))) {
      detectedCalls.push(tc);
    }
  }

  if (callbacks?.onToken && text) callbacks.onToken(text);

  return {
    content: text,
    toolCalls: detectedCalls.length > 0 ? detectedCalls : undefined,
    rawParts: parts.length > 0 ? parts : undefined,
  };
}

// ── Anthropic Claude Implementation ───────────────────────────
async function callAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  systemPrompt: string,
  messages: KuroMessage[],
  tools: KuroToolDef[],
  temperature: number,
  callbacks?: StreamCallbacks
): Promise<ChatResponse> {
  if (!apiKey?.trim()) {
    throw new Error("Anthropic API key is missing. Please set it in Kuro Settings.");
  }

  const anthropicMessages: any[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "assistant") {
      const contentParts: any[] = [];
      if (m.content) contentParts.push({ type: "text", text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          contentParts.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
      }
      anthropicMessages.push({
        role: "assistant",
        content: contentParts.length > 0 ? contentParts : "...",
      });
    } else if (m.role === "tool") {
      const toolResultsContent = (m.toolResults || []).map((tr) => ({
        type: "tool_result",
        tool_use_id: tr.callId,
        content: JSON.stringify(tr.success ? tr.result : { error: tr.error }),
      }));
      anthropicMessages.push({
        role: "user",
        content: toolResultsContent.length > 0 ? toolResultsContent : m.content,
      });
    } else {
      anthropicMessages.push({
        role: "user",
        content: m.content || "",
      });
    }
  }

  const payload = {
    model,
    system: systemPrompt,
    messages: anthropicMessages,
    tools: formatAnthropicTools(tools),
    max_tokens: 2048,
    temperature,
  };

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic HTTP ${res.status}`);
  }

  const data = await res.json();
  const contentBlocks = data?.content || [];
  let text = "";
  const detectedCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

  for (const block of contentBlocks) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      detectedCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input || {},
      });
    }
  }

  const textualCalls = parseToolCallsFromText(text);
  for (const tc of textualCalls) {
    if (!detectedCalls.some((c) => c.name === tc.name)) {
      detectedCalls.push(tc);
    }
  }

  if (callbacks?.onToken && text) callbacks.onToken(text);

  return {
    content: text,
    toolCalls: detectedCalls.length > 0 ? detectedCalls : undefined,
  };
}

// ── OpenAI-Compatible Implementation ───────────────────────────
async function callOpenAICompatible(
  provider: KuroProviderId,
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  systemPrompt: string,
  messages: KuroMessage[],
  tools: KuroToolDef[],
  temperature: number,
  callbacks?: StreamCallbacks
): Promise<ChatResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey?.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://kurorelay.local";
    headers["X-Title"] = "KuroRelay";
  }

  const apiMessages: any[] = [{ role: "system", content: systemPrompt }];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "assistant") {
      const msgObj: any = { role: "assistant", content: m.content || null };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msgObj.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }
      apiMessages.push(msgObj);
    } else if (m.role === "tool") {
      if (m.toolResults && m.toolResults.length > 0) {
        for (const tr of m.toolResults) {
          apiMessages.push({
            role: "tool",
            tool_call_id: tr.callId,
            content: JSON.stringify(tr.success ? tr.result : { error: tr.error }),
          });
        }
      } else {
        apiMessages.push({ role: "user", content: m.content });
      }
    } else {
      apiMessages.push({ role: "user", content: m.content || "" });
    }
  }

  const payload: any = {
    model,
    messages: apiMessages,
    tools: formatOpenAITools(tools),
    tool_choice: "auto",
    temperature,
  };

  const endpoint = `${baseUrl}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `${provider} returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const message = choice?.message;
  const content = message?.content || "";
  if (callbacks?.onToken && content) callbacks.onToken(content);

  const detectedCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
  if (message?.tool_calls && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        parsedArgs = {};
      }
      detectedCalls.push({
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: tc.function?.name || "",
        arguments: parsedArgs,
      });
    }
  }

  // Also check textual json tool directives
  const textualCalls = parseToolCallsFromText(content);
  for (const tc of textualCalls) {
    if (!detectedCalls.some((c) => c.name === tc.name)) {
      detectedCalls.push(tc);
    }
  }

  return {
    content,
    toolCalls: detectedCalls.length > 0 ? detectedCalls : undefined,
  };
}

// ── Textual Tool Call Parser ───────────────────────────────────
function parseToolCallsFromText(text: string): Array<{ id: string; name: string; arguments: Record<string, any> }> {
  const calls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
  const regex = /```json:kuro_tool_call\s*([\s\S]*?)\s*```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name) {
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: parsed.name,
          arguments: parsed.arguments || {},
        });
      }
    } catch {
      // Ignore malformed tool call blocks
    }
  }

  return calls;
}
