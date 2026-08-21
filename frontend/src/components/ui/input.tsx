import { cn } from "../../lib/utils";

// Inputs are the one place the system gets genuinely compact: 3px radius against
// the 12–24px used everywhere else. Focus is a 2px blue ring — the border never
// changes colour, the ring does all the work.
export function Input({ className, ...props }: { className?: string; [key: string]: any }) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-sm border border-input bg-background px-3 py-2",
        "text-[16px] text-foreground placeholder:text-white/60",
        "transition-[border-color,box-shadow] duration-180 ease-out",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
