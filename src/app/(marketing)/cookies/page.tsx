import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Cookie policy",
  description:
    "The cookies Skill For Career Academy sets, what each one does, how long it lasts, and how to control them.",
};

const { contact } = siteConfig;
const UPDATED = "21 July 2026";

const COOKIES = [
  {
    name: "sfc_access",
    purpose: "Proves who you are on each request once you have signed in.",
    type: "Strictly necessary",
    life: "15 minutes, renewed automatically while you browse",
  },
  {
    name: "sfc_refresh",
    purpose:
      "Keeps you signed in and lets us issue a fresh access cookie without asking for your password again.",
    type: "Strictly necessary",
    life: "Until you sign out",
  },
  {
    name: "theme",
    purpose:
      "Remembers whether you chose light or dark mode. Stored in your browser's local storage, not sent to our servers.",
    type: "Preference",
    life: "Until you clear your browser data",
  },
];

const SECTIONS: LegalSection[] = [
  {
    id: "what-are-cookies",
    heading: "What cookies are",
    body: (
      <p>
        Cookies are small text files a website stores in your browser. They let a site
        recognise your browser between requests — which is how you stay signed in after
        entering your password once. Similar technologies, such as your browser&apos;s local
        storage, work the same way and are covered by this policy too.
      </p>
    ),
  },
  {
    id: "what-we-use",
    heading: "What we use",
    body: (
      <>
        <p>
          We keep this deliberately short. <strong>We do not use advertising or
          cross-site tracking cookies</strong>, and we do not run third-party analytics
          trackers on the marketing site.
        </p>
        {/* Table scrolls inside itself on narrow screens rather than pushing the page wide. */}
        <div className="mt-5 -mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs tracking-wide uppercase">
                <th scope="col" className="border-b px-3 py-2 font-semibold">
                  Name
                </th>
                <th scope="col" className="border-b px-3 py-2 font-semibold">
                  What it does
                </th>
                <th scope="col" className="border-b px-3 py-2 font-semibold">
                  Type
                </th>
                <th scope="col" className="border-b px-3 py-2 font-semibold">
                  Lifetime
                </th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name} className="align-top">
                  <td className="border-b px-3 py-3 font-mono text-xs font-medium">
                    {c.name}
                  </td>
                  <td className="text-muted-foreground border-b px-3 py-3">{c.purpose}</td>
                  <td className="text-muted-foreground border-b px-3 py-3 whitespace-nowrap">
                    {c.type}
                  </td>
                  <td className="text-muted-foreground border-b px-3 py-3">{c.life}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "why",
    heading: "Why we need them",
    body: (
      <>
        <p>The sign-in cookies do three jobs:</p>
        <ul>
          <li>keep your session alive so you are not asked to log in on every page;</li>
          <li>
            let us serve your own dashboard, batches and progress rather than someone
            else&apos;s;
          </li>
          <li>
            protect your account — they are set as <strong>httpOnly</strong>, so scripts
            running in the browser cannot read them, and as <strong>secure</strong>, so they
            travel only over an encrypted connection.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "third-party",
    heading: "Third-party cookies",
    body: (
      <>
        <p>
          A few cookies come from services we embed rather than from us. We do not control
          them, and they are set only when you use that part of the platform:
        </p>
        <ul>
          <li>
            <strong>Payment gateway</strong> — when you pay for a programme, the gateway sets
            its own cookies to run the checkout securely and prevent fraud.
          </li>
          <li>
            <strong>Embedded media</strong> — where a lesson or testimonial embeds a
            third-party video player, that provider may set cookies when the video loads.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "managing",
    heading: "Managing cookies",
    body: (
      <>
        <p>
          Every browser lets you view, block or delete cookies from its settings, and you can
          clear the theme preference by clearing site data. Two things to know before you do:
        </p>
        <ul>
          <li>
            blocking our sign-in cookies means you will not be able to log in or attend a
            class — they are not optional for the learning platform;
          </li>
          <li>
            deleting cookies signs you out of every device where you were signed in through
            that browser.
          </li>
        </ul>
        <p>
          Browsing the public pages — courses, live classes, webinars — needs no cookies at
          all.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        If we add a cookie, this table changes with it and the date at the top of the page is
        updated. For how we handle personal data more broadly, see our{" "}
        <Link href="/privacy">privacy policy</Link>, or write to{" "}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>.
      </p>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie policy"
      intro="The handful of cookies we set, what each one is for, and how to control them."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
