# Promty collector setup instructions for AI agents

Use this document when a user asks you to connect a Git repository to Promty through Codex or Claude Code hooks.

Human-readable guide: `https://promty.org/docs/collector`
Interactive AI guide: `https://promty.org/docs/collector/ai`

## Objective

Install the Promty collector in the user's intended Git repository, configure Codex and Claude Code repository hooks, start the background uploader, and verify every integration check.

## Safety and authority

- Work from the repository the user placed in scope. Do not initialize hooks in a parent directory or a different checkout.
- Preserve existing hook entries and unrelated working-tree changes.
- Run exactly one `init` command for the selected environment.
- Do not display, read aloud, commit, or paste collector tokens, `~/.prompthub/config.json`, raw event queues, or private uploader logs.
- Do not claim completion while a diagnostic reports `needs-action`.
- GitHub authorization, Codex repository trust, and any tool permission prompt require the user's review and confirmation.
- Promty may capture prompts, responses, repository paths, and code changes. Tell the user to use non-sensitive test content.

## Prerequisites

Confirm these are available:

- Node.js 20 or newer
- Python 3.12 or newer
- Git
- A GitHub account for collector authorization
- A Git repository containing the project to connect

If the repository has a GitHub `origin` remote, Promty uses it to associate captured activity with the repository.

## Select one environment

Production:

```bash
npx promty-collector init --profile prod
```

Local development:

```bash
npx promty-collector init --profile dev
```

If the user supplied different app and API URLs, pass them together with a profile. Production and local profiles keep their credentials, queues, logs, and uploader processes separate.

## Installation procedure

1. Confirm the current working directory belongs to the intended Git repository.
2. Confirm the prerequisites without changing unrelated dependencies.
3. Run the single selected `init` command.
4. If `npx` asks to install `promty-collector`, accept the package installation.
5. If browser-based GitHub authorization starts, ask the user to complete it. Continue only after authorization returns control to the terminal.
6. Confirm the command exits with status `0` and prints `Promty init complete`.
7. Confirm these repository files exist. Do not print secret-bearing configuration values:
   - `.codex/hooks.json`
   - `.claude/settings.local.json`
8. Tell the user to open `/hooks` in Codex, review the Promty hook commands, and trust the repository.
9. Tell the user to exit and restart any Codex or Claude Code session that was open during installation.
10. Run the verification command:

```bash
npx promty-collector doctor --profile <dev-or-prod> --tool all
```

11. Report the status of `config`, `login`, `hooks/codex-cli`, `hooks/claude-code`, `queue`, `backend`, and `uploader`.
12. Ask the user to submit one small, non-sensitive prompt in each tool and confirm that the new activity appears in Promty.

## Expected hook coverage

Codex writes `.codex/hooks.json` with:

- `UserPromptSubmit`: captures the submitted prompt
- `Stop`: captures the response and changed files

Claude Code writes `.claude/settings.local.json` with:

- `SessionStart`: starts the session timeline
- `UserPromptSubmit`: captures the submitted prompt
- `Stop`: captures the response and changed files
- `SessionEnd`: closes the session timeline

## Environment switching

Running `init` again updates saved configuration and hook files. However, an uploader that is already running keeps the API destination with which it started.

Before switching environments, stop the current uploader:

```bash
kill "$(cat ~/.prompthub/uploader.pid)"
```

Then run exactly one `init` command with the new app and API URLs and restart Codex and Claude Code sessions.

## Troubleshooting

### Codex does not capture prompts

Ask the user to open `/hooks`, confirm the Promty hooks are enabled and trusted, and start a new Codex session in the repository.

### Claude Code misses `SessionStart`

Exit the Claude Code session that was open during installation and launch a new one from the repository root.

### Backend or uploader reports `needs-action`

Confirm the selected API is reachable. The user may inspect `~/.prompthub/uploader.log` locally. Do not paste private log contents into the conversation. Start the uploader if needed:

```bash
npx promty-collector start-uploader
```

Then run `doctor --tool all` again.

### Events go to the wrong environment

Stop the existing uploader before changing URLs, run one `init` command for the intended environment, and restart both AI tool sessions.

## Completion report

Report all of the following:

- selected app URL and API URL
- `init` exit status
- hook files created or updated
- Codex hook trust required or confirmed
- Codex and Claude Code session restart required or completed
- every `doctor --tool all` result
- remaining user action, if any

Do not report the integration as complete until installation succeeded, both hook configurations exist, and all automated diagnostics are healthy. Treat manual hook trust and test prompts as explicit follow-up actions when they have not yet been confirmed.
