import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Sheet } from "./Sheet";
import { tr } from "../../../src/client/i18n";

/**
 * Asking before what cannot be undone, as the web's confirm.tsx: `ask` opens one confirmation and resolves with the
 * answer, from anywhere; `Confirmations` draws it as a sheet, once in the app (in the solve menu's provider).
 */
interface Question {
  title: string;
  text?: string;
  /** The button that does it, in words ("Delete", "Remove"). */
  action: string;
  /** Whether it destroys something (the button in red); true unless said otherwise. */
  destructive?: boolean;
  /** The button that keeps things as they are ("Cancel" unless said). */
  cancel?: string;
}
let pending: (Question & { answer: (yes: boolean) => void }) | null = null;
const listeners = new Set<() => void>();

export function ask(question: Question): Promise<boolean> {
  pending?.answer(false);
  return new Promise(resolve => {
    pending = { ...question, answer: resolve };
    listeners.forEach(listener => listener());
  });
}

export function Confirmations() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw(n => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  // The last question stays drawn while its sheet goes away.
  const [shown, setShown] = useState<Question | null>(null);
  const q = pending;
  if (q && q !== shown) setShown(q);
  const close = (yes: boolean) => {
    if (pending !== q || !q) return;
    pending = null;
    q.answer(yes);
    redraw(n => n + 1);
  };
  return <Sheet open={!!q} onClose={() => close(false)} title={shown?.title ?? ""} description={shown?.text}>
    <View className="flex-row justify-end gap-2">
      <Button variant="ghost" onPress={() => close(false)}><Text>{shown?.cancel ?? tr("Cancel")}</Text></Button>
      <Button variant={shown?.destructive === false ? "default" : "destructive"} onPress={() => close(true)}><Text>{shown?.action}</Text></Button>
    </View>
  </Sheet>;
}
