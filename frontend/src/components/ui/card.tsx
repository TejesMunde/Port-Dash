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
        "rounded-lg bg-card text-card-foreground",
        "transition-colors duration-normal ease-tesla",
        hoverable && "hover:bg-secondary",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
