import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'default' | 'primary' | 'ghost' | 'square'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

const base =
  'inline-flex items-center gap-1.5 px-[13px] py-[7px] rounded-full text-[12px] font-medium font-sans cursor-pointer whitespace-nowrap bg-bg-panel text-text-primary border border-border-strong transition-[background,border-color] duration-[140ms] ease-cubic disabled:opacity-50 disabled:cursor-default enabled:hover:border-teal-line'

const variantClass: Record<Variant, string> = {
  default: base,
  primary: cn(base, 'bg-teal-400 text-bg-base border-transparent font-semibold enabled:hover:bg-teal-300 enabled:hover:border-transparent'),
  ghost:   cn(base, 'bg-transparent border-transparent text-text-muted enabled:hover:text-text-primary enabled:hover:bg-white/[0.04]'),
  square:  cn(base, 'size-8 p-0 rounded-md justify-center text-text-muted bg-transparent border-transparent enabled:hover:bg-black/[0.05] dark:enabled:hover:bg-white/[0.06]'),
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(variantClass[variant], className)}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
