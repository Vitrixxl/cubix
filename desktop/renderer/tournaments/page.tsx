/**
 * Tournaments: the ones open to every player (the administration creates them), to register for until they start,
 * then followed round by round; and one tournament's page, a group's too: where it stands, its players and its
 * bracket, the player's own match a click away.
 */
import { useEffect } from "react";
import { CalendarClock, Check, Play, Trophy, Users, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Icon } from "../base";
import { Avatar, Empty, NUMERIC, PAGE, PageHead, SectionHead } from "../ui";
import { Back, day, Figures, Nothing, PANEL, PANEL_HEAD, relative, time } from "../coaching/parts";
import { community, communityUrl, eventName, formatText, matchUrl, tournamentUrl, type Tournament, type TournamentDetail } from "../community/client";
import { Bracket, roundName } from "./bracket";
import { STATUS_TEXT } from "./format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

export function TournamentsPage() {
  const id = Number(s.view.split("/")[0]);
  return id ? <TournamentView id={id} /> : <TournamentList />;
}

export function StatusBadge({ t }: { t: Pick<Tournament, "status" | "round" | "rounds"> }) {
  return (
    <Badge variant={t.status === "running" ? "default" : "secondary"} className={cn(t.status === "open" && "bg-success/15 text-success", t.status === "cancelled" && "text-muted-foreground")}>
      {t.status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />}
      {said(t.status === "running" ? roundName(t.round, t.rounds) : STATUS_TEXT[t.status])}
    </Badge>
  );
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
      <PageHead title={tr("Tournaments")} sub={tr("Open to every player")} />
      {mine.map((t) => (
        <div key={t.id} className="flex shrink-0 items-center gap-4 rounded-xl border border-primary/40 bg-primary/10 px-5 py-3" data-slot="my-match">
          <Trophy className="size-5 text-primary" />
          <span className="flex-1 text-sm">
            {tr("{0} · your match in {1} is ready.", { 0: said(roundName(t.round, t.rounds)), 1: t.name })}</span>
          <Button onClick={() => go(matchUrl(t.myMatch!))}>
            <Play />
            {tr("Play")}</Button>
        </div>
      ))}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
        {!list ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : !list.length ? (
          <Empty>
            <Trophy className="size-6" />
            {tr("No tournament yet. The next ones will be listed here.")}</Empty>
        ) : (
          sections.map(
            ([title, items]) =>
              items.length > 0 && (
                <section key={title} className="flex flex-col gap-2" aria-label={tr(title)}>
                  <SectionHead title={title} meta={items.length} />
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
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

export function TournamentCard({ t }: { t: Tournament }) {
  return (
    <article className={cn(PANEL, "gap-4 p-5")} data-tournament={t.id}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon name={"Puzzle" + t.event} size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <button type="button" onClick={() => go(tournamentUrl(t.id))} className="truncate text-left text-base font-semibold tracking-tight outline-none hover:text-primary focus-visible:text-primary">
            {t.name}
          </button>
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {eventName(t.event)} · {formatText(t)}
          </span>
        </div>
        <StatusBadge t={t} />
      </div>
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarClock className="size-3.5" />
          {t.status === "open" ? tr("Starts {0}", { 0: when(t.startsAt) }) : tr("Started {0}", { 0: day(t.startedAt ?? t.startsAt) })}
        </span>
        <span className="flex items-center gap-2">
          <Users className="size-3.5" />
          <span className={NUMERIC}>
            {t.players}
            {t.maxPlayers ? ` / ${t.maxPlayers}` : ""} {" "}{tr("players")}</span>
        </span>
        {t.winner && (
          <span className="flex items-center gap-2 text-foreground">
            <Trophy className="size-3.5 text-warning" />
            {t.winner.username}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2">
        <RegisterButton t={t} size="sm" />
        {t.myMatch && (
          <Button size="sm" onClick={() => go(matchUrl(t.myMatch!))}>
            <Play />
            {tr("Play your match")}</Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => go(tournamentUrl(t.id))}>
          {t.status === "open" ? tr("Details") : tr("Bracket")}
        </Button>
      </div>
    </article>
  );
}

function TournamentView({ id }: { id: number }) {
  useEffect(() => {
    void community.load(`tournament:${id}`);
  }, [id]);
  const t = community.details.get(id);
  const back = t?.groupId ? communityUrl(`groups/${t.groupId}/tournaments`) : tournamentUrl();
  const lead = <Back to={back} />;
  if (!t)
    return (
      <div className={PAGE}>
        <PageHead title={tr("Tournament")} lead={lead} />
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      </div>
    );
  const round = t.matches.filter((m) => m.round === t.round),
    over = round.filter((m) => m.status === "done" || m.status === "cancelled").length;
  return (
    <div className={PAGE}>
      <PageHead title={<>{t.name}</>} lead={lead} sub={t.group ? tr("{0} · group tournament", { 0: t.group }) : tr("Open tournament")}>
        <StatusBadge t={t} />
        <RegisterButton t={t} />
        {t.myMatch && (
          <Button onClick={() => go(matchUrl(t.myMatch!))}>
            <Play />
            {tr("Play your match")}</Button>
        )}
        {t.canManage && t.status === "open" && (
          <Confirm title={tr("Start the tournament now?")} text={tr("The {0} registered players are drawn into the bracket and registration closes.", { 0: t.players })} action="Start now" onConfirm={() => community.manage(t.id, "start")}>
            {tr("Start now")}</Confirm>
        )}
        {t.canManage && (t.status === "open" || t.status === "running") && (
          <Confirm title={tr("Cancel the tournament?")} text={tr("Its matches stop where they are. This cannot be undone.")} action="Cancel the tournament" destructive onConfirm={() => community.manage(t.id, "cancel")}>
            {tr("Cancel")}</Confirm>
        )}
      </PageHead>
      <Figures
        items={[
          [tr("Event"), eventName(t.event)],
          [t.status === "open" ? tr("Starts") : tr("Started"), t.status === "open" ? `${day(t.startsAt)} · ${time(t.startsAt)}` : day(t.startedAt ?? t.startsAt)],
          [tr("Format"), formatText(t)],
          [tr("Players"), `${t.players}${t.maxPlayers ? " / " + t.maxPlayers : ""}`],
          t.status === "running"
            ? [roundName(t.round, t.rounds), tr("{0} of {1} over", { 0: over, 1: round.length })]
            : t.status === "finished"
              ? [tr("Champion"), t.winner?.username ?? "–", "text-warning"]
              : t.status === "open"
                ? [tr("Registration"), tr("closes {0}", { 0: relative(t.startsAt) })]
                : [tr("Status"), tr("Cancelled")],
        ]}
      />
      {t.description && <p className="shrink-0 text-sm text-muted-foreground">{t.description}</p>}
      <div className="flex min-h-0 flex-1 gap-4">
        <section className={cn(PANEL, "min-w-0 flex-1")} aria-label={tr("Bracket")}>
          <h2 className={PANEL_HEAD}>{tr("Bracket")}</h2>
          {t.matches.length ? (
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
              <Bracket
                tournament={t}
                me={s.user.id}
                onOpen={(m) => go(matchUrl(m.id))}
                onAward={t.canManage ? (m, p) => void community.award(m.id, p.id, t.id) : undefined}
              />
            </div>
          ) : (
            <Nothing>{t.status === "cancelled" ? tr("Called off before it started.") : tr("The players are drawn into the bracket {0}.", { 0: t.status === "open" ? relative(t.startsAt) : "at the start" })}</Nothing>
          )}
        </section>
        <Entrants t={t} />
      </div>
    </div>
  );
}

/** The players registered, in their draw order once the tournament started. */
function Entrants({ t }: { t: TournamentDetail }) {
  return (
    <section className={cn(PANEL, "w-64 shrink-0")} aria-label={tr("Players")}>
      <h2 className={PANEL_HEAD}>
        {tr("Players")}{" "}<span className={cn(NUMERIC, "text-muted-foreground")}>{t.entrants.length}</span>
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {!t.entrants.length && <li className="px-2.5 py-2 text-sm text-muted-foreground">{tr("No one yet.")}</li>}
        {t.entrants.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-3 rounded-lg px-2.5 py-1.5", p.id === s.user.id && "bg-primary/10")}>
            {p.seed && <span className={cn(NUMERIC, "w-5 text-right text-xs text-muted-foreground")}>{p.seed}</span>}
            <Avatar name={p.username} src={p.avatar} size={24} />
            <span className="truncate text-sm">{p.username}</span>
            {t.winner?.id === p.id && <Trophy className="ml-auto size-4 text-warning" />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A button asking to confirm before it acts. */
export function Confirm({ title, text, action, destructive = false, size = "default", onConfirm, children }: { title: string; text: string; action: string; destructive?: boolean; size?: "default" | "sm"; onConfirm: () => unknown; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size={size} className={destructive ? "text-muted-foreground hover:text-destructive" : undefined} />}>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("Not now")}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={() => void onConfirm()}>
            {said(action)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
