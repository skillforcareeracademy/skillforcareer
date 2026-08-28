import { parseCsv, toCsv } from "@/lib/csv";

/**
 * The question bank as a spreadsheet.
 *
 * Export used to hand back JSON, which is exactly what the client kept
 * reporting: "still getting json file download when i click export". A question
 * paper is a thing people write in Excel and mail around, so the exchange format
 * is a CSV that opens straight into a sheet — one row per question, options
 * across the columns, and the correct answers named by letter.
 *
 * Import reads this back, and still reads the old JSON exports, so banks
 * downloaded before this change keep working.
 */

export type QuestionKind =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "SHORT_ANSWER";

export interface BankOption {
  text: string;
  isCorrect: boolean;
}

export interface BankQuestion {
  type: QuestionKind;
  text: string;
  points: number;
  correctAnswer: string;
  explanation: string;
  options: BankOption[];
}

/** How many option columns the sheet carries — matches the 10-option ceiling. */
const MAX_OPTIONS = 10;
const LETTERS = "ABCDEFGHIJ".split("");

/** What each type is called in the sheet — plain English, not the enum name. */
const TYPE_LABELS: Record<QuestionKind, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / False",
  SHORT_ANSWER: "Short answer",
};

/**
 * Everything a person might reasonably type in the Type column. Matched after
 * lowercasing and stripping anything that isn't a letter, so "Multiple-Choice",
 * "multiple choice" and "MULTIPLE_CHOICE" all land in the same place.
 */
const TYPE_ALIASES: Record<string, QuestionKind> = {
  singlechoice: "SINGLE_CHOICE",
  single: "SINGLE_CHOICE",
  mcq: "SINGLE_CHOICE",
  radio: "SINGLE_CHOICE",
  multiplechoice: "MULTIPLE_CHOICE",
  multiple: "MULTIPLE_CHOICE",
  multiselect: "MULTIPLE_CHOICE",
  checkbox: "MULTIPLE_CHOICE",
  truefalse: "TRUE_FALSE",
  boolean: "TRUE_FALSE",
  tf: "TRUE_FALSE",
  shortanswer: "SHORT_ANSWER",
  short: "SHORT_ANSWER",
  written: "SHORT_ANSWER",
  text: "SHORT_ANSWER",
  descriptive: "SHORT_ANSWER",
  subjective: "SHORT_ANSWER",
};

export const QUESTION_CSV_HEADERS = [
  "Type",
  "Question",
  "Points",
  ...LETTERS.map((l) => `Option ${l}`),
  "Correct",
  "Model answer",
  "Explanation",
];

export function questionsToCsv(questions: BankQuestion[]): string {
  const rows = questions.map((q) => {
    const options = q.options.slice(0, MAX_OPTIONS);
    const correct = options
      .map((o, i) => (o.isCorrect ? LETTERS[i] : null))
      .filter(Boolean)
      .join(", ");

    return [
      TYPE_LABELS[q.type] ?? q.type,
      q.text,
      q.points,
      ...Array.from({ length: MAX_OPTIONS }, (_, i) => options[i]?.text ?? ""),
      correct,
      q.correctAnswer,
      q.explanation,
    ];
  });

  return toCsv(QUESTION_CSV_HEADERS, rows);
}

/** A blank sheet with one worked example of each type, to fill in and re-import. */
export function questionCsvTemplate(): string {
  return questionsToCsv([
    {
      type: "SINGLE_CHOICE",
      text: "Which code set is used for diagnoses in the United States?",
      points: 1,
      correctAnswer: "",
      explanation: "ICD-10-CM is the diagnosis code set; CPT covers procedures.",
      options: [
        { text: "CPT", isCorrect: false },
        { text: "ICD-10-CM", isCorrect: true },
        { text: "HCPCS Level II", isCorrect: false },
        { text: "NDC", isCorrect: false },
      ],
    },
    {
      type: "MULTIPLE_CHOICE",
      text: "Which of these are evaluation and management components? (choose all that apply)",
      points: 2,
      correctAnswer: "",
      explanation: "",
      options: [
        { text: "History", isCorrect: true },
        { text: "Examination", isCorrect: true },
        { text: "Medical decision making", isCorrect: true },
        { text: "Anaesthesia time", isCorrect: false },
      ],
    },
    {
      type: "TRUE_FALSE",
      text: "A modifier can change the meaning of a CPT code.",
      points: 1,
      correctAnswer: "",
      explanation: "",
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ],
    },
    {
      type: "SHORT_ANSWER",
      text: "In your own words, explain what upcoding is and why it matters.",
      points: 5,
      correctAnswer:
        "Billing a higher-paying code than the documentation supports. It inflates reimbursement and is treated as fraud.",
      explanation: "",
      options: [],
    },
  ]);
}

export interface ParsedBank {
  questions: BankQuestion[];
  /** Rows that couldn't be read, so a mostly-good sheet still lands. */
  errors: { row: number; message: string }[];
}

/** Find a column by any of several spellings, so hand-edited sheets still load. */
function pick(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const hit = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === name.toLowerCase(),
    );
    if (hit && row[hit] != null) return row[hit];
  }
  return "";
}

function normaliseType(raw: string): QuestionKind | null {
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return TYPE_ALIASES[key] ?? null;
}

/**
 * Read the "Correct" column.
 *
 * Accepts letters (`B`, `A, C`), 1-based numbers (`2`), and — for true/false —
 * the words themselves, because that is what people actually type.
 */
function correctIndexes(raw: string, optionCount: number): Set<number> {
  const picked = new Set<number>();
  for (const part of raw.split(/[,;/|]+/)) {
    const token = part.trim();
    if (!token) continue;

    const letter = token.toUpperCase();
    const byLetter = LETTERS.indexOf(letter);
    if (byLetter >= 0 && byLetter < optionCount) {
      picked.add(byLetter);
      continue;
    }
    const byNumber = Number(token);
    if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= optionCount) {
      picked.add(byNumber - 1);
      continue;
    }
    const word = token.toLowerCase();
    if (word === "true" || word === "false") {
      picked.add(word === "true" ? 0 : 1);
    }
  }
  return picked;
}

/**
 * Parse an uploaded bank.
 *
 * Takes CSV or a JSON export — the file is sniffed rather than trusted to its
 * extension, because a bank saved out of a sheet and re-saved as `.txt` is still
 * a CSV and should still import.
 */
export function parseQuestionBank(input: string): ParsedBank {
  const trimmed = input.replace(/^﻿/, "").trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonBank(trimmed);
  }
  return parseCsvBank(input);
}

function parseJsonBank(input: string): ParsedBank {
  try {
    const parsed: unknown = JSON.parse(input);
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as { questions?: unknown }).questions ?? []);
    if (!Array.isArray(list)) {
      return { questions: [], errors: [{ row: 0, message: "No questions in that file." }] };
    }
    // The API validates each question properly; this only has to get the shape
    // across, so a JSON export made before the CSV switch still imports.
    return { questions: list as BankQuestion[], errors: [] };
  } catch {
    return {
      questions: [],
      errors: [{ row: 0, message: "That file isn't a question bank." }],
    };
  }
}

function parseCsvBank(input: string): ParsedBank {
  const { rows } = parseCsv(input);
  const questions: BankQuestion[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, i) => {
    // +2: one for the header, one because people count from 1.
    const lineNo = i + 2;

    const text = pick(row, "Question", "Question text", "Text").trim();
    if (!text) return; // a blank spacer row, not an error

    const rawType = pick(row, "Type", "Question type").trim();
    const type = normaliseType(rawType);
    if (!type) {
      errors.push({
        row: lineNo,
        message: `"${rawType || "(blank)"}" isn't a question type. Use Single choice, Multiple choice, True / False or Short answer.`,
      });
      return;
    }

    const optionTexts = LETTERS.map((letter) =>
      pick(row, `Option ${letter}`, `Option${letter}`, letter).trim(),
    ).filter((t) => t !== "");

    const points = Number(pick(row, "Points", "Marks", "Score")) || 1;
    const explanation = pick(row, "Explanation", "Feedback").trim();
    const modelAnswer = pick(row, "Model answer", "Answer", "Correct answer").trim();

    if (type === "SHORT_ANSWER") {
      questions.push({
        type,
        text,
        points,
        correctAnswer: modelAnswer,
        explanation,
        options: [],
      });
      return;
    }

    // True/false rows usually leave the options blank and just say the answer.
    const options =
      optionTexts.length > 0
        ? optionTexts
        : type === "TRUE_FALSE"
          ? ["True", "False"]
          : [];

    if (options.length < 2) {
      errors.push({ row: lineNo, message: "Needs at least two options." });
      return;
    }

    const correct = correctIndexes(pick(row, "Correct", "Correct option", "Key"), options.length);
    if (correct.size === 0) {
      errors.push({
        row: lineNo,
        message: "No correct answer marked — put the option letter (A, B, …) in the Correct column.",
      });
      return;
    }
    if (correct.size > 1 && type !== "MULTIPLE_CHOICE") {
      errors.push({
        row: lineNo,
        message: "Only one option can be correct unless the type is Multiple choice.",
      });
      return;
    }

    questions.push({
      type,
      text,
      points,
      correctAnswer: "",
      explanation,
      options: options.map((t, idx) => ({ text: t, isCorrect: correct.has(idx) })),
    });
  });

  if (questions.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: "That sheet has no questions in it." });
  }

  return { questions, errors };
}
