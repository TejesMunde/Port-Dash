import { cn } from "../../lib/utils";

type Variant = "default" | "destructive" | "outline" | "ghost" | "secondary";
type Size = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
  outline: "border border-border bg-transparent hover:bg-secondary active:bg-secondary/80 text-foreground",
  ghost: "hover:bg-secondary active:bg-secondary/80 text-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
};

const sizeClasses: Record<Size, string> = {
  default: "h-10 px-5 text-sm",
  sm: "h-9 px-3.5 text-xs",
  lg: "h-11 px-7 text-sm",
  icon: "h-10 w-10",
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
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium",
        "transition-colors duration-normal ease-anthropic-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-40",
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
