/**
 * The community's contacts (/community/people): one list of the friends and the groups, the requests waiting on top,
 * finding players and the link that adds the account in the friends' dialog; beside it the open one's page. A friend's:
 * the score between the two, what waits for the account between them, their battles in the history. A group's: its
 * members and its tournaments to come, its battles and past tournaments in the history. The address keeps the open
 * one (/community/people/u/<id>, /community/people/g/<id>).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, MoreHorizontal, Pencil, Swords, Trophy, UserMinus, UserPlus, UserRoundX, Users } from "lucide-react";
import { Link } from "react-router";
import { store as s } from "../store";
import { go } from "../navigation";
import { Avatar, Empty, LINK, LINK_ACCENT, ListSkeleton, NUMERIC, ROW, SearchField, Segmented, StateMark, Surface, Tip, plural, usePhone } from "../ui";
import { day, relative, time } from "../coaching/parts";
import { MATCH_STATUS, community, communityUrl, eventName, formatText, scoreOf, seatIn, type Conversation, type Match, type Person } from "./client";
import { GroupMark, organiser, waiting } from "./messages";
import { InviteDialog, MemberGrid } from "./groups";
import { MatchDialog, TournamentChatCard } from "./cards";
import { BattleDialog, EditGroupDialog, FriendsDialog, HistoryDialog, NewGroupDialog, TournamentDialog } from "./dialogs";
import { VirtualList } from "../virtual";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { localFormat, tr } from "../../../src/client/i18n";
import { said } from "../base";

export const peopleUrl = (kind?: "u" | "g", id?: string | number) => communityUrl("people" + (kind ? `/${kind}/${id}` : ""));

/** The direct conversation with a player, if there is one. */
const directWith = (id: string) => community.conversations?.find((c) => c.kind === "direct" && c.with?.id === id);
/** The battles of a conversation, from its cards, the latest first. */
const battlesIn = (c: Conversation | undefined) =>
  (c ? (community.messages.get(c.id) ?? []) : [])
    .filter((m) => m.match)
    .map((m) => community.card(m.match!))
    .reverse();
/** The account's wins and losses among battles played. */
function tally(battles: Match[]) {
  const done = battles.filter((b) => b.status === "done");
  const won = done.filter((b) => b.winner === s.user.id).length;
  return { won, lost: done.length - won, played: done.length };
}

const FILTERS = ["all", "friends", "groups", "requests"] as const;
type Filter = (typeof FILTERS)[number];

export function PeoplePage({ kind, id }: { kind: string; id: string }) {
  const phone = usePhone(),
    me = community.me,
    friends = me?.friends ?? [],
    groups = me?.groups ?? [];
  useEffect(() => {
    void community.load("conversations");
  }, []);
  // ponytail: one request per friend for the score in the list; a count from the server when friends run to hundreds.
  useEffect(() => {
    for (const c of community.conversations ?? []) if (c.kind === "direct" && !community.messages.has(c.id)) void community.load(`messages:${c.id}`);
  }, [community.conversations]);
  // On a wide window the first friend (or group) opens when none is chosen; a phone shows the list first.
  useEffect(() => {
    if (phone || kind || !me) return;
    if (friends[0]) go(peopleUrl("u", friends[0].id), true);
    else if (groups[0]) go(peopleUrl("g", groups[0].id), true);
  }, [phone, kind, me]);
  const friend = kind === "u" ? friends.find((f) => f.id === id) : undefined,
    group = kind === "g" ? groups.find((g) => g.id === Number(id)) : undefined;
  return (
    <div className="flex min-h-0 flex-1 gap-5">
      {(!phone || !kind) && <Contacts kind={kind} id={id} className={phone ? "w-full" : undefined} />}
      {(!phone || kind) && (
        <Surface className="min-w-0 flex-1 overflow-hidden" data-slot="people-page">
          {friend ? (
            <FriendPage key={friend.id} friend={friend} phone={phone} />
          ) : group ? (
            <GroupPage key={group.id} id={group.id} phone={phone} />
          ) : !me ? (
            <ListSkeleton className="p-6" />
          ) : (
            <Empty icon={kind ? UserRoundX : Users} title={kind ? "No longer among your friends and groups." : "Add friends, or make a group."} />
          )}
        </Surface>
      )}
    </div>
  );
}

/** The list: its title, a new group and adding friends, the search, the filters, the requests, the friends and the groups. */
function Contacts({ kind, id, className }: { kind: string; id: string; className?: string }) {
  const me = community.me,
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<Filter>("all"),
    [adding, setAdding] = useState(false),
    q = query.trim().toLowerCase(),
    friends = (me?.friends ?? []).filter((f) => f.username.toLowerCase().includes(q)),
    groups = (me?.groups ?? []).filter((g) => g.name.toLowerCase().includes(q)),
    requests = (me?.incoming.length ?? 0) + (me?.invitations.length ?? 0) + (me?.outgoing.length ?? 0),
    scroller = useRef<HTMLDivElement>(null);
  return (
    <Surface className={cn("w-[380px] shrink-0 gap-3 pt-4 pb-3 max-md:w-full", className)} data-slot="contacts">
      <div className="flex shrink-0 items-center gap-2 px-5">
        <h1 className="mr-auto text-2xl font-extrabold tracking-[-0.02em]">{tr("Contacts")}</h1>
        <NewGroupDialog trigger={<Button variant="outline" data-action="community:new-group">+ {tr("Group")}</Button>} />
        <Button variant="outline" onClick={() => setAdding(true)} data-action="contacts:add">
          <UserPlus />
          {tr("Add")}
        </Button>
        <FriendsDialog open={adding} onOpenChange={setAdding} />
      </div>
      <div className="shrink-0 px-3">
        <SearchField value={query} onChange={setQuery} placeholder="A friend or a group" action="contacts:search" className="h-10" />
      </div>
      <Segmented
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        label="Contacts"
        action="people:filter:"
        className="mx-3 shrink-0 flex-nowrap self-start"
        options={[
          { id: "all", label: "All" },
          { id: "friends", label: "Friends", count: me?.friends.length || undefined },
          { id: "groups", label: "Groups", count: me?.groups.length || undefined },
          { id: "requests", label: "Requests", count: requests || undefined },
        ]}
      />
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-1">
        {!me ? (
          <ListSkeleton className="p-0" />
        ) : (
          <>
            {!q && (filter === "all" || filter === "requests") && <Requests empty={filter === "requests"} />}
            {(filter === "all" || filter === "friends") && (
              <Part title={tr("Friends")} count={filter === "all" ? friends.length : undefined}>
                {!friends.length ? (
                  <p className="px-2 text-[13px] text-muted-foreground">{q ? tr("No friend by that name.") : tr("No one yet.")}</p>
                ) : (
                  <VirtualList items={friends} scroller={scroller} estimate={56} gap={2} rowKey={(f) => f.id} row={(f, _, measure) => <FriendRow ref={measure} f={f} active={kind === "u" && id === f.id} />} />
                )}
              </Part>
            )}
            {(filter === "all" || filter === "groups") && (
              <Part title={tr("Groups")} count={filter === "all" ? groups.length : undefined}>
                {!groups.length ? (
                  <p className="px-2 text-[13px] text-muted-foreground">{q ? tr("No group by that name.") : tr("None yet")}</p>
                ) : (
                  <VirtualList
                    items={groups}
                    scroller={scroller}
                    estimate={56}
                    gap={2}
                    rowKey={(g) => g.id}
                    row={(g, _, measure) => (
                      <Line
                        ref={measure}
                        to={peopleUrl("g", g.id)}
                        active={kind === "g" && Number(id) === g.id}
                        face={<GroupMark size={40} />}
                        name={g.name}
                        sub={[plural(g.members, "member"), g.role === "owner" ? tr("you own it") : g.role === "admin" ? tr("you are admin") : ""].filter(Boolean).join(" · ")}
                        data-group={g.id}
                      />
                    )}
                  />
                )}
              </Part>
            )}
          </>
        )}
      </div>
    </Surface>
  );
}

/** A titled part of the list. */
function Part({ title, count, children }: { title: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5" aria-label={typeof title === "string" ? title : undefined}>
      <h2 className="flex items-center gap-2 px-2 pb-1 text-xs font-bold text-muted-foreground">
        {title}
        {!!count && <span className={NUMERIC}>{count}</span>}
      </h2>
      {children}
    </section>
  );
}

/** A friend or a group in the list: the face, the name, a line under it, and on the right what stands between you. */
function Line({ to, active, face, name, sub, end, ref, ...rest }: { to: string; active: boolean; face: React.ReactNode; name: React.ReactNode; sub: React.ReactNode; end?: React.ReactNode; ref?: (el: HTMLElement | null) => void } & Record<`data-${string}`, unknown>) {
  return (
    <Link ref={ref} to={to} aria-current={active ? "page" : undefined} className={cn(ROW, "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2.5 py-2 aria-[current=page]:bg-muted")} {...rest}>
      {face}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-bold">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      {end}
    </Link>
  );
}

function FriendRow({ f, active, ref }: { f: Person & { since: number }; active: boolean; ref?: (el: HTMLElement | null) => void }) {
  const c = directWith(f.id),
    loaded = c && community.messages.has(c.id),
    t = tally(battlesIn(c));
  return (
    <Line
      ref={ref}
      to={peopleUrl("u", f.id)}
      active={active}
      face={<Avatar name={f.username} src={f.avatar} size={40} />}
      name={f.username}
      sub={tr("Friends since {0}", { 0: day(f.since) })}
      data-person={f.username}
      end={
        loaded && (
          <span className={cn(NUMERIC, "flex flex-col items-end text-[11px] font-semibold text-muted-foreground")}>
            <b className={cn("text-[15px] font-extrabold", t.won > t.lost ? "text-success" : t.won < t.lost ? "text-destructive" : "text-foreground")}>{t.played ? `${t.won}–${t.lost}` : "–"}</b>
            {t.played ? plural(t.played, "battle") : tr("none yet")}
          </span>
        )
      }
    />
  );
}

/** What waits for an answer, each in a card of its own: friend requests, group invitations, then the requests sent. */
function Requests({ empty }: { empty: boolean }) {
  const me = community.me!,
    count = me.incoming.length + me.invitations.length;
  if (!count && !me.outgoing.length)
    return empty ? <Empty icon={Check} className="p-6">{tr("Nothing new")}</Empty> : null;
  const CARD = "flex items-start gap-3 rounded-2xl bg-muted px-3.5 py-3";
  return (
    <Part title={tr("Requests")} count={count}>
      <ul className="flex flex-col gap-2" data-slot="requests">
        {me.incoming.map((p) => (
          <li key={p.id} className={CARD} data-request={p.username}>
            <Avatar name={p.username} src={p.avatar} size={32} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-muted-foreground">
              <span>
                <b className="font-bold text-foreground">{p.username}</b> {tr("wants to be your friend")} · {relative(p.at)}
              </span>
              <span className="flex gap-4">
                <button type="button" className={LINK_ACCENT} onClick={() => void community.acceptFriend(p.id)} data-action={"friend:accept:" + p.username}>
                  {tr("Accept")}
                </button>
                <button type="button" className={cn(LINK, "hover:text-destructive")} onClick={() => void community.removeFriend(p.id)}>
                  {tr("Decline")}
                </button>
              </span>
            </span>
          </li>
        ))}
        {me.invitations.map((g) => (
          <li key={g.id} className={CARD} data-invitation={g.id}>
            <GroupMark size={32} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-muted-foreground">
              <span>
                {tr("{0} invites you to the group", { 0: g.invitedBy })} <b className="font-bold text-foreground">{g.name}</b> · <span className={NUMERIC}>{plural(g.members, "member")}</span>
              </span>
              <span className="flex gap-4">
                <button type="button" className={LINK_ACCENT} aria-label={tr("Join {0}", { 0: g.name })} onClick={() => void community.join(g.id)}>
                  {tr("Join")}
                </button>
                <button type="button" className={cn(LINK, "hover:text-destructive")} onClick={() => void community.remove(g.id, s.user.id)}>
                  {tr("Decline")}
                </button>
              </span>
            </span>
          </li>
        ))}
        {me.outgoing.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-accent px-3.5 py-3" data-sent={p.username}>
            <Avatar name={p.username} src={p.avatar} size={32} className="opacity-70" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-muted-foreground">
              <span>
                {tr("Sent to")} <b className="font-bold text-foreground">{p.username}</b> · {relative(p.at)}
              </span>
              <button type="button" className={cn(LINK, "self-start")} onClick={() => void community.removeFriend(p.id)}>
                {tr("Take back")}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** The top of a page: the way back on phones, the face, the name and a line, the actions on the right. */
function Head({ back, face, title, sub, children }: { back: boolean; face: React.ReactNode; title: React.ReactNode; sub: React.ReactNode; children: React.ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-6 pt-5 pb-3 max-md:px-4">
      {back && (
        <Tip content={tr("Contacts")}>
          <Button variant="ghost" size="icon" aria-label={tr("Contacts")} onClick={() => go(peopleUrl())}>
            <ChevronLeft />
          </Button>
        </Tip>
      )}
      {face}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="truncate text-3xl font-extrabold tracking-[-0.03em] max-md:text-2xl">{title}</h2>
        <span className={cn(NUMERIC, "flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground")}>{sub}</span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full">{children}</span>
    </header>
  );
}

/** A small title over a column of the page. */
const Caption = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <h3 className="flex min-h-6 items-center gap-2 text-xs font-bold text-muted-foreground">
    {children}
    {action && <span className="ml-auto">{action}</span>}
  </h3>
);

const shortDate = localFormat({ day: "numeric", month: "short" });
const when = (at: number) => (Date.now() - at < 86_400_000 ? time(at) : shortDate.format(at));

/** Battles as lines: when, the event, how it is won, the score and where it stands for the account; each opens its detail. */
function BattleLines({ battles, group = false }: { battles: Match[]; group?: boolean }) {
  const [shown, setShown] = useState<Match | null>(null);
  return (
    <>
      <ul className="-mx-2.5 flex flex-col" data-slot="battles">
        {battles.map((b) => {
          const seat = seatIn(b, s.user.id),
            [a, z] = scoreOf(b),
            mine = seat === null ? [a, z] : seat === 0 ? [a, z] : [z, a],
            won = b.status === "done" && seat !== null && b.winner === s.user.id;
          return (
            <li key={b.id}>
              <button type="button" className={cn(ROW, "grid w-full grid-cols-[3.5rem_2.5rem_minmax(0,1fr)_auto_6rem] items-center gap-3 px-2.5 py-2 text-[13px]")} onClick={() => setShown(b)} data-battle-row={b.id}>
                <span className={cn(NUMERIC, "text-[11px] text-muted-foreground")}>{when(b.finishedAt ?? b.createdAt)}</span>
                <b className="font-extrabold">{eventName(b.event)}</b>
                <span className="truncate text-muted-foreground">
                  {group ? `${b.players[0]?.username ?? ""} ${tr("vs")} ${b.players[1]?.username ?? tr("anyone")}` : formatText(b)}
                </span>
                <b className={cn(NUMERIC, "text-[15px] font-extrabold")}>{b.status === "done" || b.status === "live" ? `${mine[0]}–${mine[1]}` : "–"}</b>
                <span className="justify-self-end">
                  {b.status === "done" && seat !== null ? (
                    <StateMark tone={won ? "good" : "accent"}>{won ? tr("won") : tr("lost")}</StateMark>
                  ) : (
                    <StateMark tone={b.status === "live" ? "accent" : b.status === "ready" ? "good" : b.status === "cancelled" ? "off" : ""}>{said(MATCH_STATUS[b.status])}</StateMark>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown && <MatchDialog match={shown} open onOpenChange={(open) => !open && setShown(null)} />}
    </>
  );
}

/** A friend's page: the score between you, what waits for you, a rematch to launch, and your battles in the history. */
function FriendPage({ friend: f, phone }: { friend: Person & { since: number }; phone: boolean }) {
  const [c, setC] = useState<Conversation | undefined>(() => directWith(f.id));
  useEffect(() => {
    const found = directWith(f.id);
    if (found) setC(found);
    // A battle needs the conversation it shows in: made on first need, without leaving the page.
    else if (community.conversations) void community.act<Conversation>("POST", "social/conversations", { userId: f.id }, ["conversations"]).then(setC);
  }, [f.id, community.conversations]);
  useEffect(() => {
    if (c) void community.load(`messages:${c.id}`);
  }, [c?.id]);
  const messages = c ? community.messages.get(c.id) : undefined,
    battles = battlesIn(c),
    t = tally(battles),
    items = messages ? waiting(messages) : [],
    last = battles.find((b) => b.status === "done");
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-friend={f.username}>
      <Head
        back={phone}
        face={<Avatar name={f.username} src={f.avatar} size={phone ? 52 : 72} />}
        title={f.username}
        sub={
          <>
            <span>{tr("Friends since {0}", { 0: day(f.since) })}</span>
            {t.played > 0 && <span>{plural(t.played, "battle")}</span>}
          </>
        }
      >
        {c && (
          <BattleDialog
            conversation={c}
            trigger={
              <Button data-action="friend:challenge">
                <Swords />
                {tr("Challenge")}
              </Button>
            }
          />
        )}
        <Button variant="outline" onClick={() => void community.message(f.id)} data-action="friend:write">
          {tr("Write")}
        </Button>
        {battles.length > 0 && (
          <HistoryDialog action="friend:history">
            <BattleLines battles={battles} />
          </HistoryDialog>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={tr("More about {0}", { 0: f.username })} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem variant="destructive" onClick={() => void community.removeFriend(f.id)}>
              <UserMinus />
              {tr("Remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Head>
      <div className="grid min-h-0 flex-1 gap-x-8 gap-y-6 content-start overflow-y-auto px-6 pb-6 max-md:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <section className="flex min-w-0 flex-col gap-3" aria-label={tr("Your battles")}>
          <Caption>{tr("Your battles")}</Caption>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-[20px] bg-muted px-5 py-4 max-md:gap-2 max-md:px-3" data-slot="score">
            <span className="flex items-center gap-3">
              <Avatar name={s.user.username} size={36} />
              <span className="flex flex-col">
                <b className="font-extrabold">{tr("You")}</b>
                <span className="text-xs text-muted-foreground">{plural(t.won, "win")}</span>
              </span>
            </span>
            <span className={cn(NUMERIC, "text-4xl font-extrabold tracking-[-0.04em] whitespace-nowrap md:text-5xl")} aria-label={tr("{0} to {1}", { 0: t.won, 1: t.lost })}>
              {t.won}
              <span className="px-2 text-muted-foreground">–</span>
              {t.lost}
            </span>
            <span className="flex items-center justify-end gap-3 text-right">
              <span className="flex min-w-0 flex-col">
                <b className="truncate font-extrabold">{f.username}</b>
                <span className="text-xs text-muted-foreground">{plural(t.lost, "win")}</span>
              </span>
              <Avatar name={f.username} src={f.avatar} size={36} />
            </span>
          </div>
        </section>
        <section className="flex min-w-0 flex-col gap-3" aria-label={tr("Waiting for you")}>
          <Caption>{tr("Waiting for you")}</Caption>
          {items.map((w) => (
            <Offer key={w.key} lead={w.lead} title={w.text} action={w.label} accent={w.accent} run={w.run} />
          ))}
          {c && last && (
            <Offer
              lead={eventName(last.event)}
              title={tr("A rematch?")}
              sub={tr("Same format: {0}", { 0: formatText(last) })}
              action={tr("Launch")}
              accent={!items.length}
              run={() => void community.battle(c.id, { event: last.event, points: last.points, sets: last.sets, opponentId: null })}
            />
          )}
          {!items.length && !last && <p className="text-[13px] text-muted-foreground">{tr("Nothing new")}</p>}
        </section>
      </div>
    </div>
  );
}

/** One thing to do, in a card of its own: a lead in large, a title and a line, and its step in a word. */
function Offer({ lead, title, sub, action, accent, run }: { lead: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; action: string; accent: boolean; run: () => void }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] bg-muted px-4 py-3.5" data-slot="offer">
      <b className={cn(NUMERIC, "max-w-28 truncate text-xl font-extrabold")}>{lead}</b>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">{title}</span>
        {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      {accent ? (
        <Button onClick={run}>
          {action}
        </Button>
      ) : (
        <button type="button" className={LINK} onClick={run}>
          {action}
        </button>
      )}
    </div>
  );
}

/** A group's page: its members, its tournaments to come; launching them, writing, running the group; the rest in the history. */
function GroupPage({ id, phone }: { id: number; phone: boolean }) {
  useEffect(() => {
    void community.load(`group:${id}`);
  }, [id]);
  const g = community.groups.get(id),
    [editing, setEditing] = useState(false),
    scroller = useRef<HTMLDivElement>(null),
    c = g && community.conversations?.find((x) => x.id === g.conversationId),
    members = useMemo(() => g?.members.filter((m) => m.role !== "invited") ?? [], [g]),
    invited = g?.members.filter((m) => m.role === "invited") ?? [];
  if (!g) return <ListSkeleton className="p-6" />;
  const run = organiser(g.role),
    upcoming = g.tournaments.filter((t) => t.status === "open" || t.status === "running"),
    over = g.tournaments.filter((t) => t.status !== "open" && t.status !== "running");
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-group-page={g.id}>
      <Head
        back={phone}
        face={
          <span className="flex shrink-0" aria-hidden="true">
            {members.slice(0, 3).map((m, i) => (
              <Avatar key={m.id} name={m.username} src={m.avatar} size={phone ? 40 : 52} className={cn("shadow-[0_0_0_3px_var(--card)]", i > 0 && "-ml-2.5")} />
            ))}
          </span>
        }
        title={g.name}
        sub={
          <>
            <span>{plural(members.length, "member")}</span>
            {g.role !== "member" && <span>{g.role === "owner" ? tr("you own it") : tr("you are admin")}</span>}
          </>
        }
      >
        {run && (
          <TournamentDialog
            group={g}
            trigger={
              <Button data-action="group:tournament">
                <Trophy />
                {tr("New tournament")}
              </Button>
            }
          />
        )}
        {c && (
          <BattleDialog
            conversation={c}
            group={g}
            trigger={
              <Button variant={run ? "outline" : "default"} data-action="group:battle">
                <Swords />
                {tr("Battle")}
              </Button>
            }
          />
        )}
        <Button variant="outline" onClick={() => go(communityUrl("messages/" + g.conversationId))} data-action="group:write">
          {tr("Write")}
        </Button>
        {(g.battles.length > 0 || over.length > 0) && (
          <HistoryDialog action="group:history">
            {g.battles.length > 0 && (
              <section className="flex flex-col gap-2" aria-label={tr("Battles")}>
                <Caption>{tr("Battles")}</Caption>
                <BattleLines battles={g.battles.map((b) => community.card(b))} group />
              </section>
            )}
            {over.length > 0 && (
              <section className="flex flex-col gap-2" aria-label={tr("Tournaments")}>
                <Caption>{tr("Tournaments")}</Caption>
                {over.map((t) => (
                  <TournamentChatCard key={t.id} tournament={t} />
                ))}
              </section>
            )}
          </HistoryDialog>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={tr("More about {0}", { 0: g.name })} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            {run && (
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil />
                {tr("Edit")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => void (g.role === "owner" ? community.deleteGroup(g.id) : community.remove(g.id, s.user.id))}>
              <UserMinus />
              {g.role === "owner" ? tr("Delete") : tr("Leave")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Head>
      <EditGroupDialog group={g} open={editing} onOpenChange={setEditing} />
      <div ref={scroller} className="grid min-h-0 flex-1 gap-x-8 gap-y-6 content-start overflow-y-auto px-6 pb-6 max-md:px-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-2" aria-label={tr("Members")}>
            <Caption action={run && <InviteDialog g={g} />}>{tr("Members")}</Caption>
            <MemberGrid g={g} members={[...members, ...invited]} scroller={scroller} />
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {g.description && <p className="text-[15px] leading-relaxed text-muted-foreground">{g.description}</p>}
          <section className="flex flex-col gap-2" aria-label={tr("Tournaments")}>
            <Caption>{tr("Tournaments")}</Caption>
            {!upcoming.length ? (
              <p className="text-[13px] text-muted-foreground">{tr("No tournament yet")}</p>
            ) : (
              upcoming.map((t) => <TournamentChatCard key={t.id} tournament={t} />)
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

