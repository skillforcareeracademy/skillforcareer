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
 * The Indian-English voices each platform ships, by name.
 *
 * The Web Speech API has no gender field — a voice is a name and a language
 * tag and nothing else — so wanting "an Indian female voice" means knowing
 * which names those are. These are the ones that actually exist in the wild:
 * Heera and Neerja on Windows, Veena and Isha on Apple, Kajal on Android, and
 * the generic "female" naming Chrome uses for its own set.
 */
const FEMALE_INDIAN = [
  // Apple — `say -v '?'` on a current Mac lists Aman, Rishi and Tara as its
  // Indian English voices; Tara is the only woman among them, and missing her
  // off this list is what had the guide speaking as Aman.
  "tara",
  "veena", // older macOS
  "isha", // iOS
  "sangeeta", // older macOS
  "lekha", // Apple hi-IN, reads English with an Indian accent
  // Microsoft
  "heera", // Windows, en-IN
  "neerja", // Windows natural, en-IN
  // Android / Google
  "kajal",
  "swara",
  "ananya",
  "shruti",
];

/**
 * The male ones, so a fallback never lands on one by accident.
 *
 * Worth keeping as complete as the list above: an unknown name scores as
 * neither, and on a machine whose only woman's voice was unlisted the guide
 * picked a man's simply because his name sorted first.
 */
const MALE_INDIAN = [
  "aman", // Apple, en-IN
  "rishi", // Apple, en-IN
  "neel", // Apple, hi-IN
  "ravi", // Windows, en-IN
  "prabhat", // Windows natural, en-IN
  "hemant",
  "madhur",
  "aarav",
  "arjun",
  "kiran",
];

/** Names that mark a voice female on platforms that say so in the label. */
const FEMALE_HINT = ["female", "woman"];
const MALE_HINT = ["male", "man"];

const has = (haystack: string, needles: string[]) =>
  needles.some((n) => haystack.includes(n));

/**
 * How well a voice matches "an accurate Indian female voice", higher is better.
 *
 * Scored rather than picked by a chain of fallbacks, because the right answer
 * differs per platform and no single rule finds it everywhere: the accent
 * matters most, the gender next, and a "natural"/online voice is worth
 * preferring over the robotic local one where both exist.
 */
function score(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase().replace("_", "-");

  // Anything that is not English is worse than any English voice: the tour is
  // written in English and a Hindi engine mangles it.
  if (!lang.startsWith("en")) return -1;

  let points = 0;
  if (lang === "en-in" || lang.startsWith("en-in")) points += 100;

  if (has(name, FEMALE_INDIAN)) points += 50;
  else if (has(name, FEMALE_HINT)) points += 40;
  else if (has(name, MALE_INDIAN) || has(name, MALE_HINT)) points -= 60;

  // Microsoft and Google both label their better voices this way, and they
  // are markedly less robotic than the offline set.
  if (name.includes("natural") || name.includes("online")) points += 10;
  if (!voice.localService) points += 5;

  return points;
}

/** Remembered once resolved — `getVoices()` is not cheap and never changes. */
let chosen: SpeechSynthesisVoice | null = null;

/**
 * A voice the academy has named in Settings, which wins over the scoring when
 * the device actually has it. No list of names can know every voice on every
 * machine; this is how a wrong guess is corrected without a release.
 */
let preferred = "";

export function setPreferredVoice(name: string): void {
  const next = name.trim();
  if (next === preferred) return;
  preferred = next;
  chosen = null; // re-resolve against the new preference
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  if (chosen) return chosen;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  if (preferred) {
    const named = voices.find(
      (v) => v.name.toLowerCase() === preferred.toLowerCase(),
    );
    if (named) {
      chosen = named;
      return chosen;
    }
  }

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const value = score(voice);
    if (value > bestScore) {
      best = voice;
      bestScore = value;
    }
  }
  // A negative best means every voice on the machine is non-English; the
  // browser default will do better than forcing one of them.
  chosen = bestScore >= 0 ? best : null;
  return chosen;
}

/** Which voice the guide will use, for anywhere that wants to show it. */
export function currentVoiceName(): string | null {
  return pickVoice()?.name ?? null;
}

/** Every voice this browser offers, for the picker in Settings. */
export function availableVoices(): { name: string; lang: string }[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .map((v) => ({ name: v.name, lang: v.lang }))
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
}

function utter(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();

  if (voice) {
    utterance.voice = voice;
    // Match the utterance to the voice. Asking an en-GB engine to speak
    // "en-IN" makes some platforms ignore the voice and fall back.
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-IN";
  }

  // Marginally slower than default: this is instructional, and the stock rate
  // runs over the words a first-time user is trying to follow on screen.
  utterance.rate = 0.95;
  // A touch above neutral sits better on the Indian female voices without
  // tipping into the cartoonish.
  utterance.pitch = 1.05;

  window.speechSynthesis.speak(utterance);
}

/** Say something, cancelling anything already in progress. */
export function speak(text: string): void {
  if (!speechSupported()) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  // Chrome queues utterances rather than replacing them, so without this a
  // reader who clicks through three steps hears all three back to back.
  window.speechSynthesis.cancel();

  // Chrome populates the voice list asynchronously, and the very first thing
  // the tour says is usually spoken before it arrives — which is how the guide
  // ended up in an American accent for exactly one sentence. Wait for the list
  // rather than speak with whatever is to hand.
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => utter(trimmed),
      { once: true },
    );
    return;
  }

  utter(trimmed);
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
  if (window.speechSynthesis.getVoices().length > 0) {
    pickVoice();
    return;
  }
  window.speechSynthesis.addEventListener("voiceschanged", () => pickVoice(), {
    once: true,
  });
}
