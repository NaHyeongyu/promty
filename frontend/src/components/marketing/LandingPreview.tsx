import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const productScreens = [
  {
    label: "Memory review",
    image: "/marketing/promty-memory-review.jpg",
    alt: "Actual Promty memory review interface showing an example checkout decision, rejected approach, open question, next step, and Approve for agents button",
    description: "Read the decisions and next steps. Approve the context your agent can use.",
    width: 1080,
    height: 580,
  },
  {
    label: "Project overview",
    image: "/marketing/promty-desktop-overview.jpg",
    alt: "Promty public project overview with activity charts, repository details, and connected AI tools",
    description: "See the repository and the AI activity behind its memory.",
    width: 1440,
    height: 960,
  },
  {
    label: "Connect a repository",
    image: "/marketing/promty-repository-connect.jpg",
    alt: "Actual Promty Add a project dialog with Capture AI work and Repository only options and a GitHub repository URL field",
    description: "Choose AI session capture, or connect a GitHub repository for source context.",
    width: 660,
    height: 426,
  },
] as const;

export function LandingProductPreview() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const touchStart = useRef<number | null>(null);
  const screen = productScreens[active];

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!preference.matches);
    const stopForReducedMotion = () => { if (preference.matches) setPlaying(false); };
    preference.addEventListener("change", stopForReducedMotion);
    return () => preference.removeEventListener("change", stopForReducedMotion);
  }, []);

  useEffect(() => {
    if (!playing || hovered) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % productScreens.length), 6500);
    return () => window.clearInterval(timer);
  }, [playing, hovered]);

  function select(index: number) {
    setPlaying(false);
    setActive((index + productScreens.length) % productScreens.length);
  }

  return (
    <section
      className="lp-product-preview"
      id="product-preview"
      aria-label="Promty product screenshots"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => { if (event.target.getAttribute("data-playback") !== "true") setPlaying(false); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          select(active + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <div className="lp-product-toolbar">
        <div className="lp-product-current"><span>{String(active + 1).padStart(2, "0")} / 03</span><strong>{screen.label}</strong></div>
        <div className="lp-carousel-controls" aria-label="Screenshot controls">
          <button type="button" data-playback="true" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause slideshow" : "Play slideshow"}>
            {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => select(active - 1)} aria-label="Previous screenshot" aria-controls="product-screenshot"><ChevronLeft size={19} aria-hidden="true" /></button>
          <button type="button" onClick={() => select(active + 1)} aria-label="Next screenshot" aria-controls="product-screenshot"><ChevronRight size={19} aria-hidden="true" /></button>
        </div>
      </div>
      <figure
        id="product-screenshot"
        className="lp-product-screen"
        data-screen={active}
        role="group"
        aria-roledescription="slide"
        aria-label={`${active + 1} of ${productScreens.length}: ${screen.label}`}
        onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const end = event.changedTouches[0]?.clientX;
          if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 50) {
            select(active + (end < touchStart.current ? 1 : -1));
          }
          touchStart.current = null;
        }}
        onTouchCancel={() => { touchStart.current = null; }}
      >
        <img key={screen.image} src={screen.image} alt={screen.alt} width={screen.width} height={screen.height} fetchPriority="high" />
      </figure>
      <div className="lp-product-caption">
        <div aria-live={playing ? "off" : "polite"} aria-atomic="true"><p>{screen.description}</p><span>Actual product UI · Example data</span></div>
        <div className="lp-carousel-dots" aria-label="Choose a product screenshot">
          {productScreens.map((item, index) => <button key={item.label} type="button" aria-label={`Show ${item.label}`} aria-pressed={active === index} aria-controls="product-screenshot" onClick={() => select(index)}><span /></button>)}
        </div>
      </div>
    </section>
  );
}

const workflowSteps = [
  {
    title: "Connect a repository",
    description: "Install the Collector in a repository you choose. Work in Codex or Claude Code; prompts, responses, and file changes are uploaded to that project.",
    link: "View setup steps",
    href: "#get-started",
  },
  {
    title: "Review your memory",
    description: "Review the collected inputs and choose whether to enable external AI processing. Generate memory, check the result, then approve it for agents.",
    link: "See a memory example",
    href: "#product-preview",
  },
  {
    title: "Continue with context",
    description: "Configure CLI or MCP access for your next session. The agent can retrieve approved project memory, including decisions and unresolved work.",
    link: "Read the context setup guide",
    href: "/docs/collector",
  },
] as const;

export function LandingWorkflow() {
  return (
    <ol className="lp-workflow-steps">
      {workflowSteps.map((step, index) => (
        <li key={step.title}>
          <span className="lp-workflow-number">0{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
          <a className="lp-text-link" href={step.href}>{step.link}<ArrowRight size={15} aria-hidden="true" /></a>
        </li>
      ))}
    </ol>
  );
}
