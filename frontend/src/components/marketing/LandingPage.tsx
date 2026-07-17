import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Copy,
  FileCode2,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  MemoryStick,
  MousePointer2,
  Network,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  MarketingCta,
  MarketingShell,
  SectionHeading,
} from "./MarketingShell";

const heroStages = [
  {
    label: "Capture",
    title: "A coding session finishes",
    detail: "Codex changed 3 files and made an authentication decision.",
    icon: TerminalSquare,
  },
  {
    label: "Organize",
    title: "Project Memory updates",
    detail: "The decision, its reason, and the next question become durable context.",
    icon: MemoryStick,
  },
  {
    label: "Continue",
    title: "The next agent starts informed",
    detail: "Promty delivers the current direction through CLI or MCP.",
    icon: Bot,
  },
] as const;

const workflowStages = [
  {
    number: "01",
    label: "Capture",
    title: "Work where you already work.",
    description: "Repository-scoped hooks record prompts, responses, file changes, and session boundaries without interrupting the AI tool.",
    code: "promty capture --tool codex-cli",
  },
  {
    number: "02",
    label: "Organize",
    title: "Turn activity into decisions.",
    description: "Completed work is compiled into current direction, decisions, rejected paths, technical assumptions, and open questions.",
    code: "Project Memory updated · 8 sources",
  },
  {
    number: "03",
    label: "Continue",
    title: "Give context back to any agent.",
    description: "A read-only CLI and MCP bridge let the next coding agent load the same project understanding before it plans or edits.",
    code: "promty context",
  },
] as const;

const command = "npx promty-collector init --tool codex-cli";

export function LandingPage() {
  const [heroStage, setHeroStage] = useState(0);
  const [comparison, setComparison] = useState<"without" | "with">("without");
  const [workflowStage, setWorkflowStage] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(
      () => setHeroStage((current) => (current + 1) % heroStages.length),
      3200,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const ActiveHeroIcon = heroStages[heroStage].icon;
  const activeWorkflow = workflowStages[workflowStage];
  const comparisonItems = useMemo(
    () =>
      comparison === "without"
        ? [
            "Explain architecture again",
            "Rediscover rejected approaches",
            "Guess why the last change was made",
          ]
        : [
            "Load the current project direction",
            "Recover decisions with their reasons",
            "Continue from explicit open questions",
          ],
    [comparison],
  );

  async function copyCommand() {
    await copyTextToClipboard(command);
    setCopied(true);
  }

  return (
    <MarketingShell current="home">
      <section className="marketing-hero">
        <div className="marketing-hero-grid" aria-hidden="true" />
        <div className="marketing-hero-copy" data-marketing-reveal>
          <div className="marketing-kicker">
            <CircleDot aria-hidden="true" size={14} />
            PROJECT MEMORY FOR AI AGENTS
          </div>
          <h1>
            Your AI tools forget.
            <span>Promty remembers.</span>
          </h1>
          <p>
            Promty turns coding sessions into durable project memory, so every
            human and agent can continue with the decisions that got you here.
          </p>
          <div className="marketing-hero-actions">
            <MarketingCta href="/app">
              Start with Promty <ArrowRight aria-hidden="true" size={17} />
            </MarketingCta>
            <MarketingCta href="#how-it-works" secondary>
              <Play aria-hidden="true" size={16} /> See how it works
            </MarketingCta>
          </div>
          <div className="marketing-command" role="group" aria-label="Install command">
            <TerminalSquare aria-hidden="true" size={16} />
            <code>{command}</code>
            <button aria-label="Copy install command" onClick={() => void copyCommand()} type="button">
              {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <div className="memory-relay" data-marketing-reveal>
          <div className="memory-relay-topbar">
            <span><i /> promty / auth-bridge</span>
            <span>live context</span>
          </div>
          <div className="memory-relay-stage" key={heroStage}>
            <div className="memory-relay-icon"><ActiveHeroIcon aria-hidden="true" size={22} /></div>
            <span>{heroStages[heroStage].label}</span>
            <strong>{heroStages[heroStage].title}</strong>
            <p>{heroStages[heroStage].detail}</p>
          </div>
          <div className="memory-relay-trace" aria-label="Memory relay stages">
            {heroStages.map((stage, index) => (
              <button
                aria-current={index === heroStage ? "step" : undefined}
                key={stage.label}
                onClick={() => setHeroStage(index)}
                type="button"
              >
                <span>{index + 1}</span>
                {stage.label}
              </button>
            ))}
          </div>
          <div className="memory-relay-log">
            <span><Clock3 aria-hidden="true" size={13} /> 14:32:08</span>
            <code>{heroStage === 0 ? "+ strict collector auth" : heroStage === 1 ? "decision saved · confidence .90" : "get_project_context → ready"}</code>
          </div>
        </div>
      </section>

      <div className="marketing-signal-strip" aria-label="Supported workflow surfaces">
        <span>Works across your AI workflow</span>
        <strong><Code2 aria-hidden="true" size={15} /> Codex CLI</strong>
        <strong><Sparkles aria-hidden="true" size={15} /> Claude Code</strong>
        <strong><Network aria-hidden="true" size={15} /> MCP</strong>
        <strong><GitBranch aria-hidden="true" size={15} /> GitHub</strong>
      </div>

      <section className="marketing-section problem-section">
        <SectionHeading
          eyebrow="CONTEXT IS THE BOTTLENECK"
          title="Every new session starts too far behind."
          description="Models are getting faster. Your project understanding still disappears between tools, sessions, and teammates."
        />
        <div className="comparison-card" data-mode={comparison} data-marketing-reveal>
          <div className="comparison-toggle" role="group" aria-label="Compare Promty context">
            <button aria-pressed={comparison === "without"} onClick={() => setComparison("without")} type="button">Without Promty</button>
            <button aria-pressed={comparison === "with"} onClick={() => setComparison("with")} type="button">With Promty</button>
          </div>
          <div className="comparison-content">
            <div>
              <span className="comparison-status">
                {comparison === "without" ? <RefreshCw aria-hidden="true" size={16} /> : <CheckCircle2 aria-hidden="true" size={16} />}
                {comparison === "without" ? "Context reset" : "Context loaded"}
              </span>
              <h3>{comparison === "without" ? "Start by reconstructing the past." : "Start by moving the project forward."}</h3>
              <p>{comparison === "without" ? "The next agent sees code, but not the thinking that shaped it." : "The next agent sees current direction, decisions, assumptions, and open questions."}</p>
            </div>
            <ul>
              {comparisonItems.map((item) => (
                <li key={item}>{comparison === "with" ? <Check aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="marketing-section workflow-section" id="how-it-works">
        <SectionHeading
          eyebrow="ONE CONTINUOUS MEMORY"
          title="From raw activity to reusable context."
          description="Promty stays quiet while you work, organizes what matters, and returns it exactly when the next agent needs it."
        />
        <div className="workflow-layout" data-marketing-reveal>
          <div className="workflow-selector">
            {workflowStages.map((stage, index) => (
              <button aria-current={index === workflowStage ? "step" : undefined} key={stage.number} onClick={() => setWorkflowStage(index)} type="button">
                <span>{stage.number}</span>
                <div><strong>{stage.label}</strong><small>{stage.title}</small></div>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            ))}
          </div>
          <div className="workflow-preview" key={workflowStage}>
            <div className="workflow-preview-header">
              <span>{activeWorkflow.label}</span>
              <span>0{workflowStage + 1} / 03</span>
            </div>
            <div className="workflow-preview-body">
              <span className="workflow-number">{activeWorkflow.number}</span>
              <h3>{activeWorkflow.title}</h3>
              <p>{activeWorkflow.description}</p>
              <code>{activeWorkflow.code}</code>
            </div>
            <div className="workflow-preview-meter"><i style={{ width: `${((workflowStage + 1) / 3) * 100}%` }} /></div>
          </div>
        </div>
      </section>

      <section className="marketing-section product-proof-section">
        <SectionHeading
          eyebrow="PRODUCT, NOT A TRANSCRIPT"
          title="See how work becomes memory."
          description="Every important statement stays connected to the activity that produced it."
        />
        <div className="product-proof" data-marketing-reveal>
          <div className="product-proof-sidebar">
            <div className="mini-brand"><MemoryStick aria-hidden="true" size={16} /> Project Memory</div>
            <button className="is-active" type="button"><Workflow aria-hidden="true" size={15} /> Current direction</button>
            <button type="button"><Layers3 aria-hidden="true" size={15} /> Decisions <span>4</span></button>
            <button type="button"><CircleDot aria-hidden="true" size={15} /> Open questions <span>2</span></button>
          </div>
          <div className="product-proof-main">
            <div className="proof-breadcrumb"><span>promty</span><ChevronRight aria-hidden="true" size={13} /><span>Project Memory</span><small>Updated 2m ago</small></div>
            <div className="proof-heading"><div><span>Current direction</span><h3>Ship a read-only Agent Context bridge.</h3></div><span className="confidence-badge">90% confidence</span></div>
            <p className="proof-summary">Expose compiled Project Memory through a user-owned collector token. Keep the existing capture and memory pipeline unchanged.</p>
            <div className="proof-decision-grid">
              <article><span>Decision</span><strong>Separate read auth from ingest auth</strong><p>A shared ingest secret must never read private user context.</p><small><KeyRound aria-hidden="true" size={13} /> 3 source memories</small></article>
              <article><span>Instruction for next agent</span><strong>Preserve the existing architecture</strong><p>No database migration, frontend coupling, or change to event collection.</p><small><FileCode2 aria-hidden="true" size={13} /> security.py · context_client.py</small></article>
            </div>
          </div>
          <div className="product-proof-cursor"><MousePointer2 aria-hidden="true" size={18} /><span>source linked</span></div>
        </div>
      </section>

      <section className="marketing-section handoff-section">
        <div className="handoff-copy" data-marketing-reveal>
          <span className="marketing-eyebrow">AGENT HANDOFF</span>
          <h2>One project memory.<br />Every agent starts informed.</h2>
          <p>Promty gives Codex, Claude Code, and any MCP client a shared understanding without forcing your team into another editor.</p>
          <MarketingCta href="/product">Explore Agent Context <ArrowRight aria-hidden="true" size={16} /></MarketingCta>
        </div>
        <div className="handoff-visual" data-marketing-reveal>
          <div className="agent-node"><Code2 aria-hidden="true" size={18} /><span>Codex</span></div>
          <div className="agent-node"><Sparkles aria-hidden="true" size={18} /><span>Claude</span></div>
          <div className="memory-core"><MemoryStick aria-hidden="true" size={24} /><strong>Project Memory</strong><span>direction · decisions · questions</span></div>
          <div className="agent-output"><Bot aria-hidden="true" size={18} /><span>Next agent</span><strong>Context loaded</strong></div>
          <svg aria-hidden="true" viewBox="0 0 600 320"><path d="M120 80C230 80 190 160 300 160M120 240C230 240 190 160 300 160M385 160C450 160 450 160 500 160" /></svg>
        </div>
      </section>

      <section className="marketing-section security-section" id="security">
        <SectionHeading
          eyebrow="QUIET BY DEFAULT. EXPLICIT BY DESIGN."
          title="Your project context stays under your control."
          description="Promty collects only where you install it and separates capture, identity, repository, and read permissions."
        />
        <div className="security-grid" data-marketing-reveal>
          <article><LockKeyhole aria-hidden="true" size={20} /><span>01</span><h3>Repository scoped</h3><p>Only repositories with explicit Promty hooks are captured.</p></article>
          <article><KeyRound aria-hidden="true" size={20} /><span>02</span><h3>User-owned tokens</h3><p>Private context reads require an active collector token tied to the project owner.</p></article>
          <article><ShieldCheck aria-hidden="true" size={20} /><span>03</span><h3>Separated permissions</h3><p>Global ingest and anonymous development modes cannot read Project Memory.</p></article>
          <article><Braces aria-hidden="true" size={20} /><span>04</span><h3>Reviewable output</h3><p>Humans can inspect the memory that an agent receives.</p></article>
        </div>
      </section>

      <section className="marketing-section community-section" data-marketing-reveal>
        <div className="community-intro">
          <span className="marketing-eyebrow">BUILT IN THE OPEN</span>
          <h2>Explore how real projects move.</h2>
          <p>Public projects turn activity, memory, and reusable workflows into living proof—not a wall of testimonials.</p>
          <MarketingCta href="/app?view=community" secondary>Explore community <ArrowRight aria-hidden="true" size={16} /></MarketingCta>
        </div>
        <div className="community-cards">
          <article><span className="project-monogram">PR</span><div><strong>Promty</strong><p>Project memory for AI development</p></div><small>updated now</small></article>
          <article><span className="project-monogram">AG</span><div><strong>Agent Context Bridge</strong><p>Read-only memory for coding agents</p></div><small>8 memories</small></article>
          <article><span className="project-monogram">WF</span><div><strong>Shared Workflows</strong><p>Reusable flows from completed work</p></div><small>3 published</small></article>
        </div>
      </section>

      <section className="marketing-final-cta" data-marketing-reveal>
        <div><span className="marketing-eyebrow">START WITH ONE REPOSITORY</span><h2>Stop re-explaining your project to AI.</h2><p>Connect Promty once. Let the next session begin with the context your last session earned.</p></div>
        <div className="marketing-final-actions"><MarketingCta href="/app">Open Promty <ArrowRight aria-hidden="true" size={17} /></MarketingCta><MarketingCta href="/docs/collector" secondary>Read setup guide</MarketingCta></div>
      </section>
    </MarketingShell>
  );
}
