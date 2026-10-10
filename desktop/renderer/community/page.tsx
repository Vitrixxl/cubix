/**
 * The community: one place for messages. The conversations with friends and groups side by side with the open one,
 * whose battles and tournaments show in it as cards; its details (the group's members, tournaments and battles, or the
 * friend's record) in a drawer over it. The inbox's title holds the requests waiting, the way to the contacts and a new
 * group. The contacts (friends, groups, requests, finding players) are their own tab: /community/people (people.tsx). The address keeps the conversation open (/community/messages/<id>); a group's address opens its
 * conversation, and /community/add/<username> (a shared link) asks to add that player.
 */
import { useEffect, useState } from "react";
import { MessagesSquare, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Empty, PAGE, Surface } from "../ui";
import { Tip, usePhone } from "../base";
import { PhoneSheet } from "../phone";
import { community, communityUrl } from "./client";
import { Chat, ConversationList } from "./messages";
import { Details } from "./groups";
import { LinkDialog } from "./dialogs";
import { PeoplePage, peopleUrl } from "./people";
import { Button } from "@/components/ui/button";
import { tr } from "../../../src/client/i18n";

export function CommunityPage() {
  const [view = "", arg = ""] = s.view.split("/"),
    phone = usePhone(),
    // The details come over the conversation when asked: a drawer on its right, a sheet from the bottom on phones.
    [details, setDetails] = useState(false);
  useEffect(() => {
    void community.load("me");
    void community.load("conversations");
  }, []);
  // Addresses from before, and shared ones: a group opens its conversation, the friends their dialog.
  useEffect(() => {
    if (view === "groups" && arg) {
      void community.load(`group:${arg}`).then(() => {
        const g = community.groups.get(Number(arg));
        go(communityUrl(g ? "messages/" + g.conversationId : ""), true);
      });
    } else if (view === "friends") go(peopleUrl(), true);
    else if (view && view !== "messages" && view !== "add" && view !== "people") go(communityUrl(), true);
  }, [view, arg]);
  const id = view === "messages" && arg ? Number(arg) : null,
    list = community.conversations,
    current = list?.find((c) => c.id === id),
    me = community.me;
  // On a wide window the latest conversation opens when none is chosen; a phone shows the list first.
  useEffect(() => {
    if (view === "people") return;
    if (!phone && !id && (view === "" || view === "messages") && list?.length) go(communityUrl("messages/" + list[0]!.id), true);
  }, [id, list?.length, phone, view]);
  if (view === "people")
    return (
      <div className={PAGE}>
        <PeoplePage kind={arg} id={s.view.split("/")[2] ?? ""} />
      </div>
    );
  return (
    <div className={PAGE}>
      <div className="flex min-h-0 flex-1 gap-5">
        {(!phone || !id) && <ConversationList id={id} onFriends={() => go(peopleUrl())} className={phone ? "w-full" : undefined} />}
        {(!phone || id) && (
          <Surface className="relative min-w-0 flex-1 flex-row overflow-hidden">
            {current ? (
              <Chat conversation={current} details={details} onDetails={() => setDetails(!details)} back={phone ? () => go(communityUrl()) : undefined} />
            ) : (
              <Empty icon={MessagesSquare}>{list && id ? tr("This conversation does not exist.") : tr("Your conversations open here.")}</Empty>
            )}
            {!phone && details && current && (
              <aside
                className="absolute inset-y-0 right-0 z-10 flex w-[360px] max-w-full flex-col bg-card shadow-[-16px_0_32px_rgb(0_0_0/0.08)] dark:shadow-[-20px_0_40px_rgb(0_0_0/0.3)]"
                aria-label={tr("Details")}
                onKeyDown={(e) => e.key === "Escape" && setDetails(false)}
              >
                <Tip content={tr("Hide the details")}>
                  <Button variant="ghost" size="icon" className="absolute top-3 right-3 z-10" aria-label={tr("Hide the details")} onClick={() => setDetails(false)}>
                    <X />
                  </Button>
                </Tip>
                <Details conversation={current} />
              </aside>
            )}
          </Surface>
        )}
      </div>
      {phone && current && (
        <PhoneSheet open={details} onOpenChange={setDetails} title={tr("Details")} hideTitle tall className="p-0">
          <Details conversation={current} />
        </PhoneSheet>
      )}
      {view === "add" && arg && <LinkDialog username={decodeURIComponent(arg)} onClose={() => go(communityUrl(), true)} />}
    </div>
  );
}
