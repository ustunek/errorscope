# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email security reports to the maintainers via GitHub Security Advisories on the repository, or open a private security advisory if enabled.

Include:

- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within 72 hours.

## Scope notes

- API keys are stored locally in `chrome.storage.local` and sent only to the AI provider you configure.
- ErrorScope does not operate backend servers or collect telemetry.
- Review provider privacy policies when sending DevTools context to third-party APIs.
