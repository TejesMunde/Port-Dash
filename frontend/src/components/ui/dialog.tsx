import React, { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

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

  // Split children: trigger renders outside <dialog> so it survives when closed.
  // Content renders inside <dialog> and is gated on `open`.
  const triggerChild = React.Children.toArray(children).find(
    (c) => React.isValidElement(c) && c.type === DialogTrigger
  );
  const otherChildren = React.Children.toArray(children).filter(
    (c) => !(React.isValidElement(c) && c.type === DialogTrigger)
  );

  return (
    <>
      {triggerChild}
      <dialog
        ref={ref}
        className={cn(
          "backdrop:bg-black/70 backdrop:backdrop-blur-sm",
          "open:animate-dialog-in"
        )}
        style={{
          maxWidth: "min(32rem, calc(100vw - 2rem))",
          width: "100%",
          margin: "auto",
          padding: 0,
          border: "1px solid hsl(var(--border))",
          borderRadius: "0.75rem",
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
        }}
      >
        {open && otherChildren}
      </dialog>
    </>
  );
}

export function DialogTrigger({ children, asChild: _asChild }: { children: React.ReactElement; asChild?: boolean }) {
  return children;
}

export function DialogContent({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function DialogHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex flex-col space-y-1 p-6 pb-0", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex justify-end gap-2 p-6 pt-4", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <h2 className={cn("text-lg font-semibold font-display", className)}>{children}</h2>;
}
