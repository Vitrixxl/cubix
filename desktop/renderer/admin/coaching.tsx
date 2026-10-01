/** Coaching: the applications to become a coach (with the address to answer on), and every coach. */
import { useState } from "react";
import { Check, Mail, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { admin, useAdmin } from "./api";
import { Avatar, date, Failure, NUMERIC, Nothing, num, RowsSkeleton, UserLink, ViewHead, when } from "./parts";
import { Icon } from "../base";
import { eventInfo } from "../../../src/shared/puzzles";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Application = { id: number; userId: string; username: string; email: string; events: string[]; experience: string; message: string; status: "pending" | "approved" | "rejected"; createdAt: number; decidedAt: number | null };
type Coach = { id: string; username: string; headline: string; events: string[]; priceCents: number; active: boolean; accepting: boolean; rating: number | null; reviews: number; sessions: number; students: number; upcoming: number; since: number };
type Data = { applications: Application[]; coaches: Coach[]; pending: number };

function Events({ events }: { events: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5 text-muted-foreground">
      {events.map((e) => (
        <span key={e} title={eventInfo(e)?.label ?? e}>
          <Icon name={"Puzzle" + e} size={16} />
        </span>
      ))}
    </span>
  );
}

export function Coaching({ phone }: { phone: boolean }) {
  const data = useAdmin<Data>("/coaching");
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState("");
  const d = data.data;
  async function act(key: string, path: string, done: string) {
    setBusy(key);
    try {
      await admin(path, { method: "POST" });
      toast.success(done);
      data.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const applications = d?.applications.filter((a) => filter === "all" || a.status === filter);
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <ViewHead title="Coach applications" sub={d ? `${num(d.pending)} waiting · ${num(d.applications.length)} in all` : "Players asking to coach"} />
        <ToggleGroup variant="outline" value={[filter]} onValueChange={(v: string[]) => v[0] && setFilter(v[0])} aria-label="Applications">
          {(["pending", "approved", "rejected", "all"] as const).map((id) => (
            <ToggleGroupItem key={id} value={id} data-action={"coaching:filter:" + id} className="gap-1.5 px-3 capitalize">
              {id}
              {d && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{num(id === "all" ? d.applications.length : d.applications.filter((a) => a.status === id).length)}</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {data.error && !d ? (
          <Failure error={data.error} retry={data.reload} />
        ) : !applications ? (
          <RowsSkeleton cols={phone ? 2 : 5} rows={4} />
        ) : !applications.length ? (
          <Nothing>{filter === "pending" ? "No application waiting." : "No application here."}</Nothing>
        ) : (
          <ul className="flex flex-col gap-3" data-slot="applications">
            {applications.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm" data-application={a.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={a.username} size={32} />
                  <span className="flex min-w-0 flex-col">
                    <UserLink id={a.userId} name={a.username} />
                    <span className="text-xs text-muted-foreground" title={when(a.createdAt)}>
                      Applied {date(a.createdAt)}
                    </span>
                  </span>
                  <a href={`mailto:${a.email}?subject=${encodeURIComponent("Your Qbix coach application")}`} className="flex items-center gap-1.5 text-primary hover:underline" data-slot="email">
                    <Mail className="size-4" />
                    {a.email}
                  </a>
                  <Events events={a.events} />
                  <span className="ml-auto flex items-center gap-2">
                    {a.status === "pending" ? (
                      <>
                        <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("r" + a.id, `/coaching/applications/${a.id}/reject`, "Application rejected")} data-action="coaching:reject">
                          <X />
                          Reject
                        </Button>
                        <Button size="sm" disabled={!!busy} onClick={() => act("a" + a.id, `/coaching/applications/${a.id}/approve`, `${a.username} is now a coach`)} data-action="coaching:approve">
                          <Check />
                          Approve
                        </Button>
                      </>
                    ) : (
                      <Badge variant={a.status === "approved" ? "default" : "secondary"} className="capitalize">
                        {a.status} {a.decidedAt ? date(a.decidedAt) : ""}
                      </Badge>
                    )}
                  </span>
                </div>
                {a.experience && (
                  <p>
                    <span className="text-muted-foreground">Level · </span>
                    {a.experience}
                  </p>
                )}
                <p className="whitespace-pre-line">{a.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-4">
        <ViewHead title="Coaches" sub={d ? `${num(d.coaches.filter((c) => c.active).length)} active` : "Every coach"} />
        {!d ? (
          <RowsSkeleton cols={phone ? 2 : 7} rows={4} />
        ) : !d.coaches.length ? (
          <Nothing>No coach yet.</Nothing>
        ) : (
          <Table data-slot="coaches">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Coach</TableHead>
                {!phone && <TableHead>Events</TableHead>}
                {!phone && <TableHead className="text-right">Rating</TableHead>}
                {!phone && <TableHead className="text-right">Sessions</TableHead>}
                {!phone && <TableHead className="text-right">Coming</TableHead>}
                {!phone && <TableHead className="text-right">Students</TableHead>}
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.coaches.map((c) => (
                <TableRow key={c.id} data-coach={c.username} className={cn(!c.active && "text-muted-foreground")}>
                  <TableCell className="max-w-72">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={c.username} size={24} />
                      <span className="flex min-w-0 flex-col">
                        <UserLink id={c.id} name={c.username} />
                        <span className="truncate text-xs text-muted-foreground">{c.headline || "No headline"}</span>
                      </span>
                    </span>
                  </TableCell>
                  {!phone && (
                    <TableCell>
                      <Events events={c.events} />
                    </TableCell>
                  )}
                  {!phone && <TableCell className={cn(NUMERIC, "text-right")}>{c.rating == null ? "–" : `${c.rating.toFixed(1)} (${c.reviews})`}</TableCell>}
                  {!phone && <TableCell className={cn(NUMERIC, "text-right")}>{num(c.sessions)}</TableCell>}
                  {!phone && <TableCell className={cn(NUMERIC, "text-right")}>{num(c.upcoming)}</TableCell>}
                  {!phone && <TableCell className={cn(NUMERIC, "text-right")}>{num(c.students)}</TableCell>}
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => act("c" + c.id, `/coaching/coaches/${encodeURIComponent(c.id)}/${c.active ? "disable" : "enable"}`, c.active ? `${c.username} is no longer listed` : `${c.username} is a coach again`)}
                      data-action={c.active ? "coaching:disable" : "coaching:enable"}
                    >
                      {c.active ? <Pause /> : <Play />}
                      {c.active ? "Disable" : "Enable"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
