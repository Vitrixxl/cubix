import { useEffect } from "react";
import { toast } from "sonner";
import { store } from "./store";
import { tr } from "../../src/client/i18n";

/** Shares the top-right notification stack with desktop updates. */
export function ErrorNotification({ message }: { message: string }) {
  useEffect(() => {
    if (!message) return;
    // Each failure gets a fresh id: a quick retry can fail before the old toast finishes exiting.
    const toastId = toast.error(tr("Something went wrong"), {
      description: tr(message),
      duration: Infinity,
      closeButton: false,
      className: "error-toast",
      action: {
        label: tr("Try again"),
        onClick: (event) => {
          event.preventDefault();
          void store.retry();
        },
      },
    });
    return () => { toast.dismiss(toastId); };
  }, [message]);
  return null;
}
