/**
 * Asking before what cannot be undone: `ask` opens one confirmation and resolves with the answer, from anywhere (the
 * store, a page, a client); `Confirmations` draws it, once in the app.
 */
import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { tr } from "../../src/client/i18n";

interface Question {
  title: string;
  text?: string;
  /** The button that does it, in words ("Delete", "Remove"). */
  action: string;
  /** Whether it destroys something (the button in red); true unless said otherwise. */
  destructive?: boolean;
  /** The button that keeps things as they are ("Cancel" unless said, "Keep sharing"). */
  cancel?: string;
}
let pending: (Question & { answer: (yes: boolean) => void }) | null = null;
const listeners = new Set<() => void>();

export function ask(question: Question): Promise<boolean> {
  pending?.answer(false);
  return new Promise((resolve) => {
    pending = { ...question, answer: resolve };
    listeners.forEach((l) => l());
  });
}

export function Confirmations() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  const q = pending,
    close = (yes: boolean) => {
      if (pending !== q || !q) return;
      pending = null;
      q.answer(yes);
      redraw((n) => n + 1);
    };
  return (
    <AlertDialog open={!!q} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent data-slot="confirmation">
        <AlertDialogHeader>
          <AlertDialogTitle>{q?.title}</AlertDialogTitle>
          {q?.text && <AlertDialogDescription>{q.text}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{q?.cancel ?? tr("Cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={q?.destructive === false ? "default" : "destructive"} onClick={() => close(true)} data-action="confirm">
            {q?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
