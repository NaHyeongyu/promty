import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import type { AccountPolicyConsents } from "../../workspace/types";

export function PolicyConsentModal({
  consents,
  isSaving,
  onSave,
}: {
  consents: AccountPolicyConsents;
  isSaving: boolean;
  onSave: (allowExternalAi: boolean) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [confirmedEligibility, setConfirmedEligibility] = useState(false);
  const [allowExternalAi, setAllowExternalAi] = useState(true);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const providers = consents.external_ai_providers
    .map((provider) => (provider === "openai" ? "OpenAI" : "Google Gemini"))
    .join(" / ");

  return (
    <div className="policy-consent-backdrop" role="presentation">
      <section
        aria-labelledby="policy-consent-title"
        aria-modal="true"
        className="policy-consent-modal"
        role="dialog"
      >
        <div className="policy-consent-icon" aria-hidden="true">
          <ShieldCheck size={22} strokeWidth={1.6} />
        </div>
        <div>
          <span className="policy-consent-eyebrow">{t("policyConsent.eyebrow")}</span>
          <h2 id="policy-consent-title">{t("policyConsent.title")}</h2>
          <p>{t("policyConsent.description")}</p>
        </div>

        <label className="policy-consent-option">
          <input
            checked={acceptedPolicies}
            onChange={(event) => setAcceptedPolicies(event.target.checked)}
            type="checkbox"
          />
          <span>
            {t("policyConsent.acceptPrefix")} <a href="/terms" target="_blank">{t("policyConsent.terms")}</a>{" "}
            {t("policyConsent.and")} <a href="/privacy" target="_blank">{t("policyConsent.privacy")}</a>{" "}
            {t("policyConsent.acceptSuffix")}
          </span>
        </label>

        <label className="policy-consent-option">
          <input
            checked={confirmedEligibility}
            onChange={(event) => setConfirmedEligibility(event.target.checked)}
            type="checkbox"
          />
          <span>{t("policyConsent.eligibility")}</span>
        </label>

        <label className="policy-consent-option is-optional">
          <input
            checked={allowExternalAi}
            onChange={(event) => setAllowExternalAi(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>{t("policyConsent.aiTitle")}</strong>
            {t("policyConsent.aiDescription", { providers: providers || "OpenAI / Google Gemini" })}
            <small>{t("policyConsent.aiOptional")}</small>
          </span>
        </label>

        <div className="policy-consent-actions">
          <a href="/?view=support">{t("policyConsent.contact")}</a>
          <button
            disabled={!acceptedPolicies || !confirmedEligibility || isSaving}
            onClick={() => void onSave(allowExternalAi)}
            type="button"
          >
            {isSaving ? t("common.saving") : t("policyConsent.continue")}
          </button>
        </div>
      </section>
    </div>
  );
}
