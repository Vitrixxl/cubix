/**
 * The community page: conversations with friends and groups, friends and the players to add, and groups with their
 * chat, members, tournaments and battles. Its sections are tabs under the header; the address keeps the one open
 * (/community/messages/<id>, /community/friends, /community/groups/<id>/<tab>).
 */
import { useEffect } from "react";
import { store as s } from "../store";
import { go } from "../navigation";
import { PAGE, PageHead, plural } from "../ui";
import { Count } from "../coaching/parts";
import { community, communityUrl } from "./client";
import { Messages } from "./messages";
import { Friends } from "./friends";
import { Groups } from "./groups";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

const SECTIONS = [
  ["messages", "Messages"],
  ["friends", "Friends"],
  ["groups", "Groups"],
] as const;

export function CommunityPage() {
  const [view = "", arg = "", sub = ""] = s.view.split("/");
  useEffect(() => {
    void community.load("me");
  }, []);
  useEffect(() => {
    if (!SECTIONS.some(([id]) => id === view)) go(communityUrl("messages"), true);
  }, [view]);
  const me = community.me,
    counts: Record<string, number> = { messages: me?.unread ?? 0, friends: me?.incoming.length ?? 0, groups: me?.invitations.length ?? 0 };
  return (
    <div className={PAGE}>
      <PageHead title={tr("Community")} sub={me ? `${plural(me.friends.length, "friend")} · ${plural(me.groups.length, "group")}` : undefined}>
        <Tabs value={view} onValueChange={(v: string) => go(communityUrl(v))}>
          <TabsList>
            {SECTIONS.map(([id, label]) => (
              <TabsTrigger key={id} value={id} data-action={"community:" + id} className="gap-2 px-3">
                {said(label)}
                <Count n={counts[id] ?? 0} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHead>
      {view === "friends" ? <Friends /> : view === "groups" ? <Groups id={arg ? Number(arg) : null} tab={sub} /> : <Messages id={arg ? Number(arg) : null} />}
    </div>
  );
}
