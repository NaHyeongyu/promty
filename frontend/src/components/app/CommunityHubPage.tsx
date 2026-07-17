import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider";

export function CommunityHubPage({
  children,
  hideHeader = false,
}: {
  children: ReactNode;
  hideHeader?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="community-hub-page">
      {!hideHeader ? <header className="page-header community-hub-header">
        <div className="projects-page-header-copy community-hub-header-copy">
          <h1>{t("community.title")}</h1>
          <p>{t("community.hubDescription")}</p>
        </div>
      </header> : null}

      <section className="community-hub-content">
        {children}
      </section>
    </div>
  );
}
