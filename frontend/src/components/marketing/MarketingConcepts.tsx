import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { MarketingCta } from "./MarketingShell";

export type MarketingItem = {
  body: string;
  eyebrow?: string;
  number: string;
  title: string;
};

type ContextItem = {
  label: string;
  meta?: string;
  value: string;
};

const productTourSteps = [
  {
    alt: "Promty project overview with project activity, repository details, and current context",
    description: "See the project, its recent work, and the context already available.",
    image: "/marketing/promty-product-overview.png",
    label: "OVERVIEW",
    title: "Know where the project stands.",
  },
  {
    alt: "Promty Project Memory drawer with a verified summary, outcome, and source details",
    description: "Keep the decisions and outcomes worth carrying into the next session.",
    image: "/marketing/promty-product-memory.png",
    label: "PROJECT MEMORY",
    title: "Keep what the work taught you.",
  },
  {
    alt: "Promty community workspace showing projects with shared AI context",
    description: "Give the next teammate or AI a clear place to pick up the work.",
    image: "/marketing/promty-product-community.png",
    label: "HANDOFF",
    title: "Continue without starting over.",
  },
] as const;

const continuityTimelineItems = [
  {
    detail: "Saved to the durable local queue",
    kicker: "PROMPT 01",
    state: "SAVED LOCALLY",
    title: "Refine the account settings recovery flow.",
    tone: "saved",
  },
  {
    detail: "Only output the tool emitted can be saved",
    kicker: "RESPONSE",
    state: "INTERRUPTED",
    title: "The connection dropped before the response finished.",
    tone: "interrupted",
  },
  {
    detail: "Continuation of Prompt 01",
    kicker: "PROMPT 02",
    state: "LINKED",
    title: "Continue from the recovery flow and finish the UX.",
    tone: "linked",
  },
] as const;

export function ProductTourPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion) return undefined;
    if (!("IntersectionObserver" in window)) {
      setPlaying(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting && entry.intersectionRatio >= 0.45),
      { threshold: [0, 0.45, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setActiveStep((current) => (current + 1) % productTourSteps.length);
    }, 4_200);
    return () => window.clearTimeout(timer);
  }, [activeStep, playing, reducedMotion]);

  function replay() {
    setActiveStep(0);
    setPlaying(!reducedMotion);
  }

  const active = productTourSteps[activeStep];
  const isTourPlaying = playing && !reducedMotion;

  return (
    <div
      aria-label="Interactive tour of the Promty product"
      className="value-product-tour"
      data-marketing-reveal
      ref={rootRef}
    >
      <div className="value-product-browser">
        <span aria-hidden="true"><i /><i /><i /></span>
        <code>promty.org/app</code>
        <div>
          <button
            aria-label={isTourPlaying ? "Pause product tour" : "Play product tour"}
            disabled={reducedMotion}
            onClick={() => setPlaying((current) => !current)}
            type="button"
          >
            {isTourPlaying ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
          </button>
          <button aria-label="Replay product tour" onClick={replay} type="button">
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        </div>
      </div>

      <div className="value-product-stage">
        {productTourSteps.map((step, index) => (
          <figure
            aria-hidden={activeStep !== index}
            className={activeStep === index ? "is-active" : undefined}
            data-step={index}
            key={step.label}
          >
            <img
              alt={activeStep === index ? step.alt : ""}
              loading={index === 0 ? "eager" : "lazy"}
              src={step.image}
            />
            <div className="value-product-shade" aria-hidden="true" />
            <MousePointer2
              aria-hidden="true"
              className="value-product-cursor"
              fill="currentColor"
              size={22}
            />
          </figure>
        ))}
        <div aria-live="polite" className="value-product-callout">
          <span><i aria-hidden="true" /> {active.label}</span>
          <strong>{active.title}</strong>
          <small>{active.description}</small>
        </div>
      </div>

      <div className="value-product-tabs" aria-label="Product tour steps">
        {productTourSteps.map((step, index) => (
          <button
            aria-pressed={activeStep === index}
            key={step.label}
            onClick={() => {
              setActiveStep(index);
              setPlaying(false);
            }}
            type="button"
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step.label}
          </button>
        ))}
        <i
          aria-hidden="true"
          className={isTourPlaying ? "is-playing" : undefined}
          key={`${activeStep}-${isTourPlaying}`}
        />
      </div>
    </div>
  );
}

export function ContinuityTimelinePreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeItem, setActiveItem] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setActiveItem((current) => (current + 1) % continuityTimelineItems.length);
    }, 3_200);
    return () => window.clearTimeout(timer);
  }, [activeItem, isVisible, reducedMotion]);

  const active = continuityTimelineItems[activeItem];

  return (
    <div
      aria-label="Example of an interrupted task continuing as one Promty timeline"
      className="continuity-timeline"
      data-marketing-reveal
      ref={rootRef}
    >
      <header className="continuity-timeline-header">
        <div>
          <span className="value-eyebrow">WORK TIMELINE / settings-recovery</span>
          <strong>One task. Every turn connected.</strong>
        </div>
        <span className="continuity-timeline-status">
          <i aria-hidden="true" /> SYNCED
        </span>
      </header>

      <div className="continuity-timeline-body">
        <div className="continuity-timeline-list" role="list">
          {continuityTimelineItems.map((item, index) => (
            <button
              aria-pressed={activeItem === index}
              className={`is-${item.tone}`}
              key={item.kicker}
              onClick={() => setActiveItem(index)}
              role="listitem"
              type="button"
            >
              <span className="continuity-timeline-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="continuity-timeline-copy">
                <small>{item.kicker}</small>
                <strong>{item.title}</strong>
                <em>{item.detail}</em>
              </span>
              <span className="continuity-timeline-state">{item.state}</span>
            </button>
          ))}
        </div>

        <aside className={`continuity-timeline-inspector is-${active.tone}`}>
          <span>{active.kicker}</span>
          <strong>{active.state}</strong>
          <p>{active.title}</p>
          <dl>
            <div>
              <dt>RELATION</dt>
              <dd>{activeItem === 2 ? "CONTINUES PROMPT 01" : "SAME WORK UNIT"}</dd>
            </div>
            <div>
              <dt>EVIDENCE</dt>
              <dd>{active.detail}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <footer>
        <span>1 TASK</span>
        <span>2 PROMPTS</span>
        <span>1 INTERRUPTION</span>
        <strong>NOT REWRITTEN · LINKED</strong>
      </footer>
    </div>
  );
}

export function ValueHero({
  actions,
  children,
  description,
  eyebrow,
  id = "overview",
  title,
  toolLine,
}: {
  actions: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  id?: string;
  title: string;
  toolLine: string;
}) {
  return (
    <section className="value-hero" id={id}>
      <div className="value-hero-copy" data-marketing-reveal>
        <span className="value-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="value-actions">{actions}</div>
        <span className="value-tool-line">{toolLine}</span>
      </div>
      {children}
    </section>
  );
}

export function ValueActions({
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <>
      <MarketingCta href={primaryHref}>
        {primaryLabel} <ArrowRight aria-hidden="true" size={16} />
      </MarketingCta>
      <MarketingCta href={secondaryHref} secondary>
        {secondaryLabel}
      </MarketingCta>
    </>
  );
}

export function ContextPreview({
  eyebrow,
  footer,
  items,
  project,
  status = "READY",
  title,
}: {
  eyebrow: string;
  footer: string;
  items: ContextItem[];
  project: string;
  status?: string;
  title: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeItem, setActiveItem] = useState(0);

  function updateTilt(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || !panelRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = panelRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    panelRef.current.style.setProperty("--value-tilt-x", `${y * -2}deg`);
    panelRef.current.style.setProperty("--value-tilt-y", `${x * 2.6}deg`);
    panelRef.current.style.setProperty("--value-glow-x", `${(x + 0.5) * 100}%`);
    panelRef.current.style.setProperty("--value-glow-y", `${(y + 0.5) * 100}%`);
  }

  function resetTilt() {
    panelRef.current?.style.removeProperty("--value-tilt-x");
    panelRef.current?.style.removeProperty("--value-tilt-y");
    panelRef.current?.style.removeProperty("--value-glow-x");
    panelRef.current?.style.removeProperty("--value-glow-y");
  }

  return (
    <div
      className="value-context-preview"
      data-marketing-reveal
      onPointerLeave={resetTilt}
      onPointerMove={updateTilt}
      ref={panelRef}
    >
      <div className="value-context-glow" aria-hidden="true" />
      <header>
        <span>{project}</span>
        <strong><i aria-hidden="true" /> {status}</strong>
      </header>
      <div className="value-context-body">
        <span className="value-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <div className="value-context-items">
          {items.map((item, index) => (
            <button
              aria-pressed={activeItem === index}
              key={item.label}
              onClick={() => setActiveItem(index)}
              type="button"
            >
              <span>{item.label}{item.meta ? <small>{item.meta}</small> : null}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </div>
      </div>
      <footer>{footer}</footer>
    </div>
  );
}

export function ValueSectionIntro({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="value-section-intro" data-marketing-reveal>
      <div>
        <span className="value-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}

export function MomentGrid({ items }: { items: MarketingItem[] }) {
  return (
    <div className="value-moment-grid" data-marketing-reveal>
      {items.map((item) => (
        <article key={item.number}>
          <span>{item.number}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export function ValueCardGrid({ items }: { items: MarketingItem[] }) {
  return (
    <div className="value-card-grid" data-marketing-reveal>
      {items.map((item) => (
        <article key={item.number}>
          <i aria-hidden="true" />
          <span>{item.eyebrow}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export function StepGrid({ items }: { items: MarketingItem[] }) {
  return (
    <div className="value-step-grid" data-marketing-reveal>
      {items.map((item) => (
        <article key={item.number}>
          <span>{item.number} / {item.eyebrow}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export function ReviewPanel({
  actionLabel,
  contextLabel,
  items,
  nextStep,
  status = "READY",
}: {
  actionLabel: string;
  contextLabel: string;
  items: ContextItem[];
  nextStep: string;
  status?: string;
}) {
  return (
    <div className="value-review-panel" data-marketing-reveal>
      <header>
        <span>{contextLabel}</span>
        <strong><i aria-hidden="true" /> {status}</strong>
      </header>
      <div className="value-review-items">
        {items.map((item) => (
          <article key={item.label}>
            <span>{item.label}<small>{item.meta}</small></span>
            <p>{item.value}</p>
          </article>
        ))}
      </div>
      <div className="value-review-next">
        <span>NEXT STEP</span>
        <p>{nextStep}</p>
      </div>
      <div className="value-review-actions">
        <MarketingCta href="/app" secondary>Open workspace</MarketingCta>
        <MarketingCta href="/app">{actionLabel}</MarketingCta>
      </div>
    </div>
  );
}

export function BenefitChecklist({ children }: { children: ReactNode }) {
  return (
    <ul className="value-checklist">
      {children}
    </ul>
  );
}

export function BenefitItem({ children }: { children: ReactNode }) {
  return (
    <li><Check aria-hidden="true" size={15} /> {children}</li>
  );
}

export function ValueFinalCta({
  description,
  eyebrow,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  title,
  toolLine,
}: {
  description: string;
  eyebrow: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  title: string;
  toolLine: string;
}) {
  return (
    <section className="value-final-cta">
      <div data-marketing-reveal>
        <span className="value-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="value-actions">
          <ValueActions
            primaryHref="/app"
            primaryLabel={primaryLabel}
            secondaryHref={secondaryHref}
            secondaryLabel={secondaryLabel}
          />
        </div>
        <span className="value-tool-line">{toolLine}</span>
      </div>
    </section>
  );
}
