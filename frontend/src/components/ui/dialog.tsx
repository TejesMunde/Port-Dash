import { Children, cloneElement, createContext, useContext, useEffect, useRef } from "react";
import type { ReactElement } from "react";

const OpenChangeCtx = createContext<(v: boolean) => void>(() => {});

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

  // The trigger must render outside <dialog> and regardless of `open`,
  // otherwise there is nothing left on the page to open the dialog with.
  const kids = Children.toArray(children) as ReactElement[];
  const trigger = kids.find((k) => k && k.type === DialogTrigger);
  const content = kids.filter((k) => k !== trigger);

  return (
    <OpenChangeCtx.Provider value={onOpenChange}>
      {trigger}
      <dialog
        ref={ref}
        className="backdrop:bg-black/80 open:flex shadow-ps-4"
        style={{
          // min() keeps a 16px gutter on phones; 32rem is the desktop cap.
          maxWidth: "min(32rem, calc(100vw - 2rem))",
          width: "100%",
          margin: "auto",
          padding: 0,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          // 24px — the hero/feature tier of the radius scale.
          borderRadius: "24px",
          background: "rgba(18, 19, 20, 0.68)",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
          color: "hsl(var(--card-foreground))",
        }}
      >
        {open && content}
      </dialog>
    </OpenChangeCtx.Provider>
  );
}

export function DialogTrigger({ children }: { children: ReactElement; asChild?: boolean }) {
  const onOpenChange = useContext(OpenChangeCtx);
  return cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      onOpenChange(true);
    },
  } as any);
}

export function DialogContent({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function DialogHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex flex-col space-y-2 p-6 sm:p-8 sm:pb-0 pb-0", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex justify-end gap-3 p-6 sm:p-8 pt-4", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <h2 className={cn("display text-[22px] sm:text-[28px] tracking-[0.1px]", className)}>{children}</h2>;
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
