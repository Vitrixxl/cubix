export function ShortcutKey({ letter }: { letter: string }) {
  return <kbd className="shortcut-key" aria-hidden="true">Alt+{letter}</kbd>;
}
