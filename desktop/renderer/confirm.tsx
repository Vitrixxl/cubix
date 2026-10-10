/**
 * Asking before what cannot be undone: `ask` opens one confirmation and resolves with the answer, from anywhere (the
 * store, a page, a client); `Confirmations` draws it, once in the app.
 */
import { useEffect, useState } from "react";
import { CircleHelp, TriangleAlert } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
    destructive = q?.destructive !== false,
    close = (yes: boolean) => {
      if (pending !== q || !q) return;
      pending = null;
      q.answer(yes);
      redraw((n) => n + 1);
    };
  return (
    <AlertDialog open={!!q} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent data-slot="confirmation" className="p-6">
        <AlertDialogHeader>
          <AlertDialogMedia className={destructive ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}>
            {destructive ? <TriangleAlert /> : <CircleHelp />}
          </AlertDialogMedia>
          <AlertDialogTitle className="text-lg font-extrabold tracking-[-0.02em]">{q?.title}</AlertDialogTitle>
          {q?.text && <AlertDialogDescription>{q.text}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 p-6 pt-2">
          <AlertDialogCancel>{q?.cancel ?? tr("Cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={() => close(true)} data-action="confirm">
            {q?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
