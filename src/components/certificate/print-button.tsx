"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the browser print dialog → "Save as PDF" for the certificate. */
export function PrintCertificateButton() {
  return (
    <Button onClick={() => window.print()} size="lg">
      <Download className="size-4" /> Download PDF
    </Button>
  );
}
