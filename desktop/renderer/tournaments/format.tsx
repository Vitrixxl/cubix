/**
 * How tournaments and battles are described and set up, free of the app's store so the administration shares it: the
 * format in words, a round's name, a tournament's status, the start date's field value, and the fields choosing the
 * event and how a match is won.
 */
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { msg } from "../../../src/client/i18n/msg";
import { tr } from "../../../src/client/i18n";
import { Icon, said } from "../base";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
export const eventName = (id: string) => said(eventInfo(id)?.label ?? id);
/** The name of a round, counted from the final. */
export function roundName(round: number, rounds: number) {
  const fromFinal = rounds - round;
  return fromFinal === 0 ? tr("Final") : fromFinal === 1 ? tr("Semi-finals") : fromFinal === 2 ? tr("Quarter-finals") : tr("Round {0}", { 0: round });
}
export const STATUS_TEXT = { open: msg("Registration open"), running: msg("Under way"), finished: msg("Finished"), cancelled: msg("Cancelled") } as const;
/** The date of `ms` as a `datetime-local` input wants it, on this device's clock. */
export const localInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** The event and how a match is won: solves to take a set, sets to take the match. */
export function FormatFields({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  const items = EVENTS.map((e) => ({ value: e.id, label: e.label }));
  return (
    <>
      <Field>
        <FieldLabel>{tr("Event")}</FieldLabel>
        <Select items={items} value={value.event} onValueChange={(v) => onChange({ ...value, event: String(v) })}>
          <SelectTrigger aria-label={tr("Event")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <Icon name={"Puzzle" + o.value} size={14} />
                {said(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="format-points">{tr("Solves to win a set")}</FieldLabel>
          <Input id="format-points" type="number" min={1} max={15} value={value.points} onChange={(e) => onChange({ ...value, points: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="format-sets">{tr("Sets to win the match")}</FieldLabel>
          <Input id="format-sets" type="number" min={1} max={9} value={value.sets} onChange={(e) => onChange({ ...value, sets: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} />
        </Field>
      </div>
      <FieldDescription>{formatText(value)}{tr(", on the same scrambles for both players.")}</FieldDescription>
    </>
  );
}
