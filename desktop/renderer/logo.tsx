/** The app's mark: four stickers, one of them turned to the accent. */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      {[0, 1].flatMap((row) =>
        [0, 1].map((col) => (
          <rect
            key={row * 2 + col}
            x={col * 9.75}
            y={row * 9.75}
            width={8.25}
            height={8.25}
            rx={2.2}
            className={row === 0 && col === 1 ? "fill-primary" : "fill-foreground/85"}
          />
        )),
      )}
    </svg>
  );
}

/** The app's name: Qbix, its Q bold. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={"tracking-tight " + (className ?? "")} aria-label="Qbix">
      <span className="font-extrabold">Q</span>
      <span className="font-medium">bix</span>
    </span>
  );
}
