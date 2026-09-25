import { useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";

const toastId = "desktop-update";
const checkId = "desktop-update-check";
let checking = false;
const reason = (error: any) =>
  String(error?.message ?? error).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "");
function UpdateProgress({ percent }: { percent: number }) {
  return (
    <span className="update-progress">
      <span className="update-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="mono">{percent} %</span>
    </span>
  );
}
/** Shortcut check: download a newer release with a persistent progress toast, then restart into it
 * once no solve is running; otherwise say that Cubix is up to date. */
export async function checkForUpdates(busy: () => boolean) {
  if (checking) return;
  checking = true;
  const persistent = { id: checkId, duration: Infinity, dismissible: false, closeButton: false };
  toast.loading("Recherche de mises à jour…", { ...persistent, description: undefined });
  const unsubscribe = window.cubix.onEvent((event) => {
    if (event.event !== "update-progress") return;
    toast.dismiss(toastId);
    toast.loading("Téléchargement de la mise à jour", {
      ...persistent,
      description: <UpdateProgress percent={event.value} />,
    });
  });
  try {
    const result = await window.cubix.installUpdate();
    if (result.status === "ready") {
      toast.dismiss(toastId);
      toast.loading("Redémarrage de Cubix…", {
        ...persistent,
        description: busy() ? "Après la résolution en cours." : undefined,
      });
      while (busy()) await new Promise((resolve) => setTimeout(resolve, 200));
      await window.cubix.restartUpdate(result.id);
    } else
      toast(result.status === "none" ? "Aucune mise à jour disponible" : "Mises à jour indisponibles", {
        id: checkId,
        description:
          result.status === "none"
            ? "Tu as déjà la dernière version de Cubix."
            : "Cette copie de Cubix n’a pas été installée avec le lanceur.",
        duration: 4000,
        dismissible: true,
      });
  } catch (error) {
    toast.error("Mise à jour impossible", { id: checkId, description: reason(error), duration: 6000, dismissible: true });
  } finally {
    unsubscribe();
    checking = false;
  }
}
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
