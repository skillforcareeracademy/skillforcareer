import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The terms on which Skill For Career Academy provides courses, live classes, certificates and placement support.",
};

const { contact } = siteConfig;
const UPDATED = "21 July 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    heading: "This agreement",
    body: (
      <p>
        These terms govern your use of Skill For Career Academy — our website, learning
        platform, live classes and offline sessions. By creating an account, enrolling in a
        programme or attending a class, you accept them. If you are enrolling on behalf of a
        company, you confirm you are authorised to accept these terms for it.
      </p>
    ),
  },
  {
    id: "accounts",
    heading: "Your account",
    body: (
      <>
        <ul>
          <li>Give accurate details when you register, and keep them up to date.</li>
          <li>
            Your account is personal. Do not share your password or let anyone else attend
            classes in your place — accounts found to be shared may be suspended.
          </li>
          <li>
            You are responsible for activity under your account. Tell us immediately if you
            suspect unauthorised access.
          </li>
          <li>
            Learners under 18 need a parent or guardian to enrol on their behalf and to
            accept these terms.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "enrolment",
    heading: "Enrolment, fees and payments",
    body: (
      <>
        <ul>
          <li>
            Fees, inclusions and the duration of access for each programme are shown on its
            course page or in the proposal shared with you, and are payable in Indian rupees
            unless agreed otherwise.
          </li>
          <li>
            Payments are processed by our payment gateway. Your enrolment is confirmed once
            payment succeeds and you receive a receipt.
          </li>
          <li>
            Where a programme is offered in instalments, access may be paused if an
            instalment falls due and remains unpaid.
          </li>
          <li>
            We may revise fees for future enrolments at any time. A change never affects a
            programme you have already paid for.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "refunds",
    heading: "Refunds and cancellations",
    body: (
      <p>
        Refunds are governed by the refund policy shared with you at the time of enrolment
        and are processed only where the conditions in that policy are met. Once approved, a
        refund is returned to the original payment method, and we will keep you updated on
        its status. For any fee, receipt or refund question, contact us at{" "}
        <a href={`mailto:${contact.email}`}>{contact.email}</a> or{" "}
        <a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a>.
      </p>
    ),
  },
  {
    id: "access",
    heading: "Course access and licence",
    body: (
      <>
        <p>
          On enrolment we grant you a personal, non-exclusive, non-transferable licence to
          access the programme&apos;s content for your own learning, for the access period
          stated for that programme. You may not:
        </p>
        <ul>
          <li>
            record, screen-capture, download or re-publish class content except where we
            explicitly provide a download;
          </li>
          <li>share, resell or distribute course material, notes or recordings;</li>
          <li>use our content to run a competing training programme.</li>
        </ul>
      </>
    ),
  },
  {
    id: "live-classes",
    heading: "Live and offline classes",
    body: (
      <>
        <ul>
          <li>
            Batch schedules, timings and instructors are published in advance. We may change
            them where necessary and will tell you as early as we can.
          </li>
          <li>
            Sessions may be recorded so learners can catch up. Joining a recorded session
            means you agree to appear in that recording.
          </li>
          <li>
            Behave respectfully towards instructors and other learners. Disruptive or abusive
            conduct can result in removal from a class or from the platform.
          </li>
          <li>
            At our centres, please follow the academy&apos;s rules for visitors and the local
            timings.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "certificates",
    heading: "Certificates",
    body: (
      <p>
        A certificate is issued when you meet the completion criteria for a programme —
        typically attendance, assessments and assignments. Each certificate carries a
        verification code so an employer can confirm it is genuine. We may revoke a
        certificate obtained through impersonation, plagiarism or any other misrepresentation.
      </p>
    ),
  },
  {
    id: "placement",
    heading: "Placement support",
    body: (
      <p>
        We provide placement assistance — interview preparation, profile guidance and
        introductions to our hiring-partner network.{" "}
        <strong>This is support, not a guarantee of employment.</strong> Hiring decisions rest
        entirely with the employer, and depend on your performance in their process.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>While using the platform, do not:</p>
        <ul>
          <li>impersonate anyone, or submit work that is not your own;</li>
          <li>
            attempt to break, probe or overload the platform, or access data that is not
            yours;
          </li>
          <li>scrape, copy or mirror the platform or its content;</li>
          <li>
            post anything unlawful, abusive, misleading or infringing in discussions, reviews
            or submissions;
          </li>
          <li>use the platform for anything unlawful.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    heading: "Content you post",
    body: (
      <p>
        You keep ownership of the assignments, discussion posts and reviews you submit. By
        posting them, you allow us to host, display and use them to run and improve the
        platform — for example, showing your review on a course page. We may remove content
        that breaks these terms.
      </p>
    ),
  },
  {
    id: "ip",
    heading: "Our intellectual property",
    body: (
      <p>
        Course material, recordings, notes, assessments, the platform itself and the Skill For
        Career name and logo belong to us or our licensors. Nothing in these terms transfers
        any of those rights to you.
      </p>
    ),
  },
  {
    id: "suspension",
    heading: "Suspension and termination",
    body: (
      <p>
        We may suspend or close an account that breaches these terms, that is used
        fraudulently, or where required by law. You can ask us to close your account at any
        time; fees already paid remain subject to the refund policy, and see our{" "}
        <Link href="/privacy">privacy policy</Link> for what happens to your data.
      </p>
    ),
  },
  {
    id: "disclaimers",
    heading: "Disclaimers and liability",
    body: (
      <>
        <p>
          We work to keep the platform available and the content accurate and current, but we
          provide it &ldquo;as is&rdquo;. We do not warrant uninterrupted access — maintenance,
          connectivity and third-party outages happen — nor any particular career outcome.
        </p>
        <p>
          To the extent permitted by law, our total liability arising out of or in connection
          with a programme is limited to the fees you paid us for that programme, and we are
          not liable for indirect or consequential losses.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    heading: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of India. Disputes are subject to the exclusive
        jurisdiction of the courts at Faridabad, Haryana.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <p>
        We may update these terms as our programmes and the law evolve. The date at the top of
        this page shows the current version; continuing to use the platform after an update
        means you accept it. Questions? Write to{" "}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={`The rules for using ${siteConfig.name} — enrolment, fees, class conduct, certificates and what you can expect from us.`}
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
