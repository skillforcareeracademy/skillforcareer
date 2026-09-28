"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sends the report card to the printer, where every browser offers "Save as
 * PDF". Nothing is generated on the server — the sheet the office keeps is
 * exactly the sheet on screen.
 */
export function PrintReportButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
