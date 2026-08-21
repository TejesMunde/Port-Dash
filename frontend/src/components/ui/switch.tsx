import { cn } from "../../lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "border-2 border-transparent transition-colors duration-180 ease-out",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))]",
        // Blue for on, Body Gray for off — the system has no green success state.
        checked ? "bg-primary" : "bg-[#6b6b6b]",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-ps-2 transition-transform duration-180 ease-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
