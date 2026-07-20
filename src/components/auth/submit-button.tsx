import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/** Full-width submit button with a loading spinner. */
export function SubmitButton({
  loading,
  children,
  disabled,
  className,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button
      // Base UI's Button defaults type="button"; force submit so a click
      // submits the surrounding form.
      type="submit"
      className={cn("w-full", className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
