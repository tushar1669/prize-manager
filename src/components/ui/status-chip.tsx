import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusChipVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      status: {
        draft: "bg-status-draft text-muted-foreground",
        finalized: "bg-primary/20 text-primary border border-primary/30",
        published: "bg-accent/20 text-accent-foreground border border-accent/30",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  }
);

export interface StatusChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusChipVariants> {}

export function StatusChip({ className, status, ...props }: StatusChipProps) {
  return (
    <span className={cn(statusChipVariants({ status }), className)} {...props}>
      {status}
    </span>
  );
}
