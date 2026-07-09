import { cn } from "../../lib/utils";

export function Input({ className, ...props }: { className?: string; [key: string]: any }) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded border border-input bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
