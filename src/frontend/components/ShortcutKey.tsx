export function ShortcutKey({ letter }: { letter: string }) {
  return <span className="shortcut-key" aria-hidden="true"><kbd>Alt</kbd><span>+</span><kbd>{letter}</kbd></span>;
}
