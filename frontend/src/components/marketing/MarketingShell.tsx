import { useEffect, type ReactNode } from "react";
import { ArrowRight, BookOpen, GitBranch, LayoutDashboard, Menu } from "lucide-react";
import { BrandLockup } from "../app/Branding";
import "./marketing.css";
import "./value-marketing.css";

function FigmaBrand({ withLogo = false }: { withLogo?: boolean }) {
  return <>{withLogo ? <img src="/promty.svg" alt="" /> : null}<strong className="figma-brand-word">Promty</strong></>;
}

export function MarketingShell({
  appearance = "default",
  children,
  current,
}: {
  appearance?: "default" | "figma";
  children: ReactNode;
  current: "about" | "home" | "legal" | "product";
}) {
  const isFigmaHome = current === "home";
  const isAbout = current === "about";
  const isProduct = current === "product";
  const usesFigmaAppearance = appearance === "figma";
  const footerTagline = isAbout
    ? "Building a future where projects remember."
    : isProduct
      ? "A shared memory for every AI-assisted project."
      : "Project context that carries the work forward.";
  const headerCtaLabel = isAbout
    ? "Start with Promty"
    : isProduct
      ? "Open workspace"
      : isFigmaHome ? "Get started" : "Connect a project";

  useEffect(() => {
    function scrollToCurrentHash() {
      if (!window.location.hash) return;
      const target = document.getElementById(window.location.hash.slice(1));
      target?.scrollIntoView({ block: "start" });
    }

    const frame = window.requestAnimationFrame(scrollToCurrentHash);
    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", scrollToCurrentHash);
    };
  }, []);

  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-marketing-reveal]")];
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.12 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`marketing-site${usesFigmaAppearance ? " marketing-site--figma-home" : ""}${isFigmaHome ? " marketing-site--landing" : ""}${isAbout ? " marketing-site--about" : ""}`}
    >
      <a className="marketing-skip-link" href="#main-content">
        Skip to content
      </a>
      {!usesFigmaAppearance ? <div className="marketing-scroll-progress" aria-hidden="true"><i /></div> : null}
      <header className="marketing-header">
        <a aria-label="Promty introduction" className="marketing-brand" href="/">
          {usesFigmaAppearance ? <FigmaBrand withLogo={isFigmaHome} /> : <BrandLockup />}
        </a>
        <nav aria-label="Primary navigation" className="marketing-nav">
          {usesFigmaAppearance && isAbout ? (
            <>
              <a href="#why-promty">Why Promty</a>
              <a href="#principles">Principles</a>
              <a href="#vision">Vision</a>
              <a href="/docs/collector">Docs</a>
            </>
          ) : usesFigmaAppearance && isProduct ? (
            <>
              <a href="#overview">Overview</a>
              <a href="#memory">Memory</a>
              <a href="#handoff">Handoff</a>
              <a href="/docs/collector">Docs</a>
            </>
          ) : usesFigmaAppearance && isFigmaHome ? (
            <>
              <a href="#workflow">How it works</a>
              <a href="#memory">Project Memory</a>
              <a href="#security">Privacy</a>
              <a href="/docs/collector">Docs</a>
            </>
          ) : (
            <>
              <a aria-current={current === "product" ? "page" : undefined} href="/product">Product</a>
              <a href="/about">About</a>
              <a href="/#product">How it works</a>
              <a href="/#security">Security</a>
              <a href="/docs/collector">Docs</a>
            </>
          )}
        </nav>
        <div className="marketing-header-actions">
          {usesFigmaAppearance ? <a className="marketing-sign-in" href="/app">Sign in</a> : null}
          <a className="marketing-header-cta" href="/app">
            {!usesFigmaAppearance ? <LayoutDashboard aria-hidden="true" size={15} /> : null}
            {usesFigmaAppearance ? headerCtaLabel : "Open workspace"}
            {usesFigmaAppearance ? <ArrowRight aria-hidden="true" size={15} /> : null}
          </a>
          {isFigmaHome && usesFigmaAppearance ? (
            <details className="marketing-mobile-nav">
              <summary aria-label="Navigation menu"><Menu size={20} aria-hidden="true" /></summary>
              <nav aria-label="Mobile navigation" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open"); }}>
                <a href="#workflow">How it works</a>
                <a href="#memory">Project Memory</a>
                <a href="#security">Privacy</a>
                <a href="#faq">FAQ</a>
                <a href="/docs/collector">Docs</a>
                <a href="/app">Sign in</a>
              </nav>
            </details>
          ) : null}
        </div>
      </header>
      <main id="main-content">{children}</main>
      {usesFigmaAppearance ? (
        <footer className="marketing-footer figma-footer">
          <div className="figma-footer-main">
            <div className="figma-footer-brand">
              <a aria-label="Promty introduction" className="marketing-brand" href="/">
                <FigmaBrand withLogo={isFigmaHome} />
              </a>
              <p>{footerTagline}</p>
            </div>
            <nav aria-label="Footer navigation" className="marketing-footer-links">
              <a href="/product">Product</a>
              <a href="/about">About</a>
              <a href="/#workflow">How it works</a>
              <a href="/docs/collector">Docs</a>
              <a href="https://github.com/NaHyeongyu/promty">GitHub</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/security">Security</a>
            </nav>
          </div>
          <div className="figma-footer-meta">
            <p>© 2026 Promty. Context belongs to the project.</p>
          </div>
        </footer>
      ) : (
        <footer className="marketing-footer">
          <div>
            <a aria-label="Promty introduction" className="marketing-brand" href="/">
              <BrandLockup />
            </a>
            <p>Project memory for humans and AI agents.</p>
          </div>
          <div className="marketing-footer-links">
            <a href="/product">Product</a>
            <a href="/docs/collector"><BookOpen aria-hidden="true" size={14} /> Docs</a>
            <a href="/app?view=community"><GitBranch aria-hidden="true" size={14} /> Community</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/security">Security</a>
            <a href="/app">Workspace <ArrowRight aria-hidden="true" size={14} /></a>
          </div>
        </footer>
      )}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="marketing-section-heading" data-marketing-reveal>
      <span className="marketing-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function MarketingCta({
  children,
  href,
  secondary = false,
}: {
  children: ReactNode;
  href: string;
  secondary?: boolean;
}) {
  return (
    <a className={`marketing-cta${secondary ? " is-secondary" : ""}`} href={href}>
      {children}
    </a>
  );
}
