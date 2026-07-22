import { describe, expect, it } from "vitest";
import aboutSource from "./AboutPage.tsx?raw";
import { aboutStorySteps } from "./AboutPage";

describe("AboutPage", () => {
  it("uses the three Figma product views for the continuity story", () => {
    expect(aboutStorySteps.map((step) => step.image)).toEqual([
      "/marketing/promty-product-overview.png",
      "/marketing/promty-product-memory.png",
      "/marketing/promty-product-community.png",
    ]);
  });

  it("keeps the review demo operable and the main CTA app-bound", () => {
    expect(aboutSource).toContain("aria-pressed={isIncluded}");
    expect(aboutSource).toContain('href="/app"');
    expect(aboutSource).toContain('id="how-it-works"');
    expect(aboutSource).toContain('id="review"');
  });

  it("wires reduced-motion handling and mobile story previews", () => {
    expect(aboutSource).toContain("usePrefersReducedMotion");
    expect(aboutSource).toContain('className="about-story-step-preview"');
    expect(aboutSource).toContain("if (reducedMotion ||");
  });
});
