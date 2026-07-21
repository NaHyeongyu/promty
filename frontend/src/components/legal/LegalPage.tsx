import { MarketingShell } from "../marketing/MarketingShell";
import type { ReactNode } from "react";
import "./legal.css";

type LegalDocument = "acceptable-use" | "privacy" | "security" | "terms";

const documents: Record<LegalDocument, { title: string; eyebrow: string; sections: Array<{ title: string; body: ReactNode }> }> = {
  privacy: {
    eyebrow: "LEGAL · EFFECTIVE 21 JULY 2026",
    title: "Privacy Notice",
    sections: [
      { title: "Who we are", body: <p>Promty provides project memory and collaboration tools for AI-assisted software work. Questions, access or correction requests, and privacy complaints can be sent to <a href="mailto:support@promty.org">support@promty.org</a> or through <a href="/?view=support">Support</a>.</p> },
      { title: "Information we collect", body: <><p>We collect GitHub account identifiers, username, email and avatar; authentication sessions and revocable Collector tokens; project names and repository metadata; prompts, AI responses, session events, file-change metadata and generated memory submitted through the Collector; content you choose to publish; comments, reactions and support messages; and security, device and usage records such as IP address, user agent and timestamps.</p><p>Do not submit secrets, credentials, regulated personal information, or third-party personal information you are not authorised to process.</p></> },
      { title: "How we use it", body: <p>We use information to authenticate users, operate and secure Promty, collect authorised project activity, generate and display Project Memory, provide public community features you choose to use, answer support requests, investigate abuse, meet legal obligations and improve reliability. We do not sell personal information.</p> },
      { title: "AI processing", body: <p>External AI generation is optional. If enabled, reviewed project context may be sent to the configured provider—OpenAI or Google Gemini—to generate Project Memory. The confirmation screen identifies the configured provider. Disabling this choice keeps ordinary workspace features available but blocks external AI generation. OpenAI API requests are sent with storage disabled where supported. Provider security, abuse-monitoring and legal retention may still apply.</p> },
      { title: "Sharing and overseas processing", body: <p>We use service providers including GitHub for identity and repository connections, Amazon Web Services for hosting, storage, email and backups, and—only when enabled—OpenAI or Google for AI generation. These providers may process information outside Australia, including in the United States and other locations in which they operate. We may also disclose information where legally required or necessary to protect users and the service.</p> },
      { title: "Public content", body: <p>Projects and prompt flows are private by default. If you publish content, the selected overview, generated memory, prompts, responses, images, profile identity and community interactions may become visible to other users or the public as indicated in the publishing screen. You can unpublish content, but copies already lawfully accessed by others may remain outside our control.</p> },
      { title: "Retention and deletion", body: <p>Account and project data is retained while your account or project remains active. Deleting a project removes its owned activity and memory. Deleting your account immediately removes active-database records and owned stored assets, subject to narrow legal or security exceptions. Encrypted database backups expire after 30 days. A minimal deletion identifier is kept separately for up to 35 days so a restored backup cannot recreate a deleted account. Provider-side records follow the applicable provider terms. See the account deletion screen for exact scope.</p> },
      { title: "Your choices and rights", body: <p>You can update language and connections, revoke Collector tokens, unpublish or delete projects, disable external AI processing, and permanently delete your account in Profile → Data & Privacy. You may request access to or correction of personal information, ask a retention question, or make a complaint through Support. We will verify identity before fulfilling sensitive requests and respond within a reasonable period.</p> },
      { title: "Security and complaints", body: <p>We use access controls, encryption, scoped credentials, audit records and backups, but no system is completely secure. Report security issues privately as described on the <a href="/security">Security page</a>. If a privacy complaint is not resolved, you may contact the Office of the Australian Information Commissioner.</p> },
    ],
  },
  terms: {
    eyebrow: "LEGAL · EFFECTIVE 21 JULY 2026",
    title: "Terms of Service",
    sections: [
      { title: "Eligibility and acceptance", body: <p>You must be at least 18 years old and use Promty for professional or business purposes. By accepting these Terms, you confirm that you have authority to act for yourself or the organisation you represent. If you do not agree, do not use the service.</p> },
      { title: "Your account", body: <p>Keep your GitHub account, sessions and Collector tokens secure. You are responsible for activity under your account and for promptly revoking compromised access. You must provide accurate information and comply with applicable laws and organisational policies.</p> },
      { title: "Your content", body: <p>You retain ownership of content you submit. You grant Promty a worldwide, non-exclusive licence to host, process, reproduce and display it only as needed to operate, secure and improve the service and to provide features you request. Publishing content also permits other users to view and use it as presented by the community feature. You confirm that you have all rights and permissions needed for submitted content.</p> },
      { title: "AI-generated material", body: <p>Project Memory and other generated material may be inaccurate, incomplete or similar to third-party material. Review outputs before relying on, publishing or using them. Promty does not provide legal, security or professional advice, and AI output does not replace human review.</p> },
      { title: "Acceptable use", body: <p>You must follow the <a href="/acceptable-use">Acceptable Use Policy</a>. Do not interfere with the service, access another user’s data, upload malware or secrets, violate intellectual-property or privacy rights, or use Promty for unlawful, deceptive or harmful activity.</p> },
      { title: "Third-party services", body: <p>GitHub, AWS and optional AI providers have their own terms and availability. Promty is not responsible for third-party services, and their changes may affect features. Repository access and external AI processing are separately controlled.</p> },
      { title: "Suspension and termination", body: <p>You may stop using Promty and delete your account at any time. We may restrict or suspend access where reasonably necessary for security, abuse prevention, legal compliance or material breach, and will provide notice where practical. Provisions that by nature should survive termination—including ownership, liability and dispute terms—continue to apply.</p> },
      { title: "Service and liability", body: <p>The service is provided on an “as available” basis. To the maximum extent permitted by law, Promty excludes implied guarantees that may lawfully be excluded and is not liable for indirect or consequential loss. Nothing in these Terms excludes rights or remedies that cannot be excluded under applicable law.</p> },
      { title: "Changes, law and contact", body: <p>Material changes will be presented for renewed acceptance. These Terms are governed by the laws of Queensland, Australia, and courts with jurisdiction there, subject to mandatory law. Contact <a href="mailto:support@promty.org">support@promty.org</a> with questions.</p> },
    ],
  },
  "acceptable-use": {
    eyebrow: "TRUST & SAFETY · EFFECTIVE 21 JULY 2026",
    title: "Acceptable Use Policy",
    sections: [
      { title: "Use Promty responsibly", body: <p>Promty supports legitimate professional and business software work. You are responsible for the people, data, repositories and systems affected by your use.</p> },
      { title: "Prohibited conduct", body: <ul><li>Unlawful, fraudulent, deceptive, harassing, hateful, exploitative or sexually abusive activity.</li><li>Malware, credential theft, unauthorised access, service disruption, security-control bypass or harmful automated activity.</li><li>Uploading secrets, personal information or confidential material without authorisation.</li><li>Infringing copyright, trade marks, privacy, publicity or other rights.</li><li>Publishing another person’s prompts, code or identity without permission.</li><li>Using generated output without appropriate human review where errors could cause harm.</li><li>Evading limits, suspensions, moderation or account controls.</li></ul> },
      { title: "Community content", body: <p>Only publish content you have reviewed and are authorised to share. Clearly separate factual claims from opinion, do not expose repository secrets, and respect removal requests. Report suspected violations through <a href="/?view=support">Support</a> and include the content URL and reason.</p> },
      { title: "Enforcement", body: <p>We may remove or limit content, revoke tokens, suspend accounts, preserve relevant evidence, or report conduct where reasonably necessary. We consider severity, context, repetition and risk, and provide a review path where practical.</p> },
    ],
  },
  security: {
    eyebrow: "SECURITY",
    title: "Report a vulnerability",
    sections: [
      { title: "Private reporting", body: <p>Email <a href="mailto:security@promty.org">security@promty.org</a> with a clear description, affected URL or component, reproduction steps, impact and any supporting evidence. Do not include secrets in the initial message. We aim to acknowledge reports within three business days.</p> },
      { title: "Safe research", body: <p>Use only accounts and data you control. Avoid privacy violations, destructive testing, service disruption, social engineering and automated high-volume scans. Stop testing and report promptly if you encounter user data or gain unintended access.</p> },
      { title: "What to expect", body: <p>We will validate and prioritise the report, keep you informed when practical, and coordinate disclosure after a fix. Good-faith research that follows these guidelines will not be treated as abuse. This is not a bug-bounty programme and payment is not promised.</p> },
      { title: "Account or content issues", body: <p>For compromised accounts, privacy requests, abuse or community content reports, use <a href="/?view=support">Support</a>. Do not use public issue trackers for vulnerabilities.</p> },
    ],
  },
};

export function LegalPage({ document }: { document: LegalDocument }) {
  const content = documents[document];
  return (
    <MarketingShell current="legal">
      <article className="legal-page">
        <header className="legal-hero">
          <span>{content.eyebrow}</span>
          <h1>{content.title}</h1>
          <p>Promty · Australia</p>
        </header>
        <div className="legal-layout">
          <nav aria-label={`${content.title} sections`}>
            {content.sections.map((section, index) => <a href={`#section-${index + 1}`} key={section.title}>{section.title}</a>)}
          </nav>
          <div className="legal-sections">
            {content.sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.title}>
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}
          </div>
        </div>
      </article>
    </MarketingShell>
  );
}
