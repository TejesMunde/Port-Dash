import { cn } from "../../lib/utils";

// Content panel, rendered as frosted glass: Shadow Black at 60% over the
// background loop, blurred and saturated behind, with a white hairline edge
// that catches the light. Radius 12px is the standard content tier.
export function Card({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) {
  return (
    <div
      className={cn(
        "bg-card/60 text-card-foreground rounded-lg border border-white/10 shadow-ps-1",
        "backdrop-blur-xl backdrop-saturate-150",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
