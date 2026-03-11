import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-[10px] border border-border bg-card/50 px-3 py-2 text-[12px] placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/[0.08] disabled:cursor-not-allowed disabled:opacity-40 transition-colors resize-none',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
