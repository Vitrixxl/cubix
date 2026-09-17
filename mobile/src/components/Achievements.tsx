import { memo, useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ACHIEVEMENT_GROUPS, achievementPuzzle } from "../../../src/client/lib/achievements";
import type { AchievementDto, AchievementSummaryDto } from "../../../src/shared/types";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { IconNext, IconTrophy } from "./icons";
import { PuzzleIcon } from "./PuzzlePicker";
import { Empty, Muted, Segmented, mono } from "./ui";

const GAP = 10;

/** Unlocked and total counts of one achievement group (a puzzle or "General"). */
export function groupProgress(summary: AchievementSummaryDto, group: string) {
  const all = summary.achievements.filter(a => a.group === group);
  return { unlocked: all.filter(a => a.unlocked).length, total: all.length };
}

/** A thin completion bar. */
function Track({ ratio, unlocked }: { ratio: number; unlocked: boolean }) {
  const t = useTheme();
  return <View style={[styles.track, { backgroundColor: t.surface3 }]}><View style={[styles.fill, { backgroundColor: unlocked ? t.accent : t.readableMuted, width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }]} /></View>;
}

/** One tile per puzzle (plus General): its glyph, how many achievements are unlocked, and a bar. */
export function AchievementGroups({ summary, onOpen }: { summary: AchievementSummaryDto; onOpen: (group: string) => void }) {
  const t = useTheme();
  const { width, pagePadding } = useLayout();
  const columns = width >= 900 ? 4 : width >= 560 ? 3 : 2;
  const tileWidth = Math.floor((Math.min(width, 1100) - pagePadding * 2 - GAP * (columns - 1)) / columns);
  return <View style={styles.grid}>
    {ACHIEVEMENT_GROUPS.map(group => {
      const { unlocked, total } = groupProgress(summary, group);
      if (!total) return null;
      const puzzle = achievementPuzzle(group), done = unlocked === total;
      return <Pressable key={group} accessibilityRole="button" accessibilityLabel={`${group}: ${unlocked} of ${total} achievements`} onPress={() => onOpen(group)}
        style={({ pressed }) => [styles.tile, { width: tileWidth, backgroundColor: pressed ? t.surface2 : t.surface }]}>
        <View style={styles.tileHead}>
          {puzzle ? <PuzzleIcon puzzle={puzzle} size={24} color={done ? t.accent : t.text2} /> : <IconTrophy size={22} color={done ? t.accent : t.text2} />}
          <IconNext size={16} color={t.muted} />
        </View>
        <View>
          <Text numberOfLines={1} style={[styles.tileTitle, { color: t.text }]}>{group}</Text>
          <Text style={[mono(t, 22, "700"), { color: done ? t.accent : t.text, lineHeight: 28 }]}>{unlocked}<Text style={[mono(t, 13, "600"), { color: t.readableMuted }]}> / {total}</Text></Text>
        </View>
        <Track ratio={total ? unlocked / total : 0} unlocked={done} />
      </Pressable>;
    })}
  </View>;
}

/** A small card: the title, how far along it is, and what it takes. */
const AchievementTile = memo(function AchievementTile({ achievement, width }: { achievement: AchievementDto; width: number }) {
  const t = useTheme();
  const { unlocked } = achievement;
  const percent = Math.round(achievement.ratio * 100);
  const date = achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
  return <View accessibilityLabel={`${achievement.title}: ${achievement.description}. ${unlocked ? "Unlocked" : `${percent} percent`}, ${achievement.detail}`}
    style={[styles.tile, { width, backgroundColor: unlocked ? t.accentSoft : t.surface }]}>
    <View style={styles.tileHead}>
      <Text numberOfLines={2} style={[styles.tileTitle, { color: t.text, flex: 1 }]}>{achievement.title}</Text>
      {unlocked && <IconTrophy size={18} color={t.accent} />}
    </View>
    <Text style={[mono(t, 26, "700"), { color: unlocked ? t.accent : t.text, lineHeight: 32 }]}>{percent}<Text style={[mono(t, 14, "600"), { color: unlocked ? t.accent : t.readableMuted }]}>%</Text></Text>
    <Track ratio={achievement.ratio} unlocked={unlocked} />
    <Muted size={12} numberOfLines={2}>{unlocked && date ? `Unlocked ${date}` : achievement.detail}</Muted>
  </View>;
});

type Filter = "all" | "unlocked" | "locked";
type Row = { key: string; items: AchievementDto[] };

/** Every achievement of one group as a grid of tiles, filterable by completion. */
export function AchievementGrid({ summary, group, header, scrollKey }: { summary: AchievementSummaryDto; group: string; header?: ReactNode; scrollKey: string }) {
  const { navSpace, width, pagePadding } = useLayout();
  const [filter, setFilter] = useState<Filter>("all");
  const columns = width >= 900 ? 4 : width >= 560 ? 3 : 2;
  const tileWidth = Math.floor((Math.min(width, 1100) - pagePadding * 2 - GAP * (columns - 1)) / columns);
  const { unlocked, total } = groupProgress(summary, group);
  const rows = useMemo(() => {
    const list = summary.achievements.filter(a => a.group === group && (filter === "all" || (filter === "unlocked") === a.unlocked));
    const result: Row[] = [];
    for (let i = 0; i < list.length; i += columns) result.push({ key: list[i].id, items: list.slice(i, i + columns) });
    return result;
  }, [summary, group, filter, columns]);
  const key = `${scrollKey}:${filter}:${columns}`;
  const scroll = usePreservedList<Row>(key);
  return <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
    initialNumToRender={6} maxToRenderPerBatch={4} windowSize={5} scrollEventThrottle={64}
    style={{ flex: 1 }} contentContainerStyle={{ gap: GAP, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{ gap: 14, marginBottom: 4 }}>{header}<View style={styles.toolbar}>
      <Segmented small options={[{ id: "all", label: "All", count: total }, { id: "unlocked", label: "Unlocked", count: unlocked }, { id: "locked", label: "Locked", count: total - unlocked }]} value={filter} onChange={setFilter} />
    </View></View>}
    ListEmptyComponent={<Empty>{filter === "unlocked" ? "Nothing unlocked here yet. Keep practising!" : "Everything here is unlocked."}</Empty>}
    renderItem={({ item: row }) => <View style={styles.grid}>{row.items.map(a => <AchievementTile key={a.id} achievement={a} width={tileWidth} />)}</View>} />;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { minHeight: 124, borderRadius: 18, padding: 14, gap: 8, justifyContent: "space-between" },
  tileHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  tileTitle: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
});
