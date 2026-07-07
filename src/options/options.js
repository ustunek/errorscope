import {
  getSettings,
  saveSettings,
  getProviderDefaults,
} from "../lib/storage.js";
import { getAppInfo } from "../lib/app-info.js";

const form = document.getElementById("settings-form");
const providerSelect = document.getElementById("provider");
const baseUrlInput = document.getElementById("baseUrl");
const modelInput = document.getElementById("model");
const apiKeyInput = document.getElementById("apiKey");
const saveStatus = document.getElementById("save-status");

providerSelect.addEventListener("change", applyProviderDefaults);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(form);

  await saveSettings({
    provider: data.get("provider"),
    apiKey: data.get("apiKey"),
    baseUrl: data.get("baseUrl"),
    model: data.get("model"),
    customHeaders: data.get("customHeaders"),
    maxTokens: Number(data.get("maxTokens")) || 2048,
    temperature: Number(data.get("temperature")) ?? 0.2,
    includeSourceSnippets: data.get("includeSourceSnippets") === "on",
    includeResponseBody: data.get("includeResponseBody") === "on",
    includeRequestBody: data.get("includeRequestBody") === "on",
    showLlmPayload: data.get("showLlmPayload") === "on",
    maxBodyBytes: Number(data.get("maxBodyBytes")) || 4096,
  });

  saveStatus.textContent = "Saved.";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2500);
});

async function load() {
  const settings = await getSettings();
  providerSelect.value = settings.provider;
  apiKeyInput.value = settings.apiKey;
  baseUrlInput.value = settings.baseUrl;
  modelInput.value = settings.model;
  document.getElementById("customHeaders").value = settings.customHeaders;
  document.getElementById("maxTokens").value = settings.maxTokens;
  document.getElementById("temperature").value = settings.temperature;
  document.getElementById("includeSourceSnippets").checked =
    settings.includeSourceSnippets;
  document.getElementById("includeResponseBody").checked =
    settings.includeResponseBody;
  document.getElementById("includeRequestBody").checked =
    settings.includeRequestBody;
  document.getElementById("showLlmPayload").checked = settings.showLlmPayload;
  document.getElementById("maxBodyBytes").value = settings.maxBodyBytes;

  if (!settings.baseUrl || !settings.model) {
    applyProviderDefaults();
  }
}

function applyProviderDefaults() {
  const defaults = getProviderDefaults(providerSelect.value);
  if (!baseUrlInput.value || baseUrlInput.dataset.auto === "true") {
    baseUrlInput.value = defaults.baseUrl;
    baseUrlInput.dataset.auto = "true";
  }
  if (!modelInput.value || modelInput.dataset.auto === "true") {
    modelInput.value = defaults.model;
    modelInput.dataset.auto = "true";
  }

  baseUrlInput.addEventListener(
    "input",
    () => {
      baseUrlInput.dataset.auto = "false";
    },
    { once: true }
  );
  modelInput.addEventListener(
    "input",
    () => {
      modelInput.dataset.auto = "false";
    },
    { once: true }
  );
}

load();
initAppInfo();

function initAppInfo() {
  const info = getAppInfo();
  document.getElementById("options-version").textContent = `v${info.version}`;
  document.getElementById("about-version").textContent = info.version;
  document.getElementById("about-description").textContent = info.description;
  const link = document.getElementById("about-homepage");
  if (info.homepage) {
    link.href = info.homepage;
  } else {
    link.parentElement.classList.add("hidden");
  }
}
