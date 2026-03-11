import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-[10px] border border-border bg-card/50 px-3 py-1 text-[12px] placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/[0.08] disabled:cursor-not-allowed disabled:opacity-40 transition-colors',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
