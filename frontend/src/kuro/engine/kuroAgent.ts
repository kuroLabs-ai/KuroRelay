// ─────────────────────────────────────────────────────────────
// Kuro Engine — Autonomous Agent Loop Orchestrator
// ─────────────────────────────────────────────────────────────

import { buildSystemPrompt } from "./systemPrompt";
import { KURO_TOOLS, executeKuroTool } from "./toolsRegistry";
import { callLLM } from "./llmClient";
import type { KuroMessage, KuroConfig, KuroToolResult } from "./types";

export interface AgentRunOptions {
  userPrompt: string;
  history: KuroMessage[];
  config: KuroConfig;
  onMessageUpdate: (messages: KuroMessage[]) => void;
  onStatusChange: (status: "idle" | "thinking" | "executing_tool", toolName?: string) => void;
}

export async function runKuroAgent(options: AgentRunOptions): Promise<KuroMessage[]> {
  const { userPrompt, history, config, onMessageUpdate, onStatusChange } = options;

  const userMsg: KuroMessage = {
    id: `msg_${Date.now()}_user`,
    role: "user",
    content: userPrompt,
    timestamp: Date.now(),
  };

  const updatedHistory = [...history, userMsg];
  onMessageUpdate(updatedHistory);
  onStatusChange("thinking");

  const provider = config.activeProvider;
  const apiKey = config.keys[provider];
  const baseUrl = config.baseUrls[provider];
  const selectedModel = config.selectedModels[provider] || "gemini-2.5-flash";

  let iteration = 0;
  const maxIterations = 5;

  let currentWorkingHistory = [...updatedHistory];

  while (iteration < maxIterations) {
    iteration++;

    // Generate fresh system prompt with current live UI & DB context
    const systemPrompt = buildSystemPrompt(config.personaMode);

    try {
      const response = await callLLM(
        provider,
        selectedModel,
        apiKey,
        baseUrl,
        systemPrompt,
        currentWorkingHistory,
        KURO_TOOLS,
        config.temperature
      );

      // Clean assistant content from explicit raw kuro_tool_call blocks to keep UI elegant
      const cleanedContent = response.content
        .replace(/```json:kuro_tool_call[\s\S]*?```/g, "")
        .trim();

      const assistantMsg: KuroMessage = {
        id: `msg_${Date.now()}_assistant_${iteration}`,
        role: "assistant",
        content: cleanedContent || (response.toolCalls ? "Executing requested action..." : ""),
        timestamp: Date.now(),
        toolCalls: response.toolCalls,
        toolResults: [],
        rawParts: response.rawParts,
      };

      currentWorkingHistory.push(assistantMsg);
      onMessageUpdate([...currentWorkingHistory]);

      // If no tool calls requested, the agent is done!
      if (!response.toolCalls || response.toolCalls.length === 0) {
        onStatusChange("idle");
        return currentWorkingHistory;
      }

      // Execute each tool call sequentially
      const results: KuroToolResult[] = [];
      for (const call of response.toolCalls) {
        onStatusChange("executing_tool", call.name);
        const cleanName = call.name.replace(/^default_api:/, "");
        const res = await executeKuroTool(call.id, cleanName, call.arguments);
        res.toolName = call.name;
        results.push(res);
      }

      assistantMsg.toolResults = results;
      onMessageUpdate([...currentWorkingHistory]);

      // Feed results back into conversation as structured tool results
      const toolSummaryText = results
        .map((r) => {
          if (r.success) {
            return `Tool "${r.toolName}" succeeded in ${r.durationMs}ms with result: ${JSON.stringify(r.result)}`;
          } else {
            return `Tool "${r.toolName}" failed in ${r.durationMs}ms with error: ${r.error}`;
          }
        })
        .join("\n\n");

      const toolMsg: KuroMessage = {
        id: `msg_${Date.now()}_tool_feedback_${iteration}`,
        role: "tool",
        content: toolSummaryText,
        toolResults: results,
        timestamp: Date.now(),
      };

      currentWorkingHistory.push(toolMsg);
      onStatusChange("thinking");
    } catch (err: any) {
      const errorMsg: KuroMessage = {
        id: `msg_${Date.now()}_error`,
        role: "assistant",
        content: `⚠️ Kuro encountered an issue: ${err.message || String(err)}`,
        timestamp: Date.now(),
      };
      currentWorkingHistory.push(errorMsg);
      onMessageUpdate([...currentWorkingHistory]);
      onStatusChange("idle");
      return currentWorkingHistory;
    }
  }

  onStatusChange("idle");
  return currentWorkingHistory;
}
