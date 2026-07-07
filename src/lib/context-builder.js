/**
 * Build enriched analysis context based on user settings.
 */

import { limitContextForLlm } from "./context-limits.js";
import { getRequestBody, getResponseBody } from "./network-body.js";
import { resolveSourceContext } from "./source-resolver.js";

export async function buildAnalysisContext({
  type,
  payload,
  settings,
  harEntry,
}) {
  const context = structuredClone(payload);

  const isConsole =
    type === "console_error" || type === "cors" || type === "csp" || type === "runtime";

  if (isConsole && settings.includeSourceSnippets) {
    context.sourceContext = await resolveSourceContext({
      stack: payload.stack,
      location: payload.source ?? payload.location,
    });
  }

  if ((type === "network_failure" || type === "performance" || type === "cors") && harEntry) {
    if (settings.includeResponseBody) {
      context.responseBody = await getResponseBody(harEntry, settings.maxBodyBytes);
    }
    if (settings.includeRequestBody) {
      context.requestBody = getRequestBody(harEntry, settings.maxBodyBytes);
    }
  }

  return limitContextForLlm(context, settings);
}
