import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  CircleDot,
  Code2,
  FileClock,
  FileQuestion,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  MemoryStick,
  Network,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { MarketingCta, MarketingShell, SectionHeading } from "./MarketingShell";

export function ProductPage() {
  return (
    <MarketingShell current="product">
      <section className="product-hero">
        <div className="product-hero-copy" data-marketing-reveal>
          <div className="marketing-kicker"><MemoryStick aria-hidden="true" size={14} /> PROMTY PRODUCT</div>
          <h1>The memory layer between your project and every agent.</h1>
          <p>Capture work without interrupting it. Organize the decisions that matter. Deliver current project context through the tools agents already understand.</p>
          <div className="marketing-hero-actions"><MarketingCta href="/">Open workspace <ArrowRight aria-hidden="true" size={17} /></MarketingCta><MarketingCta href="/docs/collector" secondary>Read the setup guide</MarketingCta></div>
        </div>
        <div className="product-architecture" data-marketing-reveal>
          <div className="architecture-label">PROJECT CONTEXT PIPELINE</div>
          <div className="architecture-row"><div><Code2 aria-hidden="true" size={18} /><strong>Codex</strong><span>session activity</span></div><div><Sparkles aria-hidden="true" size={18} /><strong>Claude Code</strong><span>session activity</span></div></div>
          <span className="architecture-arrow">↓</span>
          <div className="architecture-memory"><MemoryStick aria-hidden="true" size={22} /><div><strong>Promty Project Memory</strong><span>Goal · Direction · Decisions · Questions</span></div><small>compiled</small></div>
          <span className="architecture-arrow">↓</span>
          <div className="architecture-row"><div><TerminalSquare aria-hidden="true" size={18} /><strong>promty context</strong><span>CLI</span></div><div><Network aria-hidden="true" size={18} /><strong>get_project_context</strong><span>MCP</span></div></div>
        </div>
      </section>

      <section className="marketing-section product-detail-section">
        <SectionHeading eyebrow="WHAT PROMTY REMEMBERS" title="A useful model of the project—not a larger transcript." description="Promty compresses completed AI work into the exact categories future humans and agents need to reason well." />
        <div className="memory-map" data-marketing-reveal>
          <article><Workflow aria-hidden="true" size={19} /><span>01</span><h3>Current direction</h3><p>The active implementation path and what the project is optimizing for now.</p></article>
          <article><GitBranch aria-hidden="true" size={19} /><span>02</span><h3>Important decisions</h3><p>What was chosen, why it was chosen, and which memories support it.</p></article>
          <article><Layers3 aria-hidden="true" size={19} /><span>03</span><h3>Rejected directions</h3><p>Approaches that were considered and the reason they should not be repeated.</p></article>
          <article><Braces aria-hidden="true" size={19} /><span>04</span><h3>Technical assumptions</h3><p>Constraints and beliefs that shape architecture and implementation choices.</p></article>
          <article><FileQuestion aria-hidden="true" size={19} /><span>05</span><h3>Open questions</h3><p>Unknowns that still require validation or a product decision.</p></article>
          <article><Bot aria-hidden="true" size={19} /><span>06</span><h3>Agent instructions</h3><p>Explicit guidance the next agent should follow before it changes the project.</p></article>
        </div>
      </section>

      <section className="marketing-section context-api-section">
        <div className="context-api-copy" data-marketing-reveal>
          <span className="marketing-eyebrow">AGENT CONTEXT</span>
          <h2>Context arrives before the next plan.</h2>
          <p>The read-only bridge derives the same project identity used during capture, authenticates with a user-owned collector token, and returns Project Memory as Markdown and structured JSON.</p>
          <ul><li><Check aria-hidden="true" size={15} />No new storage model</li><li><Check aria-hidden="true" size={15} />No write access for agents</li><li><Check aria-hidden="true" size={15} />One context model across CLI and MCP</li></ul>
        </div>
        <div className="context-code-window" data-marketing-reveal>
          <div><span><i /><i /><i /></span><small>terminal</small></div>
          <pre><code><span>$</span> promty context{"\n\n"}<em># Promty Agent Context</em>{"\n"}Project: Promty{"\n"}Memory updated: just now{"\n\n"}<em>## Current direction</em>{"\n"}Ship a read-only Agent Context bridge.{"\n\n"}<em>## Instructions for future AI agents</em>{"\n"}- Preserve the existing architecture.{"\n"}- Read context before editing.</code></pre>
          <div className="context-code-status"><CircleDot aria-hidden="true" size={13} /> context loaded · confidence 0.90</div>
        </div>
      </section>

      <section className="marketing-section lifecycle-section">
        <SectionHeading eyebrow="MEMORY LIFECYCLE" title="Built around completed work." description="Raw events stay useful as evidence. Project Memory stays concise enough to guide the next decision." />
        <ol className="lifecycle-track" data-marketing-reveal>
          <li><span>01</span><div><TerminalSquare aria-hidden="true" size={18} /><h3>Repository hook</h3><p>Explicit install begins capture.</p></div></li>
          <li><span>02</span><div><FileClock aria-hidden="true" size={18} /><h3>Session boundary</h3><p>Completed work forms a stable window.</p></div></li>
          <li><span>03</span><div><Layers3 aria-hidden="true" size={18} /><h3>Memory compile</h3><p>Evidence becomes durable context.</p></div></li>
          <li><span>04</span><div><Bot aria-hidden="true" size={18} /><h3>Agent handoff</h3><p>The next tool reads the latest state.</p></div></li>
        </ol>
      </section>

      <section className="marketing-section control-section">
        <div className="control-panel" data-marketing-reveal>
          <div><span className="marketing-eyebrow">CONTROL MODEL</span><h2>Separate permissions. Clear ownership.</h2><p>Promty treats capture access, account identity, repository access, and project-memory reads as different capabilities.</p></div>
          <div className="control-matrix">
            <div><span>Capability</span><span>Credential</span><span>Scope</span></div>
            <div><span><TerminalSquare aria-hidden="true" size={14} /> Event capture</span><strong>Collector token</strong><small>Installed repositories</small></div>
            <div><span><KeyRound aria-hidden="true" size={14} /> Context read</span><strong>User-owned token</strong><small>Owner projects only</small></div>
            <div><span><GitBranch aria-hidden="true" size={14} /> Source access</span><strong>GitHub OAuth</strong><small>Explicit repositories</small></div>
            <div><span><LockKeyhole aria-hidden="true" size={14} /> Web workspace</span><strong>Web session</strong><small>Signed-in account</small></div>
          </div>
        </div>
      </section>

      <section className="marketing-section use-case-section">
        <SectionHeading eyebrow="WHO IT HELPS" title="For projects moving faster than their context." />
        <div className="use-case-grid" data-marketing-reveal>
          <article><span>SOLO BUILDERS</span><h3>Resume after a week without reconstructing your own thinking.</h3><p>Keep the reasoning behind fast AI-assisted changes available when you return.</p></article>
          <article><span>AI-NATIVE TEAMS</span><h3>Give teammates and agents the same current direction.</h3><p>Reduce divergence when multiple people and tools touch the same project.</p></article>
          <article><span>OPEN PROJECTS</span><h3>Show how the work evolved, not only the final repository.</h3><p>Publish selected project activity and reusable workflows as living proof.</p></article>
        </div>
      </section>

      <section className="marketing-section faq-section">
        <SectionHeading eyebrow="QUESTIONS" title="The important details, up front." />
        <div className="faq-list" data-marketing-reveal>
          <details><summary>Does Promty read every repository on my machine?<span>+</span></summary><p>No. Collection begins only in repositories where you explicitly install Promty hooks.</p></details>
          <details><summary>Does an MCP agent get write access?<span>+</span></summary><p>No. The Agent Context bridge is read-only and exposes the latest compiled Project Memory.</p></details>
          <details><summary>Is Project Memory just a transcript summary?<span>+</span></summary><p>No. It is structured around direction, decisions, rejected paths, assumptions, questions, and instructions for future agents.</p></details>
          <details><summary>Can I use Promty without changing my coding tool?<span>+</span></summary><p>Yes. Promty integrates through repository hooks, a background uploader, CLI context, and MCP.</p></details>
        </div>
      </section>

      <section className="marketing-final-cta product-final-cta" data-marketing-reveal>
        <div><span className="marketing-eyebrow">MAKE CONTEXT CONTINUOUS</span><h2>Your next agent should know what the last one learned.</h2><p>Start with one repository and let Project Memory grow with the work.</p></div>
        <div className="marketing-final-actions"><MarketingCta href="/">Start with Promty <ArrowRight aria-hidden="true" size={17} /></MarketingCta><MarketingCta href="/docs/collector" secondary><ShieldCheck aria-hidden="true" size={16} /> Review setup</MarketingCta></div>
      </section>
    </MarketingShell>
  );
}
