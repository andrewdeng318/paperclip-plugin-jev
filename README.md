# Jev Issue Triage for Paperclip

Jev Issue Triage is a community plugin that adds AI-assisted routing and prioritization to [Paperclip](https://github.com/paperclipai/paperclip).

It analyzes a minimized issue snapshot with Jev and returns:

- a recommended owner
- a recommended priority
- an issue type
- a missing-context probability
- a blocker probability

## Automation modes

| Mode | Behavior |
| --- | --- |
| `Advisory` | Runs only when a user clicks **Analyze with Jev**. It never changes issue fields. |
| `Auto when confident` | Analyzes newly created issues and updates owner or priority only when the configured thresholds are met. |
| `Always auto` | Analyzes newly created issues and applies every valid owner and priority recommendation. |

Automatic processing listens only for `issue.created`. Plugin updates cannot trigger another Jev call. Each issue also stores an idempotency marker so duplicate create events do not consume additional credits.

## Data boundary

The plugin sends only:

- issue title, description, status, and priority
- eligible agent names, roles, titles, statuses, and capabilities

The plugin does not send comments, attachments, run logs, workspace files, or credentials. Paperclip stores the API key as a company-scoped secret reference. Only the plugin worker resolves it.

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
7. Save the configuration.

The recommended starting configuration is:

- mode: `Auto when confident`
- owner confidence threshold: `0.8`
- priority confidence threshold: `0.7`
- missing context threshold: `0.7`

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
