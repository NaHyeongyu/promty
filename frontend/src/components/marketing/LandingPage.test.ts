import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage, publicCollectorCommand } from "./LandingPage";

describe("publicCollectorCommand", () => {
  it("installs the latest collector against the production profile", () => {
    expect(publicCollectorCommand).toBe(
      "npx promty-collector@latest init --tool codex-cli --profile prod",
    );
  });

  it("resolves every in-page navigation link, including the footer", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    const anchors = [...html.matchAll(/href="\/?#([^"]+)"/g)].map((match) => match[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(ids.has(anchor), `Missing target: ${anchor}`).toBe(true);
    expect(html).toContain('href="/app"');
    expect(html).toContain('href="/docs/collector"');
  });

  it("keeps sign-in actions separate from setup navigation", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
      href: match[1].match(/href="([^"]+)"/)?.[1],
      label: match[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, "").trim(),
    }));
    const starts = links.filter((link) => link.label === "Get started");
    expect(starts.length).toBeGreaterThan(1);
    expect(starts.every((link) => link.href === "/app")).toBe(true);
    const setup = links.filter((link) => link.label === "View setup steps");
    expect(setup.length).toBeGreaterThan(0);
    expect(setup.every((link) => link.href === "#get-started")).toBe(true);
  });

});
