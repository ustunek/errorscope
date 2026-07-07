/**
 * App metadata from extension manifest.
 */

export function getAppInfo() {
  const manifest = chrome.runtime.getManifest();
  return {
    name: manifest.name ?? "ErrorScope",
    version: manifest.version ?? "0.0.0",
    description: manifest.description ?? "",
    homepage: manifest.homepage_url ?? "",
  };
}
