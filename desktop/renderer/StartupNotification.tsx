import { useEffect } from "react";
import { toast } from "sonner";

/** Tells the cuber when the launcher opened this version without updating; same wording as the phone. */
export function StartupNotification() {
  useEffect(() => {
    let active = true;
    // Test harnesses stub the bridge without this method.
    Promise.resolve(window.cubix.startup?.()).then((startup) => {
      const notice = startup?.notice;
      if (!active || !notice) return;
      if (notice === "offline")
        toast("Mode hors ligne", {
          id: "startup-notice",
          description: "Impossible de joindre le serveur. Tes temps restent enregistrés sur cet appareil et se synchroniseront au retour de la connexion.",
          duration: 8000,
        });
      else
        toast.warning("Mise à jour impossible", {
          id: "startup-notice",
          description: "La dernière version n’a pas pu être installée. Cubix réessaiera au prochain lancement.",
          duration: 8000,
        });
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return null;
}
