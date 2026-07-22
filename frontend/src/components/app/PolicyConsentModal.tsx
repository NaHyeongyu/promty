import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { focusableModalElements } from "../project-detail/modalFocus";

export function PolicyConsentModal({
  isSaving,
  onAccept,
}: {
  isSaving: boolean;
  onAccept: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [confirmedEligibility, setConfirmedEligibility] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    const focusDialog = window.requestAnimationFrame(() => {
      if (dialogRef.current) {
        focusableModalElements(dialogRef.current)[0]?.focus();
      }
    });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = focusableModalElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      window.removeEventListener("keydown", trapFocus);
      document.body.classList.remove("modal-open");
    };
  }, []);

  return (
    <div className="policy-consent-backdrop" role="presentation">
      <section
        aria-describedby="policy-consent-description"
        aria-labelledby="policy-consent-title"
        aria-modal="true"
        className="policy-consent-modal"
        ref={dialogRef}
        role="dialog"
      >
        <div className="policy-consent-icon" aria-hidden="true">
          <ShieldCheck size={22} strokeWidth={1.6} />
        </div>
        <div>
          <span className="policy-consent-eyebrow">{t("policyConsent.eyebrow")}</span>
          <h2 id="policy-consent-title">{t("policyConsent.title")}</h2>
          <p id="policy-consent-description">{t("policyConsent.description")}</p>
        </div>

        <label className="policy-consent-option">
          <input
            checked={acceptedPolicies}
            onChange={(event) => setAcceptedPolicies(event.target.checked)}
            type="checkbox"
          />
          <span>
            {t("policyConsent.acceptPrefix")} <a href="/terms" rel="noreferrer" target="_blank">{t("policyConsent.terms")}</a>{" "}
            {t("policyConsent.and")} <a href="/privacy" rel="noreferrer" target="_blank">{t("policyConsent.privacy")}</a>{" "}
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

        <div className="policy-consent-actions">
          <a href="/app?view=support">{t("policyConsent.contact")}</a>
          <button
            disabled={!acceptedPolicies || !confirmedEligibility || isSaving}
            onClick={() => void onAccept()}
            type="button"
          >
            {isSaving ? t("common.saving") : t("policyConsent.continue")}
          </button>
        </div>
      </section>
    </div>
  );
}
