import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { isCommunityPreview } from "../../workspace/communityPreviewData";

export function CommunityHubPage({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useI18n();
  const preview = isCommunityPreview();

  return (
    <div className="community-hub-page">
      <header className="page-header community-hub-header">
        <div className="projects-page-header-copy community-hub-header-copy">
          <h1>{t("community.title")}</h1>
          <p>{t("community.hubDescription")}</p>
        </div>
        {preview ? <span className="community-preview-label">{t("community.previewData")}</span> : null}
      </header>

      <section className="community-hub-content">
        {children}
      </section>
    </div>
  );
}
