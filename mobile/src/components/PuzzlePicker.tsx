import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { EVENTS, eventInfo, type EventId } from "../../../src/shared/puzzles";
import { cubeSwitchLockedAtom, eventAtom } from "../state";
import { useTheme } from "../theme";
import { IconChevronDown } from "./icons";
import { Select } from "./Select";
import { Sheet } from "./Sheet";

/** Official WCA event glyphs from the @cubing/icons font (MIT). */
const CODEPOINT: Record<EventId, number> = {
  "222": 0xf10a, "333": 0xf106, "444": 0xf101, "555": 0xf10c, "666": 0xf113, "777": 0xf111,
  "333oh": 0xf115, "333bf": 0xf107, "444bf": 0xf104, "555bf": 0xf114,
  sq1: 0xf102, pyram: 0xf112, skewb: 0xf105, minx: 0xf103, clock: 0xf108,
};
/** The WCA glyph of a puzzle or event, `size` px, in `color` (default text). */
export function PuzzleIcon({ puzzle, size = 20, color }: { puzzle: EventId; size?: number; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontFamily: "cubing-icons", fontSize: size, lineHeight: size * 1.1, color: color ?? t.text, includeFontPadding: false }}>{String.fromCodePoint(CODEPOINT[puzzle])}</Text>;
}

/** A select listing every WCA event with its glyph (filters). */
export function PuzzleSelect({ value, onChange }: { value: EventId; onChange: (event: EventId) => void }) {
  const t = useTheme();
  return <Select value={value} accessibilityLabel={`Puzzle: ${eventInfo(value)?.label ?? value}`} minWidth={180}
    options={EVENTS.map(e => ({ value: e.id, label: e.label, icon: <PuzzleIcon puzzle={e.id} size={16} color={t.muted} />, iconChecked: <PuzzleIcon puzzle={e.id} size={16} color={t.text} /> }))}
    onChange={onChange} />;
}

/**
 * `.puzzle-modal`: the "Puzzle" dialog, a 4-column grid of glyph-over-name options (76 px on phones);
 * the current puzzle is outlined on surface2.
 */
function PuzzleDialog({ open, value, onClose, onChange }: { open: boolean; value: EventId; onClose: () => void; onChange: (event: EventId) => void }) {
  const t = useTheme();
  const phone = useWindowDimensions().width <= 700;
  const [gridWidth, setGridWidth] = useState(0);
  const cell = gridWidth ? (gridWidth - 3 * 4) / 4 : "23%";
  return <Sheet open={open} onClose={onClose} title="Puzzle">
    <View style={styles.grid} onLayout={event => setGridWidth(Math.floor(event.nativeEvent.layout.width))}>
      {EVENTS.map(p => {
        const current = p.id === value;
        return <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: current }} accessibilityLabel={p.label}
          onPress={() => { onClose(); if (!current) onChange(p.id); }}
          style={({ pressed }) => [styles.option, { width: cell, height: phone ? 76 : 84, borderColor: current ? t.line : "transparent", backgroundColor: current ? t.surface2 : pressed ? t.hover : "transparent" }]}>
          <PuzzleIcon puzzle={p.id} size={26} color={current ? t.text : t.secondary} />
          <Text numberOfLines={2} style={[styles.optionText, { color: current ? t.text : t.secondary }]}>{p.label}</Text>
        </Pressable>;
      })}
    </View>
  </Sheet>;
}

/**
 * The app-wide puzzle: the `.control.head-puzzle` of page headers (glyph, name, chevron) opening the
 * puzzle dialog. Locked while a training session holds the cube.
 */
export function PuzzlePicker() {
  const t = useTheme();
  const [event, setEvent] = useAtom(eventAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  const [open, setOpen] = useState(false);
  const label = eventInfo(event)?.label ?? event;
  return <>
    <Pressable disabled={locked} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Puzzle: ${label}`} accessibilityHint="Choose a puzzle"
      style={({ pressed }) => [styles.trigger, { borderColor: t.line, backgroundColor: pressed || open ? t.hover : "transparent", opacity: locked ? 0.35 : 1 }]}>
      <PuzzleIcon puzzle={event} size={16} color={t.text} />
      <Text numberOfLines={1} style={[styles.triggerText, { color: t.text }]}>{label}</Text>
      <IconChevronDown size={12} color={t.muted} />
    </Pressable>
    <PuzzleDialog open={open} value={event} onClose={() => setOpen(false)} onChange={setEvent} />
  </>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, flexShrink: 0 },
  triggerText: { fontSize: 13, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  option: { alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 2 },
  optionText: { fontSize: 13, fontWeight: "500", textAlign: "center" },
});
