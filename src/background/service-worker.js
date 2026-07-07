/**
 * ErrorScope service worker — routes AI analysis requests from DevTools.
 */

import { analyzeIssue, chatWithHistory } from "../lib/ai-providers.js";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[ErrorScope] installed");
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ANALYZE") {
    analyzeIssue(message.payload)
      .then(({ analysis }) => sendResponse({ ok: true, analysis }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message ?? String(err) })
      );
    return true;
  }

  if (message?.type === "CHAT") {
    chatWithHistory(message.payload.messages)
      .then((analysis) => sendResponse({ ok: true, analysis }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message ?? String(err) })
      );
    return true;
  }

  return false;
});
