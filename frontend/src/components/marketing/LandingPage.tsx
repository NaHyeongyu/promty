import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { copyTextToClipboard } from "../../lib/clipboard";
import { MarketingShell } from "./MarketingShell";

export const publicCollectorCommand =
  "npx promty-collector@latest init --tool codex-cli --profile prod";

const heroStages = [
  {
    label: "SESSION COMPLETE",
    status: "Completed",
    duration: 1_000,
  },
  {
    label: "EXTRACT",
    status: "3 context fragments",
    duration: 1_800,
  },
  {
    label: "COMPILE",
    status: "Project Memory built",
    duration: 2_000,
  },
  {
    label: "REVIEW",
    status: "Source linked",
    duration: 1_200,
  },
  {
    label: "CONTINUE",
    status: "Ready for next agent",
    duration: 2_000,
  },
] as const;

const problemCosts = [
  {
    number: "01",
    title: "Explain the architecture again",
    description:
      "The agent can read the files, but it cannot see the decisions that shaped them.",
  },
  {
    number: "02",
    title: "Repeat rejected approaches",
    description:
      "Failed experiments and trade-offs vanish, so the same detours return.",
  },
  {
    number: "03",
    title: "Lose the open questions",
    description:
      "What remained uncertain is buried in an old transcript instead of guiding the next step.",
  },
] as const;

const workflowSteps = [
  {
    number: "01",
    eyebrow: "CAPTURE",
    title: "Capture completed work",
    description:
      "Install the collector in one repository and keep working in Codex CLI or Claude Code.",
    outcome: "Repository scoped",
  },
  {
    number: "02",
    eyebrow: "COMPILE",
    title: "Compile durable context",
    description:
      "Promty condenses outcomes, decisions, rejected paths, and open questions into memory you can review.",
    outcome: "Human reviewable",
  },
  {
    number: "03",
    eyebrow: "CONTINUE",
    title: "Continue with intent",
    description:
      "The next session reads the latest Project Memory through the CLI or owner-scoped, read-only MCP access.",
    outcome: "Agent ready",
  },
] as const;

const memoryEntries = [
  {
    key: "direction",
    label: "CURRENT DIRECTION",
    body:
      "Keep collection repository-scoped and make every generated memory reviewable before it becomes shared context.",
    source: "Collector onboarding · completed session",
  },
  {
    key: "decision",
    label: "DECISION",
    body:
      "Use durable summaries of reasoning instead of replaying raw transcripts in the next session.",
    source: "Architecture decision · 3 supporting memories",
  },
  {
    key: "question",
    label: "OPEN QUESTION",
    body:
      "How should conflicting context from the CLI and dashboard be reconciled?",
    source: "Unresolved product question",
  },
  {
    key: "instruction",
    label: "NEXT INSTRUCTION",
    body:
      "Read the latest memory first, then continue the collector onboarding UX from the unresolved state.",
    source: "Instruction for the next human or agent",
    mono: true,
  },
] as const;

const audiences = [
  {
    number: "01",
    label: "SOLO BUILDERS",
    title: "Return to a project without reloading it from scratch.",
    description:
      "Move between days, branches, and AI sessions with the current direction already preserved.",
  },
  {
    number: "02",
    label: "AI-NATIVE TEAMS",
    title: "Hand work off with the reason trail intact.",
    description:
      "Share decisions and unresolved questions across people, Codex, Claude Code, and future tools.",
  },
  {
    number: "03",
    label: "OPEN PROJECTS",
    title: "Help contributors understand where the work is going.",
    description:
      "Offer a concise orientation layer without asking newcomers to read old chat histories.",
  },
] as const;

const trustPrinciples = [
  {
    number: "01",
    kicker: "SELECTED REPOSITORY",
    title: "Only explicit repositories",
    description:
      "Collection starts where you enable it. Unrelated projects stay out.",
  },
  {
    number: "02",
    kicker: "PROJECT MEMORY",
    title: "Human-reviewable memory",
    description: "See and correct the context before it guides more work.",
  },
  {
    number: "03",
    kicker: "READ-ONLY MCP",
    title: "Read-only, owner-scoped access",
    description:
      "Let approved tools retrieve memory without writing back into it.",
  },
] as const;

const faqs = [
  {
    question: "Does Promty read every repository on my machine?",
    answer:
      "No. Collection begins only in repositories where you explicitly install Promty hooks.",
  },
  {
    question: "Why are Codex and Claude Code hooks both shown?",
    answer:
      "Promty supports both tools, but only the hook installed for a tool runs with that tool. Installing Codex support does not make a Claude Code hook run automatically.",
  },
  {
    question: "Is Project Memory just a transcript summary?",
    answer:
      "No. It is structured around current direction, decisions, rejected paths, open questions, and instructions that future humans and agents can review.",
  },
  {
    question: "Does an MCP agent get write access?",
    answer:
      "No. The Agent Context bridge is read-only and owner-scoped. It retrieves the latest compiled Project Memory without writing back into it.",
  },
] as const;

function emitMarketingInteraction(name: string) {
  window.dispatchEvent(
    new CustomEvent("promty:marketing-interaction", { detail: { name } }),
  );
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function HeroMemoryDemo() {
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const hasAutoplayed = useRef(false);
  const [stage, setStage] = useState(reducedMotion ? heroStages.length - 1 : 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!reducedMotion) return;
    setStage(heroStages.length - 1);
    setPlaying(false);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || hasAutoplayed.current || !rootRef.current) return;
    if (!("IntersectionObserver" in window)) {
      hasAutoplayed.current = true;
      setPlaying(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        hasAutoplayed.current = true;
        setStage(0);
        setPlaying(true);
        observer.disconnect();
      },
      { threshold: [0.5] },
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      if (stage === heroStages.length - 1) {
        setPlaying(false);
        return;
      }
      setStage((current) => current + 1);
    }, heroStages[stage].duration);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, stage]);

  function replay() {
    setStage(0);
    setPlaying(!reducedMotion);
    emitMarketingInteraction("hero_demo_replay");
  }

  function togglePlayback() {
    if (stage === heroStages.length - 1 && !playing) {
      replay();
      return;
    }
    setPlaying((current) => !current);
    emitMarketingInteraction(playing ? "hero_demo_pause" : "hero_demo_play");
  }

  return (
    <div
      className="figma-hero-demo"
      data-playing={playing ? "true" : "false"}
      data-stage={stage}
      ref={rootRef}
    >
      <div className="figma-hero-demo-header">
        <div>
          <span>PROJECT MEMORY</span>
          <strong>promty / collector</strong>
        </div>
        <small>{heroStages[stage].status}</small>
      </div>

      <div className="figma-hero-demo-viewport" aria-live="polite">
        <article aria-hidden={stage !== 0} className={stage === 0 ? "is-active" : ""}>
          <div className="figma-session-complete-mark"><Check size={22} /></div>
          <span>SESSION COMPLETE</span>
          <h3>Collector onboarding finished</h3>
          <p>3 files changed · 1 decision · 1 open question</p>
        </article>

        <article aria-hidden={stage !== 1} className={stage === 1 ? "is-active" : ""}>
          <span>EXTRACTING CONTEXT</span>
          <div className="figma-context-fragments">
            <div><small>DECISION</small><strong>Keep collection repository-scoped</strong></div>
            <div><small>OUTCOME</small><strong>Setup flow completed successfully</strong></div>
            <div><small>OPEN QUESTION</small><strong>Reconcile CLI and dashboard context</strong></div>
          </div>
        </article>

        <article aria-hidden={stage !== 2} className={stage === 2 ? "is-active" : ""}>
          <span>COMPILING MEMORY</span>
          <div className="figma-compiled-memory">
            <small>CURRENT DIRECTION</small>
            <strong>Keep every generated memory reviewable.</strong>
            <p>Preserve decisions, reasons, and unresolved questions.</p>
            <i>3 context fragments joined</i>
          </div>
        </article>

        <article aria-hidden={stage !== 3} className={stage === 3 ? "is-active" : ""}>
          <span>REVIEWABLE CONTEXT</span>
          <div className="figma-review-state">
            <div><Check size={15} /><span>Current direction</span><small>reviewed</small></div>
            <div><Check size={15} /><span>Decision and reason</span><small>source linked</small></div>
            <div><Check size={15} /><span>Open question</span><small>kept visible</small></div>
          </div>
        </article>

        <article aria-hidden={stage !== 4} className={stage === 4 ? "is-active" : ""}>
          <span>NEXT AGENT</span>
          <div className="figma-agent-ready">
            <small>promty context</small>
            <strong>Project Memory loaded</strong>
            <p>Start from the current direction and continue the unresolved onboarding UX.</p>
            <i><Check size={13} /> Ready for the next session</i>
          </div>
        </article>
      </div>

      <div className="figma-hero-demo-footer">
        <div className="figma-demo-progress" aria-hidden="true">
          {heroStages.map((item, index) => (
            <i className={index <= stage ? "is-complete" : ""} key={item.label} />
          ))}
        </div>
        <span>{String(stage + 1).padStart(2, "0")} / 05 · {heroStages[stage].label}</span>
        <div>
          <button
            aria-label={playing ? "Pause Project Memory demo" : "Play Project Memory demo"}
            onClick={togglePlayback}
            type="button"
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button aria-label="Replay Project Memory demo" onClick={replay} type="button">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const workflowRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState(0);
  const [activeMemory, setActiveMemory] = useState<
    (typeof memoryEntries)[number]["key"]
  >(memoryEntries[0].key);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const root = workflowRef.current;
    if (!root || !("IntersectionObserver" in window)) return undefined;
    const cards = [...root.querySelectorAll<HTMLElement>("[data-workflow-step]")];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        setActiveWorkflow(Number((visible.target as HTMLElement).dataset.workflowStep));
      },
      { threshold: [0.35, 0.65] },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  async function copyCommand() {
    await copyTextToClipboard(publicCollectorCommand);
    setCopied(true);
    emitMarketingInteraction("collector_command_copy");
  }

  return (
    <MarketingShell appearance="figma" current="home">
      <div className="figma-landing-page">
        <section className="figma-landing-hero">
          <div className="figma-landing-hero-copy" data-marketing-reveal>
            <span className="figma-landing-eyebrow">
              PROJECT MEMORY FOR AI-NATIVE DEVELOPMENT
            </span>
            <h1>Every AI session should start where the last one ended.</h1>
            <p>
              Promty turns completed AI coding sessions into reviewable project
              memory, so the next human or agent can continue with the right
              decisions, reasons, and open questions.
            </p>
            <div className="figma-landing-actions">
              <a className="figma-button is-primary" href="/app">
                Connect one repository
              </a>
              <a className="figma-button is-secondary" href="#project-memory">
                See what the next agent receives
              </a>
            </div>
            <button
              aria-label="Copy Promty collector install command"
              className="figma-command"
              onClick={() => void copyCommand()}
              type="button"
            >
              <code>{publicCollectorCommand}</code>
              <span>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <HeroMemoryDemo />
        </section>

        <section className="figma-problem-section">
          <div className="figma-section-copy" data-marketing-reveal>
            <span className="figma-landing-eyebrow">THE CONTEXT GAP</span>
            <h2>Code shows what changed. It does not explain why.</h2>
            <p>
              When a session ends, the reasoning behind the work usually
              disappears with it. The next session starts by reconstructing
              context instead of moving the project forward.
            </p>
          </div>
          <div className="figma-problem-costs" data-marketing-reveal>
            {problemCosts.map((cost) => (
              <article key={cost.number}>
                <span>{cost.number}</span>
                <div><h3>{cost.title}</h3><p>{cost.description}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="figma-workflow-section" id="product">
          <div className="figma-workflow-intro" data-marketing-reveal>
            <div>
              <span className="figma-landing-eyebrow">FROM ACTIVITY TO CONTINUITY</span>
              <h2>Capture the work. Keep the reasoning. Continue anywhere.</h2>
            </div>
            <p>
              Promty creates a compact, reviewable layer of project context
              without replacing your repository, issue tracker, or coding agent.
            </p>
          </div>
          <div
            className="figma-workflow-steps"
            data-active-step={activeWorkflow}
            data-marketing-reveal
            ref={workflowRef}
          >
            {workflowSteps.map((step, index) => (
              <article
                aria-current={activeWorkflow === index ? "step" : undefined}
                data-workflow-step={index}
                key={step.number}
                onFocus={() => setActiveWorkflow(index)}
                onMouseEnter={() => setActiveWorkflow(index)}
                tabIndex={0}
              >
                <div><span>{step.number}</span><small>{step.eyebrow}</small></div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <strong>{step.outcome}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="figma-memory-section" id="project-memory">
          <div className="figma-memory-copy" data-marketing-reveal>
            <span className="figma-landing-eyebrow">WHAT THE NEXT AGENT RECEIVES</span>
            <h2>Not another transcript. A working model of the project.</h2>
            <p>
              Project Memory gives the next collaborator the smallest useful
              set of context: what matters now, why the team chose it, and what
              should happen next.
            </p>
            <ul>
              <li>Decisions with their reasons</li>
              <li>Open questions and next instructions</li>
              <li>Source links back to the completed work</li>
            </ul>
          </div>
          <div className="figma-memory-panel" data-marketing-reveal>
            <div className="figma-memory-header">
              <div><span>PROJECT MEMORY</span><h3>promty / collector</h3></div>
              <strong>CURRENT</strong>
            </div>
            <div className="figma-memory-entries">
              {memoryEntries.map((entry) => (
                <button
                  aria-pressed={activeMemory === entry.key}
                  className={"mono" in entry && entry.mono ? "is-mono" : undefined}
                  key={entry.key}
                  onClick={() => {
                    setActiveMemory(entry.key);
                    emitMarketingInteraction(`memory_field_${entry.key}`);
                  }}
                  type="button"
                >
                  <span>{entry.label}</span>
                  <p>{entry.body}</p>
                  <small>{entry.source}</small>
                </button>
              ))}
            </div>
            <div className="figma-memory-footer"><span>Source linked</span><small>Updated after a successful session</small></div>
          </div>
        </section>

        <section className="figma-audience-section">
          <div className="figma-audience-intro" data-marketing-reveal>
            <div><span className="figma-landing-eyebrow">WHO PROMTY HELPS</span><h2>Built for projects where context compounds.</h2></div>
            <p>The longer a project lives, the more valuable its reasoning becomes. Promty keeps that value available to whoever continues next.</p>
          </div>
          <div className="figma-audience-cards" data-marketing-reveal>
            {audiences.map((audience) => (
              <article key={audience.number}>
                <div><span>{audience.number}</span><small>{audience.label}</small></div>
                <h3>{audience.title}</h3><p>{audience.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="figma-trust-section" id="security">
          <div className="figma-trust-intro" data-marketing-reveal>
            <span className="figma-landing-eyebrow">TRUST BY DEFAULT</span>
            <h2>Your project context stays under your control.</h2>
            <p>Continuity should stay useful, inspectable, and limited to the projects you choose.</p>
          </div>
          <div className="figma-trust-flow" data-marketing-reveal>
            {trustPrinciples.map((principle) => (
              <article key={principle.number} tabIndex={0}>
                <div><span>{principle.number}</span><small>{principle.kicker}</small></div>
                <h3>{principle.title}</h3><p>{principle.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="figma-faq-section" id="faq">
          <div data-marketing-reveal>
            <span className="figma-landing-eyebrow">QUESTIONS</span>
            <h2>The important details, up front.</h2>
            <p>Understand collection scope, hooks, memory, and agent permissions before connecting a repository.</p>
          </div>
          <div className="figma-faq-list" data-marketing-reveal>
            {faqs.map((faq) => (
              <details
                key={faq.question}
                onToggle={(event) => {
                  if (event.currentTarget.open) emitMarketingInteraction("faq_open");
                }}
              >
                <summary>{faq.question}<ChevronDown aria-hidden="true" size={18} /></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="figma-final-cta">
          <div className="figma-final-cta-panel" data-marketing-reveal>
            <div><span className="figma-landing-eyebrow">START WITH ONE PROJECT</span><h2>Stop re-explaining your project to AI.</h2></div>
            <div><p>Connect one repository. Keep your current coding tools and workflow.</p><a className="figma-button is-primary" href="/app">Connect one repository</a></div>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
