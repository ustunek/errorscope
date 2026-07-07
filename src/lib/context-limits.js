/**
 * Limits for code snippets and LLM context size.
 */

export const SNIPPET_LINE_RADIUS = 14;
export const MAX_LINE_CHARS = 180;
export const MAX_SNIPPET_CHARS = 5000;
export const MAX_STACK_CHARS = 1200;
export const MAX_CONTEXT_CHARS = 12000;

export function truncateChars(text, max) {
  if (!text || text.length <= max) return text ?? "";
  return `${text.slice(0, max)}… [truncated]`;
}

export function limitLine(line, maxChars = MAX_LINE_CHARS) {
  const s = String(line ?? "");
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}

export function buildSnippet(lines, line, radius = SNIPPET_LINE_RADIUS) {
  const idx = Math.max(0, line - 1);
  const start = Math.max(0, idx - radius);
  const end = Math.min(lines.length, idx + radius + 1);

  let snippet = lines
    .slice(start, end)
    .map((content, i) => {
      const n = start + i + 1;
      const marker = n === line ? ">" : " ";
      return `${marker} ${String(n).padStart(4)} | ${limitLine(content)}`;
    })
    .join("\n");

  return truncateChars(snippet, MAX_SNIPPET_CHARS);
}

export function limitSourceContext(sourceContext) {
  if (!sourceContext || typeof sourceContext !== "object") return sourceContext;

  const next = { ...sourceContext };
  if (next.snippet) next.snippet = truncateChars(next.snippet, MAX_SNIPPET_CHARS);
  if (next.bundleSnippet) {
    next.bundleSnippet = truncateChars(next.bundleSnippet, MAX_SNIPPET_CHARS);
  }
  return next;
}

export function limitContextForLlm(context, settings = {}) {
  const maxContext = settings.maxContextChars ?? MAX_CONTEXT_CHARS;
  const maxBody = settings.maxBodyBytes ?? 4096;

  const next = structuredClone(context);

  if (next.stack) next.stack = truncateChars(next.stack, MAX_STACK_CHARS);
  if (next.sourceContext) next.sourceContext = limitSourceContext(next.sourceContext);
  if (next.responseBody) next.responseBody = truncateChars(next.responseBody, maxBody);
  if (next.requestBody) next.requestBody = truncateChars(next.requestBody, maxBody);

  let json = JSON.stringify(next);
  if (json.length <= maxContext) return next;

  if (next.sourceContext?.snippet) delete next.sourceContext.snippet;
  if (next.sourceContext?.bundleSnippet) delete next.sourceContext.bundleSnippet;
  json = JSON.stringify(next);
  if (json.length <= maxContext) return next;

  delete next.responseBody;
  delete next.requestBody;
  next._contextTrimmed = true;

  return next;
}
