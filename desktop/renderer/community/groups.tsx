/**
 * Groups: the account's groups and invitations, and one group with its chat, its members, its tournaments and its
 * battles. Its owner and admins invite and remove members and organise tournaments; any member launches a battle,
 * against another member or whoever takes it up.
 */
import { useEffect, useState } from "react";
import { Check, Crown, LogOut, MoreHorizontal, Pencil, Play, Plus, Shield, Swords, Trash2, Trophy, UserPlus, Users, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Icon } from "../base";
import { Avatar, NUMERIC } from "../ui";
import { Nothing, PANEL, PANEL_HEAD, ROWS, RowLink, RowsSkeleton, relative } from "../coaching/parts";
import { community, communityUrl, eventName, formatText, matchUrl, seatIn, type Format, type Group, type Match } from "./client";
import { Chat } from "./messages";
import { TournamentCard, Confirm } from "../tournaments/page";
import { FormatFields, localInput } from "../tournaments/format";
import { EVENTS } from "../../../src/shared/puzzles";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

const TABS = [
  ["chat", "Chat"],
  ["members", "Members"],
  ["tournaments", "Tournaments"],
  ["battles", "Battles"],
] as const;

export function Groups({ id, tab }: { id: number | null; tab: string }) {
  const me = community.me;
  // The first group opens when none is chosen.
  useEffect(() => {
    if (!id && me?.groups.length) go(communityUrl("groups/" + me.groups[0]!.id), true);
  }, [id, me?.groups.length]);
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className={cn(PANEL, "w-72 shrink-0")}>
        <div className="flex shrink-0 items-center justify-between pr-2">
          <h2 className={PANEL_HEAD}>{tr("Groups")}</h2>
          <GroupDialog />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!!me?.invitations.length && (
            <ul className={ROWS} aria-label={tr("Invitations")}>
              {me.invitations.map((g) => (
                <li key={g.id} className="flex flex-col gap-2 rounded-lg bg-primary/8 px-2.5 py-2.5" data-invitation={g.id}>
                  <span className="text-sm">
                    <strong className="font-semibold">{said(g.invitedBy)}</strong> {" "}{tr("invites you to")}{" "}<strong className="font-semibold">{said(g.name)}</strong>
                  </span>
                  <span className="flex gap-1.5">
                    <Button size="sm" onClick={() => void community.join(g.id)}>
                      <Check />
                      {tr("Join")}</Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void community.remove(g.id, s.user.id)}>
                      {tr("Decline")}</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!me ? (
            <RowsSkeleton />
          ) : !me.groups.length ? (
            <Nothing>{tr("No group yet. Create one and invite your friends.")}</Nothing>
          ) : (
            <ul className={ROWS} data-slot="groups">
              {me.groups.map((g) => (
                <li key={g.id}>
                  <RowLink to={communityUrl("groups/" + g.id + (tab ? "/" + tab : ""))} active={g.id === id}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">{g.name.slice(0, 2).toUpperCase()}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{said(g.name)}</span>
                      <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                        {g.members} {" "}{tr("members")}{g.role !== "member" ? " · " + g.role : ""}
                      </span>
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{id ? <GroupView id={id} tab={tab} /> : <div className={cn(PANEL, "flex-1")} />}</div>
    </div>
  );
}

/** A new group, or (`group`) its name and description changed. */
function GroupDialog({ group }: { group?: Group }) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(group?.name ?? ""),
    [description, setDescription] = useState(group?.description ?? "");
  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setDescription(group?.description ?? "");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {group ? (
        <DialogTrigger render={<DropdownMenuItem closeOnClick={false} />}>
          <Pencil />
          {tr("Edit the group")}</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" variant="outline" data-action="community:new-group" />}>
          <Plus />
          {tr("New group")}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = group ? await community.updateGroup(group.id, name.trim(), description.trim()) : await community.createGroup(name.trim(), description.trim());
            if (done) setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{group ? tr("Edit the group") : tr("New group")}</DialogTitle>
            <DialogDescription>{group ? tr("Its members see the change at once.") : tr("You run it: invite your friends, organise tournaments.")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="group-name">{tr("Name")}</FieldLabel>
              <Input id="group-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="group-description">{tr("Description")}</FieldLabel>
              <Textarea id="group-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={name.trim().length < 2}>
              {group ? tr("Save") : tr("Create the group")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const organiser = (g: Group) => g.role === "owner" || g.role === "admin";

function GroupView({ id, tab }: { id: number; tab: string }) {
  useEffect(() => {
    void community.load(`group:${id}`);
    if (!community.conversations) void community.load("conversations");
  }, [id]);
  const g = community.groups.get(id),
    current = TABS.some(([t]) => t === tab) ? tab : "chat";
  if (!g)
    return (
      <div className={cn(PANEL, "flex-1 gap-4 p-5")}>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="min-h-0 flex-1" />
      </div>
    );
  const conversation = community.conversations?.find((c) => c.id === g.conversationId);
  const counts: Record<string, number> = {
    members: g.members.filter((m) => m.role !== "invited").length,
    tournaments: g.tournaments.filter((t) => t.status === "open" || t.status === "running").length,
    battles: g.battles.filter((b) => b.status !== "done" && b.status !== "cancelled").length,
  };
  return (
    <div className={cn(PANEL, "flex-1")} data-group={g.id}>
      <header className="flex shrink-0 items-start gap-4 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{said(g.name)}</h2>
          {g.description && <p className="line-clamp-2 text-sm text-muted-foreground">{said(g.description)}</p>}
        </div>
        <Tabs value={current} onValueChange={(v: string) => go(communityUrl(`groups/${g.id}/${v}`))}>
          <TabsList>
            {TABS.map(([t, label]) => (
              <TabsTrigger key={t} value={t} data-action={"group:" + t} className="gap-1.5 px-3">
                {said(label)}
                {!!counts[t] && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{counts[t]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <GroupMenu g={g} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col border-t">
        {current === "chat" ? (
          conversation ? <Chat conversation={conversation} head={false} /> : <RowsSkeleton rows={3} />
        ) : current === "members" ? (
          <Members g={g} />
        ) : current === "tournaments" ? (
          <GroupTournaments g={g} />
        ) : (
          <Battles g={g} />
        )}
      </div>
    </div>
  );
}

function GroupMenu({ g }: { g: Group }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
    <AlertDialog open={deleting} onOpenChange={setDeleting}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("Delete")}{" "}{said(g.name)}?</AlertDialogTitle>
          <AlertDialogDescription>{tr("Its chat, tournaments and battles go with it, for every member. This cannot be undone.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("Keep it")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void community.deleteGroup(g.id)}>
            {tr("Delete the group")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={tr("Group actions")} className="text-muted-foreground" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {organiser(g) && <GroupDialog group={g} />}
        {g.role !== "owner" && (
          <DropdownMenuItem onClick={() => void community.remove(g.id, s.user.id)}>
            <LogOut />
            {tr("Leave the group")}</DropdownMenuItem>
        )}
        {g.role === "owner" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
              {tr("Delete the group")}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "", invited: "Invited" } as const;

function Members({ g }: { g: Group }) {
  const [name, setName] = useState("");
  const run = organiser(g);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {run && (
        <form
          className="flex max-w-md shrink-0"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim() && (await community.invite(g.id, name.trim()))) setName("");
          }}
        >
          <InputGroup>
            <InputGroupAddon>
              <UserPlus />
            </InputGroupAddon>
            <InputGroupInput value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Invite a player by username")} aria-label={tr("Invite a player")} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" disabled={!name.trim()}>
                {tr("Invite")}</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      )}
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {g.members.map((m) => {
          const removable = m.id !== s.user.id && m.role !== "owner" && (g.role === "owner" || (g.role === "admin" && m.role !== "admin"));
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted/40" data-member={m.username}>
              <Avatar name={m.username} src={m.avatar} size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate font-medium", m.role === "invited" && "text-muted-foreground")}>{m.username}</span>
                <span className="text-xs text-muted-foreground">{m.role === "invited" ? tr("Invited {0}", { 0: relative(m.joinedAt) }) : tr("Joined {0}", { 0: relative(m.joinedAt) })}</span>
              </span>
              {ROLE_LABEL[m.role] && (
                <Badge variant="secondary" className="gap-1">
                  {m.role === "owner" ? <Crown /> : m.role === "admin" ? <Shield /> : null}
                  {said(ROLE_LABEL[m.role])}
                </Badge>
              )}
              {(removable || (g.role === "owner" && (m.role === "admin" || m.role === "member"))) && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={tr("Manage {0}", { 0: m.username })} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto">
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
        })}
      </ul>
    </div>
  );
}

function GroupTournaments({ g }: { g: Group }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {organiser(g) && (
        <div className="flex shrink-0">
          <TournamentDialog g={g} />
        </div>
      )}
      {!g.tournaments.length ? (
        <Nothing>
          <Trophy className="size-5" />
          {organiser(g) ? tr("No tournament yet: organise the first one.") : tr("No tournament yet. The group's owner and admins organise them.")}
        </Nothing>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3 overflow-y-auto">
          {g.tournaments.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentDialog({ g }: { g: Group }) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [starts, setStarts] = useState(() => localInput(Date.now() + 86_400_000)),
    [cap, setCap] = useState(""),
    [format, setFormat] = useState<Format>({ event: "333", points: 3, sets: 2 });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-action="group:new-tournament" />}>
        <Trophy />
        {tr("Organise a tournament")}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const at = new Date(starts).getTime();
            if (await community.createTournament(g.id, { ...format, name: name.trim(), description: description.trim(), startsAt: at, maxPlayers: cap ? Number(cap) : null })) setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{tr("New tournament in")}{" "}{said(g.name)}</DialogTitle>
            <DialogDescription>{tr("Members register until it starts; the bracket is drawn at its start.")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tournament-name">{tr("Name")}</FieldLabel>
              <Input id="tournament-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <FormatFields value={format} onChange={setFormat} />
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="tournament-start">{tr("Starts")}</FieldLabel>
                <Input id="tournament-start" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tournament-cap">{tr("Most players")}</FieldLabel>
                <Input id="tournament-cap" type="number" min={2} max={256} placeholder={tr("No limit")} value={cap} onChange={(e) => setCap(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="tournament-description">{tr("Description")}</FieldLabel>
              <Textarea id="tournament-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={name.trim().length < 2 || !starts}>
              {tr("Create the tournament")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BattleDialog({ g }: { g: Group }) {
  const [open, setOpen] = useState(false),
    [opponent, setOpponent] = useState("anyone"),
    [format, setFormat] = useState<Format>({ event: "333", points: 3, sets: 1 });
  const others = g.members.filter((m) => m.role !== "invited" && m.id !== s.user.id),
    items = [{ value: "anyone", label: "Anyone in the group" }, ...others.map((m) => ({ value: m.id, label: m.username }))];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-action="group:new-battle" />}>
        <Swords />
        {tr("Launch a battle")}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await community.battle(g.id, { ...format, opponentId: opponent === "anyone" ? null : opponent })) setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{tr("New battle")}</DialogTitle>
            <DialogDescription>{tr("It starts once your opponent accepts it.")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{tr("Against")}</FieldLabel>
              <Select items={items} value={opponent} onValueChange={(v) => setOpponent(String(v))}>
                <SelectTrigger aria-label={tr("Opponent")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {said(o.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <FormatFields value={format} onChange={setFormat} />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit">{tr("Launch the battle")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const BATTLE_STATUS: Record<Match["status"], string> = { waiting: "Waiting", ready: "Ready", live: "Live", done: "Over", cancelled: "Called off" };

function Battles({ g }: { g: Group }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex shrink-0">
        <BattleDialog g={g} />
      </div>
      {!g.battles.length ? (
        <Nothing>
          <Swords className="size-5" />
          {tr("No battle yet: launch one against a member.")}</Nothing>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto" data-slot="battles">
          {g.battles.map((b) => (
            <BattleRow key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BattleRow({ b }: { b: Match }) {
  const me = s.user.id,
    seat = seatIn(b, me),
    challenged = b.status === "waiting" && seat === null ? !b.players[1] : b.status === "waiting" && seat === 1,
    winner = b.players.find((p) => p?.id === b.winner);
  return (
    <li className="flex items-center gap-4 rounded-lg border px-4 py-2.5" data-battle={b.id} data-status={b.status}>
      <Icon name={"Puzzle" + b.event} size={20} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {b.players[0]?.username} <span className="text-muted-foreground">{tr("vs")}</span> {b.players[1]?.username ?? <span className="text-muted-foreground">{tr("anyone")}</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {eventName(b.event)} · {formatText(b)} · {relative(b.createdAt)}
        </span>
      </span>
      {(b.status === "live" || b.status === "done") && (
        <span className={cn(NUMERIC, "text-sm font-medium")}>
          {b.score.sets[0]}–{b.score.sets[1]}
        </span>
      )}
      <Badge variant={b.status === "live" ? "default" : "secondary"}>{b.status === "done" && winner ? tr("{0} won", { 0: winner.username }) : BATTLE_STATUS[b.status]}</Badge>
      <span className="flex shrink-0 items-center gap-1">
        {challenged && (
          <Button size="sm" onClick={() => void community.acceptBattle(b)}>
            <Check />
            {tr("Accept")}</Button>
        )}
        {(b.status === "ready" || b.status === "live") && (
          <Button size="sm" variant={seat !== null ? "default" : "outline"} onClick={() => go(matchUrl(b.id))}>
            <Play />
            {seat !== null ? tr("Play") : tr("Watch")}
          </Button>
        )}
        {b.status === "done" && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => go(matchUrl(b.id))}>
            {tr("Details")}</Button>
        )}
        {seat !== null && (b.status === "waiting" || b.status === "ready") && (
          <Confirm title={seat === 0 ? tr("Call off the battle?") : tr("Decline the battle?")} text={tr("It is cancelled for both of you.")} action={seat === 0 ? "Call off" : "Decline"} destructive onConfirm={() => community.cancelBattle(b)}>
            {seat === 0 ? tr("Call off") : tr("Decline")}
          </Confirm>
        )}
      </span>
    </li>
  );
}
