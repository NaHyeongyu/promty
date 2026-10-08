import type { CSSProperties } from "react";
import type { AppRoute } from "../../routing";
import "./app-skeleton.css";
import "./loading-state.css";

function Placeholder({ width = "100%", height = 12, className = "" }: { width?: string | number; height?: number; className?: string }) {
  return <span className={`app-skeleton-block ${className}`} style={{ width, height } as CSSProperties} />;
}

function Header() {
  return <div className="app-skeleton-header"><Placeholder width={105} height={22} /><div className="app-skeleton-nav">{[72, 94, 52].map((width) => <Placeholder key={width} width={width} />)}</div><Placeholder width={116} height={36} /></div>;
}

function Workspace() {
  return <div className="app-skeleton-workspace">
    <aside className="app-skeleton-sidebar">
      <div className="app-skeleton-brand"><Placeholder width={26} height={26} /><Placeholder width={82} height={18} /></div>
      <div className="app-skeleton-sidebar-links">{[112, 90, 120, 80].map((width) => <div key={width}><Placeholder width={18} height={18} /><Placeholder width={width} /></div>)}</div>
      <div className="app-skeleton-profile"><Placeholder width={30} height={30} /><Placeholder width={100} /></div>
    </aside>
    <div className="app-skeleton-workspace-main">
      <div className="app-skeleton-heading"><Placeholder width={170} height={28} /><Placeholder width={120} height={36} /></div>
      <div className="app-skeleton-tools"><Placeholder width="min(360px, 60%)" height={38} /><Placeholder width={150} height={38} /></div>
      <div className="app-skeleton-table">{Array.from({ length: 7 }, (_, index) => <div className="app-skeleton-row" key={index}><div><Placeholder width={`${58 + (index % 3) * 12}%`} height={14} /><Placeholder width="44%" height={10} /></div><Placeholder width="65%" /><Placeholder width="55%" /><Placeholder width="72%" /></div>)}</div>
    </div>
  </div>;
}

export function AppSkeleton({ route = "workspace", label }: { route?: AppRoute; label: string }) {
  const layout = route === "workspace" || route === "admin" ? "workspace" : route === "landing" || route === "about" || route === "product" ? "marketing" : route === "cli-login" ? "auth" : "document";
  return <div className="app-skeleton" role="status" aria-label={label} data-layout={layout}>
    <div aria-hidden="true">
      {layout === "workspace" ? <Workspace /> : <>
        <Header />
        {layout === "marketing" ? <div className="app-skeleton-marketing"><Placeholder width={220} height={9} /><Placeholder width="min(720px, 90%)" height={54} /><div className="app-skeleton-copy"><Placeholder /><Placeholder width="82%" /></div><Placeholder width={146} height={46} /><div className="app-skeleton-product"><div><Placeholder width={140} /><Placeholder width={72} /></div><Placeholder width="38%" height={22} /><Placeholder width="64%" /><div className="app-skeleton-preview-lines">{[90, 76, 84, 60].map((width) => <Placeholder key={width} width={`${width}%`} height={14} />)}</div></div></div> : layout === "auth" ? <div className="app-skeleton-auth"><Placeholder width={180} height={30} /><Placeholder height={14} /><Placeholder width="80%" /><Placeholder height={44} /></div> : <div className="app-skeleton-document"><Placeholder width="60%" height={34} /><Placeholder width="80%" height={16} />{Array.from({ length: 3 }, (_, index) => <div key={index}><Placeholder width="35%" height={20} /><Placeholder /><Placeholder width="90%" /><Placeholder width="70%" /></div>)}</div>}
      </>}
    </div>
  </div>;
}
