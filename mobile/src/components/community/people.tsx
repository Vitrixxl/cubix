import * as Clipboard from "expo-clipboard";
import { Bell, Check, Copy, MessageSquare, Search, Share2, UserMinus, UserPlus, UserRoundX, Users, X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Share, View } from "react-native";
import { plural } from "../../../../src/client/lib/format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { Group, Person } from "../../../../src/client/lib/community";
import { community } from "../../lib/social";
import { Empty, Label, ListSkeleton, MenuItem, MoreMenu, Numeric, SectionHead } from "../layout";
import { Sheet, SheetInput, SheetScrollView } from "../Sheet";
import { Face, relative } from "../chat/kit";
import { GroupMark } from "./marks";
import { tr } from "../../../../src/client/i18n";

/**
 * The people of the community (the web's community/dialogs.tsx): a player in a list, finding players, the link that
 * adds the account, the friends, the requests waiting, a new group with the friends to invite, and the request a shared
 * link opens.
 */

const me = () => community.host.account();

/**
 * A player in a list, the same everywhere (friends, requests, members): the face, the name, a line under it, and what
 * can be done on the right. `face` stands in for the avatar (a group's mark), `lead` comes before it (a tick).
 */
export function PersonRow({ p, name, face, detail, lead, children, onPress, selected, className }: {
  p?: Person; name?: ReactNode; face?: ReactNode; detail?: string; lead?: ReactNode; children?: ReactNode; onPress?: () => void; selected?: boolean; className?: string;
}) {
  const body = <>
    {lead}
    {face ?? <Face name={p?.username} src={p?.avatar} size={32} />}
    <View className="min-w-0 flex-1">
      {typeof (name ?? p?.username) === "string" || name == null ? <Text numberOfLines={1} className="text-sm font-medium">{name ?? p?.username}</Text> : name}
      {detail ? <Text numberOfLines={1} className="text-xs text-muted-foreground">{detail}</Text> : null}
    </View>
    {children ? <View className="shrink-0 flex-row items-center gap-1">{children}</View> : null}
  </>;
  const row = cn("min-h-12 flex-row items-center gap-3 rounded-lg px-2 py-1.5", className);
  return onPress
    ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={p?.username} onPress={onPress} className={cn(row, "active:bg-muted/60", selected && "bg-primary/10")}>{body}</Pressable>
    : <View className={row}>{body}</View>;
}

/** A small button of a row, its icon then its word. */
function RowButton({ icon, label, onPress, variant = "outline", accessibilityLabel }: { icon?: typeof Check; label: string; onPress: () => void; variant?: "default" | "outline" | "ghost"; accessibilityLabel?: string }) {
  return <Button size="sm" variant={variant} className="h-9 rounded-lg px-3" accessibilityLabel={accessibilityLabel} onPress={onPress}>
    {icon ? <Icon as={icon} size={15} /> : null}
    <Text>{label}</Text>
  </Button>;
}

/** Turning down a request or an invitation: a quiet ×. */
function Decline({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={tr("Decline")} onPress={onPress} className="size-10 items-center justify-center rounded-lg active:bg-muted">
    <Icon as={X} size={17} className="text-muted-foreground" />
  </Pressable>;
}

/** A search field inside a sheet, which the sheet lifts over the keyboard. */
export function SheetSearch({ value, onChangeText, placeholder, label, autoFocus }: { value: string; onChangeText: (text: string) => void; placeholder: string; label?: string; autoFocus?: boolean }) {
  return <View className="justify-center">
    <SheetInput value={value} onChangeText={onChangeText} placeholder={placeholder} accessibilityLabel={label ?? placeholder} autoCapitalize="none" autoCorrect={false} autoFocus={autoFocus}
      returnKeyType="search" className="pl-10" />
    <View pointerEvents="none" className="absolute left-3"><Icon as={Search} size={17} className="text-muted-foreground" /></View>
  </View>;
}

type Found = Person & { relation: "friend" | "incoming" | "outgoing" | "none" };

/** What can be done with a player found by name: add, accept, or where things stand. */
export function RelationAction({ p, onMessage }: { p: Found; onMessage?: () => void }) {
  return p.relation === "none" ? <RowButton icon={UserPlus} label={tr("Add")} onPress={() => void community.addFriend(p.username)} />
    : p.relation === "incoming" ? <RowButton icon={Check} label={tr("Accept")} variant="default" onPress={() => void community.acceptFriend(p.id)} />
      : p.relation === "friend" ? <RowButton icon={MessageSquare} label={tr("Message")} onPress={async () => { if (await community.message(p.id)) onMessage?.(); }} />
        : <Text className="px-2 text-xs text-muted-foreground">{tr("Request sent")}</Text>;
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
  const link = community.shareLink(), [copied, setCopied] = useState(false);
  return <View className="gap-2" accessibilityLabel={tr("Your link")}>
    <View>
      <SectionHead title={tr("Your link")} className="min-h-0" />
      <Text className="text-xs text-muted-foreground">{tr("Whoever opens it is asked to add you as a friend.")}</Text>
    </View>
    <View className="min-h-11 flex-row items-center gap-1 rounded-lg border border-input bg-input/30 pl-3">
      <Text numberOfLines={1} selectable className="min-w-0 flex-1 font-mono text-xs text-foreground">{link}</Text>
      <Button size="sm" variant="ghost" className="h-10 rounded-lg px-2.5" onPress={() => void Clipboard.setStringAsync(link).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })}>
        <Icon as={copied ? Check : Copy} size={15} />
        <Text>{copied ? tr("Copied") : tr("Copy")}</Text>
      </Button>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Share")} onPress={() => void Share.share({ title: tr("Qbix"), message: tr("Add me on Qbix {0}", { 0: link }), url: link }).catch(() => {})}
        className="size-10 items-center justify-center rounded-lg active:bg-muted">
        <Icon as={Share2} size={16} />
      </Pressable>
    </View>
  </View>;
}

/** Finding players by name, the account's link to share, and the friends: each a message away. */
export function FriendsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState(""), found = useFound(query), friends = community.me?.friends ?? [];
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  return <Sheet open={open} onClose={onClose} title={tr("Friends")} description={tr("Find players by their username, or share your link.")} contentClassName="gap-5">
    <View className="gap-2" accessibilityLabel={tr("Find players")}>
      <SheetSearch value={query} onChangeText={setQuery} placeholder={tr("Username")} label={tr("Search players")} />
      {found && (!found.length
        ? <Empty icon={UserRoundX} className="flex-none p-4">{tr("No player by that name.")}</Empty>
        : <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="-mx-2 gap-0.5">
          {found.map(p => <PersonRow key={p.id} p={p}><RelationAction p={p} onMessage={onClose} /></PersonRow>)}
        </SheetScrollView>)}
    </View>
    {!found ? <ShareLink /> : null}
    {!found ? <View className="min-h-0 shrink gap-1" accessibilityLabel={tr("Your friends")}>
      <SectionHead title={tr("Your friends")} meta={friends.length || undefined} />
      {!friends.length
        ? <Empty icon={Users} className="flex-none p-4">{tr("No friend yet. Find players by their username, or share your link.")}</Empty>
        : <SheetScrollView contentContainerClassName="-mx-2 gap-0.5">
          {friends.map(p => <PersonRow key={p.id} p={p} detail={tr("Friends since {0}", { 0: relative(p.since) })}>
            <RowButton icon={MessageSquare} label={tr("Message")} onPress={async () => { if (await community.message(p.id)) onClose(); }} />
            <MoreMenu label={tr("More about {0}", { 0: p.username })}>
              <MenuItem icon={UserMinus} destructive onPress={() => void community.removeFriend(p.id)}>{tr("Remove from friends")}</MenuItem>
            </MoreMenu>
          </PersonRow>)}
        </SheetScrollView>}
    </View> : null}
  </Sheet>;
}

/** The bell's sheet: who asked to be friends, the groups the account is invited to, the requests it sent. */
export function RequestsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = community.me, empty = !m || (!m.incoming.length && !m.invitations.length && !m.outgoing.length);
  return <Sheet open={open} onClose={onClose} title={tr("Requests")} scroll>
    {empty ? <Empty icon={Bell} className="flex-none p-4">{tr("Nothing waiting. Requests and invitations show here.")}</Empty> : null}
    {m?.incoming.length ? <RequestSection title={tr("Friend requests")}>
      {m.incoming.map(p => <PersonRow key={p.id} p={p} detail={tr("Asked {0}", { 0: relative(p.at) })}>
        <RowButton icon={Check} label={tr("Accept")} variant="default" onPress={() => void community.acceptFriend(p.id)} />
        <Decline onPress={() => void community.removeFriend(p.id)} />
      </PersonRow>)}
    </RequestSection> : null}
    {m?.invitations.length ? <RequestSection title={tr("Group invitations")}>
      {m.invitations.map(g => <PersonRow key={g.id} face={<GroupMark size={32} />} name={g.name} detail={tr("From {0} · {1}", { 0: g.invitedBy, 1: plural(g.members, "member") })}>
        <RowButton icon={Check} label={tr("Join")} variant="default" onPress={() => { onClose(); void community.join(g.id); }} />
        <Decline onPress={() => void community.remove(g.id, me().id)} />
      </PersonRow>)}
    </RequestSection> : null}
    {m?.outgoing.length ? <RequestSection title={tr("Sent")}>
      {m.outgoing.map(p => <PersonRow key={p.id} p={p} detail={tr("You asked {0}", { 0: relative(p.at) })}>
        <RowButton label={tr("Cancel")} variant="ghost" onPress={() => void community.removeFriend(p.id)} />
      </PersonRow>)}
    </RequestSection> : null}
  </Sheet>;
}
function RequestSection({ title, children }: { title: string; children: ReactNode }) {
  return <View className="-mx-2 gap-0.5" accessibilityLabel={title}>
    <Label className="px-2 pt-1">{title}</Label>
    {children}
  </View>;
}

/** Friends to tick, found by name: who to invite to a group. */
export function FriendPicker({ friends, value, onChange }: { friends: Person[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState(""), shown = friends.filter(f => f.username.toLowerCase().includes(query.trim().toLowerCase()));
  if (!friends.length) return <Empty icon={Users} className="flex-none rounded-lg border border-border p-4">{tr("Add friends first: you invite them from here.")}</Empty>;
  return <View className="min-h-0 shrink gap-2">
    <SheetSearch value={query} onChangeText={setQuery} placeholder={tr("Find a friend")} />
    {!shown.length ? <Empty className="flex-none rounded-lg border border-border p-4">{tr("No friend by that name.")}</Empty>
      : <View className="max-h-56 rounded-lg border border-border"><SheetScrollView contentContainerClassName="gap-0.5 p-1" accessibilityLabel={tr("Friends")}>
        {shown.map(f => {
          const checked = value.includes(f.id);
          return <PersonRow key={f.id} p={f} selected={checked} onPress={() => onChange(checked ? value.filter(id => id !== f.id) : [...value, f.id])}
            lead={<View className={cn("size-5 items-center justify-center rounded-md border", checked ? "border-primary bg-primary" : "border-input")}>
              {checked ? <Icon as={Check} size={13} strokeWidth={3} className="text-primary-foreground" /> : null}
            </View>} />;
        })}
      </SheetScrollView></View>}
    {value.length ? <Numeric className="text-xs text-muted-foreground">{tr("{0} invited", { 0: value.length })}</Numeric> : null}
  </View>;
}

/** A labelled field of a sheet's form. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <View className="gap-1.5"><Text className="text-sm font-medium">{label}</Text>{children}</View>;
}

/** A new group: its name, what it is about, and the friends invited at once. */
export function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [invite, setInvite] = useState<string[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setDescription(""); setInvite([]); } }, [open]);
  return <Sheet open={open} onClose={onClose} title={tr("New group")} description={tr("A conversation for several friends, with its battles and tournaments. You run it.")}>
    <Field label={tr("Name")}><SheetInput value={name} onChangeText={setName} maxLength={40} accessibilityLabel={tr("Name")} /></Field>
    <Field label={tr("Description")}><SheetInput value={description} onChangeText={setDescription} maxLength={300} multiline accessibilityLabel={tr("Description")} className="min-h-16 py-2.5" textAlignVertical="top" /></Field>
    <Field label={tr("Invite friends")}><FriendPicker friends={community.me?.friends ?? []} value={invite} onChange={setInvite} /></Field>
    <Button disabled={busy || name.trim().length < 2} className="h-11 rounded-lg" onPress={async () => {
      setBusy(true);
      const done = await community.createGroup(name.trim(), description.trim(), invite);
      setBusy(false);
      if (done) onClose();
    }}><Text>{tr("Create the group")}</Text></Button>
  </Sheet>;
}

/** The request a shared link opens: the player behind it, and adding them. */
export function LinkSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const [player, setPlayer] = useState<Found | null | undefined>(undefined);
  useEffect(() => {
    void community.search(username).then(list => setPlayer(list.find(p => p.username.toLowerCase() === username.toLowerCase()) ?? null));
  }, [username, community.me]);
  const self = username.toLowerCase() === me().username.toLowerCase();
  return <Sheet open onClose={onClose} title={self ? tr("Your link") : tr("Add a friend")}
    description={self ? tr("This is the link others open to add you. Share it with your friends.") : tr("You opened a link to add this player.")}>
    {self ? null : player === undefined ? <ListSkeleton rows={1} />
      : !player ? <Empty icon={UserRoundX} className="flex-none p-4">{tr("No player is called {0}.", { 0: username })}</Empty>
        : <View className="-mx-2"><PersonRow p={player} detail={player.relation === "friend" ? tr("Already your friend") : player.relation === "outgoing" ? tr("Request sent") : player.relation === "incoming" ? tr("Wants to be your friend") : undefined}>
          <RelationAction p={player} onMessage={onClose} />
        </PersonRow></View>}
  </Sheet>;
}

/** The friends not in a group yet, to invite. */
export const friendsOutside = (group: Group | undefined) => (community.me?.friends ?? []).filter(f => !group?.members.some(m => m.id === f.id));
