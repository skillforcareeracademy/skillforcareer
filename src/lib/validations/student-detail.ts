import { z } from "zod";

/**
 * The learner's onboarding form — the long one admissions asks for once the
 * seat is confirmed.
 *
 * Every field is optional so the form can be saved half-finished and come back
 * to; what makes it *complete* is decided by `COMPLETION_FIELDS` below, which is
 * also what the "your profile is incomplete" notice counts against.
 */

const text = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const JOB_STATUSES = [
  { value: "FRESHER", label: "Fresher" },
  { value: "WORKING", label: "Working" },
  { value: "LOOKING", label: "Looking for a job" },
  { value: "STUDYING", label: "Still studying" },
] as const;

export const WORK_MODES = [
  { value: "ONSITE", label: "From the office" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
] as const;

export const ID_PROOF_TYPES = [
  { value: "PAN", label: "PAN card" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DL", label: "Driving licence" },
  { value: "VOTER", label: "Voter ID" },
  { value: "OTHER", label: "Something else" },
] as const;

export const GENDERS = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "OTHER", label: "Prefer to self-describe" },
  { value: "UNSAID", label: "Prefer not to say" },
] as const;

const money = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const num = typeof v === "number" ? v : Number(String(v).replace(/[, ₹]/g, ""));
    return Number.isFinite(num) && num >= 0 ? num : undefined;
  });

export const studentDetailSchema = z.object({
  whatsapp: text(20),
  alternatePhone: text(20),
  addressLine: text(500),
  city: text(80),
  state: text(80),
  pincode: text(12),
  country: text(60),

  gender: text(20),
  fatherName: text(120),
  guardianPhone: text(20),
  aadhaarNumber: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^[0-9\s-]{12,20}$/.test(v), "Aadhaar is 12 digits")
    .optional()
    .or(z.literal("")),
  aadhaarUrl: text(500),
  idProofType: text(20),
  idProofNumber: text(40),
  idProofUrl: text(500),

  highestQualification: text(120),
  specialization: text(120),
  collegeName: text(160),
  passingYear: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "" || v === null) return undefined;
      const year = Number(v);
      return Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : undefined;
    }),
  marksPercent: text(20),
  cvUrl: text(500),
  cvName: text(200),

  jobStatus: text(20),
  currentCompany: text(160),
  currentRole: text(120),
  experienceYears: text(20),
  currentPackage: money,
  expectedPackage: money,
  preferredLocations: text(200),
  preferredMode: text(20),
  willingToRelocate: z.boolean().optional(),
  openToPlacement: z.boolean().optional(),

  /** True when the learner is finishing the form rather than saving a draft. */
  submit: z.boolean().optional(),
});

export type StudentDetailInput = z.infer<typeof studentDetailSchema>;

/**
 * What the academy counts as a finished profile. The notice on the learner's
 * dashboard nags until every one of these is filled, and the office sees the
 * same percentage on the profile.
 */
export const COMPLETION_FIELDS = [
  { key: "whatsapp", label: "WhatsApp number" },
  { key: "addressLine", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "PIN code" },
  { key: "aadhaarNumber", label: "Aadhaar number" },
  { key: "aadhaarUrl", label: "Aadhaar copy" },
  { key: "idProofUrl", label: "Photo ID" },
  { key: "highestQualification", label: "Highest qualification" },
  { key: "collegeName", label: "College or school" },
  { key: "passingYear", label: "Year of passing" },
  { key: "cvUrl", label: "CV" },
  { key: "jobStatus", label: "Job status" },
  { key: "preferredLocations", label: "Preferred locations" },
] as const;

/** Fields the learner can no longer change once the form is in. */
export const LOCKED_AFTER_SUBMIT = [
  "aadhaarNumber",
  "aadhaarUrl",
  "idProofType",
  "idProofNumber",
  "idProofUrl",
  "fatherName",
  "highestQualification",
  "collegeName",
  "passingYear",
  "marksPercent",
] as const;
