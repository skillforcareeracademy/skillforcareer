/**
 * The voice guide, on the browser's own speech synthesiser.
 *
 * `window.speechSynthesis` ships in every current browser, costs nothing, sends
 * no audio anywhere, and needs no account — which is the only way a voice guide
 * fits the plan's "no third party" rule. Where it isn't available the callers
 * simply hide the button; nothing else changes.
 */

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Pick an Indian-English voice when the platform has one, so the guide sounds
 * like the academy rather than like an American GPS. Falls back to whatever
 * English voice exists, then to the browser default.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang.startsWith("en-IN")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

/** Say something, cancelling anything already in progress. */
export function speak(text: string): void {
  if (!speechSupported()) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  // Chrome queues utterances rather than replacing them, so without this a
  // reader who clicks through three steps hears all three back to back.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = "en-IN";
  // Marginally slower than default: this is instructional, and the stock rate
  // runs over the words a first-time user is trying to follow on screen.
  utterance.rate = 0.95;
  utterance.pitch = 1;

  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}

/**
 * Voices load asynchronously in Chrome — the first `getVoices()` returns an
 * empty list. Callers that care about the accent can wait on this once.
 */
export function warmVoices(): void {
  if (!speechSupported()) return;
  if (window.speechSynthesis.getVoices().length > 0) return;
  // The event fires once the list is populated; reading it is enough to cache.
  window.speechSynthesis.addEventListener(
    "voiceschanged",
    () => void window.speechSynthesis.getVoices(),
    { once: true },
  );
}
