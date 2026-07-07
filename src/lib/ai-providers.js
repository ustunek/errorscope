/**
 * AI provider adapters — all requests run in the service worker.
 */

import { buildAnalysisPrompt, buildPerformancePrompt, CHAT_SYSTEM } from "./prompts.js";
import { getSettings } from "./storage.js";

export async function analyzeIssue({ type, payload, pageUrl, prompt: presetPrompt }) {
  const settings = await getSettings();
  const prompt =
    presetPrompt ??
    (type === "performance"
      ? buildPerformancePrompt({ ...payload, pageUrl })
      : buildAnalysisPrompt({ type, payload, pageUrl }));

  const analysis = await callProvider(settings, prompt);
  return { analysis, prompt };
}

export async function chatWithHistory(messages) {
  const settings = await getSettings();
  const trimmed = trimChatHistory(messages);
  return callProviderChat(settings, trimmed);
}

async function callProvider(settings, prompt) {
  return callProviderChat(settings, [
    { role: "system", content: CHAT_SYSTEM },
    { role: "user", content: prompt },
  ]);
}

async function callProviderChat(settings, messages) {
  switch (settings.provider) {
    case "anthropic":
      return callAnthropicChat(settings, messages);
    case "gemini":
      return callGeminiChat(settings, messages);
    case "ollama":
    case "openai_compatible":
    case "openai":
    default:
      return callOpenAIChat(settings, messages);
  }
}

async function callOpenAIChat(settings, messages) {
  const base = trimSlash(settings.baseUrl || "https://api.openai.com/v1");
  const model = settings.model || "gpt-4o-mini";

  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey?.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }
  Object.assign(headers, parseCustomHeaders(settings.customHeaders));

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: settings.maxTokens ?? 1024,
      temperature: settings.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No response from model.";
}

async function callAnthropicChat(settings, messages) {
  const base = trimSlash(settings.baseUrl || "https://api.anthropic.com/v1");
  const model = settings.model || "claude-sonnet-4-20250514";

  const system = messages.find((m) => m.role === "system")?.content ?? CHAT_SYSTEM;
  const chatMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": settings.apiKey?.trim() ?? "",
      ...parseCustomHeaders(settings.customHeaders),
    },
    body: JSON.stringify({
      model,
      max_tokens: settings.maxTokens ?? 1024,
      temperature: settings.temperature ?? 0.2,
      system,
      messages: chatMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const block = data.content?.find((b) => b.type === "text");
  return block?.text ?? "No response from model.";
}

async function callGeminiChat(settings, messages) {
  const base = trimSlash(
    settings.baseUrl || "https://generativelanguage.googleapis.com/v1beta"
  );
  const model = settings.model || "gemini-2.0-flash";
  const key = settings.apiKey?.trim();
  if (!key) throw new Error("Gemini requires an API key.");

  const system = messages.find((m) => m.role === "system")?.content ?? CHAT_SYSTEM;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...parseCustomHeaders(settings.customHeaders),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: settings.maxTokens ?? 1024,
        temperature: settings.temperature ?? 0.2,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ??
    "No response from model."
  );
}

function trimChatHistory(messages, maxTurns = 12) {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= maxTurns) return [...system, ...rest];
  return [...system, rest[0], ...rest.slice(-(maxTurns - 1))];
}

function parseCustomHeaders(raw) {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return out;
}

function trimSlash(url) {
  return url.replace(/\/+$/, "");
}
