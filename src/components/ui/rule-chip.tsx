import { Lock, AlertCircle, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RuleChipProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: "lock" | "alert" | "trend" | "users";
  locked?: boolean;
}

export function RuleChip({ icon, locked, className, children, ...props }: RuleChipProps) {
  const icons = {
    lock: Lock,
    alert: AlertCircle,
    trend: TrendingUp,
    users: Users,
  };

  const Icon = icon ? icons[icon] : null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
        "bg-muted text-muted-foreground border border-border",
        locked && "opacity-60",
        className
      )}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
      {locked && <Lock className="h-3 w-3 ml-1" />}
    </div>
  );
}
