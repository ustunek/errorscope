/**
 * Fetch and redact network request/response bodies from DevTools HAR entries.
 */

const SENSITIVE_JSON =
  /"(password|token|api[_-]?key|authorization|secret|cookie)"\s*:\s*"[^"]*"/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/gi;

export function getResponseBody(entry, maxBytes = 4096) {
  return new Promise((resolve) => {
    if (!entry?.getContent) {
      resolve(null);
      return;
    }

    entry.getContent((content, encoding) => {
      const mime = entry.response?.content?.mimeType ?? "";
      if (mime && !isTextMime(mime)) {
        resolve(`[binary content: ${mime}]`);
        return;
      }

      const text = decodeContent(content, encoding);
      resolve(redactBody(prepareBody(text, maxBytes)));
    });
  });
}

export function getRequestBody(entry, maxBytes = 4096) {
  const text = entry?.request?.postData?.text;
  if (!text) return null;
  return redactBody(truncate(text, maxBytes));
}

function decodeContent(content, encoding) {
  if (!content) return "";
  if (encoding === "base64") {
    try {
      return atob(content);
    } catch {
      return "";
    }
  }
  return content;
}

function isTextMime(mime) {
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("x-www-form-urlencoded")
  );
}

function prepareBody(text, maxBytes) {
  if (!text) return null;
  const trimmed = truncate(text, maxBytes);
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

export function truncate(text, maxBytes) {
  if (!text || text.length <= maxBytes) return text ?? "";
  return `${text.slice(0, maxBytes)}\n… [truncated]`;
}

export function redactBody(text) {
  if (!text) return text;
  return text.replace(SENSITIVE_JSON, '"$1":"[REDACTED]"').replace(BEARER, "Bearer [REDACTED]");
}
