/** Coaching: the applications to become a coach (with the address to answer on), and every coach. */
import { useState } from "react";
import { Check, Headset, Inbox, Mail, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { admin, useAdmin } from "./api";
import { Avatar, date, Failure, LINK, NUMERIC, num, SectionHead, TableSkeleton, UserLink, VIEW, when } from "./parts";
import { Empty, Events, PageHead, Segmented, Surface, Tip } from "../base";
import { ask } from "../confirm";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Application = { id: number; userId: string; username: string; email: string; events: string[]; experience: string; message: string; status: "pending" | "approved" | "rejected"; createdAt: number; decidedAt: number | null };
type Coach = { id: string; username: string; headline: string; events: string[]; priceCents: number; active: boolean; accepting: boolean; rating: number | null; reviews: number; sessions: number; students: number; upcoming: number; since: number };
type Data = { applications: Application[]; coaches: Coach[]; pending: number };

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
  const active = d?.coaches.filter((c) => c.active).length ?? 0;
  return (
    <div className={VIEW}>
      <PageHead title="Coaching" sub={d ? `${num(d.pending)} applications waiting · ${num(active)} active coaches` : "Players asking to coach, and every coach"} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Applications"
          action="coaching:filter:"
          value={filter}
          onChange={setFilter}
          options={(["pending", "approved", "rejected", "all"] as const).map((id) => ({
            id,
            label: id === "pending" ? "Pending" : id === "approved" ? "Approved" : id === "rejected" ? "Rejected" : "All",
            count: d ? (id === "all" ? d.applications : d.applications.filter((a) => a.status === id)).length : undefined,
          }))}
        />
      </div>
      <section className="flex flex-col gap-3" aria-label="Coach applications">
        <SectionHead rule title="Coach applications" meta={applications?.length || undefined} />
        {data.error && !d ? (
          <Failure error={data.error} retry={data.reload} />
        ) : !applications ? (
          <TableSkeleton cols={phone ? 2 : 5} rows={4} />
        ) : !applications.length ? (
          <Empty icon={Inbox} title={filter === "pending" ? "No application waiting." : "No application here."} />
        ) : (
          <ul className="flex flex-col gap-3" data-slot="applications">
            {applications.map((a) => (
              <li key={a.id} data-application={a.id}>
                <Surface className="gap-3 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={a.username} size={32} />
                    <span className="flex min-w-0 flex-col">
                      <UserLink id={a.userId} name={a.username} />
                      <Tip content={when(a.createdAt)}>
                        <span className="w-fit text-xs text-muted-foreground">Applied {date(a.createdAt)}</span>
                      </Tip>
                    </span>
                    <a href={`mailto:${a.email}?subject=${encodeURIComponent("Your Qbix coach application")}`} className={cn(LINK, "flex items-center gap-1.5 text-muted-foreground")} data-slot="email">
                      <Mail className="size-4" />
                      {a.email}
                    </a>
                    <Events events={a.events} />
                    <span className="ml-auto flex items-center gap-2">
                      {a.status === "pending" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!busy}
                            onClick={async () =>
                              (await ask({ title: `Reject ${a.username}'s application?`, text: "The application is closed; write to the player to say why.", action: "Reject" })) &&
                              act("r" + a.id, `/coaching/applications/${a.id}/reject`, "Application rejected")
                            }
                            data-action="coaching:reject"
                          >
                            <X />
                            Reject
                          </Button>
                          <Button size="sm" disabled={!!busy} onClick={() => act("a" + a.id, `/coaching/applications/${a.id}/approve`, `${a.username} is now a coach`)} data-action="coaching:approve">
                            <Check />
                            Approve
                          </Button>
                        </>
                      ) : (
                        <Badge variant={a.status === "approved" ? "success" : "secondary"} className="capitalize">
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
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3" aria-label="Coaches">
        <SectionHead rule title="Coaches" meta={d?.coaches.length || undefined} />
        {!d ? (
          <TableSkeleton cols={phone ? 2 : 7} rows={4} />
        ) : !d.coaches.length ? (
          <Empty icon={Headset} title="No coach yet." />
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
                      onClick={async () =>
                        (!c.active ||
                          (await ask({ title: `Take ${c.username} off the list of coaches?`, text: "Players can no longer find or book this coach until it is enabled again.", action: "Disable" }))) &&
                        act("c" + c.id, `/coaching/coaches/${encodeURIComponent(c.id)}/${c.active ? "disable" : "enable"}`, c.active ? `${c.username} is no longer listed` : `${c.username} is a coach again`)
                      }
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
