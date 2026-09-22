import { useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";

const toastId = "desktop-update";
export function UpdateNotification({ busy, light }: { busy: boolean; light: boolean }) {
  const [update, setUpdate] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const restarting = useRef(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.cubix.onEvent((event) => {
      if (event.event === "update") setUpdate(event.value);
    });
    void window.cubix.availableUpdate().then((id) => {
      if (active) setUpdate(id);
    }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!update || update === dismissed || busy) {
      toast.dismiss(toastId);
      return;
    }
    toast("Une mise à jour est disponible", {
      id: toastId,
      description: "Elle est prête à être installée. Redémarre Cubix pour l’appliquer.",
      duration: Infinity,
      closeButton: false,
      onDismiss: () => setDismissed(update),
      action: {
        label: "Redémarrer",
        onClick: (event) => {
          event.preventDefault();
          if (busyRef.current || restarting.current) return;
          restarting.current = true;
          void window.cubix.restartUpdate(update).catch((error) => {
            restarting.current = false;
            toast.error("Redémarrage impossible", { description: error.message });
          });
        },
      },
    });
    return () => { toast.dismiss(toastId); };
  }, [update, dismissed, busy]);
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
