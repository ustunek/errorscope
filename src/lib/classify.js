/**
 * Classify network requests and console entries for ErrorScope.
 */

export const SLOW_REQUEST_THRESHOLD_MS = 10_000;

export function classifyNetworkRequest(entry) {
  const { request, response, _error: errorText } = entry;
  const status = response?.status ?? 0;
  const url = request?.url ?? "";
  const method = request?.method ?? "GET";

  const issues = [];

  if (status === 0) {
    issues.push({
      kind: "cors_or_network",
      severity: "error",
      label: "Blocked or network failure",
      hint: detectCorsHint(entry, errorText),
    });
  } else if (status >= 400) {
    issues.push({
      kind: status >= 500 ? "server_error" : "client_error",
      severity: status >= 500 ? "error" : "warning",
      label: `HTTP ${status}`,
      hint: response?.statusText || "Request failed",
    });
  }

  const timing = entry.timing ?? entry.time ?? entry._transferSize;
  const durationMs = getRequestDurationMs(entry);
  if (durationMs !== null && durationMs > SLOW_REQUEST_THRESHOLD_MS) {
    issues.push({
      kind: "performance",
      severity: "warning",
      label: `Slow (${durationMs}ms)`,
      hint: "Request exceeded 10s threshold (informational)",
      infoOnly: true,
    });
  }

  if (/mixed.content/i.test(errorText ?? "")) {
    issues.push({
      kind: "mixed_content",
      severity: "error",
      label: "Mixed content",
      hint: errorText,
    });
  }

  return {
    id: `net-${hashString(`${method}:${url}:${status}:${entry.startedDateTime}`)}`,
    source: "network",
    method,
    url,
    status,
    durationMs,
    pageUrl: entry.pageUrl ?? "",
    timestamp: parseNetworkTimestamp(entry.startedDateTime),
    issues,
    raw: summarizeNetworkEntry(entry),
  };
}

export function classifyConsoleEntry(entry) {
  const message = entry.message ?? String(entry);
  const level = entry.level ?? "log";
  const lower = message.toLowerCase();

  let kind = "console";
  if (/cors|cross-origin|access-control/i.test(message)) kind = "cors";
  else if (/content.security.policy|csp/i.test(message)) kind = "csp";
  else if (/uncaught|typeerror|referenceerror|syntaxerror/i.test(message)) kind = "runtime";
  else if (/failed to fetch|network error|net::/i.test(message)) kind = "network";
  else if (/hydration|react/i.test(message)) kind = "framework";

  return {
    id: `con-${hashString(`${level}:${message}:${entry.timestamp}`)}`,
    source: "console",
    level,
    message,
    kind,
    stack: entry.stack ?? null,
    location: entry.source ?? null,
    pageUrl: entry.pageUrl ?? "",
    timestamp: entry.timestamp ?? Date.now(),
    raw: entry,
  };
}

function parseNetworkTimestamp(startedDateTime) {
  if (!startedDateTime) return Date.now();
  const ms = Date.parse(startedDateTime);
  return Number.isFinite(ms) ? ms : Date.now();
}

function detectCorsHint(entry, errorText) {
  const text = `${errorText ?? ""} ${entry.request?.url ?? ""}`.toLowerCase();
  if (/cors|cross-origin|access-control/i.test(text)) {
    return "Likely CORS — check Access-Control-Allow-Origin on the server";
  }
  if (/blocked/i.test(text)) {
    return "Request blocked — may be CORS, CSP, or extension policy";
  }
  return "Status 0 — connection refused, CORS preflight failure, or offline";
}

function getRequestDurationMs(entry) {
  if (typeof entry.time === "number") return Math.round(entry.time);
  const t = entry.timing;
  if (!t) return null;
  const end = t.receiveHeadersEnd || t.responseEnd || 0;
  if (end > 0) return Math.round(end);
  return null;
}

function summarizeNetworkEntry(entry) {
  return {
    url: entry.request?.url,
    method: entry.request?.method,
    status: entry.response?.status,
    statusText: entry.response?.statusText,
    mimeType: entry.response?.content?.mimeType,
    headers: entry.request?.headers?.slice?.(0, 20),
    responseHeaders: entry.response?.headers?.slice?.(0, 20),
    timing: entry.timing,
    time: entry.time,
    error: entry._error,
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
