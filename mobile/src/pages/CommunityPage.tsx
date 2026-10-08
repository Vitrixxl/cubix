import { useAtomValue, useSetAtom } from "jotai";
import { Bell, MessagesSquare, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { plural } from "../../../src/client/lib/format";
import { BackButton, Empty, HeadButton, Page, PageHead, Surface } from "../components/layout";
import { Sheet } from "../components/Sheet";
import { Details } from "../components/community/details";
import { Chat, Conversations } from "../components/community/messages";
import { FriendsSheet, LinkSheet, NewGroupSheet, RequestsSheet } from "../components/community/people";
import { community, useSocial } from "../lib/social";
import { goBackAtom, previousRouteAtom, replaceRouteAtom } from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * The community (the web's community/page.tsx on a phone): one place for messages. The conversations with friends and
 * groups, then the one opened, whose battles and tournaments show in it as cards; its details (the group's members,
 * tournaments and battles, or the friend's record) in a sheet over it. The head holds the requests waiting, the friends
 * (finding players, the link to share) and a new group. `view` keeps the conversation open ("messages/<id>"); a
 * group's opens its conversation, and "add/<username>" (a shared link) asks to add that player.
 */
export function CommunityPage({ view: address = "" }: { view?: string }) {
  useSocial();
  const [view = "", arg = ""] = address.split("/");
  const replace = useSetAtom(replaceRouteAtom), goBack = useSetAtom(goBackAtom), previous = useAtomValue(previousRouteAtom);
  const [friends, setFriends] = useState(view === "friends"), [requests, setRequests] = useState(false), [newGroup, setNewGroup] = useState(false), [details, setDetails] = useState(false);
  useEffect(() => {
    void community.load("me");
    void community.load("conversations");
  }, []);
  // Addresses from before, and shared ones: a group opens its conversation, the friends their sheet.
  useEffect(() => {
    if (view === "groups" && arg) {
      void community.load(`group:${arg}`).then(() => {
        const g = community.groups.get(Number(arg));
        replace(g ? { page: "community", view: "messages/" + g.conversationId } : { page: "community" });
      });
    } else if (view === "friends") {
      setFriends(true);
      replace({ page: "community" });
    } else if (view && view !== "messages" && view !== "add") replace({ page: "community" });
  }, [view, arg, replace]);
  const id = view === "messages" && arg ? Number(arg) : null, list = community.conversations, current = list?.find(c => c.id === id), me = community.me;
  // Another conversation (from the details) closes them.
  useEffect(() => setDetails(false), [id]);
  /** Back to the conversations: a step back when they are under this page, else in place. */
  const toList = () => { if (previous?.page === "community" && !previous.view) goBack(); else replace({ page: "community" }); };
  const waiting = community.waiting();
  return <Page>
    <PageHead title={tr("Messages")} sub={me ? `${plural(me.friends.length, "friend")} · ${plural(me.groups.length, "group")}` : undefined}
      lead={!id ? <BackButton onPress={() => { if (!goBack()) replace({ page: "profile" }); }} /> : undefined}>
      <HeadButton icon={Bell} label={waiting ? tr("Requests, {0} waiting", { 0: waiting }) : tr("Requests")} badge={waiting} onPress={() => setRequests(true)} />
      <HeadButton icon={UserPlus} label={tr("Friends")} onPress={() => setFriends(true)} />
      <HeadButton icon={MessagesSquare} label={tr("New group")} onPress={() => setNewGroup(true)} />
    </PageHead>
    {!id ? <Conversations onNewGroup={() => setNewGroup(true)} /> : <Surface className="min-h-0 flex-1">
      {current ? <Chat conversation={current} onDetails={() => setDetails(true)} back={toList} />
        : <Empty icon={MessagesSquare}>{list ? tr("This conversation does not exist.") : tr("Your conversations open here.")}</Empty>}
    </Surface>}
    {current ? <Sheet open={details} onClose={() => setDetails(false)} title={tr("Details")} hideTitle scroll>
      <Details conversation={current} leave={() => setDetails(false)} />
    </Sheet> : null}
    <FriendsSheet open={friends} onClose={() => setFriends(false)} />
    <RequestsSheet open={requests} onClose={() => setRequests(false)} />
    <NewGroupSheet open={newGroup} onClose={() => setNewGroup(false)} />
    {view === "add" && arg ? <LinkSheet username={decodeURIComponent(arg)} onClose={() => replace({ page: "community" })} /> : null}
  </Page>;
}
