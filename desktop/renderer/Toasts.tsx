import { Toaster } from "sonner";

/** Sonner on the popover tokens, like the shadcn wrapper. */
export function Toasts({ light }: { light: boolean }) {
  return (
    <Toaster
      position="top-right"
      theme={light ? "light" : "dark"}
      offset={16}
      mobileOffset={12}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans",
          description: "text-muted-foreground!",
          actionButton: "bg-primary! text-primary-foreground!",
        },
      }}
    />
  );
}
