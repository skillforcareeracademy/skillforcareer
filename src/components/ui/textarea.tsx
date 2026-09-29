import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `field-sizing-content` grows the box to fit what is typed, which is what makes
 * these pleasant to write in — but it also gives the element an intrinsic width.
 * Inside a grid or a flex row, whose items refuse to shrink below their content
 * by default, a long line then pushed the whole column off a phone screen
 * ("text box out of screen jaa rha hai"). `min-w-0` lets it shrink again.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
