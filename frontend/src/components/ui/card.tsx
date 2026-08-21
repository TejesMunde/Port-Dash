import { cn } from "../../lib/utils";

// Content panel: separated from its neighbours by spacing and a feather-weight
// shadow rather than a border. Radius 12px is the standard content tier.
export function Card({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) {
  return (
    <div className={cn("bg-card text-card-foreground rounded-lg shadow-ps-1", className)} {...props}>
      {children}
    </div>
  );
}
