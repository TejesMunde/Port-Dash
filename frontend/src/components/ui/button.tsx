import { cn } from "../../lib/utils";

type Variant = "default" | "destructive" | "outline" | "ghost" | "secondary";
type Size = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  default: "bg-foreground text-background hover:bg-foreground/90",
  destructive: "bg-red-600 text-white hover:bg-red-500",
  outline: "border border-border bg-background hover:bg-secondary",
  ghost: "hover:bg-secondary",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

const sizeClasses: Record<Size, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6 text-sm",
  icon: "h-8 w-8",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  disabled,
  children,
  ...props
}: {
  className?: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  children?: React.ReactNode;
  [key: string]: any;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
