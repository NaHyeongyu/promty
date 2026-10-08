import {
  BenefitChecklist,
  BenefitItem,
  ContextPreview,
  MomentGrid,
  ReviewPanel,
  StepGrid,
  ValueActions,
  ValueCardGrid,
  ValueFinalCta,
  ValueHero,
  ValueSectionIntro,
  type MarketingItem,
} from "./MarketingConcepts";
import { MarketingShell } from "./MarketingShell";

const outcomes: MarketingItem[] = [
  {
    number: "01",
    title: "Work continuity",
    body: "See interrupted and resumed work as one story.",
  },
  {
    number: "02",
    title: "AI activity",
    body: "Understand what happened without rereading entire chats.",
  },
  {
    number: "03",
    title: "Project memory",
    body: "Keep current direction and decisions easy to find.",
  },
  {
    number: "04",
    title: "Context handoff",
    body: "Give the next session a clear starting point.",
  },
];

const productViews: MarketingItem[] = [
  {
    number: "01",
    eyebrow: "AI ACTIVITY",
    title: "Follow the work.",
    body: "See prompts, changes, interruptions, and resumptions in one readable timeline.",
  },
  {
    number: "02",
    eyebrow: "PROJECT MEMORY",
    title: "Know the current state.",
    body: "Keep direction, decisions, open questions, and next steps together.",
  },
  {
    number: "03",
    eyebrow: "CONTEXT HANDOFF",
    title: "Continue without repeating.",
    body: "Give the next session the latest approved Project Memory.",
  },
];

const memoryModel: MarketingItem[] = [
  {
    number: "01",
    eyebrow: "CURRENT DIRECTION",
    title: "Know what the project is optimizing for.",
    body: "The active path and the goal it supports.",
  },
  {
    number: "02",
    eyebrow: "DECISIONS",
    title: "Preserve choices and trade-offs.",
    body: "What was chosen, why, and what should not be repeated.",
  },
  {
    number: "03",
    eyebrow: "QUESTIONS + NEXT STEPS",
    title: "Keep unresolved work visible.",
    body: "What still needs validation and what should happen next.",
  },
];

export function ProductPage() {
  return (
    <MarketingShell appearance="figma" current="product">
      <div className="value-page" data-page="product">
        <ValueHero
          actions={(
            <ValueActions
              primaryHref="/app"
              primaryLabel="Open workspace"
              secondaryHref="#product-views"
              secondaryLabel="Explore the product"
            />
          )}
          description="See what happened, keep what mattered, and give the next person or AI a clear place to begin."
          eyebrow="PROMTY PRODUCT"
          title="One project memory for every AI session."
          toolLine="ACTIVITY  ·  MEMORY  ·  REVIEW  ·  HANDOFF"
        >
          <ContextPreview
            eyebrow="WHAT THE NEXT SESSION NEEDS"
            footer="SOURCE-LINKED PROJECT CONTEXT"
            items={[
              { label: "CURRENT DIRECTION", value: "Complete account settings safely." },
              { label: "LAST DECISION", value: "Review context before it carries forward." },
              { label: "OPEN QUESTION", value: "How should deletion failures be recovered?" },
            ]}
            project="PROJECT MEMORY / auth-refactor"
            title="A clear model of where the project stands."
          />
        </ValueHero>

        <section className="value-section">
          <ValueSectionIntro
            description="Promty turns AI-assisted work into a project-level memory you can revisit and carry forward."
            eyebrow="WHAT YOU CAN DO"
            title="Keep activity, context, and next steps connected."
          />
          <MomentGrid items={outcomes} />
        </section>

        <section className="value-section is-panel" id="product-views">
          <ValueSectionIntro
            description="Each view answers a different question while staying connected to the same work."
            eyebrow="THE PRODUCT SURFACE"
            title="Three views. One shared project context."
          />
          <ValueCardGrid items={productViews} />
        </section>

        <section className="value-section" id="memory">
          <ValueSectionIntro
            description="Project Memory keeps the information future work needs to move forward."
            eyebrow="WHAT STAYS WITH THE PROJECT"
            title="Not another transcript. A useful project model."
          />
          <StepGrid items={memoryModel} />
        </section>

        <section className="value-split-section" id="handoff">
          <div className="value-split-copy" data-marketing-reveal>
            <span className="value-eyebrow">CONTEXT HANDOFF</span>
            <h2>Start the next session from the next decision.</h2>
            <p>
              Promty prepares a clear starting point for the next person or
              AI—without asking them to decode old chat history.
            </p>
            <BenefitChecklist>
              <BenefitItem>Current direction</BenefitItem>
              <BenefitItem>Decisions and trade-offs</BenefitItem>
              <BenefitItem>Open questions and next steps</BenefitItem>
            </BenefitChecklist>
          </div>
          <ReviewPanel
            actionLabel="Use this context"
            contextLabel="CONTEXT HANDOFF / promty"
            items={[
              {
                label: "CURRENT DIRECTION",
                meta: "SHARED",
                value: "Complete account settings safely.",
              },
              {
                label: "LAST DECISION",
                meta: "REVIEWED",
                value: "Keep the reason behind account deletion rules.",
              },
            ]}
            nextStep="Finish error handling and recovery UX."
          />
        </section>

        <ValueFinalCta
          description="Start with one project and keep its decisions, questions, and next steps available."
          eyebrow="MAKE CONTEXT CONTINUOUS"
          primaryLabel="Open workspace"
          secondaryHref="/docs/collector"
          secondaryLabel="View setup guide"
          title="Give every session the right starting point."
          toolLine="WORKS WITH CODEX  ·  CLAUDE CODE"
        />
      </div>
    </MarketingShell>
  );
}
