# Security Policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials or private issue data.

Use GitHub private vulnerability reporting for this repository. Include:

- the affected version
- reproduction steps
- expected and actual behavior
- the potential impact

Do not include real API keys, production issue content, or other credentials in the report.

## Browser decision boundary

The browser decision tool must receive only minimized, visible page state. Visible page text is disabled by default and should be enabled only after reviewing the target site's data sensitivity. Do not pass passwords, tokens, cookies, input values, raw HTML, screenshots, selectors, or executable scripts to Jev.

Callers must enforce the configured origin allowlist, resolve numeric target indexes against the current browser snapshot, reject stale or obscured elements, and independently verify completion. Sensitive or irreversible browser operations require human confirmation even when Jev reports high confidence.

## Supported versions

Security fixes are provided for the latest published version.
