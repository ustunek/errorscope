/**
 * Prompt templates for AI analysis.
 */

import { limitContextForLlm } from "./context-limits.js";

const SYSTEM_BRIEF = `You are ErrorScope, a concise browser debugging assistant in Chrome DevTools.
Stay focused on the reported error only — do not review unrelated code in snippets.
Keep answers short (under 180 words). Use Markdown with brief sections.`;

export function buildAnalysisPrompt({ type, payload, pageUrl }) {
  const context = limitContextForLlm({
    type,
    pageUrl: pageUrl ?? "unknown",
    capturedAt: new Date().toISOString(),
    ...payload,
  });

  return `${SYSTEM_BRIEF}

Analyze this ${type} issue:

1. **Summary** — one sentence
2. **Likely cause**
3. **Fix** — numbered steps (reference snippet lines only if snippet exists)
4. **Prevention** — one line

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\``;
}

export function buildPerformancePrompt({ request, timing, pageUrl, ...rest }) {
  const context = limitContextForLlm({ request, timing, ...rest });

  return `${SYSTEM_BRIEF}

A network request is slow. Be brief.

1. **Summary**
2. **Bottleneck**
3. **Top 3 fixes**

Page: ${pageUrl ?? "unknown"}

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\``;
}

export const CHAT_SYSTEM = `${SYSTEM_BRIEF}
You are continuing a debug chat. Remember the original error context from the first message.
Answer follow-up questions briefly. Do not re-analyze the entire codebase.`;
