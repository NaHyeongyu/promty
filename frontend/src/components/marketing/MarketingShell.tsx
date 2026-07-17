import { useEffect, type ReactNode } from "react";
import { ArrowRight, BookOpen, GitBranch, LayoutDashboard } from "lucide-react";
import { BrandLockup } from "../app/Branding";
import "./marketing.css";

export function MarketingShell({
  children,
  current,
}: {
  children: ReactNode;
  current: "home" | "product";
}) {
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
    <div className="marketing-site">
      <a className="marketing-skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="marketing-header">
        <a aria-label="Promty home" className="marketing-brand" href="/">
          <BrandLockup />
        </a>
        <nav aria-label="Primary navigation" className="marketing-nav">
          <a aria-current={current === "product" ? "page" : undefined} href="/product">
            Product
          </a>
          <a href={current === "home" ? "#how-it-works" : "/#how-it-works"}>
            How it works
          </a>
          <a href={current === "home" ? "#security" : "/#security"}>Security</a>
          <a href="/docs/collector">Docs</a>
        </nav>
        <a className="marketing-header-cta" href="/app">
          <LayoutDashboard aria-hidden="true" size={15} />
          Open workspace
        </a>
      </header>
      <main id="main-content">{children}</main>
      <footer className="marketing-footer">
        <div>
          <a aria-label="Promty home" className="marketing-brand" href="/">
            <BrandLockup />
          </a>
          <p>Project memory for humans and AI agents.</p>
        </div>
        <div className="marketing-footer-links">
          <a href="/product">Product</a>
          <a href="/docs/collector"><BookOpen aria-hidden="true" size={14} /> Docs</a>
          <a href="/app?view=community"><GitBranch aria-hidden="true" size={14} /> Community</a>
          <a href="/app">Workspace <ArrowRight aria-hidden="true" size={14} /></a>
        </div>
      </footer>
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
