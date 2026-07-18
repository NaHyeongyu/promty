# Claude Code Hook Verification

Goal: validate Promty Collector with Claude Code official hooks.

Claude Code hooks are configured through Claude settings JSON. For repo-local
Promty development, use `.claude/settings.local.json` so local hook commands
and machine paths are not shared by default.

Official reference:

- https://code.claude.com/docs/en/hooks

## Install Hooks

From the repository root:

```bash
python3 collector/src/cli.py install-hooks --tool claude-code
```

This writes Promty command hooks to:

```text
.claude/settings.local.json
```

Expected hook events:

```text
SessionStart      -> capture --event-type SessionStarted
UserPromptSubmit  -> capture
Stop              -> capture-changes
SessionEnd        -> capture --event-type SessionEnded
```

`Stop` uses `capture-changes`, which stores a `ResponseReceived` event from the
Claude hook payload and then emits a `FilesChanged` event if the prompt baseline
detects git changes.

## Capture Raw Payloads

Temporarily replace one installed hook command with:

```bash
python3 collector/src/cli.py capture-raw --output docs/real-claude-payload.json
```

Then trigger the matching Claude Code hook and inspect the output.

Recommended captures:

```text
docs/real-claude-session-start-payload.json
docs/real-claude-user-prompt-submit-payload.json
docs/real-claude-stop-payload.json
docs/real-claude-session-end-payload.json
```

Do not commit raw payloads if they contain private prompts, local paths, tokens,
or repository-private content.

## Local Diagnostics

```bash
python3 collector/src/cli.py doctor --tool claude-code
```

The hooks check should report:

```text
hooks: ok - installed in .claude/settings.local.json
```

## End-to-End Check

1. Start or verify the uploader:

   ```bash
   python3 collector/src/cli.py start-uploader
   ```

2. Open Claude Code in this repository.
3. Submit a prompt that changes a small non-sensitive file.
4. Wait for the uploader to flush queued events.
5. Confirm the backend received:

   ```text
   SessionStarted
   PromptSubmitted
   ResponseReceived
   FilesChanged
   ```

6. Confirm the Promty project detail page shows a Claude Code session and the
   prompt/file changes.
