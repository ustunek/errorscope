# Contributing to ErrorScope

Thank you for helping improve ErrorScope! This project is open source and welcomes contributions.

## Getting started

1. Fork the repository and clone your fork.
2. Load the extension in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the repository root
3. Open DevTools on any page → **ErrorScope** tab.

No build step is required — the extension uses vanilla ES modules.

## Development tips

- Settings are stored in `chrome.storage.local` under the `settings` key.
- AI calls are made from the service worker (`src/background/service-worker.js`).

## Pull request guidelines

- Keep changes focused and well-scoped.
- Match existing code style (plain JS, ES modules, minimal dependencies).
- Update the README if you change user-facing behavior.
- Test manually in Chrome DevTools before submitting.

## Reporting bugs

Open a GitHub issue with:

- Chrome version
- AI provider and model (redact API keys)
- Steps to reproduce
- Expected vs actual behavior

## Feature requests

Open an issue describing the problem you want to solve, not only the solution you prefer.

## Code of conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
