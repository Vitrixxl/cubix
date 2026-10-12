import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { Check, ChevronDown, Keyboard, Timer, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { INSPECTIONS, TIME_ENTRIES, type Inspection, type TimeEntry } from "../../../src/client/lib/format";
import { DEFAULT_FIGURES } from "../../../src/client/lib/practiceSummary";
import { EVENTS, eventInfo, puzzleInfo, scrambleLabel, type EventId, type ScrambleType } from "../../../src/shared/puzzles";
import { crossTrainingType } from "../../../src/shared/crossTraining";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cubeSwitchLockedAtom, eventAtom, puzzleAtom, scrambleTypeAtom, solveModeAtom, timeEntryAtom } from "../state";
import { storage } from "../platform/storage";
import { useColors } from "../theme";
import { pickEventAtom } from "../journey";
import { useLayout } from "../hooks/useLayout";
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

/** The fourteen WCA events as a grid of glyph tiles, the current one lit in the accent: four to a row, seven on a tablet. */
export function PuzzleGrid({ value, onChange, disabled }: { value: EventId; onChange: (event: EventId) => void; disabled?: boolean }) {
  const colors = useColors(), { tablet } = useLayout();
  return <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }} accessibilityRole="radiogroup" accessibilityLabel={tr("Puzzle")}>
    {EVENTS.map(e => {
      const on = e.id === value;
      return <View key={e.id} style={{ width: tablet ? `${100 / 7}%` : "25%", padding: 4 }}>
        <Pressable accessibilityRole="radio" accessibilityLabel={tr(e.label)} accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => onChange(e.id)}
          className={cn("h-16 items-center justify-center gap-1 rounded-[14px] px-1", on ? "border-[1.5px] border-primary bg-primary/20" : "bg-muted active:bg-muted/70", disabled && "opacity-50")}>
          <PuzzleIcon puzzle={e.id} size={22} color={on ? colors.primary : colors.mutedForeground} />
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className={cn("text-center text-xs font-bold", on ? "text-primary" : "text-muted-foreground")}>{tr(e.label)}</Text>
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

const json = createJSONStorage<any>(() => storage);
/** The WCA inspection before a timer solve (the web's `cubix.timer.inspection`). */
export const inspectionAtom = atomWithStorage<Inspection>("cubix.timer.inspection", "off", json, { getOnInit: true });
/** The figures of the timer's session card, chosen by the player (see `sessionFigures`). */
export const timerFiguresAtom = atomWithStorage<string[]>("cubix.practice.figures", DEFAULT_FIGURES, json, { getOnInit: true });
/** "Spoken and on screen" in a segment of four. */
const INSPECTION_SHORT: Partial<Record<Inspection, string>> = { both: "Both" };

/**
 * The sheet of `SessionButton`, rendered once by the shell: picking a puzzle restarts the timer's session, and the
 * sheet stays open meanwhile to choose the rest. On the timer: the puzzle, the scramble type, the time entry, the WCA
 * inspection and the scrambled cube.
 */
export function SessionSheet() {
  const [mode, setMode] = useAtom(sessionSheetAtom);
  const scramble = mode === "timer";
  const event = useAtomValue(eventAtom), setEvent = useSetAtom(pickEventAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const [scrambleType, setScrambleType] = useAtom(scrambleTypeAtom);
  const [entry, setEntry] = useAtom(timeEntryAtom);
  const [inspection, setInspection] = useAtom(inspectionAtom);
  const puzzle = useAtomValue(puzzleAtom), blind = useAtomValue(solveModeAtom) === "blindfolded";
  const { tablet } = useLayout();
  const close = () => setMode(null);
  return <Sheet open={!!mode} onClose={close} title={scramble ? tr("Puzzle and scramble") : tr("Puzzle")} scroll={scramble} contentClassName="gap-3">
    <View className="gap-2">
      {scramble && <Caption>{tr("Puzzle")}</Caption>}
      <PuzzleGrid value={event} disabled={locked} onChange={id => { if (!scramble) close(); setEvent(id); }} />
    </View>
    {scramble && <>
      <Caption>{tr("Scramble")}</Caption>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={tr("Scramble")}>
        {timerScrambles(puzzleInfo(puzzle).scrambles).map(id => <Pill key={id} label={tr(scrambleLabel(id))} icon={id === scrambleType ? Check : undefined} primary={id === scrambleType}
          disabled={locked} onPress={() => setScrambleType(id)} role="radio" />)}
      </View>
      {/* Side by side on a tablet's wider sheet. */}
      <View className={cn("gap-3", tablet && "flex-row gap-4")}>
        <View className={cn("gap-3", tablet && "min-w-0 flex-1")}>
          <Caption>{tr("Entry")}</Caption>
          <PillSeg<TimeEntry> block label={tr("Entry")} value={entry} onChange={setEntry} disabled={locked}
            options={TIME_ENTRIES.map(e => ({ id: e.id, label: e.label, icon: e.id === "timer" ? Timer : e.id === "typing" ? Keyboard : undefined }))} />
        </View>
        {/* Blindfolded solves have no inspection (it is part of the time), typed ones neither. */}
        {!blind && entry !== "typing" && <View className={cn("gap-3", tablet && "min-w-0 flex-1")}>
          <Caption>{tr("WCA inspection")}</Caption>
          <PillSeg<Inspection> block label={tr("WCA inspection")} value={inspection} onChange={setInspection}
            options={INSPECTIONS.map(i => ({ id: i.id, label: INSPECTION_SHORT[i.id] ?? i.label }))} />
        </View>}
      </View>
    </>}
  </Sheet>;
}

/** A small uppercase caption over a group of controls. */
export function Caption({ children }: { children: ReactNode }) {
  return <Text className="pt-1 text-xs font-bold tracking-[0.09em] text-muted-foreground uppercase">{children}</Text>;
}


/**
 * A filled pill: a setting with its value in the accent (`label` + `value`), a filter, a choice. `on` raises it,
 * `primary` fills it with the accent.
 */
export function Pill({ label, value, icon, trailing, on, primary, disabled, onPress, role = "button", accessibilityLabel, className }: {
  label?: ReactNode; value?: ReactNode; icon?: LucideIcon; trailing?: LucideIcon; on?: boolean; primary?: boolean; disabled?: boolean; onPress?: () => void;
  role?: "button" | "radio" | "tab"; accessibilityLabel?: string; className?: string;
}) {
  const checked = role === "button" ? undefined : !!(on || primary);
  return <Pressable accessibilityRole={role} accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, selected: checked, checked }} disabled={disabled || !onPress} onPress={onPress}
    className={cn("h-10 shrink-0 flex-row items-center gap-1.5 rounded-full px-3.5", primary ? "bg-primary active:bg-primary/85" : on ? "bg-accent" : "bg-muted active:bg-muted/70", disabled && "opacity-50", className)}>
    {icon && <Icon as={icon} size={15} className={primary ? "text-primary-foreground" : on ? "text-foreground" : "text-muted-foreground"} />}
    {label != null && <Text numberOfLines={1} className={cn("text-[13px] font-semibold", primary ? "text-primary-foreground" : on ? "text-foreground" : "text-muted-foreground")}>{label}</Text>}
    {value != null && <Text numberOfLines={1} className={cn("text-[13px] font-bold tabular-nums", primary ? "text-primary-foreground" : "text-primary")}>{value}</Text>}
    {trailing && <Icon as={trailing} size={15} className={primary ? "text-primary-foreground" : "text-muted-foreground"} />}
  </Pressable>;
}

/** A segmented pill control: the chosen part raised; `block` spreads it over the width. */
export function PillSeg<T extends string>({ value, options, onChange, label, block, disabled, className }: {
  value: T; options: { id: T; label: string; icon?: LucideIcon }[]; onChange: (id: T) => void; label: string; block?: boolean; disabled?: boolean; className?: string;
}) {
  return <View accessibilityRole="tablist" accessibilityLabel={said(label)} className={cn("h-10 flex-row gap-0.5 rounded-xl bg-muted p-[3px]", !block && "self-start", disabled && "opacity-50", className)}>
    {options.map(o => {
      const on = o.id === value;
      return <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={() => { if (!on) onChange(o.id); }}
        className={cn("flex-row items-center justify-center gap-1.5 rounded-[9px] px-3", block && "flex-1", on && "bg-accent")}>
        {o.icon && <Icon as={o.icon} size={15} className={on ? "text-foreground" : "text-muted-foreground"} />}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className={cn("text-[13px] font-semibold", on ? "text-foreground" : "text-muted-foreground")}>{said(o.label)}</Text>
      </Pressable>;
    })}
  </View>;
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

