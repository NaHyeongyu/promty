import { useEffect, type ReactNode } from "react";
import { ArrowRight, BookOpen, GitBranch, LayoutDashboard } from "lucide-react";
import { BrandLockup, BrandLogo } from "../app/Branding";
import "./marketing.css";

function FigmaBrand() {
  return (
    <>
      <BrandLogo className="figma-brand-mark" />
      <strong className="figma-brand-word">promty</strong>
    </>
  );
}

export function MarketingShell({
  children,
  current,
}: {
  children: ReactNode;
  current: "home" | "product";
}) {
  const isFigmaHome = current === "home";

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
    <div className={`marketing-site${isFigmaHome ? " marketing-site--figma-home" : ""}`}>
      <a className="marketing-skip-link" href="#main-content">
        Skip to content
      </a>
      {!isFigmaHome ? <div className="marketing-scroll-progress" aria-hidden="true"><i /></div> : null}
      <header className="marketing-header">
        <a aria-label="Promty introduction" className="marketing-brand" href="/about">
          {isFigmaHome ? <FigmaBrand /> : <BrandLockup />}
        </a>
        <nav aria-label="Primary navigation" className="marketing-nav">
          {isFigmaHome ? (
            <>
              <a href="#product">Product</a>
              <a href="/?view=community">Community</a>
              <a href="#security">Security</a>
            </>
          ) : (
            <>
              <a aria-current="page" href="/product">Product</a>
              <a href="/about#product">How it works</a>
              <a href="/about#security">Security</a>
              <a href="/docs/collector">Docs</a>
            </>
          )}
        </nav>
        <a className="marketing-header-cta" href="/">
          {!isFigmaHome ? <LayoutDashboard aria-hidden="true" size={15} /> : null}
          {isFigmaHome ? "Open Promty" : "Open workspace"}
        </a>
      </header>
      <main id="main-content">{children}</main>
      {isFigmaHome ? (
        <footer className="marketing-footer figma-footer">
          <div className="figma-footer-main">
            <a aria-label="Promty introduction" className="marketing-brand" href="/about">
              <FigmaBrand />
            </a>
            <nav aria-label="Footer navigation" className="marketing-footer-links">
              <a href="#product">Product</a>
              <a href="/docs/collector">Docs</a>
              <a href="/?view=community">Community</a>
              <a href="#security">Security</a>
              <a href="#faq">FAQ</a>
              <a href="/?view=support">Contact</a>
            </nav>
          </div>
          <div className="figma-footer-meta">
            <p>Project memory for AI-native development.</p>
            <p>© 2026 Promty.</p>
          </div>
        </footer>
      ) : (
        <footer className="marketing-footer">
          <div>
            <a aria-label="Promty introduction" className="marketing-brand" href="/about">
              <BrandLockup />
            </a>
            <p>Project memory for humans and AI agents.</p>
          </div>
          <div className="marketing-footer-links">
            <a href="/product">Product</a>
            <a href="/docs/collector"><BookOpen aria-hidden="true" size={14} /> Docs</a>
            <a href="/?view=community"><GitBranch aria-hidden="true" size={14} /> Community</a>
            <a href="/">Workspace <ArrowRight aria-hidden="true" size={14} /></a>
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
