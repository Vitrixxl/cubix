import { Check, Crown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { MATCH_STATUS, roundName, scoreOf, type Match, type TournamentDetail } from "../../../../src/client/lib/community";
import { Cap } from "../duel/parts";
import { Face, PlayerLine } from "./format";
import { said, tr } from "../../../../src/client/i18n";

/**
 * A tournament's bracket on a phone, one round at a time: its rounds as chips (those over checked), the round picked as
 * a column of match cards and the next round beside it, the champion once the final is over. The account's match is
 * outlined in the accent; a match under way or over opens its page.
 */
const over = (m: Match) => m.status === "done" || m.status === "cancelled";
const byRound = (t: Pick<TournamentDetail, "matches">, round: number) => t.matches.filter(m => m.round === round).sort((a, b) => a.slot - b.slot);

export function RoundBoard({ tournament: t, me, onOpen }: {
  tournament: Pick<TournamentDetail, "matches" | "rounds" | "round" | "status" | "winner">;
  me?: string;
  onOpen?: (match: Match) => void;
}) {
  const [shown, setShown] = useState(t.status === "running" ? Math.max(1, t.round) : t.status === "finished" ? t.rounds : 1);
  const matches = byRound(t, shown), next = shown < t.rounds ? byRound(t, shown + 1) : [];
  const champion = shown === t.rounds && t.status === "finished" && t.winner;
  return <View className="min-h-0 shrink gap-2.5">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-1.5" accessibilityRole="tablist">
      {Array.from({ length: t.rounds }, (_, i) => {
        const round = i + 1, on = round === shown, done = byRound(t, round).length > 0 && byRound(t, round).every(over);
        return <Pressable key={round} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setShown(round)}
          className={cn("h-10 flex-row items-center gap-1.5 rounded-full px-3.5", on ? "bg-muted" : "active:bg-muted/50")}>
          {done ? <Icon as={Check} size={14} className="text-muted-foreground" /> : null}
          <Text className={cn("text-sm font-bold", on ? "text-foreground" : "text-muted-foreground")}>{said(roundName(round, t.rounds))}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <ScrollView className="min-h-0 shrink grow-0" accessibilityLabel={tr("Bracket")}>
      <View className="flex-row items-center gap-2.5">
        <View className="min-w-0 flex-1 gap-2">{matches.map(m => <MatchCard key={m.id} match={m} me={me} onOpen={onOpen} />)}</View>
        {next.length || champion ? <View className="min-w-0 flex-1 gap-1.5">
          {champion ? <View accessibilityLabel={tr("Champion")} className="items-center gap-2 rounded-2xl bg-warning/10 px-3 py-4">
            <Icon as={Crown} size={26} className="text-warning" />
            <Face p={champion} size={40} />
            <Text numberOfLines={1} className="text-base font-bold">{champion.username}</Text>
            <Cap className="text-warning">{tr("Champion")}</Cap>
          </View> : <>
            <Cap>{tr("{0} · next", { 0: said(roundName(shown + 1, t.rounds)) })}</Cap>
            {next.map(m => <MatchCard key={m.id} match={m} me={me} onOpen={onOpen} />)}
          </>}
        </View> : null}
      </View>
    </ScrollView>
  </View>;
}

/** A match: its two players with the sets or solves they won, the winner checked, and its state under them. */
function MatchCard({ match: m, me, onOpen }: { match: Match; me?: string; onOpen?: (m: Match) => void }) {
  const mine = !!me && m.players.some(p => p?.id === me),
    bye = m.status === "done" && m.players.filter(Boolean).length === 1,
    open = !!onOpen && m.status !== "waiting" && !bye,
    scored = m.status !== "waiting" && !bye;
  return <Pressable disabled={!open} onPress={() => onOpen?.(m)} accessibilityRole={open ? "button" : undefined}
    accessibilityLabel={open ? tr("Open the match {0}", { 0: m.players.map(p => p?.username ?? "?").join(" – ") }) : undefined}
    className={cn("gap-1.5 rounded-2xl border-2 bg-card px-2.5 py-2", mine && !over(m) ? "border-primary" : "border-transparent", open && "active:bg-muted/50", bye && "opacity-60")}>
    {[0, 1].map(seat => {
      const p = m.players[seat];
      return <PlayerLine key={seat} p={p} size={24} name={p ? undefined : bye ? tr("Bye") : tr("To be decided")} won={!!p && m.winner === p.id}
        decided={!!m.winner} me={!!me && p?.id === me} score={p && scored ? scoreOf(m)[seat] : undefined} />;
    })}
    <Text numberOfLines={1} className={cn("text-xs", mine && !over(m) ? "font-bold text-primary" : "text-muted-foreground")}>
      {mine && !over(m) ? tr("Your match") : bye ? tr("Bye") : said(MATCH_STATUS[m.status]) + (m.forfeit ? " · " + tr("given") : "")}
    </Text>
  </Pressable>;
}
