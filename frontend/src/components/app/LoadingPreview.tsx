import { ContentSkeleton, LoadingIndicator, LoadingStatus } from "./LoadingState";
import { ProjectListLoadingState } from "./WorkspaceStates";
import "../../styles-loading.css";
import "../../styles-workspace.css";
import "../../styles-projects.css";
import "../../styles-responsive.css";
import "./loading-preview.css";

/** Development-only gallery of the actual shared loading components. */
export default function LoadingPreview() {
  return <main className="loading-preview">
    <header><span>PROMTY · LOCAL PREVIEW</span><h1>로딩 화면</h1><p>기존 컬러를 유지하고, 모든 로딩에 같은 흐름을 적용했습니다.</p></header>
    <section><h2>프로젝트 목록</h2><ProjectListLoadingState /></section>
    <div className="loading-preview-columns">
      <section><h2>상세 · 계정 정보</h2><ContentSkeleton label="상세 정보 불러오는 중" variant="detail" rows={2} /></section>
      <section><h2>검토 · 활동 목록</h2><ContentSkeleton label="목록 불러오는 중" rows={2} /></section>
    </div>
    <section><h2>관리자 · 콘텐츠 카드</h2><ContentSkeleton label="콘텐츠 불러오는 중" variant="cards" rows={3} /></section>
    <section><h2>저장 · 업로드 · 새로고침</h2><div className="loading-preview-actions"><button type="button" disabled aria-busy="true"><LoadingIndicator />저장 중…</button><button type="button" disabled aria-busy="true"><LoadingIndicator />업로드 중…</button><LoadingStatus>최신 정보를 불러오는 중…</LoadingStatus></div></section>
  </main>;
}
