import {
  ContextPreview,
  MomentGrid,
  StepGrid,
  ValueActions,
  ValueCardGrid,
  ValueFinalCta,
  ValueHero,
  ValueSectionIntro,
  type MarketingItem,
} from "./MarketingConcepts";
import { MarketingShell } from "./MarketingShell";

const whyNow: MarketingItem[] = [
  {
    number: "01",
    title: "New chat",
    body: "Start from zero.",
  },
  {
    number: "02",
    title: "Tool switch",
    body: "Lose the reasoning.",
  },
  {
    number: "03",
    title: "Return later",
    body: "Rebuild mental state.",
  },
  {
    number: "04",
    title: "Team handoff",
    body: "Repeat the history.",
  },
];

const principles: MarketingItem[] = [
  {
    number: "01",
    eyebrow: "PROJECT FIRST",
    title: "Context outlives chats.",
    body: "Work stays understandable after a session or tool changes.",
  },
  {
    number: "02",
    eyebrow: "DECISIONS OVER TRANSCRIPTS",
    title: "Keep the why.",
    body: "Preserve choices and trade-offs instead of replaying conversations.",
  },
  {
    number: "03",
    eyebrow: "HUMAN CONTROL",
    title: "You stay in control.",
    body: "Decide which projects connect and what context carries forward.",
  },
];

const vision: MarketingItem[] = [
  {
    number: "01",
    eyebrow: "WHERE IT IS",
    title: "Clear current direction.",
    body: "The project can state its active goal and path.",
  },
  {
    number: "02",
    eyebrow: "WHY IT GOT THERE",
    title: "Decisions keep their reasons.",
    body: "People understand trade-offs without replaying chat history.",
  },
  {
    number: "03",
    eyebrow: "WHAT COMES NEXT",
    title: "The next move is visible.",
    body: "Open questions and next steps remain part of the project.",
  },
];

export function AboutPage() {
  return (
    <MarketingShell appearance="figma" current="about">
      <div className="value-page" data-page="about">
        <ValueHero
          actions={(
            <ValueActions
              primaryHref="/app"
              primaryLabel="Start with Promty"
              secondaryHref="/product"
              secondaryLabel="See the product"
            />
          )}
          description="Promty exists because project context should outlive a chat, a tool, and a handoff."
          eyebrow="WHY PROMTY"
          id="why-promty"
          title="AI should move your project forward—not make you explain it again."
          toolLine="CONTEXT BELONGS TO THE PROJECT"
        >
          <ContextPreview
            eyebrow="THE PROJECT SHOULD REMEMBER"
            footer="TOOLS MAY CHANGE. PROJECT MEMORY SHOULD REMAIN."
            items={[
              { label: "WHERE IT IS", value: "Current direction is ready." },
              { label: "WHY IT GOT THERE", value: "Decisions keep their reasons." },
              { label: "WHAT COMES NEXT", value: "Open questions guide the next move." },
            ]}
            project="PROMTY PRINCIPLE / 01"
            status="PROJECT FIRST"
            title="A project should remember its own direction."
          />
        </ValueHero>

        <section className="value-section">
          <ValueSectionIntro
            description="Every new chat, tool, or handoff risks losing the reasoning that made the current code make sense."
            eyebrow="WHY NOW"
            title="AI moves fast. Project understanding does not."
          />
          <MomentGrid items={whyNow} />
        </section>

        <section className="value-section is-panel" id="principles">
          <ValueSectionIntro
            description="Promty is built around principles that keep progress useful and human-directed."
            eyebrow="WHAT WE BELIEVE"
            title="Context should belong to the project."
          />
          <ValueCardGrid items={principles} />
        </section>

        <section className="value-section" id="vision">
          <ValueSectionIntro
            description="Where it is, why it got there, and what should happen next."
            eyebrow="THE FUTURE WE WANT"
            title="Every project should be able to explain itself."
          />
          <StepGrid items={vision} />
        </section>

        <ValueFinalCta
          description="Let the project carry its own context forward."
          eyebrow="BUILD WITH CONTINUITY"
          primaryLabel="Start with Promty"
          secondaryHref="/product"
          secondaryLabel="Explore the product"
          title="Stop spending the next session explaining the last one."
          toolLine="CONTEXT BELONGS TO THE PROJECT"
        />
      </div>
    </MarketingShell>
  );
}
