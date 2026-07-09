import { cn } from "../../lib/utils";

export function Card({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) {
  return (
    <div className={cn("border border-border bg-card text-card-foreground rounded", className)} {...props}>
      {children}
    </div>
  );
}
