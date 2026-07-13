import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { API_URL, BRAND_NAME } from "../../config";
import { BrandLogo } from "../app/Branding";
import "./collector-docs.css";

type DocsAudience = "ai" | "human";

const LOCAL_COMMAND =
  "npx promty-collector init --profile dev";
const PRODUCTION_COMMAND =
  "npx promty-collector init --profile prod";
const MULTI_PROFILE_COMMAND =
  "npx promty-collector init --profiles dev,prod";

function currentSetupCommand() {
  const profile = window.location.hostname === "promty.org" || window.location.hostname === "www.promty.org"
    ? "prod"
    : "dev";
  return `npx promty-collector init --profile ${profile} --app-url ${window.location.origin} --api-url ${API_URL}`;
}

export function CollectorDocsPage({
  audience = "human",
}: {
  audience?: DocsAudience;
}) {
  useEffect(() => {
    document.title =
      audience === "ai"
        ? `AI setup instructions · ${BRAND_NAME}`
        : `Codex & Claude Code setup · ${BRAND_NAME}`;
  }, [audience]);

  if (audience === "ai") {
    return <AiCollectorGuide />;
  }

  return <HumanCollectorGuide />;
}

function DocsHeader({ audience }: { audience: DocsAudience }) {
  return (
    <header className="docs-topbar">
      <a className="docs-brand" href="/" aria-label={`${BRAND_NAME} home`}>
        <BrandLogo />
        <span>{BRAND_NAME}</span>
      </a>
      <nav aria-label="Documentation views" className="docs-view-switcher">
        <a data-active={audience === "human"} href="/docs/collector">
          Human guide
        </a>
        <a data-active={audience === "ai"} href="/docs/collector/ai">
          <Bot aria-hidden="true" size={15} />
          AI instructions
        </a>
      </nav>
    </header>
  );
}

function HumanCollectorGuide() {
  const setupCommand = currentSetupCommand();

  return (
    <div className="docs-shell">
      <DocsHeader audience="human" />
      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="On this page">
          <span className="docs-sidebar-label">On this page</span>
          <a href="#quick-start">Quick start</a>
          <a href="#codex">Codex</a>
          <a href="#claude-code">Claude Code</a>
          <a href="#verify">Verify the connection</a>
          <a href="#switch-environment">Switch environments</a>
          <a href="#troubleshooting">Troubleshooting</a>
          <a href="#privacy">Privacy & files</a>
        </aside>

        <main className="docs-main">
          <section className="docs-hero">
            <span className="docs-eyebrow">Collector integration</span>
            <h1>Connect Codex and Claude Code</h1>
            <p>
              Install repository-local hooks, authorize the collector, and send your AI work to
              {` ${BRAND_NAME}`} without changing how you use either tool.
            </p>
            <div className="docs-hero-actions">
              <a className="docs-primary-link" href="#quick-start">
                Start setup <ChevronRight aria-hidden="true" size={16} />
              </a>
              <a className="docs-secondary-link" href="/docs/collector/ai">
                <Bot aria-hidden="true" size={16} /> Give instructions to an AI
              </a>
            </div>
          </section>

          <Callout icon={<ClipboardCheck size={18} />} title="Before you begin">
            Run setup from the Git repository you want to capture. You need Node.js 20+, Python
            3.12+, Git, and a GitHub account for authorization.
          </Callout>

          <DocsSection id="quick-start" kicker="01" title="Quick start">
            <p>
              Use the command for the environment you are currently viewing. It installs both
              Codex and Claude Code hooks by default and starts the uploader in the background.
            </p>
            <CommandBlock command={setupCommand} label="Run from your repository root" />
            <ol className="docs-steps">
              <Step title="Run the command">
                Accept the one-time npm package prompt if it appears.
              </Step>
              <Step title="Authorize in your browser">
                Sign in with GitHub, approve the collector, and return to the terminal.
              </Step>
              <Step title="Confirm completion">
                Wait for <InlineCode>Promty init complete</InlineCode>. The runtime, hooks, local
                configuration, and background uploader are now ready.
              </Step>
              <Step title="Activate the hooks">
                Follow the tool-specific step below, then start a fresh AI session.
              </Step>
            </ol>
          </DocsSection>

          <DocsSection id="codex" kicker="02" title="Codex setup">
            <p>
              Setup writes repository-local hooks to <InlineCode>.codex/hooks.json</InlineCode>.
              Promty listens to prompt submission and turn completion so it can capture prompts,
              responses, and file changes.
            </p>
            <EventGrid
              events={[
                ["UserPromptSubmit", "Records the submitted prompt"],
                ["Stop", "Records the response and changed files"],
              ]}
            />
            <ol className="docs-steps">
              <Step title="Open hook settings">
                In Codex, enter <InlineCode>/hooks</InlineCode> from this repository.
              </Step>
              <Step title="Trust this repository">
                Review the Promty commands and approve the repository hooks when prompted. Codex
                will not execute untrusted hooks.
              </Step>
              <Step title="Start a new session">
                Close the current Codex session and start a new one in the same repository.
              </Step>
              <Step title="Send a test prompt">
                Use a small, non-sensitive prompt and then verify the connection below.
              </Step>
            </ol>
          </DocsSection>

          <DocsSection id="claude-code" kicker="03" title="Claude Code setup">
            <p>
              Setup writes repository-local hooks to
              <InlineCode>.claude/settings.local.json</InlineCode>. Claude Code uses four lifecycle
              events to preserve the complete session timeline.
            </p>
            <EventGrid
              events={[
                ["SessionStart", "Starts the session timeline"],
                ["UserPromptSubmit", "Records the submitted prompt"],
                ["Stop", "Records the response and changed files"],
                ["SessionEnd", "Closes the session timeline"],
              ]}
            />
            <ol className="docs-steps">
              <Step title="Start a new session">
                Exit any Claude Code session that was already open during installation, then start
                Claude Code again from this repository.
              </Step>
              <Step title="Confirm hook permissions">
                If Claude Code asks whether repository hooks may run, review and approve them.
              </Step>
              <Step title="Send a test prompt">
                Submit a small, non-sensitive prompt. End the session to also test
                <InlineCode>SessionEnd</InlineCode>.
              </Step>
            </ol>
          </DocsSection>

          <DocsSection id="verify" kicker="04" title="Verify the connection">
            <p>Run diagnostics for both integrations from the same repository.</p>
            <CommandBlock command="npx promty-collector doctor --tool all" />
            <p>Healthy output reports these checks as <InlineCode>ok</InlineCode>:</p>
            <div className="docs-check-grid">
              {[
                "config",
                "login",
                "hooks/codex-cli",
                "hooks/claude-code",
                "queue",
                "backend",
                "uploader",
              ].map((check) => (
                <span key={check}>
                  <Check aria-hidden="true" size={15} /> {check}
                </span>
              ))}
            </div>
            <p>
              After a test prompt, open {BRAND_NAME} and confirm the project timeline contains the
              new session. Uploading normally completes within a few seconds.
            </p>
          </DocsSection>

          <DocsSection id="switch-environment" kicker="05" title="Switch environments">
            <Callout icon={<RefreshCw size={18} />} title="Choose explicit destinations">
              Use one profile for a single destination, or initialize both profiles explicitly to
              save the same captured event to independent development and production queues.
            </Callout>
            <div className="docs-command-pair">
              <CommandBlock command={LOCAL_COMMAND} label="Local development" />
              <CommandBlock command={PRODUCTION_COMMAND} label="Production" />
            </div>
            <CommandBlock command={MULTI_PROFILE_COMMAND} label="Development and production" />
            <p>
              Multi-profile mode creates an event once, keeps a separate retry queue for each
              destination, and reports each backend and uploader independently through doctor.
            </p>
            <CommandBlock
              command="npx promty-collector doctor --profiles dev,prod --tool all"
              label="Verify both profiles"
            />
          </DocsSection>

          <DocsSection id="troubleshooting" kicker="06" title="Troubleshooting">
            <TroubleshootingList />
          </DocsSection>

          <DocsSection id="privacy" kicker="07" title="Privacy & generated files">
            <p>
              Promty may capture prompts, responses, repository paths, and code changes. Test with
              non-sensitive content and review your organization’s policy before connecting a
              private repository.
            </p>
            <div className="docs-file-list">
              <FileItem path=".codex/hooks.json" text="Codex repository hooks" />
              <FileItem path=".claude/settings.local.json" text="Claude Code local hooks" />
              <FileItem
                path="~/.prompthub/profiles/&lt;profile&gt;/config.json"
                text="Profile-specific login and API configuration"
              />
              <FileItem
                path="~/.prompthub/profiles/&lt;profile&gt;/events"
                text="Profile-specific pending event queue"
              />
              <FileItem
                path="~/.prompthub/profiles/&lt;profile&gt;/uploader.log"
                text="Profile-specific background uploader log"
              />
            </div>
            <Callout icon={<ShieldCheck size={18} />} title="Keep credentials private">
              Never paste the Promty config, collector token, raw event queue, or private uploader
              logs into an AI conversation. Review hook files before deciding whether to commit
              them.
            </Callout>
          </DocsSection>
        </main>
      </div>
    </div>
  );
}

function AiCollectorGuide() {
  const setupCommand = currentSetupCommand();
  const instructions = `# Task: connect this repository to Promty

Follow these instructions from the repository root.

## Constraints
- Use the Promty environment supplied by the user. For this page, use:
  - app URL: ${window.location.origin}
  - API URL: ${API_URL}
- Run exactly one init command for the selected environment.
- Do not display, read aloud, commit, or paste collector tokens, ~/.prompthub/config.json, raw event queues, or private uploader logs.
- Preserve existing hooks and unrelated repository changes.
- Browser-based GitHub authorization and hook trust require the user's confirmation.

## Procedure
1. Confirm the current working directory is inside the intended Git repository.
2. Check that Node.js 20+, Python 3.12+, and Git are available.
3. Run:
   ${setupCommand}
4. If npx asks to install promty-collector, accept it.
5. Ask the user to complete GitHub authorization if the browser flow pauses execution.
6. Confirm the command exits successfully and prints "Promty init complete".
7. Confirm these repository files exist without exposing secret values:
   - .codex/hooks.json
   - .claude/settings.local.json
8. Tell the user to open /hooks in Codex, review the Promty commands, and trust this repository.
9. Tell the user to restart existing Codex and Claude Code sessions.
10. Run:
    npx promty-collector doctor --tool all
11. Report each diagnostic status. Do not claim success if any check says "needs-action".
12. Ask the user to submit one non-sensitive test prompt in each tool, then confirm the new activity in Promty.

## Expected hooks
- Codex: UserPromptSubmit, Stop
- Claude Code: SessionStart, UserPromptSubmit, Stop, SessionEnd

## Environment switching
If an uploader is already running for a different API, do not just run init again. Stop that uploader first, run init once with the new URLs, and restart the AI sessions. An existing uploader keeps its original API destination until restarted.

## Completion report
State:
- selected app and API URLs
- init exit status
- hook files created or updated
- Codex trust still required or confirmed
- session restart still required or completed
- doctor results
- any action the user must complete`;

  return (
    <div className="docs-shell docs-ai-shell">
      <DocsHeader audience="ai" />
      <main className="docs-ai-main">
        <a className="docs-back-link" href="/docs/collector">
          <ArrowLeft aria-hidden="true" size={15} /> Back to the human guide
        </a>
        <section className="docs-ai-hero">
          <span className="docs-eyebrow">Agent-readable setup contract</span>
          <h1>Let your AI connect Promty</h1>
          <p>
            Send this page to Codex, Claude Code, or another coding agent. The instruction block
            defines the exact command, safety boundaries, user handoffs, and success checks.
          </p>
          <a className="docs-raw-link" href="/docs/promty-agent-setup.md">
            Open raw Markdown <ExternalLink aria-hidden="true" size={14} />
          </a>
        </section>

        <Callout icon={<Bot size={18} />} title="Suggested prompt">
          Open <InlineCode>{window.location.href}</InlineCode>, follow the Promty setup instructions
          exactly, and report any step that needs my confirmation.
        </Callout>

        <section className="docs-agent-contract" aria-labelledby="agent-contract-title">
          <div className="docs-agent-contract-header">
            <div>
              <span>promty-agent-setup.md</span>
              <h2 id="agent-contract-title">Installation instructions</h2>
            </div>
            <CopyButton text={instructions} />
          </div>
          <pre><code>{instructions}</code></pre>
        </section>

        <div className="docs-ai-summary">
          <SummaryCard
            icon={<Terminal size={19} />}
            title="One setup command"
            text="The page supplies URLs for the current environment and prevents accidental cross-environment setup."
          />
          <SummaryCard
            icon={<GitBranch size={19} />}
            title="User-controlled auth"
            text="The agent pauses for GitHub authorization and repository hook trust instead of bypassing them."
          />
          <SummaryCard
            icon={<Code2 size={19} />}
            title="Verifiable completion"
            text="The agent checks both hook files and runs doctor before reporting that integration succeeded."
          />
        </div>

        <footer className="docs-ai-footer">
          <ShieldCheck aria-hidden="true" size={17} />
          The agent is instructed not to expose collector credentials or raw captured activity.
        </footer>
      </main>
    </div>
  );
}

function DocsSection({
  children,
  id,
  kicker,
  title,
}: {
  children: ReactNode;
  id: string;
  kicker: string;
  title: string;
}) {
  return (
    <section className="docs-section" id={id}>
      <div className="docs-section-heading">
        <span>{kicker}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CommandBlock({ command, label }: { command: string; label?: string }) {
  return (
    <div className="docs-command-block">
      {label ? <span>{label}</span> : null}
      <div>
        <Terminal aria-hidden="true" size={17} />
        <pre><code>{command}</code></pre>
        <CopyButton text={command} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className="docs-copy-button"
      data-copied={copied}
      onClick={() => void copy()}
      title={copied ? "Copied" : "Copy to clipboard"}
      type="button"
    >
      {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function Step({ children, title }: { children: ReactNode; title: string }) {
  return (
    <li>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  );
}

function Callout({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <aside className="docs-callout">
      <span className="docs-callout-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return <code className="docs-inline-code">{children}</code>;
}

function EventGrid({ events }: { events: [string, string][] }) {
  return (
    <div className="docs-event-grid">
      {events.map(([name, description]) => (
        <div key={name}>
          <Code2 aria-hidden="true" size={17} />
          <span>
            <code>{name}</code>
            <small>{description}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function FileItem({ path, text }: { path: string; text: string }) {
  return (
    <div>
      <code>{path}</code>
      <span>{text}</span>
    </div>
  );
}

function TroubleshootingList() {
  const items = [
    [
      "Codex does not capture prompts",
      <>Open <InlineCode>/hooks</InlineCode>, confirm the Promty hooks are enabled and trusted, then start a new session.</>,
    ],
    [
      "Claude Code misses SessionStart",
      <>Exit the session that was open during setup and launch Claude Code again from the repository root.</>,
    ],
    [
      "Backend or uploader needs action",
      <>Check <InlineCode>~/.prompthub/uploader.log</InlineCode> locally. Confirm the selected API is reachable, then run <InlineCode>npx promty-collector start-uploader</InlineCode>.</>,
    ],
    [
      "The wrong environment receives events",
      <>Stop the running uploader before changing URLs. Re-run exactly one environment command and restart both AI sessions.</>,
    ],
  ] as const;

  return (
    <div className="docs-troubleshooting-list">
      {items.map(([title, description]) => (
        <details key={title}>
          <summary>
            {title}
            <ChevronRight aria-hidden="true" size={17} />
          </summary>
          <p>{description}</p>
        </details>
      ))}
    </div>
  );
}

function SummaryCard({
  icon,
  text,
  title,
}: {
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <article>
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
