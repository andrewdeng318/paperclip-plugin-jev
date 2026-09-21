# Jev Issue Triage for Paperclip

Jev Issue Triage is a community plugin that adds AI-assisted routing, prioritization, and constrained browser decisions to [Paperclip](https://github.com/paperclipai/paperclip).

It analyzes a minimized issue snapshot with Jev and returns:

- a recommended owner
- a recommended priority
- an issue type
- a missing-context probability
- a blocker probability

It also contributes a Paperclip agent tool that selects one browser operation and one observed target from a minimized page snapshot. The tool makes decisions only; it does not own or drive a browser session.

## Automation modes

| Mode | Behavior |
| --- | --- |
| `Advisory` | Runs only when a user clicks **Analyze with Jev**. It never changes issue fields. |
| `Auto when confident` | Analyzes newly created issues and updates owner or priority only when the configured thresholds are met. |
| `Always auto` | Analyzes newly created issues and applies every valid owner and priority recommendation. |

Automatic processing listens only for `issue.created`. Plugin updates cannot trigger another Jev call. Each issue also stores an idempotency marker so duplicate create events do not consume additional credits.

## Browser decision modes

| Mode | Behavior |
| --- | --- |
| `Observe only` | Returns an advisory decision and never authorizes execution. |
| `Confirm mutations` | Allows low-risk runtime actions such as scrolling or waiting. Click, text, and select operations require confirmation. |
| `Auto safe actions` | Marks high-confidence, non-sensitive actions as eligible for automatic execution. Sensitive controls always require confirmation. |

The `decide-browser-action` agent tool accepts:

- a natural-language goal
- the current HTTP or HTTPS URL
- a snapshot identifier used to reject stale decisions
- optional visible page text when the operator explicitly enables it
- up to 64 numbered, visible elements and their supported actions
- an optional short action history

It returns one of `CLICK`, `TYPE_TEXT`, `SELECT`, `SCROLL_UP`, `SCROLL_DOWN`, `WAIT`, `DONE`, or `BLOCKED`, plus an observed target when the operation needs one. `TYPE_TEXT` requests a separate text-generation step; Jev does not generate the text value.

The browser executor must resolve the returned numeric index against the same live snapshot, reject stale or obscured targets, log the attempted operation before execution, and independently verify the result. Never treat `DONE` as proof that the goal succeeded.

## Data boundary

The plugin sends only:

- issue title, description, status, and priority
- eligible agent names, roles, titles, statuses, and capabilities

The plugin does not send comments, attachments, run logs, workspace files, or credentials. Paperclip stores the API key as a company-scoped secret reference. Only the plugin worker resolves it.

For browser decisions, the plugin sends only the goal, URL, numbered element roles and labels, observed select options, and a short action history. Truncated visible page text is opt-in and disabled by default. It does not send screenshots, DOM selectors, executable code, or input values. Browser origins must match the configured exact-origin allowlist.

Automatic modes can update only the issue owner and priority. They do not change status, description, comments, attachments, or relationships.

The provider base URL is fixed to `https://jev-ai.pro/api`.

## Requirements

- Paperclip with plugin support
- Node.js 24.11 or later for local development
- A Jev API key from <https://jev-ai.pro/jev-api>

## Install

After the npm package is published:

```bash
paperclipai plugin install paperclip-plugin-jev
```

For local development:

```bash
git clone https://github.com/andrewdeng318/paperclip-plugin-jev.git
cd paperclip-plugin-jev
pnpm install
pnpm build
paperclipai plugin install "$PWD" --local
```

## Configure

1. Open **Settings → Secrets** in Paperclip.
2. Create a company-scoped managed secret for the Jev API key.
3. Open **Settings → Plugins → Jev Issue Triage**.
4. Select the secret in **Jev API Key**.
5. Select an automation mode.
6. Adjust the confidence thresholds if needed.
7. Select a browser decision mode and review the allowed origins.
8. Save the configuration.

The recommended starting configuration is:

- mode: `Auto when confident`
- owner confidence threshold: `0.8`
- priority confidence threshold: `0.7`
- missing context threshold: `0.7`
- browser mode: `Observe only`
- browser confidence threshold: `0.85`
- include visible page text: disabled
- browser allowed origins: `http://127.0.0.1:3100`, `http://localhost:3100`

Start in `Observe only` and compare the suggested operations with human decisions before enabling automatic execution.

## Develop

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm dev` to rebuild the worker, manifest, and UI bundles when source files change. Use `pnpm dev:ui` for the optional UI development server.

## Security

Do not put a Jev API key in source code, issue comments, configuration files, or shell history. Store it through Paperclip Secrets and bind the resulting secret reference in the plugin settings.

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## License

MIT

## Disclaimer

This is a community plugin. It is not maintained or endorsed by Paperclip or Jev.
