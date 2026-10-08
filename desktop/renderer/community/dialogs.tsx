/**
 * What the community launches: a battle from a conversation, a group's tournament, a new group with the friends to
 * invite, and the people: finding players, the link that adds the account, the friends, and the requests waiting.
 */
import { cloneElement, useEffect, useMemo, useState } from "react";
import { Bell, Check, Copy, MessageSquare, MoreHorizontal, Share2, Swords, Trophy, UserMinus, UserPlus, UserRoundX, Users, X } from "lucide-react";
import { store as s } from "../store";
import { Avatar, Modal, plural } from "../ui";
import { Count, Empty, LABEL, ListSkeleton, NUMERIC, ROW, SearchField, SectionHead, Tip } from "../base";
import { relative } from "../coaching/parts";
import { DEFAULT_PLAYERS, MAX_PLAYERS, community, playersLimit, type Conversation, type Format, type Group, type Person } from "./client";
import { GroupMark } from "./messages";
import { FormatFields, localInput } from "../tournaments/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** A header button: its icon, and its words where the window has room; its name in a tooltip either way. */
export function HeadButton({ icon: I, label, size = "sm", ...props }: { icon: typeof Swords; label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Tip content={label}>
      <Button variant="outline" size={size} aria-label={label} {...props}>
        <I />
        <span className="max-lg:hidden">{label}</span>
      </Button>
    </Tip>
  );
}

/**
 * A player in a list, the same everywhere (friends, requests, members, a tournament's players): the face, the name, a
 * line under it, and what can be done on the right. `face` stands in for the avatar (a group's mark), `lead` comes
 * before it (a seed, a tick box); `as="label"` makes the whole row a choice.
 */
export function PersonRow({
  p,
  name,
  face,
  detail,
  lead,
  children,
  className,
  as: As = "li",
  ...rest
}: {
  p?: Person;
  name?: React.ReactNode;
  face?: React.ReactNode;
  detail?: React.ReactNode;
  lead?: React.ReactNode;
  as?: "li" | "label" | "div";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5", className)} data-person={p?.username} {...rest}>
      {lead}
      {face ?? <Avatar name={p?.username} src={p?.avatar} size={32} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name ?? p?.username}</span>
        {detail && <span className="truncate text-xs text-muted-foreground">{said(detail)}</span>}
      </span>
      {children && <span className="flex shrink-0 items-center gap-1">{children}</span>}
    </As>
  );
}

/** The button opening a dialog: the one given, or the header button, opening it on a click. */
const opener = (trigger: React.ReactElement<{ onClick?: () => void }>, open: () => void) => cloneElement(trigger, { onClick: open });

/** A battle launched from a conversation: against the friend, or in a group against a member or whoever takes it. */
export function BattleDialog({ conversation: c, group }: { conversation: Conversation; group?: Group }) {
  const [open, setOpen] = useState(false),
    [opponent, setOpponent] = useState("anyone"),
    [format, setFormat] = useState<Format>({ event: "333", points: 3, sets: 1 }),
    [busy, setBusy] = useState(false);
  const others = group?.members.filter((m) => m.role !== "invited" && m.id !== s.user.id) ?? [],
    items = [{ value: "anyone", label: tr("Anyone in the group") }, ...others.map((m) => ({ value: m.id, label: m.username }))];
  return (
    <>
      <HeadButton icon={Swords} label={tr("Battle")} data-action="conversation:battle" onClick={() => setOpen(true)} />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={c.kind === "direct" ? tr("Challenge {0}", { 0: c.with!.username }) : tr("New battle in {0}", { 0: c.group!.name })}
        description={tr("It shows in the conversation, and starts once your opponent accepts it.")}
        className="sm:max-w-md"
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const done = await community.battle(c.id, { ...format, opponentId: c.kind === "direct" ? null : opponent === "anyone" ? null : opponent });
            setBusy(false);
            if (done) setOpen(false);
          }}
        >
          <FieldGroup>
            {c.kind === "group" && (
              <Field>
                <FieldLabel>{tr("Against")}</FieldLabel>
                <Select items={items} value={opponent} onValueChange={(v) => setOpponent(String(v))}>
                  <SelectTrigger aria-label={tr("Opponent")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <FormatFields value={format} onChange={setFormat} />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              <Swords />
              {tr("Launch the battle")}</Button>
          </DialogFooter>
        </form>
      </Modal>
    </>
  );
}

/** A group's tournament, organised by its owner or an admin; its card comes into the group's conversation. */
export function TournamentDialog({ group: g, trigger }: { group: Group; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [starts, setStarts] = useState(() => localInput(Date.now() + 86_400_000)),
    [cap, setCap] = useState(String(DEFAULT_PLAYERS)),
    [format, setFormat] = useState<Format>({ event: "333", points: 3, sets: 2 }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setStarts(localInput(Date.now() + 86_400_000));
  }, [open]);
  return (
    <>
      {opener(trigger ?? <HeadButton icon={Trophy} label={tr("Tournament")} data-action="conversation:tournament" />, () => setOpen(true))}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={tr("New tournament in {0}", { 0: g.name })}
        description={tr("Its card goes to the group's conversation. Members register until it starts; the bracket is drawn at its start.")}
        className="sm:max-w-lg"
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const done = await community.createTournament(g.id, { ...format, name: name.trim(), description: description.trim(), startsAt: new Date(starts).getTime(), maxPlayers: playersLimit(cap) });
            setBusy(false);
            if (done) {
              setOpen(false);
              setName("");
              setDescription("");
            }
          }}
        >
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
                <Input id="tournament-cap" type="number" required min={2} max={MAX_PLAYERS} value={cap} onChange={(e) => setCap(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="tournament-description">{tr("Description")}</FieldLabel>
              <Textarea id="tournament-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={busy || name.trim().length < 2 || !starts}>
              <Trophy />
              {tr("Create the tournament")}</Button>
          </DialogFooter>
        </form>
      </Modal>
    </>
  );
}

/** Friends to tick, found by name: who to invite to a group. */
export function FriendPicker({ friends, value, onChange }: { friends: Person[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState(""),
    shown = friends.filter((f) => f.username.toLowerCase().includes(query.trim().toLowerCase()));
  if (!friends.length)
    return (
      <Empty icon={Users} className="rounded-lg border p-4">
        {tr("Add friends first: you invite them from here.")}
      </Empty>
    );
  return (
    <div className="flex flex-col gap-2">
      <SearchField value={query} onChange={setQuery} placeholder="Find a friend" />
      {!shown.length ? (
        <Empty className="rounded-lg border p-4">{tr("No friend by that name.")}</Empty>
      ) : (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1" aria-label={tr("Friends")}>
          {shown.map((f) => {
            const checked = value.includes(f.id);
            return (
              <li key={f.id}>
                <PersonRow
                  as="label"
                  p={f}
                  className={cn(ROW, "cursor-pointer", checked && "bg-primary/10 hover:bg-primary/15")}
                  data-friend={f.username}
                  lead={<Checkbox checked={checked} onCheckedChange={(on) => onChange(on ? [...value, f.id] : value.filter((id) => id !== f.id))} />}
                />
              </li>
            );
          })}
        </ul>
      )}
      {value.length > 0 && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{tr("{0} invited", { 0: value.length })}</span>}
    </div>
  );
}

/** A new group: its name, what it is about, and the friends invited at once. */
export function NewGroupDialog({ trigger }: { trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [invite, setInvite] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setInvite([]);
    }
  }, [open]);
  return (
    <>
      {opener(trigger ?? <HeadButton icon={Users} label={tr("New group")} data-action="community:new-group" />, () => setOpen(true))}
      <Modal open={open} onOpenChange={setOpen} title={tr("New group")} description={tr("A conversation for several friends, with its battles and tournaments. You run it.")} className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const done = await community.createGroup(name.trim(), description.trim(), invite);
            setBusy(false);
            if (done) setOpen(false);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="group-name">{tr("Name")}</FieldLabel>
              <Input id="group-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="group-description">{tr("Description")}</FieldLabel>
              <Textarea id="group-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
            </Field>
            <Field>
              <FieldLabel>{tr("Invite friends")}</FieldLabel>
              <FriendPicker friends={community.me?.friends ?? []} value={invite} onChange={setInvite} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {tr("Create the group")}</Button>
          </DialogFooter>
        </form>
      </Modal>
    </>
  );
}

/** A group's name and description, changed by its owner or an admin. */
export function EditGroupDialog({ group: g, open, onOpenChange }: { group: Group; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState(g.name),
    [description, setDescription] = useState(g.description);
  useEffect(() => {
    if (open) {
      setName(g.name);
      setDescription(g.description);
    }
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={tr("Edit the group")} description={tr("Its members see the change at once.")} className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await community.updateGroup(g.id, name.trim(), description.trim())) onOpenChange(false);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="group-edit-name">{tr("Name")}</FieldLabel>
              <Input id="group-edit-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="group-edit-description">{tr("Description")}</FieldLabel>
              <Textarea id="group-edit-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={name.trim().length < 2}>
              {tr("Save")}</Button>
          </DialogFooter>
        </form>
    </Modal>
  );
}

type Found = Person & { relation: "friend" | "incoming" | "outgoing" | "none" };

/** What can be done with a player found by name: add, accept, or where things stand. */
export function RelationAction({ p }: { p: Found }) {
  return p.relation === "none" ? (
    <Button size="sm" variant="outline" onClick={() => void community.addFriend(p.username)} data-action={"friend:add:" + p.username}>
      <UserPlus />
      {tr("Add")}</Button>
  ) : p.relation === "incoming" ? (
    <Button size="sm" onClick={() => void community.acceptFriend(p.id)}>
      <Check />
      {tr("Accept")}</Button>
  ) : p.relation === "friend" ? (
    <Button size="sm" variant="outline" onClick={() => void community.message(p.id)}>
      <MessageSquare />
      {tr("Message")}</Button>
  ) : (
    <span className="px-2 text-xs text-muted-foreground">{tr("Request sent")}</span>
  );
}

/** Players whose name starts with what is typed, a moment after the last key; found again as relations change. */
function useFound(query: string) {
  const [found, setFound] = useState<Found[] | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q) return void setFound(null);
    const timer = setTimeout(() => void community.search(q).then(setFound), 200);
    return () => clearTimeout(timer);
  }, [query, community.me]);
  return found;
}

/** The link that adds the account as a friend, to copy or share. */
function ShareLink() {
  const link = community.shareLink(),
    [copied, setCopied] = useState(false);
  return (
    <section className="flex shrink-0 flex-col gap-2" aria-label={tr("Your link")}>
      <div>
        <SectionHead title="Your link" className="min-h-0" />
        <p className="text-xs text-muted-foreground">{tr("Whoever opens it is asked to add you as a friend.")}</p>
      </div>
      <InputGroup>
        <InputGroupInput value={link} readOnly aria-label={tr("Your link")} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
            data-action="friends:copy-link"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? tr("Copied") : tr("Copy")}
          </InputGroupButton>
          {typeof navigator.share === "function" && (
            <Tip content={tr("Share")}>
              <InputGroupButton size="icon-xs" aria-label={tr("Share")} onClick={() => void navigator.share({ title: "Qbix", text: tr("Add me on Qbix"), url: link }).catch(() => {})}>
                <Share2 />
              </InputGroupButton>
            </Tip>
          )}
        </InputGroupAddon>
      </InputGroup>
    </section>
  );
}

/** Finding players by name, the account's link to share, and the friends: each a message away. */
export function FriendsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState(""),
    found = useFound(query),
    friends = community.me?.friends ?? [];
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={tr("Friends")} description={tr("Find players by their username, or share your link.")} tall className="flex max-h-[min(44rem,90svh)] flex-col sm:max-w-lg">
      <div className="flex min-h-0 flex-1 flex-col gap-5" data-slot="friends-dialog">
        <section className="flex shrink-0 flex-col gap-2" aria-label={tr("Find players")}>
          <SearchField value={query} onChange={setQuery} placeholder="Username" label="Search players" action="community:search" autoFocus />
          {found &&
            (!found.length ? (
              <Empty icon={UserRoundX} className="p-4">
                {tr("No player by that name.")}
              </Empty>
            ) : (
              <ul className="-mx-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                {found.map((p) => (
                  <PersonRow key={p.id} p={p}>
                    <RelationAction p={p} />
                  </PersonRow>
                ))}
              </ul>
            ))}
        </section>
        {!found && <ShareLink />}
        {!found && (
          <section className="flex min-h-0 flex-1 flex-col gap-1" aria-label={tr("Your friends")}>
            <SectionHead title="Your friends" meta={friends.length || undefined} />
            {!friends.length ? (
              <Empty icon={Users} className="p-4">
                {tr("No friend yet. Find players by their username, or share your link.")}
              </Empty>
            ) : (
              <ul className="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                {friends.map((p) => (
                  <PersonRow key={p.id} p={p} detail={tr("Friends since {0}", { 0: relative(p.since) })}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (await community.message(p.id)) onOpenChange(false);
                      }}
                    >
                      <MessageSquare />
                      {tr("Message")}</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={tr("More about {0}", { 0: p.username })} />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-auto">
                        <DropdownMenuItem variant="destructive" onClick={() => void community.removeFriend(p.id)}>
                          <UserMinus />
                          {tr("Remove from friends")}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </PersonRow>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

/** The bell of the messages: who asked to be friends, the groups the account is invited to, the requests it sent. */
export function Requests() {
  const me = community.me,
    count = community.waiting(),
    empty = me && !me.incoming.length && !me.invitations.length && !me.outgoing.length;
  return (
    <Popover>
      <Tip content={tr("Requests")}>
        <PopoverTrigger render={<Button variant="outline" size="icon" className="relative" aria-label={count ? tr("Requests, {0} waiting", { 0: count }) : tr("Requests")} data-action="community:requests" />}>
          <Bell />
          {count > 0 && (
            <span data-slot="requests-count" className="absolute -top-1.5 -right-1.5 flex">
              <Count n={count} className="ml-0 h-4.5 min-w-4.5 px-1 ring-2 ring-background" />
            </span>
          )}
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-88 gap-3 p-2" data-slot="requests">
        {empty && (
          <Empty icon={Bell} className="p-4">
            {tr("Nothing waiting. Requests and invitations show here.")}
          </Empty>
        )}
        {!!me?.incoming.length && (
          <RequestSection title="Friend requests">
            {me.incoming.map((p) => (
              <PersonRow key={p.id} p={p} detail={tr("Asked {0}", { 0: relative(p.at) })}>
                <Button size="sm" onClick={() => void community.acceptFriend(p.id)} data-action={"friend:accept:" + p.username}>
                  <Check />
                  {tr("Accept")}</Button>
                <Decline onClick={() => void community.removeFriend(p.id)} />
              </PersonRow>
            ))}
          </RequestSection>
        )}
        {!!me?.invitations.length && (
          <RequestSection title="Group invitations">
            {me.invitations.map((g) => (
              <PersonRow key={g.id} face={<GroupMark size={32} />} name={g.name} detail={`${tr("From {0}", { 0: g.invitedBy })} · ${plural(g.members, "member")}`}>
                <Button size="sm" onClick={() => void community.join(g.id)}>
                  <Check />
                  {tr("Join")}</Button>
                <Decline onClick={() => void community.remove(g.id, s.user.id)} />
              </PersonRow>
            ))}
          </RequestSection>
        )}
        {!!me?.outgoing.length && (
          <RequestSection title="Sent">
            {me.outgoing.map((p) => (
              <PersonRow key={p.id} p={p} detail={tr("You asked {0}", { 0: relative(p.at) })}>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void community.removeFriend(p.id)}>
                  {tr("Cancel")}</Button>
              </PersonRow>
            ))}
          </RequestSection>
        )}
      </PopoverContent>
    </Popover>
  );
}
function Decline({ onClick }: { onClick: () => void }) {
  return (
    <Tip content={tr("Decline")}>
      <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={tr("Decline")} onClick={onClick}>
        <X />
      </Button>
    </Tip>
  );
}
function RequestSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5" aria-label={said(title)}>
      <h3 className={cn(LABEL, "px-2 pt-1")}>{said(title)}</h3>
      <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">{children}</ul>
    </section>
  );
}

/** The request a shared link opens: the player behind it, and adding them. */
export function LinkDialog({ username, onClose }: { username: string; onClose: () => void }) {
  const [player, setPlayer] = useState<Found | null | undefined>(undefined);
  useEffect(() => {
    void community.search(username).then((list) => setPlayer(list.find((p) => p.username.toLowerCase() === username.toLowerCase()) ?? null));
  }, [username, community.me]);
  const self = username.toLowerCase() === s.user.username.toLowerCase();
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={self ? tr("Your link") : tr("Add a friend")}
      description={self ? tr("This is the link others open to add you. Share it with your friends.") : tr("You opened a link to add this player.")}
      className="sm:max-w-sm"
    >
      <div data-slot="link-dialog">
        {self ? null : player === undefined ? (
          <ListSkeleton rows={1} className="p-0" />
        ) : !player ? (
          <Empty icon={UserRoundX} className="p-4">
            {tr("No player is called {0}.", { 0: username })}
          </Empty>
        ) : (
          <ul className="-mx-2">
            <PersonRow p={player} detail={player.relation === "friend" ? tr("Already your friend") : player.relation === "outgoing" ? tr("Request sent") : player.relation === "incoming" ? tr("Wants to be your friend") : undefined}>
              <RelationAction p={player} />
            </PersonRow>
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** The friends not in a group yet, to invite. */
export const useFriendsOutside = (group: Group | undefined) =>
  useMemo(() => (community.me?.friends ?? []).filter((f) => !group?.members.some((m) => m.id === f.id)), [community.me, group]);
