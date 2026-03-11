import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center text-[10px] font-semibold tracking-[0.09em] uppercase',
  {
    variants: {
      variant: {
        default:
          'rounded-[5px] px-2 py-0.5 bg-primary/[0.08] text-primary border border-primary/[0.22]',
        secondary:
          'rounded-[5px] px-2 py-0.5 bg-white/[0.04] text-white/[0.35] border border-white/10',
        destructive:
          'rounded-[5px] px-2 py-0.5 bg-destructive/[0.08] text-destructive border border-destructive/[0.22]',
        outline:
          'rounded-[5px] px-2 py-0.5 border border-border text-muted-foreground',
        success:
          'rounded-[5px] px-2 py-0.5 bg-success/[0.08] text-success border border-success/[0.22]',
        warning:
          'rounded-[5px] px-2 py-0.5 bg-warning/[0.08] text-warning border border-warning/[0.22]',
        info:
          'rounded-[5px] px-2 py-0.5 bg-info/[0.08] text-info border border-info/[0.22]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
