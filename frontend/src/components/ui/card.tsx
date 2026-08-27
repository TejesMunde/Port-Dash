import { cn } from "../../lib/utils";

export function Card({
  className,
  hoverable = false,
  children,
  ...props
}: {
  className?: string;
  hoverable?: boolean;
  children?: React.ReactNode;
  [key: string]: any;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        "transition-colors duration-normal ease-anthropic-out",
        hoverable && "hover:border-border/60 hover:bg-card/80",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
