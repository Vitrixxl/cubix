import { Trophy } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { MATCH_STATUS, roundName, scoreOf, type Match, type Person, type TournamentDetail } from "../../../../src/client/lib/community";
import { MenuItem, MoreMenu, Numeric } from "../layout";
import { Face, MatchStatusBadge, PlayerLine } from "./format";
import { tr } from "../../../../src/client/i18n";

/**
 * A tournament's bracket on a phone, after the web's desktop/renderer/tournaments/bracket.tsx: a column per round,
 * scrolled sideways (and down, for a large first round), each match as a card with its two players and the sets they
 * won, lines from each pair of matches to the match their winners meet in, and the champion once the final is over.
 * The account's matches are outlined in the accent; it opens on the round being played.
 */
const COLUMN = 232, GAP = 48, CARD = 112;
const over = (m: Match) => m.status === "done" || m.status === "cancelled";

export function Bracket({ tournament: t, me, onOpen, onAward }: {
  tournament: Pick<TournamentDetail, "matches" | "rounds" | "round" | "status" | "winner">;
  me?: string;
  onOpen?: (match: Match) => void;
  onAward?: (match: Match, winner: Person) => void;
}) {
  const rounds = Array.from({ length: t.rounds }, (_, i) => t.matches.filter(m => m.round === i + 1).sort((a, b) => a.slot - b.slot));
  const first = rounds[0]?.length ?? 0;
  const scroller = useRef<ScrollView>(null), placed = useRef(false);
  // Every column as tall as the first round needs, so a match sits level with the middle of the two before it.
  const height = Math.max(1, first) * CARD + 44;
  return <ScrollView nestedScrollEnabled className="min-h-0 flex-1" contentContainerStyle={{ paddingBottom: 4 }}>
    <ScrollView ref={scroller} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} accessibilityLabel={tr("Bracket")}
      onContentSizeChange={() => {
        if (placed.current || t.status !== "running" || t.round <= 1) return;
        placed.current = true;
        scroller.current?.scrollTo({ x: (t.round - 1) * (COLUMN + GAP) - 16, animated: false });
      }}>
      <View className="flex-row" style={{ gap: GAP, minHeight: height }}>
        {rounds.map((matches, i) => {
          const round = i + 1, done = matches.filter(over).length, current = t.status === "running" && round === t.round;
          return <View key={round} accessibilityLabel={roundName(round, t.rounds)} style={{ width: COLUMN }}>
            <View className={cn("flex-row items-center justify-between gap-2 border-b pb-2", current ? "border-primary/40" : "border-border")}>
              <Text className={cn("text-sm font-medium", current && "text-primary")}>{roundName(round, t.rounds)}</Text>
              <Badge variant={current ? "accent" : "secondary"}>
                <Numeric>{round > t.round && t.status === "running" ? tr("Next") : tr("{0} of {1} over", { 0: done, 1: matches.length })}</Numeric>
              </Badge>
            </View>
            <View className="min-h-0 flex-1">
              {pairs(matches).map((pair, k) => <View key={k} className="flex-1 justify-around gap-3 py-2">
                {pair.map(m => <MatchCard key={m.id} match={m} me={me} joined={round > 1} onOpen={onOpen} onAward={onAward} />)}
                {/* The line from the pair to the match their winners meet in, across the gap between the columns. */}
                {round < t.rounds && pair.length === 2 ? <View pointerEvents="none" className="absolute top-1/4 bottom-1/4 rounded-r-lg border-y-2 border-r-2 border-foreground/20"
                  style={{ right: -GAP / 2, width: GAP / 2 }} /> : null}
              </View>)}
            </View>
          </View>;
        })}
        {t.status === "finished" && t.winner ? <View accessibilityLabel={tr("Champion")} style={{ width: 200 }}>
          <Text className="border-b border-warning/40 pb-2 text-sm font-medium text-warning">{tr("Champion")}</Text>
          <View className="my-auto items-center gap-3 rounded-xl border border-warning/25 bg-warning/10 px-4 py-6">
            <Icon as={Trophy} size={40} className="text-warning" />
            <Face p={t.winner} size={48} />
            <Text numberOfLines={1} className="text-lg font-semibold">{t.winner.username}</Text>
          </View>
        </View> : null}
      </View>
    </ScrollView>
  </ScrollView>;
}

function pairs<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

/**
 * A match: its number and state on top (and the organiser's way to decide it), then its two players with their score,
 * the winner in bold with a check; the account's own outlined in the accent. The whole card opens the match.
 */
function MatchCard({ match: m, me, joined, onOpen, onAward }: { match: Match; me?: string; joined: boolean; onOpen?: (m: Match) => void; onAward?: (m: Match, winner: Person) => void }) {
  const mine = !!me && m.players.some(p => p?.id === me),
    bye = m.status === "done" && m.players.filter(Boolean).length === 1,
    open = !!onOpen && m.status !== "waiting" && !bye,
    decidable = !!onAward && (m.status === "ready" || m.status === "live") && m.players.every(Boolean),
    scored = m.status !== "waiting" && !bye;
  return <View>
    {/* The line coming from the pair before, drawn outside the card. */}
    {joined ? <View pointerEvents="none" className="absolute top-1/2 border-t-2 border-foreground/20" style={{ left: -GAP / 2, width: GAP / 2 }} /> : null}
    <Pressable disabled={!open} onPress={() => onOpen?.(m)} accessibilityRole={open ? "button" : undefined}
      accessibilityLabel={open ? tr("Open the match {0}", { 0: m.players.map(p => p?.username ?? "?").join(" – ") }) : undefined}
      className={cn("gap-2 rounded-xl border bg-card p-3", mine ? "border-primary/60" : "border-border", open && "active:bg-muted/40", bye && "opacity-60")}>
      <View className="h-5 flex-row items-center gap-2">
        <Numeric className="text-xs text-muted-foreground">{tr("Match {0}", { 0: m.slot + 1 })}</Numeric>
        <MatchStatusBadge status={m.status} className="ml-auto">{(bye ? tr("Bye") : tr(MATCH_STATUS[m.status])) + (m.forfeit ? " · " + tr("given") : "")}</MatchStatusBadge>
        {decidable ? <View className="-my-3 -mr-3">
          <MoreMenu label={tr("Decide the match")}>
            <Text className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{tr("Give the match to")}</Text>
            {m.players.map(p => p ? <MenuItem key={p.id} onPress={() => onAward!(m, p)}>{p.username}</MenuItem> : null)}
          </MoreMenu>
        </View> : null}
      </View>
      {[0, 1].map(seat => {
        const p = m.players[seat];
        return <PlayerLine key={seat} p={p} size={24} name={p ? undefined : bye ? tr("Bye") : tr("To be decided")} won={!!p && m.winner === p.id}
          decided={!!m.winner} me={!!me && p?.id === me} score={p && scored ? scoreOf(m)[seat] : undefined} />;
      })}
    </Pressable>
  </View>;
}
