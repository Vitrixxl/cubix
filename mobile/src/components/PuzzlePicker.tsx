import { useAtom, useAtomValue } from "jotai";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { cubeSwitchLockedAtom, puzzleAtom } from "../state";
import { useTheme } from "../theme";
import { Select } from "./Select";

/** Official WCA event glyphs from the @cubing/icons font (MIT). */
const CODEPOINT: Record<PuzzleId, number> = {
  "222": 0xf10a, "333": 0xf106, "444": 0xf101, "555": 0xf10c, "666": 0xf113, "777": 0xf111,
  sq1: 0xf102, pyram: 0xf112, skewb: 0xf105, minx: 0xf103, clock: 0xf108,
};
export function PuzzleIcon({ puzzle, size = 20, color }: { puzzle: PuzzleId; size?: number; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontFamily: "cubing-icons", fontSize: size, lineHeight: size * 1.1, color: color ?? t.text, includeFontPadding: false }}>{String.fromCodePoint(CODEPOINT[puzzle])}</Text>;
}

/** A select listing every puzzle with its WCA glyph. */
export function PuzzleSelect({ value, onChange, disabled, compact, nav, style }: { value: PuzzleId; onChange: (puzzle: PuzzleId) => void; disabled?: boolean; compact?: boolean; nav?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const iconSize = nav ? 18 : 22;
  return <Select value={value} disabled={disabled} compact={compact} flat={nav ? "nav" : undefined} style={style} accessibilityLabel={`Puzzle: ${puzzleInfo(value).label}`} minWidth={180}
    options={PUZZLES.map(p => ({ value: p.id, label: p.label, icon: <PuzzleIcon puzzle={p.id} size={iconSize} color={t.text2} />, iconChecked: <PuzzleIcon puzzle={p.id} size={iconSize} color={t.accent} /> }))}
    onChange={onChange} />;
}

/** The app-wide puzzle, shown in the navigation. */
export function PuzzlePicker({ compact, style }: { compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const [puzzle, setPuzzle] = useAtom(puzzleAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  return <PuzzleSelect value={puzzle} onChange={setPuzzle} disabled={locked} compact={compact} style={style} nav />;
}
