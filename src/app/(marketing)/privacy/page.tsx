import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Skill For Career Academy collects, uses, shares and protects your personal data — and the choices you have over it.",
};

const { contact } = siteConfig;
const UPDATED = "21 July 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    body: (
      <>
        <p>
          Skill For Career Academy (&ldquo;Skill For Career&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) is an online and offline learning platform operated by Webeside
          Technology, with centres in Faridabad, Haryana and Greater Noida, Uttar Pradesh.
          This policy explains what we do with personal data collected through{" "}
          {siteConfig.url.replace(/^https?:\/\//, "")}, our classrooms and our support
          channels.
        </p>
        <p>
          For anything in this policy you can reach us at{" "}
          <a href={`mailto:${contact.email}`}>{contact.email}</a> or{" "}
          <a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a>.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    heading: "What we collect",
    body: (
      <>
        <p>We collect only what the platform needs to run:</p>
        <ul>
          <li>
            <strong>Account details</strong> — name, email address, phone number, password
            (stored only as a cryptographic hash), and anything you choose to add to your
            profile such as a photo, headline or bio.
          </li>
          <li>
            <strong>Enquiry details</strong> — the name, phone number, email, course
            interest and message you submit through our enquiry, callback and corporate
            proposal forms.
          </li>
          <li>
            <strong>Learning activity</strong> — enrolments, batch and attendance records,
            lesson progress, notes, bookmarks, quiz and assignment submissions, grades,
            reviews and discussion posts.
          </li>
          <li>
            <strong>Live class participation</strong> — joining times, attendance, chat
            messages, and session recordings where a class is recorded. Classes that are
            recorded are announced at the start of the session.
          </li>
          <li>
            <strong>Payment records</strong> — the amount, date, invoice and the reference
            IDs returned by our payment gateway. <strong>We never receive or store your
            card, UPI or net-banking credentials</strong>; those go directly to the gateway.
          </li>
          <li>
            <strong>Files you upload</strong> — assignment submissions, profile pictures and
            any documents you send us.
          </li>
          <li>
            <strong>Technical data</strong> — IP address, browser and device type, and
            timestamps of requests, recorded in our server logs for security and
            troubleshooting.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    heading: "How we use it",
    body: (
      <>
        <p>Your data is used to:</p>
        <ul>
          <li>create and secure your account, and keep you signed in;</li>
          <li>deliver courses, live classes, assessments and certificates;</li>
          <li>process fees, issue invoices and handle refunds;</li>
          <li>
            respond to enquiries, provide counselling and support, and share batch
            reminders, results and platform notifications;
          </li>
          <li>
            offer placement assistance — your profile is shared with a hiring partner only
            when you ask us to;
          </li>
          <li>
            understand which courses and lessons work, in aggregate, so we can improve them;
          </li>
          <li>meet our legal, tax and accounting obligations, and prevent misuse.</li>
        </ul>
        <p>
          Marketing messages about new batches or offers are sent only where you have asked
          for them or enquired with us, and every such message carries a way to opt out.
        </p>
      </>
    ),
  },
  {
    id: "legal-basis",
    heading: "Your consent",
    body: (
      <>
        <p>
          We process personal data on the basis of the consent you give when you create an
          account, enrol in a programme or submit an enquiry — and, where the law allows,
          for legitimate uses such as fulfilling a service you asked for, keeping records
          required by law and protecting the platform from misuse.
        </p>
        <p>
          You can withdraw consent at any time by writing to{" "}
          <a href={`mailto:${contact.email}`}>{contact.email}</a>. Withdrawing consent does
          not affect processing already carried out, and may mean we can no longer provide
          parts of the service.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "Who we share it with",
    body: (
      <>
        <p>
          <strong>We do not sell your personal data.</strong> We share it only with service
          providers who help us run the platform, and only to the extent they need:
        </p>
        <ul>
          <li>
            <strong>Payment gateway</strong> — to take payments and process refunds securely.
          </li>
          <li>
            <strong>Email and messaging providers</strong> — to deliver verification codes,
            receipts and notifications.
          </li>
          <li>
            <strong>Hosting and storage providers</strong> — to run the application, the
            database and uploaded files.
          </li>
          <li>
            <strong>Instructors and academy staff</strong> — trainers and counsellors see the
            learner data they need to teach and support your batch.
          </li>
          <li>
            <strong>Hiring partners</strong> — only with your explicit request or consent as
            part of placement support.
          </li>
          <li>
            <strong>Authorities</strong> — where disclosure is required by law or to protect
            our rights, learners or the public.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "certificates",
    heading: "Certificates and public verification",
    body: (
      <p>
        Certificates we issue carry a unique verification code. Anyone holding that code can
        open our verification page and see the learner&apos;s name, the programme completed
        and the issue date — that is the point of a verifiable certificate. Nothing else from
        your account is shown, and the page is not indexed or searchable by name.
      </p>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies",
    body: (
      <p>
        We use a small number of cookies, almost all of them strictly necessary to sign you
        in and keep you signed in. The full list is in our{" "}
        <Link href="/cookies">cookie policy</Link>.
      </p>
    ),
  },
  {
    id: "retention",
    heading: "How long we keep it",
    body: (
      <>
        <p>
          Account and learning records are kept for as long as your account is active, so you
          keep access to your progress and certificates. After an account is closed we retain:
        </p>
        <ul>
          <li>
            payment and invoice records for as long as tax and accounting law requires;
          </li>
          <li>
            certificate records, so an issued certificate stays verifiable for the employer
            you gave it to;
          </li>
          <li>server logs for a short period, for security investigations.</li>
        </ul>
        <p>Everything else is deleted or anonymised.</p>
      </>
    ),
  },
  {
    id: "security",
    heading: "How we protect it",
    body: (
      <p>
        Passwords are stored only as salted hashes, traffic is encrypted in transit, sessions
        use short-lived tokens, and access to learner data inside the academy is limited by
        role — a counsellor, an instructor and an administrator each see a different slice.
        No system is perfectly secure, so if we ever become aware of a breach affecting your
        data we will inform you and the relevant authority as required by law.
      </p>
    ),
  },
  {
    id: "your-rights",
    heading: "Your rights",
    body: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li>give you a copy of the personal data we hold about you;</li>
          <li>correct anything inaccurate or incomplete;</li>
          <li>
            delete your data, where we are not required to keep it for legal or accounting
            reasons;
          </li>
          <li>stop sending you marketing messages;</li>
          <li>withdraw a consent you previously gave.</li>
        </ul>
        <p>
          Write to <a href={`mailto:${contact.email}`}>{contact.email}</a> with your request
          and we will respond within a reasonable period. If you are not satisfied with how
          we handled it, you may escalate the matter to the relevant data protection
          authority.
        </p>
      </>
    ),
  },
  {
    id: "children",
    heading: "Learners under 18",
    body: (
      <p>
        Learners under 18 may use the platform only with the consent and supervision of a
        parent or guardian, who is responsible for the enrolment. If you believe a child has
        given us personal data without that consent, write to us and we will remove it.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        We update this policy when the platform or the law changes. The date at the top of
        this page always shows the current version, and material changes will be notified in
        the app or by email.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="What we collect, why we collect it, who we share it with, and the control you have over it."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
