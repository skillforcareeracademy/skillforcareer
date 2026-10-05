"use client";

import { ChevronDown, FileSpreadsheet } from "lucide-react";
import {
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABEL,
  type TemplateKind,
} from "@/lib/question-csv";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A sample sheet of the kind you are about to write.
 *
 * "Provide different sample download options as per Quiz type … similarly in
 * the assignment." A teacher typing a hundred true/false questions wants a
 * sheet of true/false, not one row of each with three to delete.
 */
export function SampleSheetMenu({
  endpoint,
  label = "Sample sheet",
}: {
  /** The template route; the chosen kind is added as `?type=`. */
  endpoint: string;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="ghost">
            <FileSpreadsheet className="size-4" /> {label}
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {/* Base UI requires a label to sit inside a group — on its own it
            throws "MenuGroupContext is missing" and takes the page down. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sample sheet for…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(TEMPLATE_KINDS as readonly TemplateKind[]).map((kind) => (
            <DropdownMenuItem
              key={kind}
              render={
                <a href={`${endpoint}?type=${kind}`} download>
                  {TEMPLATE_KIND_LABEL[kind]}
                </a>
              }
            />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
