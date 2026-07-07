/**
 * Injects a console hook into the inspected page (main world, not content script).
 */

export const CONSOLE_HOOK = String.raw`
(function () {
  if (window.__errorscopeHooked) return "already";
  window.__errorscopeHooked = true;
  window.__errorscopeLogs = window.__errorscopeLogs || [];

  function serialize(value) {
    if (value instanceof Error) {
      return value.message + (value.stack ? "\\n" + value.stack : "");
    }
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  }

  function push(level, args, extra) {
    window.__errorscopeLogs.push({
      level: level,
      message: args.map(serialize).join(" "),
      timestamp: Date.now(),
      pageUrl: window.location.href,
      stack: extra && extra.stack ? extra.stack : null,
      source: extra && extra.source ? extra.source : null
    });
    if (window.__errorscopeLogs.length > 300) {
      window.__errorscopeLogs.shift();
    }
  }

  ["error", "warn"].forEach(function (level) {
    var orig = console[level].bind(console);
    console[level] = function () {
      push(level, Array.prototype.slice.call(arguments));
      return orig.apply(console, arguments);
    };
  });

  window.addEventListener("error", function (e) {
    push("error", [e.message], {
      stack: e.error && e.error.stack,
      source: e.filename + ":" + e.lineno + ":" + e.colno
    });
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    push("error", ["Unhandled Promise Rejection: " + msg], {
      stack: reason && reason.stack
    });
  });

  return "ok";
})();
`;

const POLL_EXPRESSION = String.raw`
(function () {
  var logs = window.__errorscopeLogs || [];
  return JSON.stringify(logs.filter(function (e) {
    return e.level === "error" || e.level === "warn";
  }));
})()
`;

/**
 * Eval in the page's main JavaScript context (NOT content script isolated world).
 */
export function evalInPage(expression, callback) {
  chrome.devtools.inspectedWindow.eval(expression, (result, exceptionInfo) => {
    callback(result, exceptionInfo);
  });
}

export function injectConsoleHook(callback) {
  evalInPage(CONSOLE_HOOK, (result, exceptionInfo) => {
    callback?.(result, exceptionInfo);
  });
}

export function pollConsoleLogs(callback) {
  evalInPage(POLL_EXPRESSION, (result, exceptionInfo) => {
    if (exceptionInfo?.isException) {
      callback([], exceptionInfo);
      return;
    }
    let entries = [];
    try {
      entries = JSON.parse(result || "[]");
    } catch {
      entries = [];
    }
    callback(entries, null);
  });
}
