import { Toaster } from "sonner";

export function Toasts({ light }: { light: boolean }) {
  return <Toaster
    position="top-right"
    theme={light ? "light" : "dark"}
    offset={16}
    mobileOffset={12}
    toastOptions={{
      style: { background: "var(--surface)", color: "var(--text)", borderColor: "var(--line)" },
      actionButtonStyle: { background: "var(--accent)", color: "white" },
    }}
  />;
}
