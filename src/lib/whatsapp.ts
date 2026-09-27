/**
 * The academy's WhatsApp link, from whatever an admin typed into Settings.
 *
 * Numbers arrive as "+91 98765 43210", "098765 43210" or "9876543210"; wa.me
 * wants digits with a country code and nothing else. A number too short to be
 * real returns null so the caller can drop the button rather than link to a
 * broken chat.
 */
export function whatsappDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(raw: string, text?: string): string | null {
  const digits = whatsappDigits(raw ?? "");
  if (!digits) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}
