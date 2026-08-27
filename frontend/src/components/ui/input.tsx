import { cn } from "../../lib/utils";

export function Input({ className, ...props }: { className?: string; [key: string]: any }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded border border-input bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground",
        "transition-colors duration-normal ease-ferrari",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    />
  );
}
