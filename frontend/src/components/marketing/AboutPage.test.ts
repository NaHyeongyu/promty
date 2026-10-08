import { describe, expect, it } from "vitest";
import aboutSource from "./AboutPage.tsx?raw";
import conceptsSource from "./MarketingConcepts.tsx?raw";

describe("AboutPage", () => {
  it("keeps the page editorial and value-led", () => {
    expect(aboutSource).toContain(
      "AI should move your project forward—not make you explain it again.",
    );
    expect(aboutSource).toContain("Context should belong to the project.");
    expect(aboutSource).toContain(
      "Every project should be able to explain itself.",
    );
    expect(aboutSource).not.toContain("owner-scoped");
    expect(aboutSource).not.toContain("MCP");
  });

  it("links the narrative sections and keeps the primary CTA app-bound", () => {
    expect(aboutSource).toContain('primaryHref="/app"');
    expect(aboutSource).toContain('id="why-promty"');
    expect(aboutSource).toContain('id="principles"');
    expect(aboutSource).toContain('id="vision"');
  });

  it("uses the shared interactive context preview", () => {
    expect(aboutSource).toContain("<ContextPreview");
    expect(conceptsSource).toContain("onPointerMove={updateTilt}");
    expect(conceptsSource).toContain("prefers-reduced-motion: reduce");
    expect(conceptsSource).toContain("aria-pressed={activeItem === index}");
  });
});
