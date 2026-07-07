/**
 * ErrorScope — persisted settings (chrome.storage.local).
 */

const DEFAULT_SETTINGS = {
  provider: "openai",
  apiKey: "",
  model: "",
  baseUrl: "",
  customHeaders: "",
  maxTokens: 1024,
  temperature: 0.2,
  includeSourceSnippets: true,
  includeRequestBody: false,
  includeResponseBody: true,
  showLlmPayload: false,
  maxBodyBytes: 4096,
  maxContextChars: 12000,
};

const PROVIDER_DEFAULTS = {
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    model: "claude-sonnet-4-20250514",
    baseUrl: "https://api.anthropic.com/v1",
  },
  gemini: {
    model: "gemini-2.0-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  ollama: {
    model: "llama3.2",
    baseUrl: "http://localhost:11434/v1",
  },
  openai_compatible: {
    model: "",
    baseUrl: "http://localhost:8080/v1",
  },
};

export async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...stored.settings };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function getProviderDefaults(provider) {
  return PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai_compatible;
}

export function isConfigured(settings) {
  if (!settings?.provider) return false;
  if (settings.provider === "ollama") return Boolean(settings.baseUrl);
  return Boolean(settings.apiKey?.trim());
}

const DISMISSED_KEY = "dismissedByPage";

function dismissedPageKey(tabId, pageUrl) {
  return `${tabId}:${pageUrl}`;
}

export async function loadDismissedIds(tabId, pageUrl) {
  const data = await chrome.storage.session.get(DISMISSED_KEY);
  const map = data[DISMISSED_KEY] ?? {};
  return map[dismissedPageKey(tabId, pageUrl)] ?? [];
}

export async function saveDismissedIds(tabId, pageUrl, ids) {
  const data = await chrome.storage.session.get(DISMISSED_KEY);
  const map = data[DISMISSED_KEY] ?? {};
  map[dismissedPageKey(tabId, pageUrl)] = [...ids];
  await chrome.storage.session.set({ [DISMISSED_KEY]: map });
}

export { DEFAULT_SETTINGS, PROVIDER_DEFAULTS };
