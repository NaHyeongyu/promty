import { useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  LifeBuoy,
  Mail,
  Search,
  Send,
} from "lucide-react";
import {
  submitSupportInquiry,
  type SupportInquiryCategory,
} from "../../api/support";
import { UnauthorizedError } from "../../api/client";
import { useI18n, type TranslationKey } from "../../i18n/I18nProvider";
import type { AuthUser } from "../../workspace/types";

type FaqItem = {
  answer: TranslationKey;
  category: TranslationKey;
  id: string;
  question: TranslationKey;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    answer: "support.faq.collectorAnswer",
    category: "support.faq.categorySetup",
    id: "collector",
    question: "support.faq.collectorQuestion",
  },
  {
    answer: "support.faq.hooksAnswer",
    category: "support.faq.categorySetup",
    id: "hooks",
    question: "support.faq.hooksQuestion",
  },
  {
    answer: "support.faq.memoryAnswer",
    category: "support.faq.categoryMemory",
    id: "memory",
    question: "support.faq.memoryQuestion",
  },
  {
    answer: "support.faq.privateAnswer",
    category: "support.faq.categoryPrivacy",
    id: "private",
    question: "support.faq.privateQuestion",
  },
  {
    answer: "support.faq.repositoryAnswer",
    category: "support.faq.categoryProjects",
    id: "repository",
    question: "support.faq.repositoryQuestion",
  },
  {
    answer: "support.faq.publicAnswer",
    category: "support.faq.categoryCommunity",
    id: "public",
    question: "support.faq.publicQuestion",
  },
  {
    answer: "support.faq.deleteAnswer",
    category: "support.faq.categoryAccount",
    id: "delete",
    question: "support.faq.deleteQuestion",
  },
];

const CATEGORY_OPTIONS: Array<{
  label: TranslationKey;
  value: SupportInquiryCategory;
}> = [
  { label: "support.category.question", value: "question" },
  { label: "support.category.bug", value: "bug" },
  { label: "support.category.feature", value: "feature" },
  { label: "support.category.privacy", value: "privacy" },
  { label: "support.category.other", value: "other" },
];

export function SupportPage({
  currentUser,
  onUnauthorized,
}: {
  currentUser: AuthUser;
  onUnauthorized: () => void;
}) {
  const { t } = useI18n();
  const [faqQuery, setFaqQuery] = useState("");
  const [category, setCategory] = useState<SupportInquiryCategory>("question");
  const [replyEmail, setReplyEmail] = useState(currentUser.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedInquiryId, setSubmittedInquiryId] = useState<string | null>(null);
  const normalizedQuery = faqQuery.trim().toLocaleLowerCase();
  const visibleFaqs = useMemo(
    () =>
      normalizedQuery
        ? FAQ_ITEMS.filter((item) =>
            `${t(item.category)} ${t(item.question)} ${t(item.answer)}`
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        : FAQ_ITEMS,
    [normalizedQuery, t],
  );

  const submitInquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setSubmittedInquiryId(null);
    setIsSubmitting(true);
    try {
      const response = await submitSupportInquiry({
        category,
        message,
        reply_email: replyEmail,
        subject,
      });
      setSubmittedInquiryId(response.id);
      setSubject("");
      setMessage("");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : t("support.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="support-page">
      <header className="support-hero">
        <div className="support-hero-icon" aria-hidden="true">
          <LifeBuoy size={26} strokeWidth={1.5} />
        </div>
        <div>
          <span className="support-kicker">{t("support.kicker")}</span>
          <h1>{t("support.title")}</h1>
          <p>{t("support.description")}</p>
        </div>
      </header>

      <div className="support-layout">
        <section className="support-faq-panel" aria-labelledby="support-faq-title">
          <div className="support-section-heading">
            <div>
              <span className="support-kicker">FAQ</span>
              <h2 id="support-faq-title">{t("support.faqTitle")}</h2>
            </div>
            <span className="support-count">{visibleFaqs.length}</span>
          </div>

          <label className="support-search">
            <Search aria-hidden="true" size={17} strokeWidth={1.5} />
            <input
              aria-label={t("support.searchLabel")}
              onChange={(event) => setFaqQuery(event.target.value)}
              placeholder={t("support.searchPlaceholder")}
              type="search"
              value={faqQuery}
            />
          </label>

          <div className="support-faq-list">
            {visibleFaqs.map((item) => (
              <details className="support-faq-item" key={item.id}>
                <summary>
                  <span>
                    <small>{t(item.category)}</small>
                    <strong>{t(item.question)}</strong>
                  </span>
                  <ChevronDown aria-hidden="true" size={18} strokeWidth={1.5} />
                </summary>
                <p>{t(item.answer)}</p>
              </details>
            ))}
            {visibleFaqs.length === 0 ? (
              <div className="support-faq-empty">
                <CircleHelp aria-hidden="true" size={24} strokeWidth={1.5} />
                <strong>{t("support.noFaqResults")}</strong>
                <span>{t("support.noFaqResultsDescription")}</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="support-contact-panel" aria-labelledby="support-contact-title">
          <div className="support-section-heading">
            <div>
              <span className="support-kicker">1:1</span>
              <h2 id="support-contact-title">{t("support.contactTitle")}</h2>
            </div>
            <Mail aria-hidden="true" size={20} strokeWidth={1.5} />
          </div>
          <p className="support-contact-description">{t("support.contactDescription")}</p>

          {submittedInquiryId ? (
            <div className="support-submit-success" role="status">
              <CheckCircle2 aria-hidden="true" size={22} strokeWidth={1.5} />
              <div>
                <strong>{t("support.submittedTitle")}</strong>
                <p>{t("support.submittedDescription", { email: replyEmail })}</p>
                <small>{t("support.reference", { id: submittedInquiryId.slice(0, 8) })}</small>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="support-submit-error" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <form className="support-form" onSubmit={submitInquiry}>
            <label>
              <span>{t("support.categoryLabel")}</span>
              <select
                onChange={(event) =>
                  setCategory(event.target.value as SupportInquiryCategory)
                }
                value={category}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{t("support.replyEmailLabel")}</span>
              <input
                autoComplete="email"
                maxLength={320}
                onChange={(event) => setReplyEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={replyEmail}
              />
              <small>{t("support.replyEmailHint")}</small>
            </label>

            <label>
              <span>{t("support.subjectLabel")}</span>
              <input
                maxLength={160}
                minLength={4}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={t("support.subjectPlaceholder")}
                required
                value={subject}
              />
            </label>

            <label>
              <span>{t("support.messageLabel")}</span>
              <textarea
                maxLength={5000}
                minLength={20}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("support.messagePlaceholder")}
                required
                rows={8}
                value={message}
              />
              <small className="support-character-count">{message.length} / 5000</small>
            </label>

            <button className="support-submit-button" disabled={isSubmitting} type="submit">
              <Send aria-hidden="true" size={17} strokeWidth={1.5} />
              <span>
                {isSubmitting ? t("support.submitting") : t("support.submit")}
              </span>
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
