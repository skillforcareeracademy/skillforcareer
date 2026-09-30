import Script from "next/script";
import type { Tracking } from "@/server/services/tracking-service";

/**
 * The Google tags for the whole site, built from whatever Admin > Settings >
 * Integrations holds. Nothing here is hard-coded: with no IDs saved this
 * renders nothing at all and the site loads no third-party script.
 *
 * `afterInteractive` is what Google's own Next.js guidance uses for both tags —
 * early enough to catch the page view, late enough not to block the page.
 *
 * Search Console's verification is *not* here: it has to be a `<meta>` in the
 * head, which the root layout emits through `metadata.verification.google`.
 */
export function SiteTracking({ tracking }: { tracking: Tracking }) {
  const { gaMeasurementId, gtmContainerId } = tracking;
  if (!gaMeasurementId && !gtmContainerId) return null;

  return (
    <>
      {gtmContainerId && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmContainerId}');`}
        </Script>
      )}

      {gaMeasurementId && (
        <>
          <Script
            id="ga-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
          />
          {/* Google's standard snippet. Page views after a client-side
              navigation are left to GA4's enhanced measurement, which watches
              history changes and is on by default — sending them from here as
              well would count every page twice. */}
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaMeasurementId}');`}
          </Script>
        </>
      )}
    </>
  );
}

/**
 * Tag Manager's fallback for browsers with JavaScript off. It has to sit at the
 * very top of `<body>`, which is why it is separate from the script above.
 */
export function SiteTrackingNoScript({ tracking }: { tracking: Tracking }) {
  if (!tracking.gtmContainerId) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${tracking.gtmContainerId}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
