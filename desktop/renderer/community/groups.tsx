/**
 * The details beside a conversation. A group's: what it is about, its members (invited by its owner and admins, from
 * the friends or by name), its tournaments and its battles, then leaving or deleting it. A friend's: since when, the
 * battles between the two and their record, and ending the friendship.
 */
import { useState } from "react";
import { Crown, LogOut, MessageSquare, MoreHorizontal, Pencil, Plus, Shield, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Icon } from "../base";
import { Avatar, NUMERIC, plural } from "../ui";
import { day, relative } from "../coaching/parts";
import { community, eventName, scoreOf, tournamentUrl, type Conversation, type Group, type Match } from "./client";
import { GroupMark, organiser } from "./messages";
import { MatchDialog } from "./cards";
import { EditGroupDialog, FriendPicker, TournamentDialog, useFriendsOutside } from "./dialogs";
import { StatusBadge } from "../tournaments/page";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "../../../src/client/i18n";
import { msg } from "../../../src/client/i18n/msg";
import { said } from "../base";

/** A part of the details: its title, a count, an action on the right. */
function Part({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t px-4 py-4" aria-label={title}>
      <h3 className="flex min-h-7 items-center gap-2 text-sm font-medium">
        {title}
        {!!count && <span className={cn(NUMERIC, "text-muted-foreground")}>{count}</span>}
        <span className="ml-auto">{action}</span>
      </h3>
      {children}
    </section>
  );
}

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
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-24" />
      </div>
    );
  const run = organiser(g.role),
    members = g.members.filter((m) => m.role !== "invited"),
    invited = g.members.filter((m) => m.role === "invited");
  return (
    <>
      <header className="flex flex-col items-center gap-2 px-4 pt-6 pb-4 text-center">
        <GroupMark size={56} />
        <h2 className="text-lg font-semibold tracking-tight">{g.name}</h2>
        {g.description && <p className="text-muted-foreground">{g.description}</p>}
        <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{tr("Created {0}", { 0: day(g.createdAt) })} · {plural(members.length, "member")}</span>
        {run && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(true)}>
            <Pencil />
            {tr("Edit")}</Button>
        )}
        <EditGroupDialog group={g} open={editing} onOpenChange={setEditing} />
      </header>
      <Part title={tr("Members")} count={members.length} action={run && <InviteDialog g={g} />}>
        <ul className="-mx-2 flex flex-col gap-0.5" data-slot="members">
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
                <Button size="sm" variant="ghost" className="text-muted-foreground">
                  <Plus />
                  {tr("Organise")}</Button>
              }
            />
          )
        }
      >
        {!g.tournaments.length ? (
          <p className="text-xs text-muted-foreground">{run ? tr("No tournament yet: organise the first one.") : tr("No tournament yet. The group's owner and admins organise them.")}</p>
        ) : (
          <ul className="-mx-2 flex flex-col gap-0.5">
            {g.tournaments.map((t) => (
              <li key={t.id}>
                <button type="button" className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/50" onClick={() => go(tournamentUrl(t.id))} data-tournament-row={t.id}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon name={"Puzzle" + t.event} size={16} />
                  </span>
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
      <div className="mt-auto flex flex-col gap-1 border-t p-3">
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

function Member({ g, m }: { g: Group; m: Group["members"][number] }) {
  const removable = m.id !== s.user.id && m.role !== "owner" && (g.role === "owner" || (g.role === "admin" && m.role !== "admin")),
    manageable = removable || (g.role === "owner" && (m.role === "admin" || m.role === "member")),
    friend = community.me?.friends.some((f) => f.id === m.id);
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40" data-member={m.username}>
      <Avatar name={m.username} src={m.avatar} size={30} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium", m.role === "invited" && "text-muted-foreground")}>{m.id === s.user.id ? tr("You") : m.username}</span>
        <span className="truncate text-xs text-muted-foreground">{m.role === "invited" ? tr("Invited {0}", { 0: relative(m.joinedAt) }) : tr("Joined {0}", { 0: relative(m.joinedAt) })}</span>
      </span>
      {ROLE_LABEL[m.role] && (
        <Badge variant="secondary" className="gap-1">
          {m.role === "owner" ? <Crown /> : m.role === "admin" ? <Shield /> : null}
          {said(ROLE_LABEL[m.role])}
        </Badge>
      )}
      {(manageable || (m.id !== s.user.id && m.role !== "invited")) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={tr("Manage {0}", { 0: m.username })} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
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
function InviteDialog({ g }: { g: Group }) {
  const [open, setOpen] = useState(false),
    [picked, setPicked] = useState<string[]>([]),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    outside = useFriendsOutside(g);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPicked([]);
          setName("");
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" data-action="group:invite" />}>
        <UserPlus />
        {tr("Invite")}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("Invite to {0}", { 0: g.name })}</DialogTitle>
          <DialogDescription>{tr("They join once they accept the invitation.")}</DialogDescription>
        </DialogHeader>
        <FriendPicker friends={outside} value={picked} onChange={setPicked} />
        <form
          className="flex flex-col gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim() && (await community.invite(g.id, name.trim()))) setName("");
          }}
        >
          <span className="text-xs text-muted-foreground">{tr("Or a player who is not your friend, by username:")}</span>
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
      </DialogContent>
    </Dialog>
  );
}

/** Battles as rows: who against whom, the score or where it stands; each opens its detail. */
function Battles({ battles, empty }: { battles: Match[]; empty: string }) {
  const [shown, setShown] = useState<Match | null>(null);
  if (!battles.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <>
      <ul className="-mx-2 flex flex-col gap-0.5" data-slot="battles">
        {battles.map((match) => {
          const b = community.card(match),
            won = b.winner === s.user.id,
            mine = b.players.some((p) => p?.id === s.user.id);
          return (
            <li key={b.id}>
              <button type="button" className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/50" onClick={() => setShown(b)} data-battle-row={b.id}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon name={"Puzzle" + b.event} size={16} />
                </span>
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
                  <Badge variant={b.status === "live" ? "default" : "secondary"} className="shrink-0">
                    {b.status === "live" ? tr("Live") : b.status === "cancelled" ? tr("Called off") : b.status === "ready" ? tr("Ready") : tr("Waiting")}
                  </Badge>
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
      <header className="flex flex-col items-center gap-2 px-4 pt-6 pb-4 text-center">
        <Avatar name={other.username} src={other.avatar} size={56} />
        <h2 className="text-lg font-semibold tracking-tight">{other.username}</h2>
        <span className="text-xs text-muted-foreground">{friend ? tr("Friends since {0}", { 0: day(friend.since) }) : tr("No longer friends")}</span>
      </header>
      <Part title={tr("Your battles")} count={battles.length}>
        {done.length > 0 && (
          <div className="mb-1 grid grid-cols-3 gap-2 rounded-lg bg-muted/45 px-3 py-2 text-center">
            {[
              [tr("Won"), won, "text-success"],
              [tr("Lost"), done.length - won, "text-destructive"],
              [tr("Played"), done.length, ""],
            ].map(([label, n, tone]) => (
              <span key={String(label)} className="flex flex-col">
                <span className={cn(NUMERIC, "text-lg font-semibold", String(tone))}>{n}</span>
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </span>
            ))}
          </div>
        )}
        <Battles battles={battles} empty={tr("No battle yet: challenge {0} from the top of the conversation.", { 0: other.username })} />
      </Part>
      {friend && (
        <div className="mt-auto flex flex-col gap-1 border-t p-3">
          <Button variant="ghost" className="justify-start text-muted-foreground hover:text-destructive" onClick={() => void community.removeFriend(other.id)}>
            <UserMinus />
            {tr("Remove from friends")}</Button>
        </div>
      )}
    </>
  );
}

