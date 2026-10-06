/**
 * How tournaments and battles are described and set up, free of the app's store so the administration shares it: the
 * format in words, a round's name, a tournament's status, the start date's field value, and the fields choosing the
 * event and how a match is won.
 */
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { msg } from "../../../src/client/i18n/msg";
import { tr } from "../../../src/client/i18n";
import { Icon, said } from "../base";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A match's format and event, as chosen when it is created. */
export interface Format {
  event: string;
  points: number;
  sets: number;
}
/**
 * "First to 3 solves · best of 3 sets", or "First to 5 solves" for a single set. The dot holds to the words before it,
 * so a line never starts with it.
 */
export const formatText = (f: { points: number; sets: number }) => {
  const values = { 0: f.points, 1: 2 * f.sets - 1 };
  if (f.sets > 1) return (f.points > 1 ? tr("First to {0} solves · best of {1} sets", values) : tr("First to 1 solve · best of {1} sets", values)).replace(" · ", "\u00a0· ");
  return f.points > 1 ? tr("First to {0} solves", values) : tr("First to 1 solve");
};
/** A match's score as it reads best: sets when it has several, solves won otherwise. */
export const scoreOf = (m: { sets: number; score: { sets: [number, number]; solves?: [number, number] } }): [number, number] => (m.sets > 1 ? m.score.sets : (m.score.solves ?? m.score.sets));
export const eventName = (id: string) => said(eventInfo(id)?.label ?? id);
/** The name of a round, counted from the final. */
export function roundName(round: number, rounds: number) {
  const fromFinal = rounds - round;
  return fromFinal === 0 ? tr("Final") : fromFinal === 1 ? tr("Semi-finals") : fromFinal === 2 ? tr("Quarter-finals") : tr("Round {0}", { 0: round });
}
export const STATUS_TEXT = { open: msg("Registration open"), running: msg("Under way"), finished: msg("Finished"), cancelled: msg("Cancelled") } as const;
/** The date of `ms` as a `datetime-local` input wants it, on this device's clock. */
export const localInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** The event, picked from the grid of every event's icon like the app's puzzle picker. */
function EventPicker({ value, onChange }: { value: string; onChange: (event: string) => void }) {
  const [open, setOpen] = useState(false),
    current = eventInfo(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="h-9 w-full justify-start gap-2 px-2.5" aria-label={tr("Event")} data-action="format:event" />}>
        <Icon name={"Puzzle" + value} size={18} />
        <span className="truncate">{said(current?.label ?? value)}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1.5">
        <div role="listbox" aria-label={tr("Event")} className="grid grid-cols-4 gap-0.5">
          {EVENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="option"
              aria-selected={e.id === value}
              className={cn(
                "flex w-21 flex-col items-center gap-2 rounded-md px-1 pt-3 pb-2.5 text-xs text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:text-foreground",
                e.id === value && "bg-foreground/8 text-foreground",
              )}
              onClick={() => {
                setOpen(false);
                onChange(e.id);
              }}
            >
              <Icon name={"Puzzle" + e.id} size={26} />
              <span className="max-w-full truncate">{said(e.label)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The event and how a match is won, on one line: solves to take a set, sets to take the match. */
export function FormatFields({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
        <Field>
          <FieldLabel>{tr("Event")}</FieldLabel>
          <EventPicker value={value.event} onChange={(event) => onChange({ ...value, event })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="format-points">{tr("Solves per set")}</FieldLabel>
          <Input id="format-points" type="number" min={1} max={15} value={value.points} onChange={(e) => onChange({ ...value, points: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="format-sets">{tr("Sets to win")}</FieldLabel>
          <Input id="format-sets" type="number" min={1} max={9} value={value.sets} onChange={(e) => onChange({ ...value, sets: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} />
        </Field>
      </div>
      <FieldDescription>{formatText(value)}{tr(", on the same scrambles for both players.")}</FieldDescription>
    </>
  );
}
