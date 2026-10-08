import { useState } from "react";
import { ArrowDown, ArrowRight, Check, ChevronDown, Copy, GitBranch, LockKeyhole, ShieldCheck, Terminal } from "lucide-react";
import { MarketingShell, MarketingCta } from "./MarketingShell";
import { LandingProductPreview, LandingWorkflow } from "./LandingPreview";
import { MarketingToolIcon } from "./MarketingToolIcon";
import "./landing-redesign.css";

export const publicCollectorCommand =
  "npx promty-collector@latest init --tool codex-cli --profile prod";

const questions = [
  {
    question: "Is Promty free to use?",
    answer: "Yes. Promty is free to use. Sign in with GitHub to get started.",
  },
  {
    question: "What is Project Memory?",
    answer: "A structured account of your project’s current direction, decisions and their reasons, rejected approaches, open questions, and next steps. It is generated from selected work records and can be reviewed before you approve it for agent use.",
  },
  {
    question: "Which tools can I use with Promty?",
    answer: "The Collector supports Codex and Claude Code. You can retrieve approved Project Memory through the Promty CLI or a configured MCP-compatible client. Connecting a tool for capture and configuring it to read memory are separate steps.",
  },
  {
    question: "Does it collect every project on my computer?",
    answer: "Collection starts in the Git repositories where you explicitly install the Collector. It captures prompts, emitted responses, session events, and file-change information from those connected repositories. Other projects are not automatically scanned.",
  },
  {
    question: "What is sent to an external AI provider?",
    answer: "Memory generation requires a separate choice to enable external AI processing. You can review and exclude prompt previews before generation. Requests can include selected prompt previews, related response samples, project metadata, and existing memory. Generation does not send raw source-file contents or patches. Excluding a generation input does not delete the original activity stored in Promty.",
  },
  {
    question: "Does the next agent receive my entire chat history?",
    answer: "The owner-scoped, read-only Agent Context bridge returns the latest Project Memory you approved for agents. It does not expose raw prompts, responses, or patch bodies, and cannot modify the memory. Set up the CLI or MCP bridge to make that context available to your next session.",
  },
  {
    question: "How is this different from an AGENTS.md file?",
    answer: "An AGENTS.md file is useful for instructions and conventions you maintain in a repository. Promty adds a reviewable record of decisions and unresolved work from your AI coding sessions. You can use both: standing instructions in your repository, and approved project context from Promty.",
  },
];

function CollectorSetup() {
  const [tool, setTool] = useState<"codex-cli" | "claude-code">("codex-cli");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const command = publicCollectorCommand.replace("codex-cli", tool);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="lp-install">
      <div className="lp-install-toolbar">
        <div className="lp-tool-choice" aria-label="Choose your coding tool">
          {(["codex-cli", "claude-code"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={tool === value} onClick={() => { setTool(value); setCopyState("idle"); }}>
              <MarketingToolIcon tool={value === "codex-cli" ? "codex" : "claude"} size={15} />
              {value === "codex-cli" ? "Codex" : "Claude Code"}
            </button>
          ))}
        </div>
        <span>RUN IN YOUR REPOSITORY</span>
      </div>
      <div className="lp-install-command">
        <span aria-hidden="true">$</span>
        <code>{command}</code>
        <button aria-label="Copy install command" onClick={copyCommand} type="button">
          {copyState === "copied" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
        </button>
      </div>
      <div className="lp-install-footer">
        <span>Git repository · Node.js 20+ · Python 3.12+</span>
        <span role="status">{copyState === "copied" ? "Command copied" : copyState === "failed" ? "Select the command to copy it manually." : ""}</span>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <MarketingShell appearance="figma" current="home">
      <div className="lp-page" data-page="landing">
        <section className="lp-hero lp-container" id="overview">
          <div className="lp-hero-copy">
            <a className="lp-announcement" href="#workflow"><span className="lp-status-dot" /> PROJECT MEMORY FOR AI BUILDERS <ArrowRight size={13} aria-hidden="true" /></a>
            <h1>Pick up where <span>you left off.</span></h1>
            <p>Turn Codex and Claude Code sessions into project memory. Review the decisions, then bring approved context into your next session.</p>
            <div className="lp-actions">
              <MarketingCta href="/app">Get started <ArrowRight size={16} aria-hidden="true" /></MarketingCta>
              <a className="lp-text-link" href="#get-started">View setup steps <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
            <div className="lp-hero-tools"><span className="lp-free-note"><Check size={13} aria-hidden="true" /> Free to use</span><i /><span>WORKS WITH</span><strong><MarketingToolIcon tool="codex" /> Codex</strong><i /><strong><MarketingToolIcon tool="claude" /> Claude Code</strong></div>
          </div>
          <div className="lp-hero-visual">
            <LandingProductPreview />
          </div>
        </section>

        <div className="lp-promise-strip lp-container">
          <span><GitBranch size={16} aria-hidden="true" /> Capture only the projects you connect</span>
          <span><ShieldCheck size={16} aria-hidden="true" /> Review what carries forward</span>
          <span><Terminal size={16} aria-hidden="true" /> Bring context to your next tool</span>
        </div>

        <section className="lp-workflow-section" id="workflow">
          <div className="lp-container">
            <div className="lp-section-heading">
              <div><span className="lp-eyebrow">HOW PROMTY FITS INTO YOUR WORK</span><h2>Connect. Review.<br />Continue.</h2></div>
              <p>Start in your repository. Review the collected work in Promty. Set up your next agent to read the memory you approve.</p>
            </div>
            <LandingWorkflow />
          </div>
        </section>

        <section className="lp-section lp-container lp-memory-section" id="memory">
          <div className="lp-section-intro">
            <span className="lp-eyebrow">WHAT PROJECT MEMORY KEEPS</span>
            <h2>Decisions, reasons,<br /><span>and next steps.</span></h2>
            <p>A concise record of what the project is doing and why, with sources you can revisit. Review it before making it available to agents.</p>
            <a className="lp-text-link" href="/product">Explore Project Memory <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          <div className="lp-memory-anatomy">
            {[
              ["01", "Current direction", "What you’re building and what matters now."],
              ["02", "Decisions & reasons", "What you chose, why, and which paths you ruled out."],
              ["03", "Open questions", "The uncertainties that still need an answer."],
              ["04", "A clear next step", "Where the next human or AI should begin."],
            ].map(([number, title, body]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div><ArrowRight size={16} aria-hidden="true" /></article>)}
          </div>
        </section>

        <section className="lp-trust-section" id="security">
          <div className="lp-container">
            <div className="lp-section-heading"><div><span className="lp-eyebrow">YOUR PROJECT. YOUR BOUNDARIES.</span><h2>Useful memory.<br />Deliberate control.</h2></div><a className="lp-text-link" href="/privacy">Read our privacy notice <ArrowRight size={16} aria-hidden="true" /></a></div>
            <div className="lp-trust-grid">
              <article><GitBranch size={23} aria-hidden="true" /><h3>Choose what connects.</h3><p>Install the Collector in the repositories you choose. Collection starts there, and projects are private by default.</p></article>
              <article><ShieldCheck size={23} aria-hidden="true" /><h3>Decide what gets used.</h3><p>Review generation inputs, choose whether to enable external AI processing, and approve memory separately for agents.</p></article>
              <article><LockKeyhole size={23} aria-hidden="true" /><h3>Share approved context.</h3><p>The read-only Agent Context bridge retrieves your approved memory. Raw chats and patches stay outside that response.</p></article>
            </div>
            <p className="lp-trust-note">Collection uploads activity to Promty. Reviewing generation inputs and approving agent memory are separate controls.</p>
          </div>
        </section>

        <section className="lp-section lp-container lp-start" id="get-started">
          <div className="lp-section-heading"><div><span className="lp-eyebrow">CONNECT YOUR FIRST REPOSITORY</span><h2>Sign in. Run setup.<br /><span>Start your next task.</span></h2></div><p>You’ll need a GitHub account, a local Git repository, Node.js 20+, and Python 3.12+. Choose your coding tool below to begin.</p></div>
          <ol className="lp-setup-steps">
            <li><span>01</span><div><h3>Run inside your repository</h3><p>Open a terminal at your project’s root. Select Codex or Claude Code, then run the command below.</p></div></li>
            <li><span>02</span><div><h3>Authorize with GitHub</h3><p>Complete the browser authorization, then return to the terminal and wait for “Promty init complete”.</p></div></li>
            <li><span>03</span><div><h3>Start a new coding session</h3><p>Open your selected tool in that repository. Send a test prompt, then check that activity appears in Promty.</p></div></li>
          </ol>
          <CollectorSetup />
          <p className="lp-setup-next">To bring approved memory into your next session, follow the <a href="/docs/collector">CLI or MCP context setup</a>.</p>
          <div className="lp-start-actions"><span className="lp-free-note"><Check size={13} aria-hidden="true" /> Free to use</span><MarketingCta href="/app">Get started <ArrowRight size={16} aria-hidden="true" /></MarketingCta><a className="lp-text-link" href="/docs/collector">Read the setup guide <ArrowRight size={16} aria-hidden="true" /></a></div>
        </section>

        <section className="lp-section lp-container lp-faq" id="faq">
          <div><span className="lp-eyebrow">A FEW THINGS WORTH KNOWING</span><h2>Before you <br />connect.</h2><p>More detail in the <a href="/docs/collector">setup guide</a>.</p></div>
          <div className="lp-faq-list">{questions.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
        </section>
        <section className="lp-closing lp-container"><div><span className="lp-eyebrow">READY FOR YOUR FIRST PROJECT?</span><h2>Keep your project moving.</h2></div><MarketingCta href="/app">Get started <ArrowRight size={16} aria-hidden="true" /></MarketingCta></section>
      </div>
    </MarketingShell>
  );
}
