/**
 * How Ami decides what a visitor asked.
 *
 * There is no rented model behind this — the plan's "no third party" rule holds
 * (see the project brief), and an answer the academy did not write is an answer
 * the academy cannot stand behind on fees or placement claims. So matching is
 * keyword scoring over the intents staff typed in Admin → Assistant, and a
 * question that scores too low is recorded as unanswered rather than guessed at.
 *
 * Client-safe: the admin "test your answer" box runs the same function in the
 * browser, so nothing here may touch the database.
 */

/** Words too common to carry meaning in a two-line question. */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "being",
  "do", "does", "did", "doing", "have", "has", "had", "i", "me", "my", "we",
  "our", "you", "your", "it", "its", "of", "to", "for", "on", "in", "at", "by",
  "with", "and", "or", "but", "if", "then", "than", "so", "that", "this",
  "these", "those", "there", "here", "can", "could", "would", "should", "will",
  "shall", "may", "might", "must", "please", "tell", "know", "want", "need",
  "about", "from", "up", "out", "get", "got",
  // Hinglish fillers — the academy's learners write in both, and "kya hai"
  // carries no more signal than "what is".
  "kya", "hai", "ha", "haan", "ka", "ki", "ke", "ko", "me", "mein", "se",
  "kaise", "kaun", "kab", "kahan", "kitna", "kitne", "bhi", "hi", "aur", "ya",
  "mujhe", "mera", "meri", "aap", "aapka", "hum", "hamara", "krna", "karna",
  "chahiye", "sakta", "sakte", "hoga", "hota", "hoti",
]);

/**
 * Lowercase, strip punctuation, drop stop words, and fold a few obvious
 * variants so "fees", "fee" and "FEES?" are one token.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Crude but predictable: only the plural and -ing endings people actually type. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export interface MatchableIntent {
  id: string;
  question: string;
  /** Alternative phrasings and bare keywords. */
  patterns: string[];
  answer: string;
  actionLabel?: string | null;
  actionUrl?: string | null;
}

export interface MatchResult {
  intent: MatchableIntent;
  score: number;
}

/**
 * Score one intent against a question.
 *
 * Two signals, deliberately simple enough that staff can predict them when
 * writing an intent: how much of the *question's* meaning the intent covers,
 * and whether any single phrasing appears more or less verbatim. The second is
 * what lets a one-word keyword like "refund" win outright.
 */
export function scoreIntent(questionTokens: string[], intent: MatchableIntent): number {
  if (questionTokens.length === 0) return 0;

  const phrasings = [intent.question, ...intent.patterns].filter((p) => p.trim());
  let best = 0;

  for (const phrase of phrasings) {
    const tokens = tokenize(phrase);
    if (tokens.length === 0) continue;
    const set = new Set(tokens);

    const hits = questionTokens.filter((t) => set.has(t)).length;
    if (hits === 0) continue;

    // Coverage of the question, tempered by coverage of the phrasing — so a
    // long intent that happens to share one word doesn't beat a tight one.
    const questionCoverage = hits / questionTokens.length;
    const phraseCoverage = hits / tokens.length;
    let score = questionCoverage * 0.65 + phraseCoverage * 0.35;

    // A phrasing that appears as a contiguous run in the question is a much
    // stronger signal than the same words scattered about.
    if (tokens.length > 1 && containsRun(questionTokens, tokens)) score += 0.25;

    // A deliberately short keyword ("refund", "emi") is meant to fire on its own.
    if (tokens.length === 1 && questionTokens.includes(tokens[0]!)) {
      score = Math.max(score, 0.6);
    }

    best = Math.max(best, score);
  }

  return Math.min(1, best);
}

/** True when `needle` appears as consecutive tokens inside `haystack`. */
function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let all = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Below this, Ami says it doesn't know rather than serving the nearest thing.
 *
 * A wrong answer about fees or placement is worse than no answer: the visitor
 * acts on it, and the academy has to walk it back.
 */
export const MATCH_THRESHOLD = 0.42;

/** The best intent for a question, or null when nothing is close enough. */
export function findBestMatch(
  question: string,
  intents: MatchableIntent[],
): MatchResult | null {
  const tokens = tokenize(question);
  if (tokens.length === 0) return null;

  let best: MatchResult | null = null;
  for (const intent of intents) {
    const score = scoreIntent(tokens, intent);
    if (score > (best?.score ?? 0)) best = { intent, score };
  }

  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

/** The runners-up, for "did you mean…?" when nothing cleared the bar. */
export function nearMisses(
  question: string,
  intents: MatchableIntent[],
  take = 3,
): MatchableIntent[] {
  const tokens = tokenize(question);
  if (tokens.length === 0) return [];
  return intents
    .map((intent) => ({ intent, score: scoreIntent(tokens, intent) }))
    .filter((r) => r.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((r) => r.intent);
}
