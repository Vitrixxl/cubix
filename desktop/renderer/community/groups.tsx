/**
 * The details beside a conversation. A group's: what it is about, its members (invited by its owner and admins, from
 * the friends or by name), its tournaments and its battles, then leaving or deleting it. A friend's: since when, the
 * battles between the two and their record, and ending the friendship.
 */
import { useState } from "react";
import { LogOut, MessageSquare, Plus, Shield, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Avatar, Empty, Figure, LABEL, LINK, Modal, NUMERIC, ROW, SectionHead, Strip, plural } from "../ui";
import { day, relative } from "../coaching/parts";
import { community, eventName, scoreOf, tournamentUrl, type Conversation, type Group, type Match } from "./client";
import { organiser } from "./messages";
import { MatchDialog } from "./cards";
import { EditGroupDialog, FriendPicker, TournamentDialog, useFriendsOutside } from "./dialogs";
import { EventTile, MatchStatusBadge, StatusBadge } from "../tournaments/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "../../../src/client/i18n";
import { msg } from "../../../src/client/i18n/msg";
import { said } from "../base";

/** A part of the details: its title, a count, an action on the right. */
function Part({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 px-4 pt-3 pb-2" aria-label={title}>
      <SectionHead title={title} meta={count || undefined}>
        {action}
      </SectionHead>
      {children}
    </section>
  );
}

/** A row of the details that opens what it shows: the event's icon, two lines, and where it stands. */
const DETAIL_ROW = cn(ROW, "flex w-full items-center gap-3 px-2 py-2");

/** The details of a conversation: its group's, or the friend's. */
export function Details({ conversation: c }: { conversation: Conversation }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm" data-slot="details">
      {c.kind === "group" ? <GroupDetails id={c.group!.id} /> : <FriendDetails c={c} />}
    </div>
  );
}

const ROLE_LABEL = { owner: msg("Owner"), admin: msg("Admin"), member: "", invited: msg("Invited") };

function GroupDetails({ id }: { id: number }) {
  const g = community.groups.get(id),
    [editing, setEditing] = useState(false);
  if (!g)
    return (
      <div className="flex flex-col items-center gap-3 p-4 pt-6" aria-busy="true" aria-label={tr("Loading")}>
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );
  const run = organiser(g.role),
    members = g.members.filter((m) => m.role !== "invited"),
    invited = g.members.filter((m) => m.role === "invited");
  return (
    <>
      <header className="flex flex-col gap-1.5 px-5 pt-5 pr-14 pb-2">
        <span className="flex items-baseline gap-3">
          <h2 className="truncate text-lg font-extrabold tracking-[-0.02em]">{g.name}</h2>
          {run && (
            <button type="button" className={LINK} onClick={() => setEditing(true)}>
              {tr("Edit")}
            </button>
          )}
        </span>
        {g.description && <p className="text-muted-foreground">{g.description}</p>}
        <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{tr("Created {0}", { 0: day(g.createdAt) })} · {plural(members.length, "member")}</span>
        <EditGroupDialog group={g} open={editing} onOpenChange={setEditing} />
      </header>
      <Part title={tr("Members")} count={members.length} action={run && <InviteDialog g={g} />}>
        <ul className="grid grid-cols-4 gap-x-1.5 gap-y-3 pt-1" data-slot="members">
          {[...members, ...invited].map((m) => (
            <Member key={m.id} g={g} m={m} />
          ))}
        </ul>
      </Part>
      <Part
        title={tr("Tournaments")}
        count={g.tournaments.length}
        action={
          run && (
            <TournamentDialog
              group={g}
              trigger={
                <Button variant="ghost" className="text-muted-foreground">
                  <Plus />
                  {tr("Organise")}</Button>
              }
            />
          )
        }
      >
        {!g.tournaments.length ? (
          <Empty className="p-3">{run ? tr("No tournament yet: organise the first one.") : tr("No tournament yet. The group's owner and admins organise them.")}</Empty>
        ) : (
          <ul className="-mx-2 flex flex-col gap-0.5">
            {g.tournaments.map((t) => (
              <li key={t.id}>
                <button type="button" className={DETAIL_ROW} onClick={() => go(tournamentUrl(t.id))} data-tournament-row={t.id}>
                  <EventTile event={t.event} className="size-8" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{t.name}</span>
                    <span className={cn(NUMERIC, "truncate text-xs text-muted-foreground")}>
                      {t.status === "finished" && t.winner ? tr("Won by {0}", { 0: t.winner.username }) : `${day(t.startsAt)} · ${plural(t.players, "player")}`}
                    </span>
                  </span>
                  <StatusBadge t={t} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Part>
      <Part title={tr("Battles")} count={g.battles.length}>
        <Battles battles={g.battles} empty={tr("No battle yet: launch one from the top of the conversation.")} />
      </Part>
      <div className="mt-auto flex flex-col gap-1 p-3">
        {g.role !== "owner" ? (
          <Button variant="ghost" className="justify-start text-muted-foreground hover:text-destructive" onClick={() => void community.remove(g.id, s.user.id)}>
            <LogOut />
            {tr("Leave the group")}</Button>
        ) : (
          <Button variant="ghost" className="justify-start text-muted-foreground hover:text-destructive" onClick={() => void community.deleteGroup(g.id)}>
            <Trash2 />
            {tr("Delete the group")}</Button>
        )}
      </div>
    </>
  );
}

export function Member({ g, m }: { g: Group; m: Group["members"][number] }) {
  const removable = m.id !== s.user.id && m.role !== "owner" && (g.role === "owner" || (g.role === "admin" && m.role !== "admin")),
    manageable = removable || (g.role === "owner" && (m.role === "admin" || m.role === "member")),
    friend = community.me?.friends.some((f) => f.id === m.id);
  const actions = manageable || (m.id !== s.user.id && m.role !== "invited"),
    face = (
      <>
        <span className={cn("rounded-full", m.role === "invited" && "opacity-55 outline-2 outline-offset-2 outline-muted-foreground/50 outline-dashed")}>
          <Avatar name={m.username} src={m.avatar} size={48} />
        </span>
        <span className="max-w-full truncate text-xs font-bold">{m.id === s.user.id ? tr("You") : m.username}</span>
        <small className={cn("text-[11px] font-semibold", m.role === "owner" || m.role === "admin" ? "text-warning" : "text-muted-foreground")}>
          {ROLE_LABEL[m.role] ? said(ROLE_LABEL[m.role]) : tr("member")}
        </small>
      </>
    ),
    tile = "flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-center";
  return (
    <li data-member={m.username} data-person={m.username} title={m.role === "invited" ? tr("Invited {0}", { 0: relative(m.joinedAt) }) : tr("Joined {0}", { 0: relative(m.joinedAt) })}>
      {!actions ? (
        <div className={tile}>{face}</div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={cn(ROW, tile)} aria-label={tr("Manage {0}", { 0: m.username })} />}>{face}</DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-auto">
            {m.id !== s.user.id && m.role !== "invited" && (friend ? (
              <DropdownMenuItem onClick={() => void community.message(m.id)}>
                <MessageSquare />
                {tr("Write to {0}", { 0: m.username })}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => void community.addFriend(m.username)}>
                <UserPlus />
                {tr("Add as a friend")}</DropdownMenuItem>
            ))}
            {g.role === "owner" && m.role === "member" && (
              <DropdownMenuItem onClick={() => void community.setRole(g.id, m.id, "admin")}>
                <Shield />
                {tr("Make admin")}</DropdownMenuItem>
            )}
            {g.role === "owner" && m.role === "admin" && (
              <DropdownMenuItem onClick={() => void community.setRole(g.id, m.id, "member")}>
                <Users />
                {tr("Make member")}</DropdownMenuItem>
            )}
            {removable && (
              <DropdownMenuItem variant="destructive" onClick={() => void community.remove(g.id, m.id)}>
                <X />
                {m.role === "invited" ? tr("Withdraw the invitation") : tr("Remove from the group")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** Inviting to a group: friends ticked from a list, or any player by name. */
export function InviteDialog({ g }: { g: Group }) {
  const [open, setOpen] = useState(false),
    [picked, setPicked] = useState<string[]>([]),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    outside = useFriendsOutside(g);
  return (
    <>
      <Button
        variant="ghost"
        className="text-muted-foreground"
        data-action="group:invite"
        onClick={() => {
          setPicked([]);
          setName("");
          setOpen(true);
        }}
      >
        <UserPlus />
        {tr("Invite")}</Button>
      <Modal open={open} onOpenChange={setOpen} title={tr("Invite to {0}", { 0: g.name })} description={tr("They join once they accept the invitation.")} className="sm:max-w-md">
        <FriendPicker friends={outside} value={picked} onChange={setPicked} />
        <form
          className="flex flex-col gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim() && (await community.invite(g.id, name.trim()))) setName("");
          }}
        >
          <span className={LABEL}>{tr("Or a player who is not your friend, by username:")}</span>
          <InputGroup>
            <InputGroupInput value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Username")} aria-label={tr("Invite a player")} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" disabled={!name.trim()}>
                {tr("Invite")}</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <DialogFooter>
          <Button
            disabled={!picked.length || busy}
            onClick={async () => {
              setBusy(true);
              for (const id of picked) await community.inviteFriend(g.id, id);
              setBusy(false);
              setOpen(false);
            }}
          >
            <UserPlus />
            {picked.length ? tr("Invite {0}", { 0: picked.length }) : tr("Invite")}
          </Button>
        </DialogFooter>
      </Modal>
    </>
  );
}

/** Battles as rows: who against whom, the score or where it stands; each opens its detail. */
function Battles({ battles, empty }: { battles: Match[]; empty: string }) {
  const [shown, setShown] = useState<Match | null>(null);
  if (!battles.length) return <Empty className="p-3">{empty}</Empty>;
  return (
    <>
      <ul className="-mx-2 flex flex-col gap-0.5" data-slot="battles">
        {battles.map((match) => {
          const b = community.card(match),
            won = b.winner === s.user.id,
            mine = b.players.some((p) => p?.id === s.user.id);
          return (
            <li key={b.id}>
              <button type="button" className={DETAIL_ROW} onClick={() => setShown(b)} data-battle-row={b.id}>
                <EventTile event={b.event} className="size-8" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {b.players[0]?.username} <span className="font-normal text-muted-foreground">{tr("vs")}</span> {b.players[1]?.username ?? tr("anyone")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {eventName(b.event)} · {relative(b.finishedAt ?? b.createdAt)}
                  </span>
                </span>
                {b.status === "done" ? (
                  <span className={cn(NUMERIC, "shrink-0 text-sm font-semibold", mine && (won ? "text-success" : "text-destructive"))}>
                    {scoreOf(b).join("–")}
                  </span>
                ) : (
                  <MatchStatusBadge status={b.status} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {shown && <MatchDialog match={shown} open onOpenChange={(open) => !open && setShown(null)} />}
    </>
  );
}

function FriendDetails({ c }: { c: Conversation }) {
  const other = c.with!,
    friend = community.me?.friends.find((f) => f.id === other.id),
    // The battles between the two, from the conversation's cards, the latest first.
    battles = (community.messages.get(c.id) ?? [])
      .filter((m) => m.match)
      .map((m) => community.card(m.match!))
      .reverse(),
    done = battles.filter((b) => b.status === "done"),
    won = done.filter((b) => b.winner === s.user.id).length;
  return (
    <>
      <header className="flex items-center gap-3.5 px-5 pt-5 pr-14 pb-2">
        <Avatar name={other.username} src={other.avatar} size={52} />
        <span className="flex min-w-0 flex-col gap-0.5">
        <h2 className="truncate text-lg font-extrabold tracking-[-0.02em]">{other.username}</h2>
        <span className="text-xs text-muted-foreground">{friend ? tr("Friends since {0}", { 0: day(friend.since) }) : tr("No longer friends")}</span>
        </span>
      </header>
      <Part title={tr("Your battles")} count={battles.length}>
        {done.length > 0 && (
          <Strip className="mb-1 grid-cols-3 bg-muted">
            <Figure label="Won" value={won} tone="good" />
            <Figure label="Lost" value={done.length - won} tone="bad" />
            <Figure label="Played" value={done.length} />
          </Strip>
        )}
        <Battles battles={battles} empty={tr("No battle yet: challenge {0} from the top of the conversation.", { 0: other.username })} />
      </Part>
      {friend && (
        <div className="mt-auto flex flex-col gap-1 p-3">
          <Button variant="ghost" className="justify-start text-muted-foreground hover:text-destructive" onClick={() => void community.removeFriend(other.id)}>
            <UserMinus />
            {tr("Remove from friends")}</Button>
        </div>
      )}
    </>
  );
}

