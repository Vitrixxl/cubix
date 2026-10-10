/** The profile pages' shared pieces: a card's title, and a row of figures. */
import React from "react";
import { StatCard, dots, type Tone } from "../ui";
import { cn } from "@/lib/utils";

/** The title of a profile card: between the page's heading and a section's. */
export const CARD_TITLE = "shrink-0 text-lg font-extrabold tracking-[-0.03em]";

/**
 * A row of figures inside a card, each after its dot (the best in mint, averages in peach and lilac): the timer's
 * tiles without their tile. `tiles` gives each its own tile instead, on the page background.
 */
export function Figures({ figures, tiles = false, className }: { figures: [label: string, value: React.ReactNode, tone?: Tone][]; tiles?: boolean; className?: string }) {
  const colours = dots(figures.map(([, , tone]) => tone ?? ""));
  return (
    <div className={cn("grid shrink-0", tiles ? "gap-3 max-md:gap-2" : "gap-x-6 gap-y-3", className)} style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}>
      {figures.map(([label, value], i) => (
        <StatCard key={label} label={label} value={value} dot={colours[i]} size="sm" className={tiles ? undefined : "bg-transparent p-0"} />
      ))}
    </div>
  );
}
