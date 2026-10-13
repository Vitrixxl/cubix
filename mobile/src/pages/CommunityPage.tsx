import { useSetAtom } from "jotai";
import { MessagesSquare } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { Docked, Pane } from "../components/chat/kit";
import { Empty } from "../components/layout";
import { Sheet } from "../components/Sheet";
import { Details, FriendPage, GroupPage } from "../components/community/details";
import { Chat, Inbox } from "../components/community/messages";
import { AddFriendSheet, Contacts, LinkSheet, NewGroupSheet, Requests, RequestsSheet, ShareLink } from "../components/community/people";
import { useLayout } from "../hooks/useLayout";
import { community, useSocial } from "../lib/social";
import { goBackAtom, replaceRouteAtom, type Route } from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * The community (the web's community/page.tsx and people.tsx), two tabs of the Me section. Messages: the conversations
 * with friends and groups; one opened is a screen of its own, its battles and tournaments in it as cards, its details
 * (the group's members, tournaments and battles, or the friend's record) in a sheet over it. Community ("people"): the
 * requests, the friends and the groups; a friend ("people/u/<id>") or a group ("people/g/<id>") opens its page.
 * "messages/<id>" keeps a conversation open, a group's old address opens its conversation, and "add/<username>" (a
 * shared link) asks to add that player. On a wide screen (a tablet held sideways, a laptop) the list stays and what it
 * opens shows beside it: the conversation in a card, a friend's or a group's page docked at the right (with none open,
 * what waits for an answer and the link to share).
 */
export function CommunityPage({ view: address = "" }: { view?: string }) {
  useSocial();
  const [view = "", arg = "", sub = ""] = address.split("/");
  const replace = useSetAtom(replaceRouteAtom), goBack = useSetAtom(goBackAtom), { wide } = useLayout();
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

  // Docked, a page closes back to the list alone.
  const people = back({ page: "community", view: "people" }), close = () => replace({ page: "community", view: "people" });
  const page = view === "people" && arg === "u" ? <FriendPage id={sub} back={wide ? close : people} docked={wide} />
    : view === "people" && arg === "g" ? <GroupPage id={Number(sub)} back={wide ? close : people} docked={wide} /> : null;
  if (page && !wide) return page;
  const chat = id ? <View className="min-h-0 flex-1">
    {current ? <Chat conversation={current} onDetails={() => setDetails(true)} back={wide ? undefined : back({ page: "community" })} />
      : <>{!wide ? <PushedBar title={tr("Messages")} onBack={back({ page: "community" })} /> : null}
        <Empty icon={MessagesSquare}>{list ? tr("This conversation does not exist.") : tr("Your conversations open here.")}</Empty></>}
    {current ? <Sheet open={details} onClose={() => setDetails(false)} title={tr("Details")} hideTitle scroll>
      <Details conversation={current} leave={() => setDetails(false)} />
    </Sheet> : null}
  </View> : null;
  if (chat && !wide) return chat;
  const inbox = <Inbox onAddFriend={() => setAddFriend(true)} onNewGroup={() => setNewGroup(true)} onRequests={() => setRequests(true)} selected={id} />;
  return <View className="min-h-0 flex-1">
    <AppBar puzzle={false} />
    <SectionTabs />
    {view === "people" ? wide ? <View className="min-h-0 flex-1 flex-row">
      <Contacts onAddFriend={() => setAddFriend(true)} onNewGroup={() => setNewGroup(true)} selected={page ? `people/${arg}/${sub}` : undefined} aside={!page} />
      <Docked>{page ?? <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3 p-4"><Requests empty narrow /><ShareLink /></ScrollView>}</Docked>
    </View> : <Contacts onAddFriend={() => setAddFriend(true)} onNewGroup={() => setNewGroup(true)} />
      : wide ? <View className="min-h-0 flex-1 flex-row">
        <View className="w-[408px]">{inbox}</View>
        <Pane className="my-3 mr-7 ml-4">{chat ?? <Empty icon={MessagesSquare}>{tr("Your conversations open here.")}</Empty>}</Pane>
      </View> : inbox}
    <AddFriendSheet open={addFriend} onClose={() => setAddFriend(false)} />
    <RequestsSheet open={requests} onClose={() => setRequests(false)} />
    <NewGroupSheet open={newGroup} onClose={() => setNewGroup(false)} />
    {view === "add" && arg ? <LinkSheet username={decodeURIComponent(arg)} onClose={() => replace({ page: "community" })} /> : null}
  </View>;
}
