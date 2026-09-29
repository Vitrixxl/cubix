import { useAtom, useAtomValue } from "jotai";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { EVENTS, eventInfo, type EventId } from "../../../src/shared/puzzles";
import { cubeSwitchLockedAtom, eventAtom } from "../state";
import { useTheme } from "../theme";
import { IconChevronDown } from "./icons";
import { Select } from "./Select";
import { Popover, useAnchor, type Anchor } from "./Popover";
import { headCellStyle, useHeadCell } from "./ui";

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

const COLUMNS = 4;
/**
 * `.puzzle-menu`: the puzzles as cells of a 4-column grid sharing their lines (glyph over name), hanging flush from
 * the cell that opened it, the whole width on phones; the current puzzle on surface2 in the accent colour.
 */
function PuzzleMenu({ anchor, overlap, value, onClose, onChange }: { anchor: Anchor | null; overlap: number; value: EventId; onClose: () => void; onChange: (event: EventId) => void }) {
  const t = useTheme();
  const window = useWindowDimensions();
  const phone = window.width <= 700;
  const width = phone ? (window.width - 2) / COLUMNS : 104;
  const lastRow = EVENTS.length % COLUMNS || COLUMNS;
  return <Popover anchor={anchor} onClose={onClose} overlap={overlap} width={COLUMNS * 104 + 2}>
    <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
      <View style={styles.grid}>
        {EVENTS.map((p, i) => {
          const current = p.id === value;
          return <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: current }} accessibilityLabel={p.label}
            onPress={() => { onClose(); if (!current) onChange(p.id); }}
            style={({ pressed }) => [styles.option, {
              width, height: phone ? 84 : 92, borderColor: t.line,
              borderRightWidth: i % COLUMNS === COLUMNS - 1 ? 0 : 1, borderBottomWidth: i >= EVENTS.length - lastRow ? 0 : 1,
              backgroundColor: current ? t.surface2 : pressed ? t.hover : "transparent",
            }]}>
            <PuzzleIcon puzzle={p.id} size={26} color={current ? t.accent : t.secondary} />
            <Text numberOfLines={2} style={[styles.optionText, { color: current ? t.accent : t.secondary }]}>{p.label}</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
  </Popover>;
}

/**
 * The app-wide puzzle: the `.control.head-puzzle` of page headers (glyph, name, chevron) opening the
 * puzzle menu. Locked while a training session holds the cube.
 */
export function PuzzlePicker() {
  const t = useTheme();
  const cell = useHeadCell();
  const [event, setEvent] = useAtom(eventAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  const { ref, anchor, open, close, isOpen } = useAnchor();
  const label = eventInfo(event)?.label ?? event;
  return <>
    <Pressable ref={ref} disabled={locked} onPress={open} accessibilityRole="button" accessibilityLabel={`Puzzle: ${label}`} accessibilityHint="Choose a puzzle"
      style={({ pressed }) => [styles.trigger, { borderColor: t.line, backgroundColor: isOpen ? t.surface2 : pressed ? t.hover : "transparent", opacity: locked ? 0.35 : 1 }, cell && headCellStyle(t, cell)]}>
      <PuzzleIcon puzzle={event} size={16} color={t.text} />
      <Text numberOfLines={1} style={[styles.triggerText, { color: t.text }]}>{label}</Text>
      <IconChevronDown size={12} color={t.muted} />
    </Pressable>
    <PuzzleMenu anchor={anchor} overlap={cell ? 0 : 1} value={event} onClose={close} onChange={setEvent} />
  </>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 0, borderWidth: 1, flexShrink: 0 },
  triggerText: { fontSize: 13, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  option: { alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 4 },
  optionText: { fontSize: 13, fontWeight: "500", textAlign: "center" },
});
