/**
 * Tournaments: the ones open to every player (the administration creates them) and those of the account's groups, to
 * register for until they start, then followed round by round; and one tournament's page: where it stands, its players
 * and its bracket, the player's own match a click away.
 */
import { useEffect } from "react";
import { CalendarClock, Check, Crown, Flag, Play, Swords, Trophy, Users, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { ask } from "../confirm";
import { Empty, Figure, ListSkeleton, NUMERIC, PAGE, PageHead, SectionHead, Strip, Surface } from "../ui";
import { Back, day, relative, time } from "../coaching/parts";
import { community, communityUrl, eventName, formatText, matchUrl, tournamentUrl, type Tournament, type TournamentDetail } from "../community/client";
import { PersonRow } from "../community/dialogs";
import { Bracket, roundName } from "./bracket";
import { CARD_LINK, EventTile, StatusBadge, apart, opens } from "./format";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

export function TournamentsPage() {
  const id = Number(s.view.split("/")[0]);
  return id ? <TournamentView id={id} /> : <TournamentList />;
}

/** "Sat 10 Oct · 18:00 · in 2 days" */
export const when = (ms: number) => `${day(ms)} · ${time(ms)} · ${relative(ms)}`;

/** Register, or take the registration back, while the tournament has not started. */
export function RegisterButton({ t, size = "default" }: { t: Tournament; size?: "default" | "sm" }) {
  if (t.status !== "open") return null;
  const full = !!t.maxPlayers && t.players >= t.maxPlayers;
  return t.registered ? (
    <Button variant="outline" size={size} onClick={() => void community.register(t.id, false)} className="group/registered" data-action={"tournament:unregister:" + t.id}>
      <Check className="group-hover/registered:hidden" />
      <X className="hidden group-hover/registered:block" />
      <span className="group-hover/registered:hidden">{tr("Registered")}</span>
      <span className="hidden group-hover/registered:inline">{tr("Unregister")}</span>
    </Button>
  ) : (
    <Button size={size} disabled={full} onClick={() => void community.register(t.id, true)} data-action={"tournament:register:" + t.id}>
      {full ? tr("Full") : tr("Register")}
    </Button>
  );
}

/** The account's match ready to be played: the round, against whom, and the way to it. */
function MatchReady({ title, text, match, action }: { title: string; text: string; match: number; action?: string }) {
  return (
    <Alert variant="info" className="flex shrink-0 items-center gap-3 px-4 py-3" data-slot="my-match">
      <Swords />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{text}</AlertDescription>
      </div>
      <Button onClick={() => go(matchUrl(match))} data-action={action}>
        <Play />
        {tr("Play your match")}</Button>
    </Alert>
  );
}

/** The cards on their way: shaped like a tournament's card. */
function CardsSkeleton() {
  return (
    <div className={GRID} aria-busy="true" aria-label={tr("Loading")}>
      {[0, 1, 2].map((i) => (
        <Surface key={i} className="gap-4 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-7 w-24" />
        </Surface>
      ))}
    </div>
  );
}

/** The cards share the width: as many columns as fit, stretched to fill the row. */
const GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4";

function TournamentList() {
  useEffect(() => {
    void community.load("tournaments");
  }, []);
  const list = community.tournaments,
    mine = list?.filter((t) => t.myMatch) ?? [],
    sections: [string, Tournament[]][] = [
      ["Under way", list?.filter((t) => t.status === "running") ?? []],
      ["Registration open", list?.filter((t) => t.status === "open") ?? []],
      ["Past", list?.filter((t) => t.status === "finished" || t.status === "cancelled") ?? []],
    ];
  return (
    <div className={PAGE}>
      <PageHead title={tr("Tournaments")} sub={tr("Open to every player, and your groups'")} />
      <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
        {mine.map((t) => (
          <MatchReady key={t.id} title={tr("{0} · your match in {1} is ready.", { 0: said(roundName(t.round, t.rounds)), 1: t.name })} text={formatText(t)} match={t.myMatch!} />
        ))}
        {!list ? (
          <CardsSkeleton />
        ) : !list.length ? (
          <Empty icon={Trophy}>{tr("No tournament yet. The next ones will be listed here.")}</Empty>
        ) : (
          sections.map(
            ([title, items]) =>
              items.length > 0 && (
                <section key={title} className="flex flex-col gap-2" aria-label={tr(title)}>
                  <SectionHead title={title} meta={items.length} />
                  <div className={GRID}>
                    {items.map((t) => (
                      <TournamentCard key={t.id} t={t} />
                    ))}
                  </div>
                </section>
              ),
          )
        )}
      </div>
    </div>
  );
}

/** A tournament as a card, here and in a conversation: its name, group and format, when, how many, and registering. The
 * whole card opens its page. */
export function TournamentCard({ t, className }: { t: Tournament; className?: string }) {
  return (
    <Surface className={cn("gap-4 p-4", CARD_LINK, className)} data-tournament={t.id} data-status={t.status} aria-label={tr("Open {0}", { 0: t.name })} {...opens(() => go(tournamentUrl(t.id)), "link")}>
      <div className="flex items-start gap-3">
        <EventTile event={t.event} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 text-base leading-snug font-semibold tracking-tight">{t.name}</h3>
          <p className="text-sm text-muted-foreground">
            {t.group && <span className="text-foreground/80">{t.group} · </span>}
            {eventName(t.event)} · {formatText(t)}
          </p>
        </div>
        <StatusBadge t={t} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          {t.status === "open" ? tr("Starts {0}", { 0: when(t.startsAt) }) : t.status === "running" ? tr("Started {0}", { 0: relative(t.startedAt ?? t.startsAt) }) : day(t.finishedAt ?? t.startsAt)}
        </span>
        <span className="flex items-center gap-2">
          <Users className="size-4" />
          <span className={NUMERIC}>
            {t.players}
            {t.maxPlayers ? ` / ${t.maxPlayers}` : ""} {tr("players")}
          </span>
        </span>
        {t.winner && (
          <span className="flex items-center gap-2 text-foreground">
            <Crown className="size-4 text-warning" />
            {tr("{0} won the tournament", { 0: t.winner.username })}</span>
        )}
      </div>
      {(t.status === "open" || t.myMatch) && (
        <div className="mt-auto flex flex-wrap items-center gap-2" {...apart}>
          <RegisterButton t={t} size="sm" />
          {t.myMatch && (
            <Button size="sm" onClick={() => go(matchUrl(t.myMatch!))}>
              <Play />
              {tr("Play your match")}</Button>
          )}
        </div>
      )}
    </Surface>
  );
}

function TournamentView({ id }: { id: number }) {
  useEffect(() => {
    void community.load(`tournament:${id}`);
  }, [id]);
  const t = community.details.get(id);
  // A group's tournament goes back to the group's conversation, where its card is.
  const back = t?.groupId ? communityUrl(`groups/${t.groupId}`) : tournamentUrl();
  // Still in it while it runs: the tournament is the whole app, left only by giving up.
  const held = community.competition?.tournament === id;
  const lead = held ? <Trophy className="size-6 text-warning" /> : <Back to={back} />;
  if (!t)
    return (
      <div className={PAGE} aria-busy="true" aria-label={tr("Loading")}>
        <PageHead title={tr("Tournament")} lead={lead} />
        <Skeleton className="h-18 shrink-0 rounded-xl" />
        <div className="flex min-h-0 flex-1 gap-4">
          <Surface className="min-w-0 flex-1 gap-3 p-4">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-1 gap-14">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-1 flex-col justify-around gap-3">
                  {Array.from({ length: 4 >> i }, (_, k) => (
                    <Skeleton key={k} className="h-24 rounded-xl" />
                  ))}
                </div>
              ))}
            </div>
          </Surface>
          <Surface className="w-64 shrink-0 p-2 max-md:hidden">
            <ListSkeleton rows={6} className="p-0" />
          </Surface>
        </div>
      </div>
    );
  const round = t.matches.filter((m) => m.round === t.round),
    over = round.filter((m) => m.status === "done" || m.status === "cancelled").length;
  const confirm = async (question: { title: string; text: string; action: string; destructive?: boolean }, then: () => unknown) => {
    if (await ask({ ...question, cancel: tr("Not now") })) void then();
  };
  return (
    <div className={PAGE}>
      <PageHead title={<>{t.name}</>} lead={lead} sub={t.group ? tr("{0} · group tournament", { 0: t.group }) : tr("Open tournament")}>
        <StatusBadge t={t} />
        <RegisterButton t={t} />
        {t.myMatch && !held && (
          <Button onClick={() => go(matchUrl(t.myMatch!))}>
            <Play />
            {tr("Play your match")}</Button>
        )}
        {held && (
          <Button variant="outline" className="text-muted-foreground hover:text-destructive" onClick={() => void community.withdraw(t)} data-action="tournament:withdraw">
            <Flag />
            {tr("Give up")}</Button>
        )}
        {t.canManage && t.status === "open" && (
          <Button
            variant="outline"
            onClick={() =>
              confirm(
                { title: tr("Start the tournament now?"), text: tr("The {0} registered players are drawn into the bracket and registration closes.", { 0: t.players }), action: tr("Start now"), destructive: false },
                () => community.manage(t.id, "start"),
              )
            }
          >
            {tr("Start now")}</Button>
        )}
        {t.canManage && (t.status === "open" || t.status === "running") && (
          <Button
            variant="outline"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => confirm({ title: tr("Cancel the tournament?"), text: tr("Its matches stop where they are. This cannot be undone."), action: tr("Cancel the tournament") }, () => community.manage(t.id, "cancel"))}
          >
            {tr("Cancel")}</Button>
        )}
      </PageHead>
      {held && <Standing t={t} />}
      <Strip className="grid-cols-2 md:grid-cols-6">
        <Figure label="Event" value={eventName(t.event)} size="base" />
        <Figure label={t.status === "open" ? "Starts" : "Started"} value={t.status === "open" ? `${day(t.startsAt)} · ${time(t.startsAt)}` : day(t.startedAt ?? t.startsAt)} size="base" />
        <Figure label="Format" value={formatText(t)} size="base" className="col-span-2" />
        <Figure label="Players" value={`${t.players}${t.maxPlayers ? " / " + t.maxPlayers : ""}`} size="base" />
        {t.status === "running" ? (
          <Figure label={roundName(t.round, t.rounds)} value={tr("{0} of {1} over", { 0: over, 1: round.length })} size="base" tone="accent" />
        ) : t.status === "finished" ? (
          <Figure label="Champion" value={t.winner?.username ?? "–"} size="base" tone="warning" />
        ) : t.status === "open" ? (
          <Figure label="Registration" value={tr("closes {0}", { 0: relative(t.startsAt) })} size="base" />
        ) : (
          <Figure label="Status" value={tr("Cancelled")} size="base" />
        )}
      </Strip>
      {t.description && <p className="line-clamp-2 max-w-prose shrink-0 text-sm text-muted-foreground">{t.description}</p>}
      <div className="flex min-h-0 flex-1 gap-4">
        <Surface className="min-w-0 flex-1 gap-3 p-4" aria-label={tr("Bracket")}>
          <SectionHead title="Bracket" />
          {t.matches.length ? (
            <Bracket tournament={t} me={s.user.id} onOpen={(m) => go(matchUrl(m.id))} onAward={t.canManage ? (m, p) => void community.award(m.id, p.id, t.id) : undefined} />
          ) : (
            <Empty icon={Trophy}>
              {t.status === "cancelled" ? tr("Called off before it started.") : tr("The players are drawn into the bracket {0}.", { 0: t.status === "open" ? relative(t.startsAt) : tr("at the start") })}
            </Empty>
          )}
        </Surface>
        <Entrants t={t} />
      </div>
    </div>
  );
}

/** Where the account stands in the tournament it is in: its match to play now, or the round it waits for. */
function Standing({ t }: { t: TournamentDetail }) {
  const mine = t.matches.find((m) => m.id === t.myMatch),
    opponent = mine?.players.find((p) => p && p.id !== s.user.id),
    round = t.matches.filter((m) => m.round === t.round),
    over = round.filter((m) => m.status === "done" || m.status === "cancelled").length;
  return mine ? (
    <MatchReady
      title={tr("{0}: your match is ready", { 0: said(roundName(mine.round, t.rounds)) })}
      text={opponent ? tr("Against {0}. Both of you on the match page and it starts.", { 0: opponent.username }) : tr("It starts once both players are on its page.")}
      match={mine.id}
      action="tournament:play"
    />
  ) : (
    <Alert className="shrink-0 px-4 py-3" data-slot="standing">
      <Check />
      <AlertTitle>{tr("You are still in")}</AlertTitle>
      <AlertDescription className={NUMERIC}>
        {tr("Waiting for the rest of the {0}: {1} of {2} matches over. Your next match opens here by itself.", { 0: said(roundName(t.round, t.rounds)), 1: over, 2: round.length })}
      </AlertDescription>
    </Alert>
  );
}

/** The players registered, in their draw order once the tournament started. */
function Entrants({ t }: { t: TournamentDetail }) {
  return (
    <Surface className="w-64 shrink-0 max-md:hidden" aria-label={tr("Players")}>
      <SectionHead title="Players" meta={t.entrants.length} className="px-4 pt-3" />
      {!t.entrants.length ? (
        <Empty icon={Users} className="p-4">
          {tr("No one yet.")}
        </Empty>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {t.entrants.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              name={p.id === s.user.id ? <span className="text-primary">{p.username}</span> : undefined}
              lead={p.seed ? <span className={cn(NUMERIC, "w-4 shrink-0 text-right text-xs text-muted-foreground")}>{p.seed}</span> : undefined}
            >
              {t.winner?.id === p.id && <Trophy className="size-4 text-warning" />}
            </PersonRow>
          ))}
        </ul>
      )}
    </Surface>
  );
}
