import { Playfair_Display, Great_Vibes } from "next/font/google";

/**
 * Type for the printed awards.
 *
 * The site runs on Inter, which is right for an interface and wrong for a
 * document somebody frames. These load only on the routes that draw a
 * certificate — the two verification pages and the homepage showcase — by
 * applying `certificateFontVars` to the certificate's own wrapper rather than
 * to the root layout.
 */
export const certSerif = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-cert-serif",
  display: "swap",
});

/** The calligraphic hand used for recipients' names on the ribboned designs. */
export const certScript = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-cert-script",
  display: "swap",
});

export const certificateFontVars = `${certSerif.variable} ${certScript.variable}`;
