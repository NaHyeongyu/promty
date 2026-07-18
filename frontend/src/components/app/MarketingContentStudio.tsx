import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clipboard,
  CloudUpload,
  Code2,
  ExternalLink,
  FileText,
  GitBranch,
  Languages,
  LoaderCircle,
  MessageCircle,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  approveMarketingContent,
  createMarketingContent,
  deliverMarketingContent,
  fetchMarketingContent,
  fetchMarketingIntegrations,
  generateMarketingContent,
  MARKETING_CHANNELS,
  updateMarketingContent,
} from "../../api/marketing";
import type {
  MarketingBilingualContent,
  MarketingChannel,
  MarketingContent,
  MarketingContentCreate,
  MarketingIntegrations,
  MarketingLocale,
  MarketingVariant,
} from "../../api/marketing";
import { copyTextToClipboard } from "../../lib/clipboard";
import { formatOptionalTimestamp } from "../../lib/formatters";
import { safeExternalHttpUrl } from "../../lib/urls";
import { useAdminLocale } from "../../i18n/useAdminLocale";
import "../../styles-marketing-admin.css";

const CHANNEL_META: Record<MarketingChannel, { label: string; icon: typeof Send; type: "community" | "owned" | "social" }> = {
  x: { icon: X, label: "X", type: "social" },
  threads: { icon: MessageCircle, label: "Threads", type: "social" },
  bluesky: { icon: CloudUpload, label: "Bluesky", type: "social" },
  linkedin: { icon: Network, label: "LinkedIn", type: "social" },
  devto: { icon: Code2, label: "DEV.to", type: "owned" },
  github: { icon: GitBranch, label: "GitHub", type: "owned" },
  reddit: { icon: MessageCircle, label: "Reddit", type: "community" },
  hackernews: { icon: FileText, label: "Hacker News", type: "community" },
};

const EMPTY_CREATE: MarketingContentCreate = {
  campaign_name: "",
  channels: [...MARKETING_CHANNELS],
  cta_url: "https://promty.org/app",
  source_summary: "",
  source_title: "",
  source_type: "manual",
  source_url: "",
  tone: "practical",
};

function isBilingualContent(content: MarketingContent["content"]): content is MarketingBilingualContent {
  return "ko" in content && "en" in content;
}

function variantText(variant: MarketingVariant) {
  const tags = variant.hashtags.length > 0
    ? `\n\n${variant.hashtags.map((tag) => `#${tag}`).join(" ")}`
    : "";
  return `${variant.title}\n\n${variant.body}${tags}`;
}

function statusLabel(status: MarketingContent["status"], ko: boolean) {
  const labels: Record<MarketingContent["status"], [string, string]> = {
    approved: ["Approved", "승인됨"],
    draft: ["Draft", "초안"],
    failed: ["Failed", "실패"],
    published: ["Published", "게시됨"],
    review: ["Review", "검토 중"],
    scheduled: ["Scheduled", "예약됨"],
  };
  return labels[status][ko ? 1 : 0];
}

export function MarketingContentStudio() {
  const { locale, text } = useAdminLocale();
  const ko = locale === "ko";
  const [items, setItems] = useState<MarketingContent[]>([]);
  const [integrations, setIntegrations] = useState<MarketingIntegrations | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<MarketingContent | null>(null);
  const [activeChannel, setActiveChannel] = useState<MarketingChannel>("x");
  const [createForm, setCreateForm] = useState<MarketingContentCreate>(EMPTY_CREATE);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [page, integrationStatus] = await Promise.all([
        fetchMarketingContent(signal),
        fetchMarketingIntegrations(signal),
      ]);
      setItems(page.items);
      setIntegrations(integrationStatus);
      setSelectedId((current) => current ?? page.items[0]?.id ?? null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : text("Could not load marketing content.", "마케팅 콘텐츠를 불러오지 못했습니다."));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [text]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const next = items.find((item) => item.id === selectedId) ?? null;
    setEditor(next);
    setIsDirty(false);
    if (next) {
      setActiveChannel((current) => next.channels.includes(current) ? current : next.channels[0] ?? "x");
    }
  }, [items, selectedId]);

  const integrationSummary = useMemo(() => {
    if (!integrations) return [];
    return [
      { active: integrations.ai.openai || integrations.ai.gemini, label: integrations.ai.openai ? "OpenAI" : integrations.ai.gemini ? "Gemini" : text("Template", "템플릿") },
      { active: integrations.buffer.configured, label: "Buffer" },
      { active: integrations.devto.configured, label: "DEV.to" },
      { active: integrations.github.configured, label: "GitHub" },
    ];
  }, [integrations, text]);

  const replaceItem = (next: MarketingContent) => {
    setItems((current) => {
      const exists = current.some((item) => item.id === next.id);
      const updated = exists
        ? current.map((item) => item.id === next.id ? next : item)
        : [next, ...current];
      return updated.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    });
    setEditor(next);
    setSelectedId(next.id);
    setIsDirty(false);
  };

  const mutate = async (action: () => Promise<void>) => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : text("Marketing action failed.", "마케팅 작업에 실패했습니다."));
    } finally {
      setIsMutating(false);
    }
  };

  const createAndGenerate = () => void mutate(async () => {
    const created = await createMarketingContent({
      ...createForm,
      cta_url: createForm.cta_url || null,
      source_url: createForm.source_url || null,
    });
    replaceItem(created);
    setShowCreate(false);
    setCreateForm(EMPTY_CREATE);
    const generated = await generateMarketingContent(created.id);
    replaceItem(generated);
    setNotice(text("Korean and English channel drafts are ready for review.", "한국어·영어 채널별 초안을 생성했습니다."));
  });

  const generate = () => {
    if (!editor) return;
    void mutate(async () => {
      const generated = await generateMarketingContent(editor.id);
      replaceItem(generated);
      setNotice(text("Bilingual variants regenerated.", "한국어·영어 콘텐츠를 다시 생성했습니다."));
    });
  };

  const save = async () => {
    if (!editor || !isBilingualContent(editor.content)) return null;
    const saved = await updateMarketingContent(editor.id, {
      content: editor.content,
      status: "review",
    });
    replaceItem(saved);
    setNotice(text("Draft edits saved.", "초안 수정을 저장했습니다."));
    return saved;
  };

  const approve = () => {
    if (!editor) return;
    void mutate(async () => {
      const saved = isDirty ? await save() : editor;
      if (!saved) return;
      const approved = await approveMarketingContent(saved.id);
      replaceItem(approved);
      setNotice(text("Both languages approved for delivery.", "한국어·영어 콘텐츠를 발행 승인했습니다."));
    });
  };

  const updateVariant = (
    localeKey: MarketingLocale,
    patch: Partial<MarketingVariant>,
  ) => {
    if (!editor || !isBilingualContent(editor.content)) return;
    const current = editor.content[localeKey][activeChannel];
    if (!current) return;
    setEditor({
      ...editor,
      content: {
        ...editor.content,
        [localeKey]: {
          ...editor.content[localeKey],
          [activeChannel]: { ...current, ...patch },
        },
      },
      status: "review",
    });
    setIsDirty(true);
  };

  const copyVariant = (localeKey: MarketingLocale) => {
    if (!editor || !isBilingualContent(editor.content)) return;
    const variant = editor.content[localeKey][activeChannel];
    if (!variant) return;
    void copyTextToClipboard(variantText(variant)).then(() => {
      setNotice(text(`${CHANNEL_META[activeChannel].label} ${localeKey.toUpperCase()} copied.`, `${CHANNEL_META[activeChannel].label} ${localeKey.toUpperCase()} 콘텐츠를 복사했습니다.`));
      void deliverMarketingContent(editor.id, { channel: activeChannel, locale: localeKey, mode: "manual" }).catch(() => undefined);
    });
  };

  const deliver = (localeKey: MarketingLocale, mode: "buffer_draft" | "buffer_queue" | "buffer_schedule" | "devto_draft" | "github_discussion") => {
    if (!editor) return;
    void mutate(async () => {
      const result = await deliverMarketingContent(editor.id, {
        channel: activeChannel,
        locale: localeKey,
        mode,
        scheduled_at: mode === "buffer_schedule" && scheduleAt ? new Date(scheduleAt).toISOString() : null,
      });
      const refreshed = await fetchMarketingContent();
      setItems(refreshed.items);
      const link = result.external_url ? ` ${result.external_url}` : "";
      setNotice(text(`Delivery completed: ${result.status}.${link}`, `채널 전송을 완료했습니다: ${result.status}.${link}`));
    });
  };

  const canDeliver = editor && !isDirty && ["approved", "scheduled", "published"].includes(editor.status);
  const content = editor && isBilingualContent(editor.content) ? editor.content : null;

  if (isLoading && items.length === 0) {
    return <div className="ops-loading"><LoaderCircle className="is-spinning" size={20} /><span>{text("Loading marketing studio…", "마케팅 스튜디오를 불러오는 중…")}</span></div>;
  }

  return (
    <section className="marketing-studio">
      <header className="marketing-studio-head">
        <div>
          <span>{text("BILINGUAL CONTENT OPERATIONS", "이중 언어 콘텐츠 운영")}</span>
          <h2>{text("One story, two languages, every channel", "하나의 사례를 한국어·영어로 모든 채널에")}</h2>
          <p>{text("Generate channel-native drafts, review both languages, then schedule official integrations or copy community posts.", "채널에 맞는 초안을 만들고 두 언어를 검토한 뒤 공식 연동으로 예약하거나 커뮤니티용 글을 복사합니다.")}</p>
        </div>
        <div className="marketing-studio-actions">
          <button className="toolbar-button" onClick={() => setShowCreate(true)} type="button"><Plus size={16} /> {text("New story", "새 사례")}</button>
          <button className="toolbar-button" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw className={isLoading ? "is-spinning" : undefined} size={16} /> {text("Refresh", "새로고침")}</button>
        </div>
      </header>

      <div className="marketing-integration-strip">
        {integrationSummary.map((integration) => (
          <span data-active={integration.active || undefined} key={integration.label}>
            <i /> {integration.label} {integration.active ? text("ready", "준비됨") : text("manual", "수동")}
          </span>
        ))}
      </div>

      {notice ? <div className="ops-notice" role="status"><CheckCircle2 size={16} /><span>{notice}</span><button aria-label={text("Dismiss", "닫기")} onClick={() => setNotice(null)} type="button"><X size={15} /></button></div> : null}
      {error ? <div className="ops-error" role="alert"><span>{error}</span></div> : null}

      <div className="marketing-studio-layout">
        <aside className="marketing-story-list">
          <div className="marketing-story-list-head"><strong>{text("Stories", "콘텐츠 사례")}</strong><span>{items.length}</span></div>
          {items.map((item) => (
            <button data-active={item.id === selectedId || undefined} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <span><strong>{item.campaign_name}</strong><small>{item.source_title}</small></span>
              <em data-status={item.status}>{statusLabel(item.status, ko)}</em>
              <time>{formatOptionalTimestamp(item.updated_at, "-")}</time>
            </button>
          ))}
          {items.length === 0 ? <p>{text("Create the first reusable product story.", "첫 번째 재사용 가능한 제품 사례를 만들어보세요.")}</p> : null}
        </aside>

        <div className="marketing-editor">
          {editor ? (
            <>
              <header className="marketing-editor-head">
                <div><span>{editor.source_type}</span><h3>{editor.campaign_name}</h3><p>{editor.source_summary}</p></div>
                <div className="marketing-editor-controls">
                  <span className="marketing-status" data-status={editor.status}>{statusLabel(editor.status, ko)}</span>
                  <button disabled={isMutating} onClick={generate} type="button"><Sparkles size={15} /> {text("Regenerate", "다시 생성")}</button>
                  <button disabled={!isDirty || isMutating} onClick={() => void mutate(async () => { await save(); })} type="button"><Save size={15} /> {text("Save", "저장")}</button>
                  <button disabled={!content || isMutating} onClick={approve} type="button"><Check size={15} /> {text("Approve both", "두 언어 승인")}</button>
                </div>
              </header>

              {editor.last_error ? <div className="marketing-generation-error">{editor.last_error}</div> : null}
              <div className="marketing-channel-tabs" role="tablist">
                {editor.channels.map((channel) => {
                  const Icon = CHANNEL_META[channel].icon;
                  return <button aria-selected={activeChannel === channel} data-active={activeChannel === channel || undefined} key={channel} onClick={() => setActiveChannel(channel)} role="tab" type="button"><Icon size={15} /> {CHANNEL_META[channel].label}</button>;
                })}
              </div>

              {content ? (
                <div className="marketing-bilingual-grid">
                  {(["ko", "en"] as const).map((localeKey) => {
                    const variant = content[localeKey][activeChannel];
                    if (!variant) return null;
                    const result = editor.delivery_results[`${localeKey}:${activeChannel}`];
                    const externalUrl = safeExternalHttpUrl(result?.external_url);
                    return (
                      <article className="marketing-language-card" key={localeKey}>
                        <header>
                          <span><Languages size={15} /> {localeKey === "ko" ? "한국어" : "English"}</span>
                          {result?.status ? <em>{result.status}</em> : null}
                        </header>
                        <label>{text("Title", "제목")}<input onChange={(event) => updateVariant(localeKey, { title: event.target.value })} value={variant.title} /></label>
                        <label>{text("Body", "본문")}<textarea onChange={(event) => updateVariant(localeKey, { body: event.target.value })} rows={activeChannel === "devto" ? 24 : activeChannel === "linkedin" || activeChannel === "github" ? 14 : 10} value={variant.body} /></label>
                        <label>{text("Hashtags", "해시태그")}<input onChange={(event) => updateVariant(localeKey, { hashtags: event.target.value.split(/[,\s]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean) })} value={variant.hashtags.map((tag) => `#${tag}`).join(" ")} /></label>
                        <div className="marketing-language-actions">
                          <button onClick={() => copyVariant(localeKey)} type="button"><Clipboard size={14} /> {text("Copy", "복사")}</button>
                          {CHANNEL_META[activeChannel].type === "social" ? (
                            <>
                              <button disabled={!canDeliver || !integrations?.buffer.configured} onClick={() => deliver(localeKey, "buffer_draft")} type="button"><FileText size={14} /> {text("Buffer draft", "Buffer 초안")}</button>
                              <button disabled={!canDeliver || !integrations?.buffer.configured} onClick={() => deliver(localeKey, "buffer_queue")} type="button"><Send size={14} /> {text("Add to queue", "대기열 추가")}</button>
                            </>
                          ) : null}
                          {activeChannel === "devto" ? <button disabled={!canDeliver || !integrations?.devto.configured} onClick={() => deliver(localeKey, "devto_draft")} type="button"><Code2 size={14} /> {text("Create DEV draft", "DEV 초안 생성")}</button> : null}
                          {activeChannel === "github" ? <button disabled={!canDeliver || !integrations?.github.configured} onClick={() => deliver(localeKey, "github_discussion")} type="button"><GitBranch size={14} /> {text("Publish discussion", "Discussion 게시")}</button> : null}
                          {externalUrl ? <a href={externalUrl} rel="noreferrer" target="_blank"><ExternalLink size={14} /> {text("Open", "열기")}</a> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="marketing-empty-editor"><Sparkles size={22} /><h3>{text("Generate both languages", "한국어·영어 콘텐츠 생성")}</h3><p>{text("The source brief is saved. Generate channel-specific Korean and English drafts to continue.", "소스 브리프가 저장되었습니다. 채널별 한국어·영어 초안을 생성해주세요.")}</p><button disabled={isMutating} onClick={generate} type="button"><Sparkles size={15} /> {text("Generate", "생성")}</button></div>
              )}

              {CHANNEL_META[activeChannel].type === "social" ? (
                <div className="marketing-schedule-bar">
                  <CalendarClock size={16} />
                  <label>{text("Exact Buffer time", "Buffer 예약 시간")}<input min={new Date().toISOString().slice(0, 16)} onChange={(event) => setScheduleAt(event.target.value)} type="datetime-local" value={scheduleAt} /></label>
                  <button disabled={!canDeliver || !integrations?.buffer.configured || !scheduleAt || isMutating} onClick={() => deliver("ko", "buffer_schedule")} type="button">KO {text("schedule", "예약")}</button>
                  <button disabled={!canDeliver || !integrations?.buffer.configured || !scheduleAt || isMutating} onClick={() => deliver("en", "buffer_schedule")} type="button">EN {text("schedule", "예약")}</button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="marketing-empty-editor"><Rocket size={24} /><h3>{text("Build a bilingual distribution engine", "이중 언어 배포 엔진 시작하기")}</h3><p>{text("Create one source story and Promty will prepare Korean and English variants for every selected channel.", "하나의 원본 사례를 만들면 선택한 모든 채널의 한국어·영어 버전을 준비합니다.")}</p><button onClick={() => setShowCreate(true)} type="button"><Plus size={15} /> {text("New story", "새 사례")}</button></div>
          )}
        </div>
      </div>

      {showCreate ? (
        <div className="marketing-modal-backdrop" role="presentation">
          <form className="marketing-create-dialog" onSubmit={(event) => { event.preventDefault(); createAndGenerate(); }}>
            <header><div><span>{text("SOURCE STORY", "원본 사례")}</span><h3>{text("Create bilingual channel drafts", "한국어·영어 채널 초안 만들기")}</h3></div><button aria-label={text("Close", "닫기")} onClick={() => setShowCreate(false)} type="button"><X size={18} /></button></header>
            <div className="marketing-create-grid">
              <label>{text("Campaign name", "캠페인 이름")}<input maxLength={255} onChange={(event) => setCreateForm((current) => ({ ...current, campaign_name: event.target.value }))} required value={createForm.campaign_name} /></label>
              <label>{text("Tone", "톤")}<select onChange={(event) => setCreateForm((current) => ({ ...current, tone: event.target.value as MarketingContentCreate["tone"] }))} value={createForm.tone}><option value="practical">Practical</option><option value="technical">Technical</option><option value="founder">Founder</option><option value="launch">Launch</option></select></label>
              <label className="is-wide">{text("Story title", "사례 제목")}<input maxLength={500} onChange={(event) => setCreateForm((current) => ({ ...current, source_title: event.target.value }))} required value={createForm.source_title} /></label>
              <label className="is-wide">{text("Verified facts and learning", "확인된 사실과 배운 점")}<textarea minLength={10} onChange={(event) => setCreateForm((current) => ({ ...current, source_summary: event.target.value }))} placeholder={text("Describe the problem, what changed, why, and the result. Do not include secrets or private prompts.", "문제, 변경한 내용, 이유, 결과를 적어주세요. 비밀정보나 비공개 프롬프트는 포함하지 마세요.")} required rows={8} value={createForm.source_summary} /></label>
              <label>{text("Source URL", "원문 URL")}<input onChange={(event) => setCreateForm((current) => ({ ...current, source_url: event.target.value }))} placeholder="https://…" type="url" value={createForm.source_url ?? ""} /></label>
              <label>{text("CTA URL", "CTA URL")}<input onChange={(event) => setCreateForm((current) => ({ ...current, cta_url: event.target.value }))} placeholder="https://promty.org/app" type="url" value={createForm.cta_url ?? ""} /></label>
            </div>
            <fieldset><legend>{text("Channels", "채널")}</legend><div className="marketing-create-channels">{MARKETING_CHANNELS.map((channel) => <label key={channel}><input checked={createForm.channels.includes(channel)} onChange={(event) => setCreateForm((current) => ({ ...current, channels: event.target.checked ? [...current.channels, channel] : current.channels.filter((item) => item !== channel) }))} type="checkbox" />{CHANNEL_META[channel].label}</label>)}</div></fieldset>
            <footer><button onClick={() => setShowCreate(false)} type="button">{text("Cancel", "취소")}</button><button disabled={isMutating || createForm.channels.length === 0} type="submit">{isMutating ? <LoaderCircle className="is-spinning" size={15} /> : <Sparkles size={15} />} {text("Create and generate KO + EN", "생성하고 한국어·영어 만들기")}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
