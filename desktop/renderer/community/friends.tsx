/** Friends: finding players by name, the requests both ways, and the friends with a way to write to them. */
import { useEffect, useState } from "react";
import { Check, MessageSquare, MoreHorizontal, Search, UserMinus, UserPlus, X } from "lucide-react";
import { Avatar, NUMERIC } from "../ui";
import { Nothing, PANEL, PANEL_HEAD, ROWS, RowsSkeleton, relative } from "../coaching/parts";
import { community, type Person } from "./client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

type Found = Person & { relation: "friend" | "incoming" | "outgoing" | "none" };

function Row({ p, detail, children }: { p: Person; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted/40" data-person={p.username}>
      <Avatar name={p.username} src={p.avatar} size={32} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{p.username}</span>
        {detail && <span className="truncate text-xs text-muted-foreground">{said(detail)}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </li>
  );
}

export function Friends() {
  const me = community.me;
  const [query, setQuery] = useState(""),
    [found, setFound] = useState<Found[] | null>(null);
  // Players whose name starts with what is typed, a moment after the last key.
  useEffect(() => {
    const q = query.trim();
    if (!q) return void setFound(null);
    const timer = setTimeout(() => void community.search(q).then((list) => setFound(list)), 200);
    return () => clearTimeout(timer);
  }, [query, me]);
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex w-96 shrink-0 flex-col gap-4">
        <section className={cn(PANEL, "shrink-0")} aria-label={tr("Find players")}>
          <h2 className={PANEL_HEAD}>{tr("Find players")}</h2>
          <div className="px-3 pb-2">
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Username")} aria-label={tr("Search players")} data-action="community:search" />
            </InputGroup>
          </div>
          {found && (
            <ul className={cn(ROWS, "max-h-72 overflow-y-auto")}>
              {!found.length && <li className="px-2.5 py-2 text-sm text-muted-foreground">{tr("No player by that name.")}</li>}
              {found.map((p) => (
                <Row key={p.id} p={p}>
                  {p.relation === "none" ? (
                    <Button size="sm" variant="outline" onClick={() => void community.addFriend(p.username)}>
                      <UserPlus />
                      {tr("Add")}</Button>
                  ) : p.relation === "incoming" ? (
                    <Button size="sm" onClick={() => void community.acceptFriend(p.id)}>
                      <Check />
                      {tr("Accept")}</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{p.relation === "friend" ? tr("Friend") : tr("Asked")}</span>
                  )}
                </Row>
              ))}
            </ul>
          )}
        </section>
        <section className={cn(PANEL, "min-h-0 flex-1")} aria-label={tr("Requests")}>
          <h2 className={PANEL_HEAD}>
            {tr("Requests")}{" "}<span className={cn(NUMERIC, "text-muted-foreground")}>{(me?.incoming.length ?? 0) + (me?.outgoing.length ?? 0) || ""}</span>
          </h2>
          <ul className={cn(ROWS, "min-h-0 flex-1 overflow-y-auto")}>
            {me && !me.incoming.length && !me.outgoing.length && <li className="px-2.5 py-2 text-sm text-muted-foreground">{tr("No request.")}</li>}
            {me?.incoming.map((p) => (
              <Row key={p.id} p={p} detail={tr("Asked {0}", { 0: relative(p.at) })}>
                <Button size="sm" onClick={() => void community.acceptFriend(p.id)}>
                  <Check />
                  {tr("Accept")}</Button>
                <Button size="icon-sm" variant="ghost" aria-label={tr("Decline")} onClick={() => void community.removeFriend(p.id)}>
                  <X />
                </Button>
              </Row>
            ))}
            {me?.outgoing.map((p) => (
              <Row key={p.id} p={p} detail={tr("You asked {0}", { 0: relative(p.at) })}>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void community.removeFriend(p.id)}>
                  {tr("Cancel")}</Button>
              </Row>
            ))}
          </ul>
        </section>
      </div>
      <section className={cn(PANEL, "min-w-0 flex-1")} aria-label={tr("Friends")}>
        <h2 className={PANEL_HEAD}>
          {tr("Friends")}{" "}<span className={cn(NUMERIC, "text-muted-foreground")}>{me?.friends.length || ""}</span>
        </h2>
        {!me ? (
          <RowsSkeleton />
        ) : !me.friends.length ? (
          <Nothing>{tr("No friend yet. Find players by their username.")}</Nothing>
        ) : (
          <ul className={cn(ROWS, "min-h-0 flex-1 overflow-y-auto")}>
            {me.friends.map((p) => (
              <Row key={p.id} p={p} detail={tr("Friends since {0}", { 0: relative(p.since) })}>
                <Button size="sm" variant="outline" onClick={() => void community.message(p.id)}>
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
              </Row>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
