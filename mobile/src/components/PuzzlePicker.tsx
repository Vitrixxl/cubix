import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { ChevronDown } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { TIME_ENTRIES, type TimeEntry } from "../../../src/client/lib/format";
import { EVENTS, eventInfo, puzzleInfo, scrambleLabel, type EventId, type ScrambleType } from "../../../src/shared/puzzles";
import { crossTrainingType } from "../../../src/shared/crossTraining";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cubeSwitchLockedAtom, eventAtom, puzzleAtom, scrambleTypeAtom, timeEntryAtom } from "../state";
import { useColors } from "../theme";
import { pickEventAtom } from "../journey";
import { Sheet } from "./Sheet";
import { Label } from "./layout";
import { said, tr } from "../../../src/client/i18n";

/** Official WCA event glyphs from the @cubing/icons font (MIT). */
const CODEPOINT: Record<EventId, number> = {
  "222": 0xf10a, "333": 0xf106, "444": 0xf101, "555": 0xf10c, "666": 0xf113, "777": 0xf111,
  "333oh": 0xf115, "333bf": 0xf107, "444bf": 0xf104, "555bf": 0xf114,
  sq1: 0xf102, pyram: 0xf112, skewb: 0xf105, minx: 0xf103,
};
/** The WCA glyph of a puzzle or event, `size` dp, in `color` (default: the text colour). */
export function PuzzleIcon({ puzzle, size = 20, color }: { puzzle: EventId; size?: number; color?: string }) {
  const colors = useColors();
  return <RNText style={{ fontFamily: "cubing-icons", fontSize: size, lineHeight: size * 1.1, color: color ?? colors.foreground, includeFontPadding: false }}>{String.fromCodePoint(CODEPOINT[puzzle])}</RNText>;
}

/** Cross scrambles belong to training (cross1 is kept for history); the timer's scramble choice leaves them out. */
export const timerScrambles = (types: readonly ScrambleType[]) => types.filter(type => !type.startsWith("cross1-") && !crossTrainingType(type));

/** Choices laid out as large cells in a sheet; `prefix` goes before a label (a colour swatch). */
export function SheetChoice<T extends string>({ label, value, options, onChange, columns = 3, disabled }: {
  label: string; value: T; options: { id: T; label: string; prefix?: ReactNode }[]; onChange: (id: T) => void; columns?: number; disabled?: boolean;
}) {
  return <View className="gap-2" accessibilityLabel={said(label)}>
    <Label>{said(label)}</Label>
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -2 }}>
      {options.map(o => {
        const on = o.id === value;
        return <View key={o.id} style={{ width: `${100 / columns}%`, padding: 2 }}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => { if (!on) onChange(o.id); }}
            className={cn("h-11 flex-row items-center justify-center gap-1.5 rounded-lg px-2 active:bg-muted", on ? "bg-primary/15" : "bg-muted/40", disabled && "opacity-50")}>
            {o.prefix}
            <Text numberOfLines={1} className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{said(o.label)}</Text>
          </Pressable>
        </View>;
      })}
    </View>
  </View>;
}

/** The fourteen WCA events as a grid of glyph cells, the current one lit. */
export function PuzzleGrid({ value, onChange, disabled }: { value: EventId; onChange: (event: EventId) => void; disabled?: boolean }) {
  const colors = useColors();
  return <View className="flex-row flex-wrap" style={{ marginHorizontal: -2 }} accessibilityRole="radiogroup" accessibilityLabel={tr("Puzzle")}>
    {EVENTS.map(e => {
      const on = e.id === value;
      return <View key={e.id} style={{ width: "25%", padding: 2 }}>
        <Pressable accessibilityRole="radio" accessibilityLabel={tr(e.label)} accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => onChange(e.id)}
          className={cn("h-20 items-center justify-center gap-1.5 rounded-lg px-1 active:bg-muted", on && "bg-primary/15", disabled && "opacity-50")}>
          <PuzzleIcon puzzle={e.id} size={24} color={on ? colors.foreground : colors.mutedForeground} />
          <Text numberOfLines={2} className={cn("text-center text-xs leading-tight", on ? "text-foreground" : "text-muted-foreground")}>{tr(e.label)}</Text>
        </Pressable>
      </View>;
    })}
  </View>;
}

/** A header button showing the current event (and a non-normal scramble), opening a sheet to change it. */
export function SessionTrigger({ event, detail, onPress, disabled }: { event: EventId; detail?: string; onPress: () => void; disabled?: boolean }) {
  const label = tr(eventInfo(event)?.label ?? event);
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={tr("Puzzle: {0}", { 0: label + (detail ? `, ${detail}` : "") })} accessibilityHint={tr("Choose a puzzle")}
    className={cn("h-11 max-w-52 shrink flex-row items-center gap-2 rounded-xl bg-muted pr-2.5 pl-3 active:bg-muted/70", disabled && "opacity-50")}>
    <PuzzleIcon puzzle={event} size={17} />
    <Text numberOfLines={1} className="shrink text-sm font-semibold">
      {label}{detail ? <Text className="text-sm font-normal text-muted-foreground"> · {detail}</Text> : null}
    </Text>
    <Icon as={ChevronDown} size={16} className="text-muted-foreground" />
  </Pressable>;
}

/** The puzzle sheet of the app, open from a page head: `timer` also holds the scramble type and the time entry. */
export const sessionSheetAtom = atom<null | "puzzle" | "timer">(null);

/**
 * The app's puzzle in a page head. On the timer (`scramble`), the same sheet also holds the scramble type and the
 * time entry, instead of three small menus. Locked while a solve holds the session.
 */
export function SessionButton({ scramble = false }: { scramble?: boolean }) {
  const open = useSetAtom(sessionSheetAtom);
  const event = useAtomValue(eventAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const scrambleType = useAtomValue(scrambleTypeAtom);
  const entry = useAtomValue(timeEntryAtom);
  return <SessionTrigger event={event} disabled={locked} onPress={() => open(scramble ? "timer" : "puzzle")}
    detail={scramble ? [scrambleType !== "normal" && tr(scrambleLabel(scrambleType)), entry !== "timer" && said(TIME_ENTRIES.find(e => e.id === entry)?.label)].filter(Boolean).join(" · ") || undefined : undefined} />;
}

/**
 * The sheet of `SessionButton`, rendered once by the shell: picking a puzzle restarts the timer's session, and the
 * sheet must stay open meanwhile to choose the scramble type.
 */
export function SessionSheet() {
  const [mode, setMode] = useAtom(sessionSheetAtom);
  const scramble = mode === "timer";
  const event = useAtomValue(eventAtom), setEvent = useSetAtom(pickEventAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const [scrambleType, setScrambleType] = useAtom(scrambleTypeAtom);
  const [entry, setEntry] = useAtom(timeEntryAtom);
  const puzzle = useAtomValue(puzzleAtom);
  const close = () => setMode(null);
  return <Sheet open={!!mode} onClose={close} title={scramble ? tr("Puzzle and scramble") : tr("Puzzle")} scroll={scramble}>
    <View className="gap-2">
      {scramble && <Label>{tr("Puzzle")}</Label>}
      <PuzzleGrid value={event} disabled={locked} onChange={id => { if (!scramble) close(); setEvent(id); }} />
    </View>
    {scramble && <>
      <SheetChoice label={tr("Scramble")} columns={2} value={scrambleType} disabled={locked}
        options={timerScrambles(puzzleInfo(puzzle).scrambles).map(id => ({ id, label: scrambleLabel(id) }))} onChange={setScrambleType} />
      <SheetChoice<TimeEntry> label={tr("Entry")} value={entry} disabled={locked} options={TIME_ENTRIES.map(e => ({ id: e.id, label: e.label }))} onChange={setEntry} />
    </>}
  </Sheet>;
}

/** A filter's own event (the profile), picked from the same grid. */
export function EventPicker({ value, onChange }: { value: EventId; onChange: (event: EventId) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <SessionTrigger event={value} onPress={() => setOpen(true)} />
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Puzzle")} description={tr("Statistics of this puzzle only")}>
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
  const current = said(options.find(o => o.id === value)?.label ?? value);
  return <>
    <Button variant={variant} size="sm" className={cn("h-11 gap-1.5 rounded-lg px-3", className)} onPress={() => setOpen(true)} accessibilityLabel={`${said(label)}: ${current}`}>
      {prefix}
      <Text numberOfLines={1} className={cn("shrink text-sm", variant === "ghost" && "text-muted-foreground")}>{current}</Text>
      <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
    </Button>
    <Sheet open={open} onClose={() => setOpen(false)} title={said(label)} scroll={options.length > 8}>
      <SheetChoice label={label} columns={options.length > 6 ? 2 : 1} value={value} options={options} onChange={id => { setOpen(false); onChange(id); }} />
    </Sheet>
  </>;
}

