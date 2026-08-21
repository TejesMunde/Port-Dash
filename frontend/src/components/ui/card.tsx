import { cn } from "../../lib/utils";

// Content panel. On the light surfaces of the original system these are separated
// by shadow alone, but drop shadows do no work on Console Black — so panels lift
// off the page by luminance (Shadow Black on black) plus a Deep Charcoal hairline.
// Radius 12px is the standard content tier.
export function Card({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) {
  return (
    <div
      className={cn("bg-card text-card-foreground rounded-lg border border-border shadow-ps-1", className)}
      {...props}
    >
      {children}
    </div>
  );
}
