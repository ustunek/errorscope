/**
 * DevTools bootstrap — creates ErrorScope panel and wires console capture.
 */

import { injectConsoleHook } from "../lib/console-hook.js";

chrome.devtools.panels.create(
  "ErrorScope",
  "icons/icon32.png",
  "src/devtools/panel.html",
  (panel) => {
    panel.onShown.addListener(() => {
      injectConsoleHook();
    });
  }
);

chrome.devtools.network.onNavigated.addListener(() => {
  injectConsoleHook();
});

injectConsoleHook();
setInterval(injectConsoleHook, 3000);
