/**
 * Drafting questions from a set of notes, with nothing rented.
 *
 * This is the floor under the "generate from notes" button: it reads the notes
 * the staff actually wrote and turns the sentences that carry a fact into
 * questions, so the feature works on a fresh install with no AI service
 * configured at all. When `AI_API_URL` is set the service asks the model first
 * and only lands here if the call fails — see `quiz-source-service`.
 *
 * Nothing is invented. Every question, every correct answer and every wrong
 * option is text lifted from the notes, and each question carries the sentence
 * it came from as its explanation, so whoever is building the paper can check
 * it in one read. The draft is always reviewed before it is saved.
 */

export type DraftStyle = "MIXED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

export interface DraftOption {
  text: string;
  isCorrect: boolean;
}

export interface DraftQuestion {
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  text: string;
  points: number;
  explanation: string;
  options: DraftOption[];
  /** The sentence this came from — used to avoid asking the same line twice. */
  source?: string;
}

const STOPWORDS = new Set([
  "the", "this", "that", "these", "those", "there", "here", "when", "where", "which", "while",
  "what", "with", "without", "from", "into", "onto", "about", "after", "before", "between",
  "because", "however", "therefore", "also", "such", "some", "many", "most", "more", "than",
  "then", "they", "them", "their", "your", "yours", "ours", "note", "notes", "example",
  "examples", "chapter", "unit", "topic", "important", "remember", "following", "above",
  "below", "first", "second", "third", "finally", "and", "for", "are", "was", "were", "has",
  "have", "had", "will", "would", "should", "could", "must", "may", "might", "can", "its",
  "it", "in", "on", "of", "to", "as", "by", "or", "an", "a", "is", "be", "do", "does", "did",
]);

/** Plain text out of whatever the notes were written in. */
export function plainText(raw: string): string {
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:#39|apos);/gi, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Sentences worth building a question out of. */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const stripped = line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim();
    if (!stripped) continue;
    for (const part of stripped.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)) {
      const s = part.trim().replace(/\s+/g, " ");
      // Headings, one-word bullets and whole paragraphs all make poor questions.
      if (s.length < 35 || s.length > 280) continue;
      if (s.endsWith(":")) continue;
      if (s === s.toUpperCase()) continue;
      if (s.split(" ").length < 6) continue;
      out.push(s);
    }
  }
  return [...new Set(out)];
}

interface Definition {
  term: string;
  meaning: string;
  sentence: string;
}

const DEFINITION =
  /^(?:the\s+|an?\s+)?([A-Za-z][\w\-/&.() ]{2,60}?)\s+(?:is defined as|is known as|stands for|refers to|means|is|are)\s+(.{20,200})$/i;

function definitionsOf(sentences: string[]): Definition[] {
  const defs: Definition[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    const m = DEFINITION.exec(s);
    if (!m) continue;
    const term = m[1].trim().replace(/[,;:]$/, "");
    const meaning = m[2].trim().replace(/[.;]$/, "");
    if (term.split(" ").length > 6) continue;
    if (STOPWORDS.has(term.toLowerCase())) continue;
    if (meaning.split(" ").length < 4) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    defs.push({ term, meaning, sentence: s });
  }
  return defs;
}

/** The words the notes keep coming back to — what a blank is worth hiding. */
function keyTermsOf(text: string, sentences: string[]): string[] {
  const counts = new Map<string, number>();
  const bump = (raw: string) => {
    const term = raw.trim();
    if (term.length < 3 || term.length > 40) return;
    if (STOPWORDS.has(term.toLowerCase())) return;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  };

  for (const s of sentences) {
    // Codes and abbreviations first: in this academy's notes they are the point.
    for (const m of s.matchAll(/\b[A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]{1,4})?\b/g)) bump(m[0]);
    for (const m of s.matchAll(/\b[A-Z]\d{2}(?:\.\d{1,4})?\b/g)) bump(m[0]);
    // Proper-noun phrases, skipping the word that merely starts the sentence.
    for (const m of s.matchAll(/\b[A-Z][a-z]{2,}(?:[ -][A-Z][a-z]{2,}){0,2}\b/g)) {
      if (m.index === 0) continue;
      bump(m[0]);
    }
  }
  void text;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([term]) => term);
}

function trim(text: string, max = 180): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function fromNotes(sentence: string): string {
  return `From your notes: ${trim(sentence, 240)}`;
}

/** Four options, shuffled deterministically so a re-run reads the same. */
function laidOut(correct: string[], wrong: string[], seed: number): DraftOption[] {
  const options = [
    ...correct.map((text) => ({ text: trim(text), isCorrect: true })),
    ...wrong.map((text) => ({ text: trim(text), isCorrect: false })),
  ];
  // A tiny deterministic rotation beats Math.random: two runs over the same
  // notes should produce the same paper.
  const rotate = seed % Math.max(options.length, 1);
  return [...options.slice(rotate), ...options.slice(0, rotate)];
}

function differentEnough(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/\W+/g, "");
  const y = b.toLowerCase().replace(/\W+/g, "");
  return x !== y && !x.includes(y) && !y.includes(x);
}

export function draftQuestionsFromNotes(
  raw: string,
  opts: { count: number; style: DraftStyle },
): DraftQuestion[] {
  const text = plainText(raw);
  const sentences = sentencesOf(text);
  if (sentences.length === 0) return [];

  const defs = definitionsOf(sentences);
  const terms = keyTermsOf(text, sentences);
  /** Sentences already spent, so two questions never quote the same line. */
  const spent = new Set<string>();
  const want = opts.count;

  // ── Definitions → "What is X?" ────────────────────────────────────────────
  const definitionQuestions = (): DraftQuestion[] =>
    defs.flatMap((def, i) => {
      const wrong = defs
        .filter((d) => d.term !== def.term && differentEnough(d.meaning, def.meaning))
        .map((d) => d.meaning)
        .slice(0, 3);
      if (wrong.length < 2) return [];
      const acronym = /^[A-Z][A-Z0-9-]{1,7}$/.test(def.term);
      // "diagnosis" and "status" end in s without being plural.
      const plural = /s$/.test(def.term) && !/(?:is|us|ss)$/i.test(def.term);
      return [
        {
          type: "SINGLE_CHOICE" as const,
          text: acronym
            ? `What does ${def.term} refer to?`
            : `What ${plural ? "are" : "is"} ${def.term}?`,
          points: 1,
          explanation: fromNotes(def.sentence),
          options: laidOut([def.meaning], wrong, i),
          source: def.sentence,
        },
      ];
    });

  // ── Lists → "select everything" ───────────────────────────────────────────
  const LIST_SPLIT = /\b(?:include|includes|including|such as|consists of|comprises|types of)\b/i;
  const listQuestions = (): DraftQuestion[] =>
    sentences.flatMap((sentence, i) => {
      if (!LIST_SPLIT.test(sentence) || !sentence.includes(",")) return [];
      const after = sentence.split(LIST_SPLIT).pop() ?? "";
      const items = after
        .replace(/\.$/, "")
        .split(/,|\band\b|\bor\b/i)
        .map((x) => x.trim().replace(/^(?:the|a|an)\s+/i, ""))
        .filter((x) => x.length > 2 && x.split(" ").length <= 6);
      const correct = [...new Set(items)].slice(0, 3);
      if (correct.length < 2) return [];
      const wrong = terms.filter((t) => correct.every((c) => differentEnough(c, t))).slice(0, 2);
      if (wrong.length < 1) return [];
      const subject = sentence.split(LIST_SPLIT)[0].trim();
      return [
        {
          type: "MULTIPLE_CHOICE" as const,
          text: `Select everything the notes list here: ${trim(subject, 120)}`,
          points: 1,
          explanation: fromNotes(sentence),
          options: laidOut(correct, wrong, i),
          source: sentence,
        },
      ];
    });

  // ── Key terms → fill in the blank ─────────────────────────────────────────
  const blankQuestions = (): DraftQuestion[] =>
    terms.flatMap((term, i) => {
      const sentence = sentences.find((s) => s.includes(term) && s.length > term.length + 30);
      if (!sentence) return [];
      const wrong = terms.filter((t) => differentEnough(t, term)).slice(0, 3);
      if (wrong.length < 2) return [];
      return [
        {
          type: "SINGLE_CHOICE" as const,
          text: `Fill in the blank: ${trim(sentence.split(term).join("______"), 240)}`,
          points: 1,
          explanation: fromNotes(sentence),
          options: laidOut([term], wrong, i),
          source: sentence,
        },
      ];
    });

  // ── Statements → true / false ─────────────────────────────────────────────
  const trueFalseQuestions = (): DraftQuestion[] =>
    sentences.flatMap((sentence, i) => {
      // Every other one is made false by swapping a term the notes use
      // elsewhere — wrong on the page, and checkable against the line it
      // came from, which is printed underneath.
      const term = i % 2 === 1 ? terms.find((t) => sentence.includes(t)) : undefined;
      const swap = term ? terms.find((t) => differentEnough(t, term)) : undefined;
      const falsified = term && swap ? sentence.split(term).join(swap) : null;
      return [
        {
          type: "TRUE_FALSE" as const,
          text: `True or false: ${trim(falsified ?? sentence, 240)}`,
          points: 1,
          explanation: fromNotes(sentence),
          options: [
            { text: "True", isCorrect: !falsified },
            { text: "False", isCorrect: Boolean(falsified) },
          ],
          source: sentence,
        },
      ];
    });

  const pools: DraftQuestion[][] =
    opts.style === "SINGLE_CHOICE"
      ? [definitionQuestions(), blankQuestions()]
      : opts.style === "MULTIPLE_CHOICE"
        ? [listQuestions()]
        : opts.style === "TRUE_FALSE"
          ? [trueFalseQuestions()]
          : // Mixed: a paper that is all definitions tests one skill, so the
            // kinds are taken in turn until the count is met.
            [definitionQuestions(), blankQuestions(), listQuestions(), trueFalseQuestions()];

  const out: DraftQuestion[] = [];
  const seen = new Set<string>();
  const cursors = pools.map(() => 0);

  const take = (pool: DraftQuestion[], at: number): DraftQuestion | null => {
    for (let i = at; i < pool.length; i++) {
      const q = pool[i];
      const key = q.text.toLowerCase().replace(/\W+/g, "");
      const texts = q.options.map((o) => o.text.toLowerCase());
      cursors[pools.indexOf(pool)] = i + 1;
      // A repeated question, a repeated option or a line already quoted are all
      // reasons to move on rather than to pad the paper out.
      if (seen.has(key)) continue;
      if (new Set(texts).size !== texts.length) continue;
      if (q.source && spent.has(q.source)) continue;
      seen.add(key);
      if (q.source) spent.add(q.source);
      return q;
    }
    return null;
  };

  let exhausted = false;
  while (out.length < want && !exhausted) {
    exhausted = true;
    for (let p = 0; p < pools.length && out.length < want; p++) {
      const q = take(pools[p], cursors[p]);
      if (q) {
        out.push(q);
        exhausted = false;
      }
    }
  }
  return out.map(({ source, ...q }) => ({ ...q, source }));
}
