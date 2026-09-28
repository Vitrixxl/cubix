import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { cubeSwitchLockedAtom, puzzleAtom } from "../state";
import { useTheme } from "../theme";
import { IconChevronDown } from "./icons";
import { Select } from "./Select";
import { Sheet } from "./Sheet";

/** Official WCA event glyphs from the @cubing/icons font (MIT). */
const CODEPOINT: Record<PuzzleId, number> = {
  "222": 0xf10a, "333": 0xf106, "444": 0xf101, "555": 0xf10c, "666": 0xf113, "777": 0xf111,
  sq1: 0xf102, pyram: 0xf112, skewb: 0xf105, minx: 0xf103, clock: 0xf108,
};
/** The WCA glyph of a puzzle, `size` px, in `color` (default text). */
export function PuzzleIcon({ puzzle, size = 20, color }: { puzzle: PuzzleId; size?: number; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontFamily: "cubing-icons", fontSize: size, lineHeight: size * 1.1, color: color ?? t.text, includeFontPadding: false }}>{String.fromCodePoint(CODEPOINT[puzzle])}</Text>;
}

/** A select listing every puzzle with its WCA glyph (filters); `compact` keeps only the glyph. */
export function PuzzleSelect({ value, onChange, disabled, compact, nav, style }: { value: PuzzleId; onChange: (puzzle: PuzzleId) => void; disabled?: boolean; compact?: boolean; nav?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  void nav;
  return <Select value={value} disabled={disabled} compact={compact} style={style} accessibilityLabel={`Puzzle: ${puzzleInfo(value).label}`} minWidth={180}
    options={PUZZLES.map(p => ({ value: p.id, label: p.label, icon: <PuzzleIcon puzzle={p.id} size={16} color={t.muted} />, iconChecked: <PuzzleIcon puzzle={p.id} size={16} color={t.text} /> }))}
    onChange={onChange} />;
}

/**
 * `.puzzle-modal`: the "Puzzle" dialog, a 4-column grid of glyph-over-name options (76 px on phones);
 * the current puzzle is outlined on surface2.
 */
export function PuzzleDialog({ open, value, onClose, onChange }: { open: boolean; value: PuzzleId; onClose: () => void; onChange: (puzzle: PuzzleId) => void }) {
  const t = useTheme();
  const phone = useWindowDimensions().width <= 700;
  const [gridWidth, setGridWidth] = useState(0);
  const cell = gridWidth ? (gridWidth - 3 * 4) / 4 : "23%";
  return <Sheet open={open} onClose={onClose} title="Puzzle">
    <View style={styles.grid} onLayout={event => setGridWidth(Math.floor(event.nativeEvent.layout.width))}>
      {PUZZLES.map(p => {
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
 * puzzle dialog. `compact` keeps only the glyph. Locked while a training session holds the cube.
 */
export function PuzzlePicker({ compact, style }: { compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [puzzle, setPuzzle] = useAtom(puzzleAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  const [open, setOpen] = useState(false);
  const label = puzzleInfo(puzzle).label;
  return <>
    <Pressable disabled={locked} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Puzzle: ${label}`} accessibilityHint="Choose a puzzle"
      style={({ pressed }) => [styles.trigger, compact && styles.compact, { borderColor: t.line, backgroundColor: pressed || open ? t.hover : "transparent", opacity: locked ? 0.35 : 1 }, style]}>
      <PuzzleIcon puzzle={puzzle} size={16} color={t.text} />
      {!compact && <Text numberOfLines={1} style={[styles.triggerText, { color: t.text }]}>{label}</Text>}
      {!compact && <IconChevronDown size={12} color={t.muted} />}
    </Pressable>
    <PuzzleDialog open={open} value={puzzle} onClose={() => setOpen(false)} onChange={setPuzzle} />
  </>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, flexShrink: 0 },
  compact: { width: 32, paddingHorizontal: 0, justifyContent: "center" },
  triggerText: { fontSize: 13, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  option: { alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 2 },
  optionText: { fontSize: 13, fontWeight: "500", textAlign: "center" },
});
