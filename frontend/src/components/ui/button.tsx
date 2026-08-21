import { cn } from "../../lib/utils";

type Variant = "default" | "destructive" | "outline" | "ghost" | "secondary";
type Size = "default" | "sm" | "lg" | "icon";

// The signature move, applied to every pill button: cyan fill + 2px white border
// + 2px PlayStation-blue outer ring + scale(1.2), all on a 180ms ease.
// Miss any of the four and the interaction signature breaks.
const SIGNATURE =
  "border-2 border-transparent relative hover:z-10 focus-visible:z-10 " +
  "hover:bg-accent hover:text-white hover:border-white hover:scale-[1.2] " +
  "hover:shadow-[0_0_0_2px_hsl(var(--primary))] " +
  "focus-visible:bg-accent focus-visible:text-white focus-visible:border-white focus-visible:scale-[1.2] " +
  "focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))] " +
  "active:opacity-60";

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground " + SIGNATURE,
  destructive: "bg-destructive text-destructive-foreground " + SIGNATURE,
  // Secondary — white fill, blue label, genuine black border.
  outline: "bg-white text-primary !border-black " + SIGNATURE,
  secondary: "bg-secondary text-secondary-foreground " + SIGNATURE,
  // Transparent ghost — nav-optimized, quiet at rest.
  ghost: "bg-transparent text-foreground !border-[#1f1f1f] " + SIGNATURE,
};

// Icon Circle lightens on hover instead of taking the scale/ring treatment, so
// controls never jump. Which surface it sits on is chosen by the variant:
// `ghost` on the black masthead, `secondary` on white panels.
const iconClasses: Record<Variant, string> = {
  ghost: "bg-white/10 text-white hover:bg-white/25",
  secondary: "bg-secondary text-foreground hover:bg-muted",
  default: "bg-primary text-primary-foreground hover:bg-accent",
  destructive: "bg-destructive text-destructive-foreground hover:bg-accent",
  outline: "bg-white text-primary border-2 border-black hover:bg-secondary",
};

const sizeClasses: Record<Size, string> = {
  // Button / CTA: 18px / 500 / 0.4px. ~48px tall keeps it WCAG AAA for touch.
  default: "h-12 px-6 text-[18px] font-medium tracking-[0.4px] rounded-full",
  // Mini CTA (in-card): 14px / 700 / 0.324px.
  sm: "h-10 px-4 text-[14px] font-bold tracking-[0.324px] rounded-full",
  // Emphasized CTA: 18px / 700 / 0.45px.
  lg: "h-14 px-8 text-[18px] font-bold tracking-[0.45px] rounded-full",
  icon: "h-10 w-10 rounded-full",
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
  const isIcon = size === "icon";
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap leading-none",
        "transition-[background-color,border-color,box-shadow,transform,opacity] duration-180 ease-out",
        "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        sizeClasses[size],
        isIcon
          ? "text-[14px] font-bold active:opacity-60 " + iconClasses[variant]
          : variantClasses[variant],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
