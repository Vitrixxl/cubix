import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { PUZZLES } from "../../../src/shared/puzzles";
import { updateAvailable } from "../lib/release";
import { APK_DOWNLOAD_URL, APP_BUILD, APP_COMMIT, APP_VERSION, latestReleaseAtom, useReleaseCheck } from "../release";
import { colorModeAtom, cubeSwitchLockedAtom, puzzleAtom, routeAtom, themeAtom, type ThemeId } from "../state";
import { useTheme } from "../theme";
import { PuzzleIcon } from "./PuzzlePicker";
import { Sheet, SheetScrollView } from "./Sheet";
import { Btn, Segmented } from "./ui";

const THEMES: { id: ThemeId; name: string; color: string }[] = [
  { id: "t3-code", name: "Blue", color: "#3987e5" },
  { id: "t3-chat", name: "Pink", color: "#ed2677" },
  { id: "grove", name: "Green", color: "#39ad78" },
  { id: "ocean", name: "Cyan", color: "#42a4dc" },
  { id: "ember", name: "Orange", color: "#e1783f" },
  { id: "iris", name: "Purple", color: "#9a67df" },
];

/** Device preferences: they apply to guests as well as signed-in cubers. */
export function AppearanceSettings({ onNavigate }: { onNavigate?: () => void } = {}) {
  const t = useTheme();
  const navigate = useSetAtom(routeAtom);
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <View accessibilityLabel="Settings">
    <Row label="Theme"><Segmented options={[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }]} value={mode} onChange={setMode} /></Row>
    <Row label="Accent">
      <View style={styles.swatches} accessibilityLabel="Accent colour">
        {THEMES.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ selected: theme === item.id }} onPress={() => setTheme(item.id)} hitSlop={4}
          style={[styles.swatch, { backgroundColor: item.color }, theme === item.id && { borderWidth: 2, borderColor: t.text, outlineWidth: 2, outlineColor: t.bg, outlineStyle: "solid" }]} />)}
      </View>
    </Row>
    <Row label="Help"><Btn small label="Open the guides" onPress={() => { onNavigate?.(); navigate({ page: "guides" }); }} /></Row>
    <VersionRow />
  </View>;
}

/** Shows the installed build and, once the server announces a newer one, the download button. */
function VersionRow() {
  const t = useTheme();
  const latest = useAtomValue(latestReleaseAtom);
  const outdated = updateAvailable(APP_BUILD, latest);
  return <Row label="Version">
    <View style={styles.version}>
      <Text style={{ color: t.text2, fontSize: 13 }} accessibilityLabel="Installed version">{APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}</Text>
      {outdated && <Btn small variant="primary" label="Download update" accessibilityHint={`Build ${latest?.apkCommit?.slice(0, 7)}`} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)} />}
    </View>
  </Row>;
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const [puzzle, setPuzzle] = useAtom(puzzleAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  useReleaseCheck(open);
  return <Sheet open={open} onClose={onClose} title="Settings">
    <SheetScrollView contentContainerStyle={{ gap: 22, paddingTop: 12, paddingBottom: 16 }}>
      <View style={{ gap: 12 }}>
        <Text style={[styles.label, { color: t.text }]}>Puzzle</Text>
        <View style={styles.puzzles} accessibilityLabel="Puzzle selection">
          {PUZZLES.map(item => <Pressable key={item.id} disabled={locked} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ selected: puzzle === item.id, disabled: locked }} onPress={() => setPuzzle(item.id)}
            style={({ pressed }) => [styles.puzzle, { opacity: locked ? 0.45 : 1, backgroundColor: puzzle === item.id ? t.accentSoft : pressed ? t.hover : t.surface3, borderColor: puzzle === item.id ? t.accent : "transparent" }]}>
            <PuzzleIcon puzzle={item.id} size={24} color={puzzle === item.id ? t.accent : t.text2} />
            <Text style={{ color: puzzle === item.id ? t.accent : t.text2, fontSize: 12, fontWeight: "600" }}>{item.label}</Text>
          </Pressable>)}
        </View>
      </View>
      <AppearanceSettings onNavigate={onClose} />
    </SheetScrollView>
  </Sheet>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return <View style={[styles.row, { borderBottomColor: t.line }]}><Text style={[styles.label, { color: t.text }]}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, paddingVertical: 10, borderBottomWidth: 1 },
  puzzles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  puzzle: { width: "31%", flexGrow: 1, minHeight: 64, maxWidth: "34%", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1 },
  label: { fontSize: 14, fontWeight: "600" },
  swatches: { flexDirection: "row", gap: 8 },
  version: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 26, height: 26, borderRadius: 13 },
});
