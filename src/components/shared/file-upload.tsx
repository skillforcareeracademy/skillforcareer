"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,application/pdf";

/**
 * Upload course material (PDF / Office / text / zip) and hand back the stored
 * URL. The pasted-link field stays alongside it: instructors keep a lot of
 * material on Google Drive, and both routes end up in the same field.
 */
export function FileUpload({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string;
  onChange: (url: string, name?: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /** `/api/files/<id>/course-notes.pdf` → `course-notes.pdf`. */
  const fileName = value
    ? decodeURIComponent(value.split("?")[0].split("/").pop() ?? value)
    : "";

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("File must be under 25 MB.");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "doc");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Upload failed.");
      }
      onChange(json.data.url as string, file.name);
      toast.success(`${file.name} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || disabled}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {value ? "Replace file" : "Upload file"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => onChange("")}
            disabled={uploading || disabled}
          >
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
      </div>

      {value ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{fileName}</span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          PDF, Word, PowerPoint, Excel, CSV, text or ZIP · up to 25 MB
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
