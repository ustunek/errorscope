/**
 * Resolve bundle locations to original source via source maps (best-effort).
 */

import sourceMap from "./vendor/source-map-bundle.js";
import { buildSnippet } from "./context-limits.js";
import { parseStackFrame } from "./stack-parser.js";

const { SourceMapConsumer } = sourceMap;

export async function resolveSourceContext({ stack, location }) {
  const frame = parseStackFrame(stack, location);
  if (!frame?.url || !frame.line) {
    return { status: "no_frame" };
  }

  try {
    const bundleText = await fetchResourceText(frame.url);
    if (!bundleText) {
      return { status: "bundle_not_found", frame };
    }

    const mapUrl = extractSourceMapUrl(bundleText, frame.url);
    if (!mapUrl) {
      return {
        status: "no_sourcemap",
        frame,
        bundleSnippet: buildSnippet(bundleText.split("\n"), frame.line, 8),
      };
    }

    const mapJson = await fetchJson(mapUrl);
    if (!mapJson) {
      return { status: "map_fetch_failed", frame, mapUrl };
    }

    const consumer = await new SourceMapConsumer(mapJson);
    const original = consumer.originalPositionFor({
      line: frame.line,
      column: frame.column || 0,
    });

    let sourceText = null;
    if (original.source) {
      sourceText = consumer.sourceContentFor(original.source, true);
    }
    consumer.destroy();

    if (!original.source || !original.line) {
      return { status: "unmap_failed", frame, mapUrl };
    }

    const lines = sourceText ? sourceText.split("\n") : [];
    return {
      status: "resolved",
      frame,
      mapUrl,
      original: {
        file: original.source,
        line: original.line,
        column: original.column,
        name: original.name,
      },
      snippet: sourceText ? buildSnippet(lines, original.line) : null,
    };
  } catch (err) {
    return {
      status: "error",
      message: err?.message ?? String(err),
      frame,
    };
  }
}

function extractSourceMapUrl(source, baseUrl) {
  const match = source.match(/\/\/[#@]\s*sourceMappingURL=(.+)$/m);
  if (!match) return null;

  try {
    return new URL(match[1].trim(), baseUrl).href;
  } catch {
    return null;
  }
}

function fetchResourceText(url) {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.getResources((resources) => {
      const normalized = stripQuery(url);
      const resource = resources.find(
        (r) => r.url === url || stripQuery(r.url) === normalized
      );

      if (resource?.getContent) {
        resource.getContent((content) => resolve(content ?? null));
        return;
      }

      fetch(url, { credentials: "omit" })
        .then((res) => (res.ok ? res.text() : null))
        .then(resolve)
        .catch(() => resolve(null));
    });
  });
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function stripQuery(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}
