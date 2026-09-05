"use client";

import { EnquiryDialog } from "./enquiry-dialog";

/**
 * "Enquiry" on a programme card — the shared popup with the card-sized trigger.
 * Kept as its own export so the several card components don't each have to
 * repeat the trigger markup.
 */
export function ProgramEnquiryDialog({ courseTitle }: { courseTitle: string }) {
  return <EnquiryDialog courseTitle={courseTitle} />;
}
