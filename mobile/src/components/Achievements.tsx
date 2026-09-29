import { memo, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ACHIEVEMENT_GROUPS, achievementPuzzle } from "../../../src/client/lib/achievements";
import type { AchievementDto, AchievementSummaryDto } from "../../../src/shared/types";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { IconLock, IconTrophy } from "./icons";
import { PuzzleIcon } from "./PuzzlePicker";
import { Select } from "./Select";
import { Empty, ProgressBar, Segmented, headCellStyle, mono, useHeadCell } from "./ui";

/**
 * The web app's achievements page (`Achievements` in desktop/renderer/main.tsx): a puzzle filter and
 * All / Unlocked / Locked tabs, then every group (a puzzle or "General") with its heading and count,
 * and one raised row per achievement: lock or trophy, title, progress or unlock date, what it takes, a bar.
 */

/** `.achievement-total`: "17 / 210" and a bar, in the page header. */
export function AchievementTotal({ summary }: { summary: AchievementSummaryDto }) {
  const t = useTheme();
  const cell = useHeadCell();
  return <View style={[styles.total, cell && { ...headCellStyle(t, cell), borderLeftWidth: 0, paddingHorizontal: 14 }]} accessibilityLabel={`${summary.unlocked} of ${summary.total} achievements unlocked`}>
    <Text style={[mono(t, 13), { color: t.muted }]}>{summary.unlocked} / {summary.total}</Text>
    <ProgressBar value={summary.total ? summary.unlocked / summary.total : 0} unlocked style={{ width: 62 }} />
  </View>;
}

const unlockedDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const AchievementRow = memo(function AchievementRow({ achievement: a }: { achievement: AchievementDto }) {
  const t = useTheme();
  const note = a.unlockedAt ? unlockedDate(a.unlockedAt) : a.detail;
  return <View accessibilityLabel={`${a.title}: ${a.description}. ${a.unlocked ? "Unlocked" : `${Math.round(a.ratio * 100)} percent`}, ${note}`}
    style={[styles.row, { backgroundColor: t.raised, borderColor: t.line, opacity: a.unlocked ? 1 : 0.7 }]}>
    <View style={[styles.icon, { backgroundColor: a.unlocked ? t.soft : t.surface2 }]}>
      {a.unlocked ? <IconTrophy size={18} color={t.accent} /> : <IconLock size={18} color={t.muted} />}
    </View>
    <View style={styles.rowText}>
      <View style={styles.rowHead}>
        <Text style={[styles.title, { color: t.text }]}>{a.title}</Text>
        <Text style={[styles.note, mono(t, 12, "400"), { color: t.muted }]}>{note}</Text>
      </View>
      <Text style={{ color: t.muted, fontSize: 12, lineHeight: 17 }}>{a.description}</Text>
      <ProgressBar value={a.ratio} unlocked={a.unlocked} style={{ marginTop: 2 }} />
    </View>
  </View>;
});

type Filter = "all" | "unlocked" | "locked";
type Row = { key: string } & ({ kind: "group"; group: string; unlocked: number; total: number } | { kind: "item"; achievement: AchievementDto });

/** The whole list, filterable by group and completion; `initialGroup` preselects a puzzle. */
export function AchievementList({ summary, initialGroup, scrollKey }: { summary: AchievementSummaryDto; initialGroup?: string; scrollKey: string }) {
  const t = useTheme();
  const { navSpace, pagePadding } = useLayout();
  const [group, setGroup] = useState(initialGroup && ACHIEVEMENT_GROUPS.includes(initialGroup) ? initialGroup : "all");
  const [filter, setFilter] = useState<Filter>("all");
  const groups = useMemo(() => [...new Set(summary.achievements.map(a => a.group))], [summary]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const name of groups) {
      if (group !== "all" && group !== name) continue;
      const members = summary.achievements.filter(a => a.group === name);
      const visible = members.filter(a => filter === "all" || a.unlocked === (filter === "unlocked"));
      if (!visible.length) continue;
      result.push({ key: `group:${name}`, kind: "group", group: name, unlocked: members.filter(a => a.unlocked).length, total: members.length });
      for (const achievement of visible) result.push({ key: achievement.id, kind: "item", achievement });
    }
    return result;
  }, [summary, groups, group, filter]);
  const key = `${scrollKey}:${group}:${filter}`;
  const scroll = usePreservedList<Row>(key);
  const groupOptions = [{ value: "all", label: "All puzzles" }, ...groups.map(name => ({ value: name, label: name }))];
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={[styles.toolbar, { paddingHorizontal: pagePadding }]}>
      <Select value={group} accessibilityLabel="Achievement group" options={groupOptions} onChange={setGroup} minWidth={200} />
      <Segmented plain options={[{ id: "all", label: "All" }, { id: "unlocked", label: "Unlocked" }, { id: "locked", label: "Locked" }]} value={filter} onChange={setFilter} />
    </View>
    <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
      style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: pagePadding, paddingBottom: navSpace }}
      ListEmptyComponent={<Empty>{filter === "unlocked" ? "Nothing unlocked here yet. Keep practising!" : "Everything here is unlocked."}</Empty>}
      renderItem={({ item: row }) => {
        if (row.kind === "item") return <AchievementRow achievement={row.achievement} />;
        const puzzle = achievementPuzzle(row.group);
        return <View style={styles.heading}>
          {puzzle ? <PuzzleIcon puzzle={puzzle} size={18} color={t.text} /> : <IconTrophy size={18} color={t.text} />}
          <Text style={[styles.headingText, { color: t.text }]}>{row.group}</Text>
          <Text style={[mono(t, 12), { color: t.muted }]}>{row.unlocked} / {row.total}</Text>
        </View>;
      }} />
  </View>;
}

const styles = StyleSheet.create({
  total: { flexDirection: "row", alignItems: "center", gap: 10, height: 32 },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 12, paddingBottom: 4 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40, paddingTop: 10, marginBottom: 2 },
  headingText: { flex: 1, fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  icon: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  title: { flexShrink: 1, fontSize: 13.5, fontWeight: "600" },
  note: { flexShrink: 1, textAlign: "right" },
});
