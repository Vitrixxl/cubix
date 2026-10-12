import { useSetAtom } from "jotai";
import { MessagesSquare } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { Empty } from "../components/layout";
import { Sheet } from "../components/Sheet";
import { Details, FriendPage, GroupPage } from "../components/community/details";
import { Chat, Inbox } from "../components/community/messages";
import { AddFriendSheet, Contacts, LinkSheet, NewGroupSheet, RequestsSheet } from "../components/community/people";
import { community, useSocial } from "../lib/social";
import { goBackAtom, replaceRouteAtom, type Route } from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * The community (the web's community/page.tsx and people.tsx), two tabs of the Me section. Messages: the conversations
 * with friends and groups; one opened is a screen of its own, its battles and tournaments in it as cards, its details
 * (the group's members, tournaments and battles, or the friend's record) in a sheet over it. Community ("people"): the
 * requests, the friends and the groups; a friend ("people/u/<id>") or a group ("people/g/<id>") opens its page.
 * "messages/<id>" keeps a conversation open, a group's old address opens its conversation, and "add/<username>" (a
 * shared link) asks to add that player.
 */
export function CommunityPage({ view: address = "" }: { view?: string }) {
  useSocial();
  const [view = "", arg = "", sub = ""] = address.split("/");
  const replace = useSetAtom(replaceRouteAtom), goBack = useSetAtom(goBackAtom);
  const [addFriend, setAddFriend] = useState(false), [requests, setRequests] = useState(false), [newGroup, setNewGroup] = useState(false), [details, setDetails] = useState(false);
  useEffect(() => {
    void community.load("me");
    void community.load("conversations");
  }, []);
  // Addresses from before, and shared ones: a group opens its conversation, the friends their tab.
  useEffect(() => {
    if (view === "groups" && arg) {
      void community.load(`group:${arg}`).then(() => {
        const g = community.groups.get(Number(arg));
        replace(g ? { page: "community", view: "messages/" + g.conversationId } : { page: "community" });
      });
    } else if (view === "friends") replace({ page: "community", view: "people" });
    else if (view && view !== "messages" && view !== "add" && view !== "people") replace({ page: "community" });
  }, [view, arg, replace]);
  const id = view === "messages" && arg ? Number(arg) : null, list = community.conversations, current = list?.find(c => c.id === id);
  // Another conversation closes the details.
  useEffect(() => setDetails(false), [id]);
  /** A step back, or the tab's list when the page was opened on its own (a link, a notification). */
  const back = (root: Route) => () => { if (!goBack()) replace(root); };

  if (view === "people" && arg === "u") return <FriendPage id={sub} back={back({ page: "community", view: "people" })} />;
  if (view === "people" && arg === "g") return <GroupPage id={Number(sub)} back={back({ page: "community", view: "people" })} />;
  if (id) return <View className="min-h-0 flex-1">
    {current ? <Chat conversation={current} onDetails={() => setDetails(true)} back={back({ page: "community" })} />
      : <><PushedBar title={tr("Messages")} onBack={back({ page: "community" })} />
        <Empty icon={MessagesSquare}>{list ? tr("This conversation does not exist.") : tr("Your conversations open here.")}</Empty></>}
    {current ? <Sheet open={details} onClose={() => setDetails(false)} title={tr("Details")} hideTitle scroll>
      <Details conversation={current} leave={() => setDetails(false)} />
    </Sheet> : null}
  </View>;
  return <View className="min-h-0 flex-1">
    <AppBar puzzle={false} />
    <SectionTabs />
    {view === "people" ? <Contacts onNewGroup={() => setNewGroup(true)} />
      : <Inbox onAddFriend={() => setAddFriend(true)} onNewGroup={() => setNewGroup(true)} onRequests={() => setRequests(true)} />}
    <AddFriendSheet open={addFriend} onClose={() => setAddFriend(false)} />
    <RequestsSheet open={requests} onClose={() => setRequests(false)} />
    <NewGroupSheet open={newGroup} onClose={() => setNewGroup(false)} />
    {view === "add" && arg ? <LinkSheet username={decodeURIComponent(arg)} onClose={() => replace({ page: "community" })} /> : null}
  </View>;
}
