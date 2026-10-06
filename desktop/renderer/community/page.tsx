/**
 * The community: one place for messages. The conversations with friends and groups side by side with the open one,
 * whose battles and tournaments show in it as cards; its details (the group's members, tournaments and battles, or the
 * friend's record) beside it. The header holds the requests waiting, the friends (finding players, the link to share)
 * and a new group. The address keeps the conversation open (/community/messages/<id>); a group's address opens its
 * conversation, and /community/add/<username> (a shared link) asks to add that player.
 */
import { useEffect, useState } from "react";
import { MessagesSquare, UserPlus } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { PAGE, PageHead, plural } from "../ui";
import { usePhone, useViewport } from "../base";
import { Nothing, PANEL } from "../coaching/parts";
import { community, communityUrl } from "./client";
import { Chat, ConversationList } from "./messages";
import { Details } from "./groups";
import { FriendsDialog, HeadButton, LinkDialog, NewGroupDialog, Requests } from "./dialogs";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { tr } from "../../../src/client/i18n";

/** From this width the details sit beside the conversation; narrower, they slide over it. */
const DETAILS_BESIDE = 1280;

export function CommunityPage() {
  const [view = "", arg = ""] = s.view.split("/"),
    phone = usePhone(),
    beside = useViewport().w >= DETAILS_BESIDE,
    [friends, setFriends] = useState(view === "friends"),
    // Shown beside on a wide window until hidden; over the conversation only when asked.
    [details, setDetails] = useState<boolean | null>(null),
    shown = details ?? beside;
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
    } else if (view === "friends") {
      setFriends(true);
      go(communityUrl(), true);
    } else if (view && view !== "messages" && view !== "add") go(communityUrl(), true);
  }, [view, arg]);
  const id = view === "messages" && arg ? Number(arg) : null,
    list = community.conversations,
    current = list?.find((c) => c.id === id),
    me = community.me;
  // On a wide window the latest conversation opens when none is chosen; a phone shows the list first.
  useEffect(() => {
    if (!phone && !id && (view === "" || view === "messages") && list?.length) go(communityUrl("messages/" + list[0]!.id), true);
  }, [id, list?.length, phone, view]);
  return (
    <div className={PAGE}>
      <PageHead title={tr("Messages")} sub={me ? `${plural(me.friends.length, "friend")} · ${plural(me.groups.length, "group")}` : undefined}>
        <Requests />
        <HeadButton icon={UserPlus} label={tr("Friends")} size="default" onClick={() => setFriends(true)} data-action="community:friends" />
        <NewGroupDialog trigger={<HeadButton icon={MessagesSquare} label={tr("New group")} size="default" data-action="community:new-group" />} />
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-4">
        {(!phone || !id) && <ConversationList id={id} className={phone ? "w-full" : undefined} />}
        {(!phone || id) && (
          <div className={cn(PANEL, "min-w-0 flex-1 flex-row")}>
            {current ? (
              <>
                <Chat conversation={current} details={shown} onDetails={() => setDetails(!shown)} back={phone ? () => go(communityUrl()) : undefined} />
                {beside && shown && (
                  <aside className="flex w-80 shrink-0 flex-col border-l" aria-label={tr("Details")}>
                    <Details conversation={current} />
                  </aside>
                )}
              </>
            ) : (
              <Nothing>
                <MessagesSquare className="size-6" />
                {list && id ? tr("This conversation does not exist.") : tr("Your conversations open here.")}
              </Nothing>
            )}
          </div>
        )}
      </div>
      {!beside && current && (
        <Sheet open={shown} onOpenChange={setDetails}>
          {/* A drawer floating beside the conversation, not a wall. */}
          <SheetContent
            side="right"
            className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-2xl border p-0 data-[side=right]:inset-y-3 data-[side=right]:right-3 data-[side=right]:h-auto data-[side=right]:border"
          >
            <SheetTitle className="sr-only">{tr("Details")}</SheetTitle>
            <Details conversation={current} />
          </SheetContent>
        </Sheet>
      )}
      <FriendsDialog open={friends} onOpenChange={setFriends} />
      {view === "add" && arg && <LinkDialog username={decodeURIComponent(arg)} onClose={() => go(communityUrl(), true)} />}
    </div>
  );
}
