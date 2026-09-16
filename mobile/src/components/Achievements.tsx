import { memo, useMemo, useState, type ReactNode } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ACHIEVEMENT_GROUPS, achievementPuzzle } from "../../../src/client/lib/achievements";
import type { AchievementDto, AchievementSummaryDto } from "../../../src/shared/types";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { IconLock, IconTrophy } from "./icons";
import { PuzzleIcon } from "./PuzzlePicker";
import { Select } from "./Select";
import { Empty, Muted, Segmented, mono } from "./ui";

type Filter = "all" | "unlocked" | "locked";
type Row = { key: string } & ({ kind: "group"; group: string; unlocked: number; total: number } | { kind: "achievement"; achievement: AchievementDto });

const AchievementRow = memo(function AchievementRow({ achievement }: { achievement: AchievementDto }) {
  const t = useTheme();
  const { unlocked } = achievement;
  const date = achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
  return <View accessibilityLabel={`${achievement.title}, ${unlocked ? "unlocked" : "locked"}, ${achievement.detail}`} style={[styles.row, { borderBottomColor: t.line, opacity: unlocked ? 1 : 0.72 }]}>
    <View style={[styles.badge, { backgroundColor: unlocked ? t.accentSoft : t.surface2 }]}>
      {unlocked ? <IconTrophy size={18} color={t.accent} /> : <IconLock size={16} color={t.readableMuted} />}
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <View style={styles.titleLine}>
        <Text numberOfLines={1} style={[styles.title, { color: t.text, flexShrink: 1 }]}>{achievement.title}</Text>
        <Text style={[mono(t, 12), { color: unlocked ? t.accent : t.readableMuted }]}>{unlocked && date ? date : achievement.detail}</Text>
      </View>
      <Muted size={12} numberOfLines={2}>{achievement.description}</Muted>
      <View style={[styles.track, { backgroundColor: t.surface2 }]}><View style={[styles.fill, { backgroundColor: unlocked ? t.accent : t.readableMuted, width: `${Math.round(achievement.ratio * 100)}%` }]} /></View>
    </View>
  </View>;
});

/** Every achievement grouped by puzzle, filterable by group and completion. */
export function Achievements({ summary, header, scrollKey }: { summary: AchievementSummaryDto; header?: ReactNode; scrollKey: string }) {
  const t = useTheme();
  const { navSpace } = useLayout();
  const [group, setGroup] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const name of ACHIEVEMENT_GROUPS) {
      if (group !== "all" && group !== name) continue;
      const all = summary.achievements.filter(a => a.group === name);
      const list = all.filter(a => filter === "all" || (filter === "unlocked") === a.unlocked);
      if (!list.length) continue;
      result.push({ key: `group:${name}`, kind: "group", group: name, unlocked: all.filter(a => a.unlocked).length, total: all.length });
      for (const achievement of list) result.push({ key: achievement.id, kind: "achievement", achievement });
    }
    return result;
  }, [summary, group, filter]);
  const key = `${scrollKey}:${group}:${filter}`;
  const scroll = usePreservedList<Row>(key);
  const groups = [{ value: "all", label: "All puzzles" }, ...ACHIEVEMENT_GROUPS.map(name => { const puzzle = achievementPuzzle(name); return { value: name, label: name, ...(puzzle ? { icon: <PuzzleIcon puzzle={puzzle} size={20} color={t.text2} />, iconChecked: <PuzzleIcon puzzle={puzzle} size={20} color={t.accent} /> } : {}) }; })];
  return <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
    initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} scrollEventThrottle={64}
    style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: navSpace }} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{ gap: 16, marginBottom: 10 }}>{header}<View style={styles.toolbar}>
      <Select value={group} accessibilityLabel="Achievement group" options={groups} onChange={setGroup} />
      <Segmented small options={[{ id: "all", label: "All" }, { id: "unlocked", label: "Unlocked" }, { id: "locked", label: "Locked" }]} value={filter} onChange={setFilter} />
    </View></View>}
    ListEmptyComponent={<Empty>{filter === "unlocked" ? "Nothing unlocked here yet. Keep practising!" : "Everything here is unlocked."}</Empty>}
    renderItem={({ item: row }) => row.kind === "group"
      ? <View style={styles.groupHeading}>
          {achievementPuzzle(row.group) ? <PuzzleIcon puzzle={achievementPuzzle(row.group)!} size={18} color={t.text2} /> : <IconTrophy size={16} color={t.text2} />}
          <Text style={{ color: t.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{row.group}</Text>
          <Text style={[mono(t, 12), { color: t.readableMuted }]}>{row.unlocked} / {row.total}</Text>
        </View>
      : <AchievementRow achievement={row.achievement} />} />;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  groupHeading: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: 1 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  titleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 14, fontWeight: "700" },
  track: { height: 3, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  fill: { height: 3, borderRadius: 2 },
});
