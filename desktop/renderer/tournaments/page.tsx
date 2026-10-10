/**
 * Tournaments, drawn as the duel's arena: the ones open to every player (the administration creates them) and those of
 * the account's groups listed on the left, the one picked on the stage in the middle with its one action (play your
 * match, register, see the bracket), its players on the right. And one tournament's page: where it stands and what can
 * be done on a line over it, its bracket, its players beside.
 */
import { useEffect, useState } from "react";
import { Check, Crown, FastForward, Flag, Play, Swords, Trophy, Users, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { ask } from "../confirm";
import { Avatar, Empty, FADE, ListSkeleton, NUMERIC, PAGE, PageHead, Surface, usePhone, useViewport } from "../ui";
import { Back, day, relative, time } from "../coaching/parts";
import { community, communityUrl, eventName, formatText, matchUrl, tournamentUrl, type Tournament, type TournamentDetail } from "../community/client";
import { Bracket, roundName } from "./bracket";
import { StageAction, KICKER, PanelHead, Rank, StageMeter, Stage, StageFigure, Steps } from "./format";
import { cn } from "@/lib/utils";
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
const full = (t: Tournament) => !!t.maxPlayers && t.players >= t.maxPlayers;
const players = (t: Tournament) => `${t.players}${t.maxPlayers ? " / " + t.maxPlayers : ""}`;

/** Register, or take the registration back, while the tournament has not started. */
export function RegisterButton({ t, size = "default" }: { t: Tournament; size?: "default" | "sm" }) {
  if (t.status !== "open") return null;
  return t.registered ? (
    <Button variant="secondary" size={size} onClick={() => void community.register(t.id, false)} className="group/registered" data-action={"tournament:unregister:" + t.id}>
      <Check className="group-hover/registered:hidden" />
      <X className="hidden group-hover/registered:block" />
      <span className="group-hover/registered:hidden">{tr("Registered")}</span>
      <span className="hidden group-hover/registered:inline">{tr("Unregister")}</span>
    </Button>
  ) : (
    <Button size={size} disabled={full(t)} onClick={() => void community.register(t.id, true)} data-action={"tournament:register:" + t.id}>
      {full(t) ? tr("Full") : tr("Register")}
    </Button>
  );
}

/** The account's match ready to be played, as the duel's challenge card: the round, where, and the way to it. */
function MatchReady({ title, text, match, action }: { title: string; text: string; match: number; action?: string }) {
  return (
    <div className="grid shrink-0 gap-2.5 rounded-[18px] bg-muted p-3.5" data-slot="my-match">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Swords className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <b className="truncate text-[15px]">{title}</b>
          <span className="truncate text-[13px] text-muted-foreground">{text}</span>
        </span>
      </div>
      <Button onClick={() => go(matchUrl(match))} data-action={action}>
        <Play />
        {tr("Play your match")}
      </Button>
    </div>
  );
}

/** The order the list keeps: under way, then registration open, then the past. */
const SECTIONS: [string, (t: Tournament) => boolean][] = [
  ["Under way", (t) => t.status === "running"],
  ["Registration open", (t) => t.status === "open"],
  ["Past", (t) => t.status === "finished" || t.status === "cancelled"],
];

function TournamentList() {
  useEffect(() => {
    void community.load("tournaments");
  }, []);
  const { w } = useViewport(),
    phone = usePhone(),
    wide = w >= 1280,
    list = community.tournaments,
    ordered = SECTIONS.flatMap(([, keep]) => list?.filter(keep) ?? []),
    mine = list?.find((t) => t.myMatch),
    [picked, setPicked] = useState<number | null>(null),
    shown = ordered.find((t) => t.id === picked) ?? mine ?? ordered.find((t) => t.status === "open") ?? ordered[0];
  const rows = (
    <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
      {SECTIONS.map(([title, keep]) => {
        const items = list?.filter(keep) ?? [];
        return (
          items.length > 0 && (
            <section key={title} className="flex flex-col gap-0.5" aria-label={tr(title)}>
              <h3 className={cn(KICKER, "px-3 pb-1")}>
                {tr(title)} <span className={NUMERIC}>{items.length}</span>
              </h3>
              {items.map((t) => (
                <TournamentRow key={t.id} t={t} current={!phone && t.id === shown?.id} onClick={() => (phone ? go(tournamentUrl(t.id)) : setPicked(t.id))} />
              ))}
            </section>
          )
        );
      })}
    </div>
  );
  return (
    <div className={cn(PAGE, "tournaments")}>
      {phone && <PageHead title={tr("Tournaments")} sub={tr("Open to every player, and your groups'")} />}
      {!list ? (
        <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[340px_minmax(0,1fr)]" aria-busy="true" aria-label={tr("Loading")}>
          <Surface className="p-4">
            <ListSkeleton rows={6} className="p-0" />
          </Surface>
          <div className="flex flex-col items-center justify-center gap-6 max-md:hidden">
            <Skeleton className="size-[clamp(168px,30vh,260px)] rounded-full" />
            <Skeleton className="h-8 w-80" />
          </div>
        </div>
      ) : !list.length ? (
        <Empty icon={Trophy} title={tr("No tournament yet")} className="flex-1">
          {tr("No tournament yet. The next ones will be listed here.")}
        </Empty>
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-5", !phone && "md:grid-cols-[320px_minmax(0,1fr)]", wide && "md:grid-cols-[340px_minmax(0,1fr)_320px]")}>
          <Surface className="gap-3.5 p-4 pt-5">
            {!phone && <PanelHead title="Tournaments" meta={list.length} className="px-1" />}
            {rows}
            {mine && (
              <MatchReady title={tr("{0} · your match is ready", { 0: said(roundName(mine.round, mine.rounds)) })} text={`${mine.name} · ${formatText(mine)}`} match={mine.myMatch!} action="tournament:play" />
            )}
          </Surface>
          {!phone && shown && <TournamentStage t={community.summary(shown)} />}
          {wide && shown && (
            <Surface className="gap-3.5 p-4 pt-5">
              <Entrants id={shown.id} />
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}

/** A tournament in the list: its name, where and what, and the step it is at; the account's match marked. */
function TournamentRow({ t, current, onClick }: { t: Tournament; current: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "true" : undefined}
      data-tournament={t.id}
      data-status={t.status}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-[14px] px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current]:bg-muted"
    >
      <b className="truncate text-[15px] font-bold">{t.name}</b>
      <Steps t={t} />
      <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {t.myMatch ? <span className="shrink-0 font-semibold text-primary">{tr("Your match")} ·</span> : t.registered && t.status === "open" ? <span className="shrink-0 font-semibold text-success">{tr("Registered")} ·</span> : null}
        <span className="truncate">{[t.group, eventName(t.event), formatText(t)].filter(Boolean).join(" · ")}</span>
      </span>
    </button>
  );
}

/** The tournament picked, on the stage: its name, its one action as the disc (or how full it is), its figures. */
function TournamentStage({ t }: { t: Tournament }) {
  const open = () => go(tournamentUrl(t.id));
  const action = t.myMatch ? (
    <StageAction icon={Play} title={tr("Play")} sub={tr("your {0} match", { 0: said(roundName(t.round, t.rounds)).toLowerCase() })} onClick={() => go(matchUrl(t.myMatch!))} data-action="tournament:play" />
  ) : t.status === "open" && !t.registered && !full(t) ? (
    <StageAction icon={Check} title={tr("Register")} sub={tr("starts {0}", { 0: relative(t.startsAt) })} onClick={() => void community.register(t.id, true)} data-action={"tournament:register:" + t.id} />
  ) : t.status === "open" ? (
    <StageMeter share={t.maxPlayers ? t.players / t.maxPlayers : 1} value={players(t)} label={t.registered ? tr("You are registered") : tr("Full")} tone="good" />
  ) : (
    <StageAction icon={Trophy} title={tr("Bracket")} sub={t.status === "running" ? said(roundName(t.round, t.rounds)) : t.winner ? tr("{0} won it", { 0: t.winner.username }) : tr("Cancelled")} onClick={open} />
  );
  return (
    <Stage
      className="tournament-stage"
      data-tournament={t.id}
      lead={
        <div className="-mt-1 flex flex-wrap items-center justify-center gap-2">
          {t.registered && t.status === "open" && <RegisterButton t={t} />}
          <Button variant="ghost" onClick={open} data-action="tournament:open">
            {t.status === "open" ? tr("See the tournament") : tr("Open the tournament")}
          </Button>
        </div>
      }
      figures={
        <>
          <StageFigure value={eventName(t.event)} label="Event" />
          <StageFigure value={players(t)} label="Players" />
          {t.status === "open" ? (
            <StageFigure value={`${day(t.startsAt)} · ${time(t.startsAt)}`} label="Starts" />
          ) : t.status === "running" ? (
            <StageFigure value={`${t.round} / ${t.rounds}`} label="Round" tone="accent" />
          ) : (
            <StageFigure value={t.winner?.username ?? "–"} label="Champion" />
          )}
        </>
      }
    >
      <div className="flex max-w-xl flex-col items-center gap-1.5">
        <span className={KICKER}>{t.group ? tr("{0} · group tournament", { 0: t.group }) : tr("Open tournament")}</span>
        <h2 className="text-[clamp(26px,3.4vw,40px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance">{t.name}</h2>
        <p className="text-sm text-muted-foreground">{formatText(t)}</p>
      </div>
      {action}
    </Stage>
  );
}

/** The players registered, in their draw order once the tournament started; the champion crowned. */
function Entrants({ id, className }: { id: number; className?: string }) {
  useEffect(() => {
    if (!community.details.has(id)) void community.load(`tournament:${id}`);
  }, [id]);
  const t = community.details.get(id);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)} aria-label={tr("Players")}>
      <PanelHead title="Players" meta={t ? t.entrants.length : undefined} className="px-1" />
      {!t ? (
        <ListSkeleton rows={6} className="p-0" />
      ) : !t.entrants.length ? (
        <Empty icon={Users} className="flex-1">
          {tr("No one yet.")}
        </Empty>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
          {t.entrants.map((p, i) => {
            const me = p.id === s.user.id;
            return (
              <li key={p.id} className={cn("flex min-h-11 items-center gap-3 rounded-[14px] px-2.5 py-1.5", me && "bg-primary/10")} data-person={p.username}>
                <Rank n={p.seed ?? i + 1} />
                <Avatar name={p.username} src={p.avatar} size={32} />
                <span className={cn("min-w-0 flex-1 truncate text-[15px] font-bold", me && "text-primary")}>{p.username}</span>
                {t.winner?.id === p.id && <Crown className="size-4 text-warning" aria-label={tr("Champion")} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TournamentView({ id }: { id: number }) {
  useEffect(() => {
    void community.load(`tournament:${id}`);
  }, [id]);
  const phone = usePhone(),
    t = community.details.get(id);
  // A group's tournament goes back to the group's conversation, where its card is.
  const back = t?.groupId ? communityUrl(`groups/${t.groupId}`) : tournamentUrl();
  // Still in it while it runs: the tournament is the whole app, left only by giving up.
  const held = community.competition?.tournament === id;
  const lead = held ? <Trophy className="size-5 text-warning" /> : <Back to={back} />;
  if (!t)
    return (
      <div className={PAGE} aria-busy="true" aria-label={tr("Loading")}>
        <div className="flex h-9 items-center gap-2">
          {lead}
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-80 shrink-0" />
        <div className="flex min-h-0 flex-1 gap-5">
          <Surface className="min-w-0 flex-1 gap-3 p-4">
            <div className="flex flex-1 gap-14">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-1 flex-col justify-around gap-3">
                  {Array.from({ length: 4 >> i }, (_, k) => (
                    <Skeleton key={k} className="h-20 rounded-2xl" />
                  ))}
                </div>
              ))}
            </div>
          </Surface>
          <Surface className="w-80 shrink-0 p-4 max-md:hidden">
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
  const actions = (
    <>
      <RegisterButton t={t} />
      {t.myMatch && !held && (
        <Button onClick={() => go(matchUrl(t.myMatch!))}>
          <Play />
          {tr("Play your match")}
        </Button>
      )}
      {held && (
        <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => void community.withdraw(t)} data-action="tournament:withdraw" aria-label={tr("Give up")}>
          <Flag />
          <span className="max-md:hidden">{tr("Give up")}</span>
        </Button>
      )}
      {t.canManage && t.status === "open" && (
        <Button
          variant="secondary"
          aria-label={tr("Start now")}
          onClick={() =>
            confirm(
              { title: tr("Start the tournament now?"), text: tr("The {0} registered players are drawn into the bracket and registration closes.", { 0: t.players }), action: tr("Start now"), destructive: false },
              () => community.manage(t.id, "start"),
            )
          }
        >
          <FastForward />
          <span className="max-md:hidden">{tr("Start now")}</span>
        </Button>
      )}
      {t.canManage && (t.status === "open" || t.status === "running") && (
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          aria-label={tr("Cancel the tournament")}
          onClick={() => confirm({ title: tr("Cancel the tournament?"), text: tr("Its matches stop where they are. This cannot be undone."), action: tr("Cancel the tournament") }, () => community.manage(t.id, "cancel"))}
        >
          <X />
          <span className="max-md:hidden">{tr("Cancel")}</span>
        </Button>
      )}
    </>
  );
  return (
    <div className={cn(PAGE, "tournament")}>
      <div className={cn("flex min-h-9 shrink-0 items-center gap-2", FADE)}>
        {lead}
        <span className={cn(KICKER, "mr-auto truncate")}>{[t.group ? tr("{0} · group tournament", { 0: t.group }) : tr("Open tournament"), eventName(t.event), formatText(t)].join(" · ")}</span>
        {!phone && actions}
      </div>
      <header className="flex shrink-0 flex-wrap items-end gap-x-10 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Steps t={t} />
          <h1 className="truncate text-[26px] leading-none font-extrabold tracking-[-0.03em] md:text-[34px]">{t.name}</h1>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 [&>div]:items-start">
          <StageFigure value={players(t)} label="Players" />
          {t.status === "open" ? (
            <StageFigure value={relative(t.startsAt)} label={tr("Starts {0}", { 0: `${day(t.startsAt)} · ${time(t.startsAt)}` })} />
          ) : t.status === "running" ? (
            <StageFigure value={`${over} / ${round.length}`} label={tr("{0} · matches over", { 0: said(roundName(t.round, t.rounds)) })} tone="accent" />
          ) : t.status === "finished" ? (
            <StageFigure value={t.winner?.username ?? "–"} label="Champion" />
          ) : (
            <StageFigure value={tr("Cancelled")} label="Status" />
          )}
        </div>
        {phone && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {t.description && <p className="line-clamp-2 max-w-prose shrink-0 text-sm text-muted-foreground">{t.description}</p>}
      {held && <Standing t={t} />}
      <div className="flex min-h-0 flex-1 gap-5">
        <Surface className="min-w-0 flex-1 gap-3 p-4 pt-[18px]" aria-label={tr("Bracket")}>
          <PanelHead title="Bracket" meta={t.matches.length ? `${t.round} / ${t.rounds}` : undefined} className="px-1" />
          {t.matches.length ? (
            <Bracket tournament={t} me={s.user.id} onOpen={(m) => go(matchUrl(m.id))} onAward={t.canManage ? (m, p) => void community.award(m.id, p.id, t.id) : undefined} />
          ) : (
            <Empty icon={Trophy} className="flex-1">
              {t.status === "cancelled" ? tr("Called off before it started.") : tr("The players are drawn into the bracket {0}.", { 0: t.status === "open" ? relative(t.startsAt) : tr("at the start") })}
            </Empty>
          )}
        </Surface>
        {!phone && (
          <Surface className="w-80 shrink-0 gap-3 p-4 pt-[18px] max-lg:w-64">
            <Entrants id={t.id} />
          </Surface>
        )}
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
    <p className="flex shrink-0 items-center gap-2.5 rounded-[18px] bg-muted px-4 py-3 text-sm" data-slot="standing">
      <Check className="size-4 shrink-0 text-success" />
      <b className="shrink-0">{tr("You are still in")}</b>
      <span className={cn(NUMERIC, "min-w-0 truncate text-muted-foreground")}>
        {tr("Waiting for the rest of the {0}: {1} of {2} matches over. Your next match opens here by itself.", { 0: said(roundName(t.round, t.rounds)), 1: over, 2: round.length })}
      </span>
    </p>
  );
}
