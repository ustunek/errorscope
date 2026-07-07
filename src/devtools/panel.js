/**
 * ErrorScope DevTools panel — Console & Network views with AI analysis.
 */

import {
  classifyConsoleEntry,
  classifyNetworkRequest,
} from "../lib/classify.js";
import { injectConsoleHook, pollConsoleLogs } from "../lib/console-hook.js";
import { buildAnalysisContext } from "../lib/context-builder.js";
import { CHAT_SYSTEM } from "../lib/prompts.js";
import {
  buildAnalysisPrompt,
  buildPerformancePrompt,
} from "../lib/prompts.js";
import { getAppInfo } from "../lib/app-info.js";
import { getSettings, isConfigured, loadDismissedIds, saveDismissedIds } from "../lib/storage.js";

const consoleList = document.getElementById("console-list");
const networkList = document.getElementById("network-list");
const allList = document.getElementById("all-list");
const consoleEmpty = document.getElementById("console-empty");
const networkEmpty = document.getElementById("network-empty");
const allEmpty = document.getElementById("all-empty");
const configBanner = document.getElementById("config-banner");
const analysisOverlay = document.getElementById("analysis-overlay");
const analysisStatus = document.getElementById("analysis-status");
const analysisStatusText = document.getElementById("analysis-status-text");
const consoleHint = document.getElementById("console-hint");
const llmRequestSection = document.getElementById("llm-request-section");
const llmPayloadContent = document.getElementById("llm-payload-content");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");

const aboutOverlay = document.getElementById("about-overlay");

const seenConsole = new Set();
const seenNetwork = new Set();
const dismissedItems = new Set();
const networkEntries = [];
const networkHarById = new Map();
const analysisSessions = new Map();

let pageUrl = chrome.devtools.inspectedWindow.tabURL;
const tabId = chrome.devtools.inspectedWindow.tabId;
let chatSession = null;

chrome.devtools.network.onRequestFinished.addListener((entry) => {
  entry._errorscopePageUrl = pageUrl;
  networkEntries.push(entry);
  if (networkEntries.length > 200) networkEntries.shift();
});

chrome.devtools.network.onNavigated.addListener(() => {
  pageUrl = chrome.devtools.inspectedWindow.tabURL;
  networkEntries.length = 0;
  networkHarById.clear();
  analysisSessions.clear();
  dismissedItems.clear();
  seenNetwork.clear();
  seenConsole.clear();
  allList.innerHTML = "";
  consoleList.innerHTML = "";
  networkList.innerHTML = "";
  allEmpty.classList.remove("hidden");
  consoleEmpty.classList.remove("hidden");
  networkEmpty.classList.remove("hidden");
  if (consoleHint) consoleHint.classList.add("hidden");
  void loadDismissedForPage().then(() => {
    renderNetwork(true);
    injectConsoleHook();
    void pollConsole();
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

document.getElementById("refresh-btn").addEventListener("click", refreshAll);
document.getElementById("clear-btn").addEventListener("click", clearActiveTab);
document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("open-settings").addEventListener("click", openSettings);
document.getElementById("about-btn").addEventListener("click", openAboutPanel);
document.getElementById("about-close").addEventListener("click", closeAboutPanel);
document.getElementById("close-dialog").addEventListener("click", closeAnalysisModal);

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendFollowUp();
});

document.getElementById("analysis-modal")?.addEventListener("click", (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn?.dataset.copy) {
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById(copyBtn.dataset.copy);
    if (el) copyToClipboard(el.textContent, copyBtn);
  }
});

document.body.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-expand");
  if (!btn) return;
  const el = document.getElementById(btn.dataset.expandFor);
  if (!el) return;
  const expanded = el.classList.toggle("expanded");
  btn.setAttribute("aria-expanded", String(expanded));
  btn.textContent = expanded ? "Show less" : "Show more";
});

initAppInfo();

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".panel-view").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.panel !== name);
  });
}

function showAnalysisLoading(message) {
  if (analysisStatusText) analysisStatusText.textContent = message;
  analysisStatus?.classList.remove("hidden");
}

function hideAnalysisLoading() {
  analysisStatus?.classList.add("hidden");
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function openAboutPanel() {
  aboutOverlay.classList.remove("hidden");
}

function closeAboutPanel() {
  aboutOverlay.classList.add("hidden");
}

function initAppInfo() {
  const info = getAppInfo();
  document.getElementById("app-version").textContent = `v${info.version}`;
  document.getElementById("panel-about-version").textContent = info.version;
  document.getElementById("panel-about-description").textContent = info.description;
  const link = document.getElementById("panel-about-homepage");
  if (info.homepage) {
    link.href = info.homepage;
  } else {
    link.classList.add("hidden");
  }
}

function persistCurrentSession() {
  if (!chatSession?.itemId) return;
  analysisSessions.set(chatSession.itemId, chatSession);
  if (chatSession.analyzed) {
    updateAnalyzeButton(chatSession.itemId, "Continue AI");
  }
}

function updateAnalyzeButton(itemId, label) {
  document
    .querySelectorAll(`.item[data-id="${CSS.escape(itemId)}"] [data-action=analyze]`)
    .forEach((btn) => {
      btn.textContent = label;
    });
}

function getActiveTab() {
  return document.querySelector(".tab.active")?.dataset.tab ?? "all";
}

function updateEmptyStates() {
  consoleEmpty.classList.toggle("hidden", consoleList.children.length > 0);
  networkEmpty.classList.toggle("hidden", networkList.children.length > 0);
  allEmpty.classList.toggle("hidden", allList.children.length > 0);
}

function clearSessionsWithPrefix(prefix) {
  for (const id of analysisSessions.keys()) {
    if (id.startsWith(prefix)) analysisSessions.delete(id);
  }
}

async function loadDismissedForPage() {
  dismissedItems.clear();
  const stored = await loadDismissedIds(tabId, pageUrl);
  for (const id of stored) dismissedItems.add(id);
}

async function persistDismissed() {
  await saveDismissedIds(tabId, pageUrl, dismissedItems);
}

async function clearConsoleItems() {
  for (const id of seenConsole) dismissedItems.add(id);
  await persistDismissed();
  seenConsole.clear();
  consoleList.innerHTML = "";
  allList.querySelectorAll('.item[data-source="console"]').forEach((el) => el.remove());
  clearSessionsWithPrefix("con-");
  updateEmptyStates();
}

async function clearNetworkItems() {
  for (const id of seenNetwork) dismissedItems.add(id);
  await persistDismissed();
  seenNetwork.clear();
  networkList.innerHTML = "";
  networkHarById.clear();
  allList.querySelectorAll('.item[data-source="network"]').forEach((el) => el.remove());
  clearSessionsWithPrefix("net-");
  updateEmptyStates();
}

function clearActiveTab() {
  const tab = getActiveTab();
  if (tab === "all") {
    void (async () => {
      await clearConsoleItems();
      await clearNetworkItems();
    })();
    return;
  }
  if (tab === "console") {
    void clearConsoleItems();
    return;
  }
  if (tab === "network") {
    void clearNetworkItems();
  }
}

function closeAnalysisModal() {
  persistCurrentSession();
  analysisOverlay.classList.add("hidden");
}

function openAnalysisModal() {
  analysisOverlay.classList.remove("hidden");
}

async function refreshAll() {
  await updateConfigBanner();
  allList.innerHTML = "";
  consoleList.innerHTML = "";
  networkList.innerHTML = "";
  seenConsole.clear();
  seenNetwork.clear();
  networkHarById.clear();
  if (consoleHint) consoleHint.classList.add("hidden");
  injectConsoleHook();
  await pollConsole();
  renderNetwork(true);
  updateEmptyStates();
}

async function updateConfigBanner() {
  const settings = await getSettings();
  configBanner.classList.toggle("hidden", isConfigured(settings));
}

async function pollConsole() {
  return new Promise((resolve) => {
    pollConsoleLogs((entries, exceptionInfo) => {
      if (exceptionInfo) {
        if (consoleHint) {
          consoleHint.textContent =
            "Console hook blocked on this page (CSP). Errors thrown after page load may not appear.";
          consoleHint.classList.remove("hidden");
        }
        resolve();
        return;
      }

      for (const raw of entries) {
        const item = classifyConsoleEntry(raw);
        if (seenConsole.has(item.id) || dismissedItems.has(item.id)) continue;
        seenConsole.add(item.id);
        consoleList.prepend(renderConsoleItem(item));
        allList.prepend(renderConsoleItem(item));
      }

      updateEmptyStates();
      resolve();
    });
  });
}

function renderNetwork(force = false) {
  const issues = [];

  for (const entry of networkEntries) {
    const item = classifyNetworkRequest(serializeNetworkEntry(entry));
    if (!item.issues.length) continue;
    if (dismissedItems.has(item.id)) continue;
    if (!force && seenNetwork.has(item.id)) continue;
    seenNetwork.add(item.id);
    networkHarById.set(item.id, entry);
    issues.push(item);
  }

  if (force) networkList.innerHTML = "";

  for (const item of issues.reverse()) {
    networkList.prepend(renderNetworkItem(item));
    if (!allList.querySelector(`.item[data-id="${CSS.escape(item.id)}"]`)) {
      allList.prepend(renderNetworkItem(item));
    }
  }

  updateEmptyStates();
}

function renderConsoleItem(item) {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = item.id;
  li.dataset.source = "console";

  const levelBadge =
    item.level === "error"
      ? '<span class="badge badge-error">error</span>'
      : '<span class="badge badge-warning">warn</span>';

  const kindBadge = `<span class="badge badge-info">${escapeHtml(item.kind)}</span>`;

  li.innerHTML = `
    <div class="item-meta">${levelBadge}${kindBadge}</div>
    <div class="item-header">
      ${renderClampedText(item.message, "item-message")}
      <button class="btn btn-analyze" data-action="analyze">Analyze with AI</button>
    </div>
    ${renderItemContext(item.pageUrl, item.timestamp)}
    ${item.location ? renderClampedText(item.location, "item-url") : ""}
  `;

  setupTextExpand(li);

  li.querySelector("[data-action=analyze]").addEventListener("click", () =>
    runAnalysis({
      itemId: item.id,
      type: item.kind === "cors" ? "cors" : "console_error",
      payload: item.raw,
      label: item.message,
    })
  );

  if (analysisSessions.has(item.id)) {
    li.querySelector("[data-action=analyze]").textContent = "Continue AI";
  }

  return li;
}

function isInfoOnlyNetworkItem(item) {
  return item.issues.length > 0 && item.issues.every((issue) => issue.kind === "performance");
}

function renderNetworkItem(item) {
  const li = document.createElement("li");
  const infoOnly = isInfoOnlyNetworkItem(item);
  li.className = infoOnly ? "item item-info" : "item";
  li.dataset.id = item.id;
  li.dataset.source = "network";

  const badges = item.issues
    .map((issue) => {
      const cls = issue.severity === "error" ? "badge-error" : "badge-warning";
      return `<span class="badge ${cls}">${escapeHtml(issue.label)}</span>`;
    })
    .join("");

  const infoBadge = infoOnly ? '<span class="badge badge-warning">Info</span>' : "";

  const primaryIssue = item.issues[0];
  const analysisType =
    primaryIssue?.kind === "performance"
      ? "performance"
      : primaryIssue?.kind === "cors_or_network"
        ? "cors"
        : "network_failure";

  const analyzeButton = infoOnly
    ? ""
    : `<button class="btn btn-analyze" data-action="analyze">Analyze with AI</button>`;

  li.innerHTML = `
    <div class="item-meta">${infoBadge}${badges}<span class="badge badge-info">${escapeHtml(item.method)}</span></div>
    <div class="item-header">
      <div class="item-text-group">
        ${renderClampedText(primaryIssue?.hint ?? `HTTP ${item.status}`, "item-message")}
        ${renderClampedText(item.url, "item-url")}
      </div>
      ${analyzeButton}
    </div>
    ${renderItemContext(item.pageUrl, item.timestamp)}
  `;

  setupTextExpand(li);

  if (!infoOnly) {
    li.querySelector("[data-action=analyze]").addEventListener("click", () =>
      runAnalysis({
        itemId: item.id,
        type: analysisType,
        payload: item.raw,
        label: item.url,
        harEntry: networkHarById.get(item.id),
      })
    );

    if (analysisSessions.has(item.id)) {
      li.querySelector("[data-action=analyze]").textContent = "Continue AI";
    }
  }

  return li;
}

function restoreSession(session) {
  chatSession = session;
  chatMessages.innerHTML = "";
  hideAnalysisLoading();

  if (session.requestPreview) {
    llmPayloadContent.textContent = session.requestPreview;
    llmRequestSection.open = Boolean(session.requestOpen);
    llmRequestSection.classList.remove("hidden");
  }

  renderFullChatHistory();
  chatInput.disabled = !session.analyzed;
  chatSend.disabled = !session.analyzed;
  chatInput.value = "";
}

async function runAnalysis({ itemId, type, payload, label, harEntry }) {
  const settings = await getSettings();
  if (!isConfigured(settings)) {
    openSettings();
    return;
  }

  openAnalysisModal();

  const cached = analysisSessions.get(itemId);
  if (cached?.analyzed) {
    restoreSession(cached);
    chatInput.focus();
    return;
  }

  chatSession = {
    itemId,
    messages: [],
    context: null,
    prompt: null,
    analyzed: false,
    requestPreview: null,
    requestOpen: false,
  };
  chatMessages.innerHTML = "";
  llmRequestSection.classList.add("hidden");
  llmPayloadContent.textContent = "";
  chatInput.disabled = true;
  chatSend.disabled = true;

  showAnalysisLoading(`Gathering context: ${label?.slice(0, 80) ?? type}…`);

  let context;
  try {
    context = await buildAnalysisContext({ type, payload, settings, harEntry });
  } catch (err) {
    hideAnalysisLoading();
    appendErrorBubble(err?.message ?? "Context failed");
    return;
  }

  const prompt =
    type === "performance"
      ? buildPerformancePrompt({ ...context, pageUrl })
      : buildAnalysisPrompt({ type, payload: context, pageUrl });

  const requestPreview = JSON.stringify({ type, pageUrl, context, prompt }, null, 2);

  chatSession.context = context;
  chatSession.prompt = prompt;
  chatSession.requestPreview = requestPreview;
  chatSession.requestOpen = settings.showLlmPayload;

  llmPayloadContent.textContent = requestPreview;
  llmRequestSection.open = settings.showLlmPayload;
  llmRequestSection.classList.remove("hidden");

  showAnalysisLoading(`AI is analyzing: ${label?.slice(0, 80) ?? type}…`);

  chrome.runtime.sendMessage(
    { type: "ANALYZE", payload: { type, payload: context, pageUrl, prompt } },
    (response) => {
      hideAnalysisLoading();

      if (chrome.runtime.lastError) {
        appendErrorBubble(chrome.runtime.lastError.message);
        return;
      }

      if (!response?.ok) {
        appendErrorBubble(response?.error ?? "Analysis failed");
        return;
      }

      chatSession.messages = [
        { role: "system", content: CHAT_SYSTEM },
        { role: "user", content: prompt },
        { role: "assistant", content: response.analysis },
      ];
      chatSession.analyzed = true;

      renderFullChatHistory();
      persistCurrentSession();
      chatInput.disabled = false;
      chatSend.disabled = false;
      chatInput.focus();
    }
  );
}

function sendFollowUp() {
  const text = chatInput.value.trim();
  if (!text || !chatSession?.messages?.length) return;

  chatInput.value = "";
  chatInput.disabled = true;
  chatSend.disabled = true;

  chatSession.messages.push({ role: "user", content: text });
  appendUserBubble(text);
  appendTypingBubble();

  chrome.runtime.sendMessage(
    { type: "CHAT", payload: { messages: chatSession.messages } },
    (response) => {
      removeTypingBubble();
      chatInput.disabled = false;
      chatSend.disabled = false;
      chatInput.focus();

      if (chrome.runtime.lastError) {
        appendErrorBubble(chrome.runtime.lastError.message);
        return;
      }

      if (!response?.ok) {
        appendErrorBubble(response?.error ?? "Chat failed");
        chatSession.messages.pop();
        return;
      }

      chatSession.messages.push({
        role: "assistant",
        content: response.analysis,
      });
      appendAssistantBubble(response.analysis);
      persistCurrentSession();
    }
  );
}

function renderFullChatHistory() {
  chatMessages.innerHTML = "";
  if (!chatSession?.messages?.length) return;

  let skippedInitialPrompt = false;
  for (const msg of chatSession.messages) {
    if (msg.role === "system") continue;
    if (msg.role === "user" && !skippedInitialPrompt) {
      skippedInitialPrompt = true;
      continue;
    }
    if (msg.role === "user") appendUserBubble(msg.content);
    if (msg.role === "assistant") appendAssistantBubble(msg.content);
  }
}

function renderChat() {
  renderFullChatHistory();
}

function appendUserBubble(text) {
  const el = document.createElement("div");
  el.className = "chat-bubble user";
  el.innerHTML = `<p>${escapeHtml(text)}</p>`;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendAssistantBubble(text) {
  const el = document.createElement("div");
  el.className = "chat-bubble assistant";

  const header = document.createElement("div");
  header.className = "bubble-header";
  header.innerHTML = `<span>Response</span>`;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn-icon";
  copyBtn.title = "Copy response";
  copyBtn.setAttribute("aria-label", "Copy response");
  copyBtn.innerHTML = copyIconSvg();
  copyBtn.addEventListener("click", () => copyToClipboard(text, copyBtn));

  header.appendChild(copyBtn);

  const body = document.createElement("div");
  body.className = "bubble-body";
  body.innerHTML = renderMarkdown(text);

  el.append(header, body);
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendErrorBubble(text) {
  const el = document.createElement("div");
  el.className = "chat-bubble error";
  el.innerHTML = `<p class="badge badge-error">${escapeHtml(text)}</p>`;
  chatMessages.appendChild(el);
}

function appendTypingBubble() {
  const el = document.createElement("div");
  el.className = "chat-bubble assistant typing";
  el.id = "chat-typing";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <span class="loading-spinner loading-spinner-sm" aria-hidden="true"></span>
    <span>AI is responding…</span>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingBubble() {
  document.getElementById("chat-typing")?.remove();
}

function copyIconSvg() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const prev = btn.title;
    btn.title = "Copied!";
    setTimeout(() => {
      btn.title = prev;
    }, 1500);
  } catch {
    btn.title = "Copy failed";
  }
}

function serializeNetworkEntry(entry) {
  return {
    request: {
      url: entry.request?.url,
      method: entry.request?.method,
      headers: entry.request?.headers,
      postData: entry.request?.postData,
    },
    response: {
      status: entry.response?.status,
      statusText: entry.response?.statusText,
      headers: entry.response?.headers,
      content: entry.response?.content,
    },
    startedDateTime: entry.startedDateTime,
    pageUrl: entry._errorscopePageUrl ?? pageUrl,
    time: entry.time,
    timing: entry.timing,
    _error: entry._error,
  };
}

function renderClampedText(text, className) {
  const uid = `t${Math.random().toString(36).slice(2, 10)}`;
  return `<div class="item-text-wrap">
    <p class="${className} item-text-clamp" id="${uid}">${escapeHtml(text)}</p>
    <button type="button" class="btn-expand hidden" data-expand-for="${uid}" aria-expanded="false">Show more</button>
  </div>`;
}

function setupTextExpand(root) {
  requestAnimationFrame(() => {
    root.querySelectorAll(".item-text-clamp").forEach((el) => {
      const btn = el.parentElement?.querySelector(".btn-expand");
      if (!btn || el.classList.contains("expanded")) return;
      if (el.scrollHeight > el.clientHeight + 1) {
        btn.classList.remove("hidden");
      }
    });
  });
}

function renderItemContext(pageUrl, timestamp) {
  const parts = [];
  if (timestamp) {
    parts.push(
      `<time datetime="${new Date(timestamp).toISOString()}">${escapeHtml(formatItemTime(timestamp))}</time>`
    );
  }
  if (pageUrl) {
    parts.push(
      `<span class="item-page-url" title="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</span>`
    );
  }
  if (!parts.length) return "";
  return `<p class="item-context">${parts.join('<span class="item-context-sep">·</span>')}</p>`;
}

function formatItemTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ol>${m}</ol>`)
    .replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[houl])/gm, (line) =>
      line.startsWith("<") ? line : `<p>${line}</p>`
    );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

void loadDismissedForPage().then(() => {
  refreshAll();
  injectConsoleHook();
});
setInterval(() => {
  injectConsoleHook();
  pollConsole();
}, 1500);
setInterval(() => renderNetwork(), 2000);
