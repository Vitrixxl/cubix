import { useAtom, useAtomValue } from "jotai";
import { ChevronDown } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { TIME_ENTRIES, type TimeEntry } from "../../../src/client/lib/format";
import { EVENTS, eventInfo, puzzleInfo, scrambleLabel, type EventId, type ScrambleType } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cubeSwitchLockedAtom, eventAtom, puzzleAtom, scrambleTypeAtom, timeEntryAtom } from "../state";
import { useColors } from "../theme";
import { Sheet } from "./Sheet";

/** Official WCA event glyphs from the @cubing/icons font (MIT). */
const CODEPOINT: Record<EventId, number> = {
  "222": 0xf10a, "333": 0xf106, "444": 0xf101, "555": 0xf10c, "666": 0xf113, "777": 0xf111,
  "333oh": 0xf115, "333bf": 0xf107, "444bf": 0xf104, "555bf": 0xf114,
  sq1: 0xf102, pyram: 0xf112, skewb: 0xf105, minx: 0xf103, clock: 0xf108,
};
/** The WCA glyph of a puzzle or event, `size` dp, in `color` (default: the text colour). */
export function PuzzleIcon({ puzzle, size = 20, color }: { puzzle: EventId; size?: number; color?: string }) {
  const colors = useColors();
  return <RNText style={{ fontFamily: "cubing-icons", fontSize: size, lineHeight: size * 1.1, color: color ?? colors.foreground, includeFontPadding: false }}>{String.fromCodePoint(CODEPOINT[puzzle])}</RNText>;
}

/** Cross + 1 scrambles belong to training; the timer's scramble choice leaves them out. */
export const timerScrambles = (types: readonly ScrambleType[]) => types.filter(type => !type.startsWith("cross1-"));

/** Choices laid out as large cells in a sheet. */
export function SheetChoice<T extends string>({ label, value, options, onChange, columns = 3, disabled }: {
  label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; columns?: number; disabled?: boolean;
}) {
  return <View className="gap-2" accessibilityLabel={label}>
    <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -2 }}>
      {options.map(o => {
        const on = o.id === value;
        return <View key={o.id} style={{ width: `${100 / columns}%`, padding: 2 }}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => { if (!on) onChange(o.id); }}
            className={cn("h-11 items-center justify-center rounded-lg px-2", on ? "bg-primary/15" : "bg-muted/40 active:bg-muted", disabled && "opacity-50")}>
            <Text numberOfLines={1} className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{o.label}</Text>
          </Pressable>
        </View>;
      })}
    </View>
  </View>;
}

/** The fifteen WCA events as a grid of glyph cells, the current one lit. */
export function PuzzleGrid({ value, onChange, disabled }: { value: EventId; onChange: (event: EventId) => void; disabled?: boolean }) {
  const colors = useColors();
  return <View className="flex-row flex-wrap" style={{ marginHorizontal: -2 }} accessibilityRole="radiogroup" accessibilityLabel="Puzzle">
    {EVENTS.map(e => {
      const on = e.id === value;
      return <View key={e.id} style={{ width: "25%", padding: 2 }}>
        <Pressable accessibilityRole="radio" accessibilityLabel={e.label} accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => onChange(e.id)}
          className={cn("h-20 items-center justify-center gap-1.5 rounded-lg px-1", on ? "bg-primary/15" : "active:bg-muted", disabled && "opacity-50")}>
          <PuzzleIcon puzzle={e.id} size={24} color={on ? colors.foreground : colors.mutedForeground} />
          <Text numberOfLines={2} className={cn("text-center text-[11px] leading-tight", on ? "text-foreground" : "text-muted-foreground")}>{e.label}</Text>
        </Pressable>
      </View>;
    })}
  </View>;
}

/** A header button showing the current event (and a non-normal scramble), opening a sheet to change it. */
export function SessionTrigger({ event, detail, onPress, disabled }: { event: EventId; detail?: string; onPress: () => void; disabled?: boolean }) {
  const label = eventInfo(event)?.label ?? event;
  return <Button variant="outline" className="h-9 max-w-48 gap-1.5 px-2.5" disabled={disabled} onPress={onPress} accessibilityLabel={`Puzzle: ${label}${detail ? `, ${detail}` : ""}`} accessibilityHint="Choose a puzzle">
    <PuzzleIcon puzzle={event} size={16} />
    <Text numberOfLines={1} className="shrink text-sm font-medium">
      {label}{detail ? <Text className="text-sm text-muted-foreground"> · {detail}</Text> : null}
    </Text>
    <Icon as={ChevronDown} size={15} className="text-muted-foreground" />
  </Button>;
}

/**
 * The app's puzzle in a page head. On the timer (`scramble`), the same sheet also holds the scramble type and the
 * time entry, instead of three small menus. Locked while a solve holds the session.
 */
export function SessionButton({ scramble = false }: { scramble?: boolean }) {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useAtom(eventAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const [scrambleType, setScrambleType] = useAtom(scrambleTypeAtom);
  const [entry, setEntry] = useAtom(timeEntryAtom);
  const puzzle = useAtomValue(puzzleAtom);
  return <>
    <SessionTrigger event={event} detail={scramble && scrambleType !== "normal" ? scrambleLabel(scrambleType) : undefined} disabled={locked} onPress={() => setOpen(true)} />
    <Sheet open={open} onClose={() => setOpen(false)} title={scramble ? "Puzzle and scramble" : "Puzzle"} scroll={scramble} tall={scramble}>
      <View className="gap-2">
        {scramble && <Text className="text-xs font-medium text-muted-foreground">Puzzle</Text>}
        <PuzzleGrid value={event} disabled={locked} onChange={id => { if (!scramble) setOpen(false); setEvent(id); }} />
      </View>
      {scramble && <>
        <SheetChoice label="Scramble" columns={2} value={scrambleType} disabled={locked}
          options={timerScrambles(puzzleInfo(puzzle).scrambles).map(id => ({ id, label: scrambleLabel(id) }))} onChange={setScrambleType} />
        <SheetChoice<TimeEntry> label="Entry" value={entry} disabled={locked} options={TIME_ENTRIES.map(e => ({ id: e.id, label: e.label }))} onChange={setEntry} />
      </>}
    </Sheet>
  </>;
}

/** A filter's own event (the profile), picked from the same grid. */
export function EventPicker({ value, onChange }: { value: EventId; onChange: (event: EventId) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <SessionTrigger event={value} onPress={() => setOpen(true)} />
    <Sheet open={open} onClose={() => setOpen(false)} title="Puzzle" description="Statistics of this puzzle only">
      <PuzzleGrid value={value} onChange={id => { setOpen(false); onChange(id); }} />
    </Sheet>
  </>;
}

/** A compact choice (sort, filter) opening its options in a sheet. */
export function ChoiceButton<T extends string>({ label, value, options, onChange, prefix, className, variant = "outline" }: {
  label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; prefix?: ReactNode; className?: string;
  /** Outlined in a page head, ghost in a card's heading row. */
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.id === value)?.label ?? value;
  return <>
    <Button variant={variant} size="sm" className={cn("h-9 gap-1.5 px-3", className)} onPress={() => setOpen(true)} accessibilityLabel={`${label}: ${current}`}>
      {prefix}
      <Text numberOfLines={1} className={cn("shrink text-sm", variant === "ghost" && "text-muted-foreground")}>{current}</Text>
      <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
    </Button>
    <Sheet open={open} onClose={() => setOpen(false)} title={label} scroll={options.length > 8}>
      <SheetChoice label={label} columns={options.length > 6 ? 2 : 1} value={value} options={options} onChange={id => { setOpen(false); onChange(id); }} />
    </Sheet>
  </>;
}

