/**
 * Parse stack traces and location strings into file/line/column frames.
 */

const STACK_FRAME =
  /(?:at\s+(?:[^\s(]+\s+)?\(?)?((?:https?|webpack|file):[^\s)]+|\/[^\s)]+|[^@:\s()]+?\.(?:js|ts|tsx|jsx|mjs|cjs)):(\d+):(\d+)\)?/;

const LOCATION_ONLY = /^(.+?):(\d+)(?::(\d+))?$/;

export function parseStackFrame(stack, location) {
  if (location) {
    const loc = parseLocation(location);
    if (loc) return loc;
  }

  if (!stack) return null;

  const lines = String(stack).split("\n");
  for (const line of lines) {
    const frame = parseStackLine(line);
    if (frame) return frame;
  }

  return null;
}

function parseLocation(location) {
  const text = String(location).trim();
  const match = text.match(LOCATION_ONLY);
  if (!match) return null;

  return {
    url: match[1],
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : 0,
  };
}

function parseStackLine(line) {
  const match = line.match(STACK_FRAME);
  if (!match) return null;

  let url = match[1];
  if (!url.startsWith("http") && !url.startsWith("file") && !url.startsWith("/")) {
    return null;
  }

  return {
    url,
    line: Number(match[2]),
    column: Number(match[3]),
  };
}
