import { useEffect, useRef } from "react";

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = () => onOpenChange(false);
    el.addEventListener("close", close);
    return () => el.removeEventListener("close", close);
  }, [onOpenChange]);

  return (
    <dialog
      ref={ref}
      className="backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex"
      style={{
        maxWidth: "32rem",
        width: "100%",
        margin: "auto",
        padding: 0,
        border: "1px solid hsl(var(--border))",
        borderRadius: "0.375rem",
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
      }}
    >
      {open && children}
    </dialog>
  );
}

export function DialogTrigger({ children, asChild: _asChild }: { children: React.ReactElement; asChild?: boolean }) {
  return children;
}

export function DialogContent({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function DialogHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex flex-col space-y-1 p-5 pb-0", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex justify-end gap-2 p-5 pt-3", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <h2 className={cn("text-base font-semibold", className)}>{children}</h2>;
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
