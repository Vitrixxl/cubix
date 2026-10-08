/** One account: its figures, 90 days of activity, puzzles, recent solves, sessions, IPs, duels and requests, and the
 * two actions an administrator has on it (sign out everywhere, delete). */
import { useState } from "react";
import { Globe, Headset, Laptop, ListX, LogOut, Swords, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { admin, AdminError, listUrl, navigate, useAdmin, type UserDetail } from "./api";
import { DailyChart } from "./charts";
import {
  ago,
  date,
  event,
  Failure,
  FiguresSkeleton,
  GuestTag,
  Avatar,
  IpLink,
  Kind,
  Kpi,
  NUMERIC,
  num,
  TableSkeleton,
  SectionHead,
  Status,
  useNow,
  UserLink,
  VIEW,
  when,
} from "./parts";
import { Back, Empty, PageHead, Strip } from "../base";
import { ask } from "../confirm";
import { fmtTime } from "../../../src/client/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function User({ id, phone }: { id: string; phone: boolean }) {
  const detail = useAdmin<UserDetail>("/users/" + encodeURIComponent(id));
  const now = useNow();
  const d = detail.data;
  const back = <Back onClick={() => navigate(listUrl.users)} label="All users" action="user:back" />;
  if (detail.error && !d)
    return (
      <div className={VIEW}>
        <PageHead title="Account" lead={back} />
        <Failure error={detail.error} retry={detail.reload} />
      </div>
    );
  if (!d) return <UserSkeleton back={back} phone={phone} />;
  const u = d.user;
  const activeDays = d.activity.filter((a) => a.active || a.solves).length;
  return (
    <div className={VIEW} data-slot="user-detail">
      <PageHead
        lead={
          <>
            {back}
            <Avatar name={u.username} size={40} />
          </>
        }
        title={
          <span className="flex items-center gap-2">
            {u.username}
            {u.isGuest && <GuestTag />}
          </span>
        }
        sub={
          <>
            Created {date(u.createdAt)} · seen {ago(u.lastSeenAt, now)} · <span className={NUMERIC}>{u.id}</span>
          </>
        }
      >
        <CoachToggle id={u.id} coach={u.coach} onDone={detail.reload} />
        <Revoke id={u.id} sessions={u.activeSessions} onDone={detail.reload} />
        <Delete id={u.id} username={u.username} />
      </PageHead>
      <Strip label="Key figures" className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Solves" value={num(u.solves)} sub={`${num(u.solves7d)} in 7 d`} />
        <Kpi label="Practice sessions" value={num(u.practiceSessions)} sub={`last solve ${ago(u.lastSolveAt, now)}`} />
        <Kpi label="Learned cases" value={num(u.learnedCases)} />
        <Kpi label="Duels" value={num(d.duels.played)} sub={`${num(d.duels.won)} won · ${num(d.duels.lost)} lost · ${num(d.duels.drawn)} drawn`} />
        <Kpi label="Signed-in devices" value={num(u.activeSessions)} />
        <Kpi label="Active days · 90 d" value={num(activeDays)} />
      </Strip>
      <section aria-label="Activity" className="grid gap-6 lg:grid-cols-2">
        <DailyChart title="Solves · 90 d" data={d.activity} series={[{ key: "solves", label: "Solves", color: "var(--chart-1)" }]} height="h-32" />
        <DailyChart title="Requests · 90 d" data={d.activity} series={[{ key: "requests", label: "Requests", color: "var(--chart-1)" }]} height="h-32" />
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col" aria-label="Puzzles">
          <SectionHead rule title="Puzzles" meta={d.puzzles.length || undefined} />
          {!d.puzzles.length ? (
            <Empty icon={Timer} title="No solve yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Solves</TableHead>
                  <TableHead className="text-right">DNF</TableHead>
                  <TableHead className="text-right max-sm:hidden">Training</TableHead>
                  <TableHead className="text-right">Best</TableHead>
                  <TableHead className="text-right">Mean</TableHead>
                  <TableHead className="text-right max-sm:hidden">Last</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.puzzles.map((p) => (
                  <TableRow key={p.puzzleId + p.solveMode}>
                    <TableCell className="font-medium">{event(p.puzzleId, p.solveMode)}</TableCell>
                    <TableCell className={cn(NUMERIC, "text-right")}>{num(p.solves)}</TableCell>
                    <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{num(p.dnf)}</TableCell>
                    <TableCell className={cn(NUMERIC, "text-right text-muted-foreground max-sm:hidden")}>{num(p.trainingSolves)}</TableCell>
                    <TableCell className={cn(NUMERIC, "text-right")}>{fmtTime(p.bestMs)}</TableCell>
                    <TableCell className={cn(NUMERIC, "text-right")}>{fmtTime(p.meanMs == null ? null : Math.round(p.meanMs))}</TableCell>
                    <TableCell className="text-right text-muted-foreground max-sm:hidden">{ago(p.lastAt, now)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
        <section className="flex min-w-0 flex-col" aria-label="Recent solves">
          <SectionHead rule title="Recent solves" meta={d.recentSolves.length || undefined} />
          {!d.recentSolves.length ? (
            <Empty icon={Timer} title="No solve yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="max-sm:hidden">Scramble</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.recentSolves.slice(0, 10).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{when(s.at)}</TableCell>
                    <TableCell>{event(s.puzzleId, s.solveMode)}</TableCell>
                    <TableCell className="text-muted-foreground max-sm:hidden">{s.caseId ?? s.scrambleType}</TableCell>
                    <TableCell className={cn(NUMERIC, "text-right")}>
                      {s.penalty === "dnf" ? (
                        <span className="text-muted-foreground">DNF</span>
                      ) : (
                        <>
                          {fmtTime(s.effectiveMs)}
                          {s.penalty === "+2" && <span className="ml-1 text-xs text-muted-foreground">+2</span>}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="flex min-w-0 flex-col" aria-label="Signed-in devices">
          <SectionHead rule title="Signed-in devices" meta={d.sessions.length || undefined} />
          {!d.sessions.length ? (
            <Empty icon={Laptop} title="Signed out everywhere." />
          ) : (
            <ul className="flex flex-col">
              {d.sessions.map((s) => (
                <li key={s.id} className="flex h-11 items-center gap-3 border-b text-sm last:border-0">
                  <span className={cn(NUMERIC, "w-24 shrink-0 text-xs text-muted-foreground")}>{s.id}</span>
                  <span className="min-w-0 flex-1 truncate">used {ago(s.lastUsedAt ?? s.createdAt, now)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">until {date(s.expiresAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex min-w-0 flex-col" aria-label="IP addresses">
          <SectionHead rule title="IP addresses" meta={d.ips.length || undefined} />
          {!d.ips.length ? (
            <Empty icon={Globe} title="No address recorded." />
          ) : (
            <ul className="flex flex-col">
              {d.ips.map((ip) => (
                <li key={ip.ip} className="flex h-11 items-center gap-3 border-b text-sm last:border-0">
                  <IpLink ip={ip.ip} className="min-w-0 flex-1" />
                  <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>
                    {num(ip.days)} d · last {ip.lastDay.slice(5)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex min-w-0 flex-col" aria-label="Duels">
          <SectionHead rule title="Duels" meta={d.duels.played || undefined} />
          {!d.duels.recent.length ? (
            <Empty icon={Swords} title="No duel yet." />
          ) : (
            <ul className="flex flex-col">
              {d.duels.recent.map((duel) => (
                <li key={duel.id} className="flex h-11 items-center gap-3 border-b text-sm last:border-0">
                  <span className={cn("w-10 shrink-0 text-xs font-medium", duel.result === "win" ? "text-success" : duel.result === "loss" ? "text-destructive" : "text-muted-foreground")}>
                    {duel.result}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    vs <UserLink id={duel.opponentId} name={duel.opponent} />
                  </span>
                  <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>
                    {fmtTime(duel.ao5)} / {fmtTime(duel.opponentAo5)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="flex min-w-0 flex-col" aria-label="Recent requests">
        <SectionHead rule title="Recent requests" meta={d.recentRequests.length || undefined}>
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/requests?user=${encodeURIComponent(u.id)}`)} data-action="user:requests">
            All requests
          </Button>
        </SectionHead>
        {!d.recentRequests.length ? (
          <Empty icon={ListX} title="No request logged." />
        ) : (
          <Table>
            <TableBody>
              {d.recentRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={cn(NUMERIC, "w-36 text-xs text-muted-foreground")}>{when(r.at, true)}</TableCell>
                  <TableCell className="w-14">
                    <Status status={r.status} />
                  </TableCell>
                  <TableCell className="max-w-0 truncate">
                    <span className={cn(NUMERIC, "mr-2 text-xs text-muted-foreground")}>{r.method}</span>
                    <span className={NUMERIC}>{r.path}</span>
                  </TableCell>
                  <TableCell className="w-28 max-sm:hidden">
                    <Kind kind={r.kind} important={r.important} />
                  </TableCell>
                  <TableCell className="w-36 text-right max-sm:hidden">
                    <IpLink ip={r.ip} className="text-muted-foreground" />
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

/** Makes the account a coach without an application, or takes it off the list of coaches. */
function CoachToggle({ id, coach, onDone }: { id: string; coach: "active" | "disabled" | null; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const active = coach === "active";
  return (
    <Button
      variant="outline"
      disabled={pending}
      data-action={active ? "user:coach:off" : "user:coach:on"}
      onClick={async () => {
        if (active && !(await ask({ title: "Remove this coach?", text: "The account leaves the list of coaches; players can no longer book it. Make it a coach again at any time.", action: "Remove coach" })))
          return;
        setPending(true);
        try {
          await admin(`/coaching/coaches/${encodeURIComponent(id)}/${active ? "disable" : "enable"}`, { method: "POST" });
          toast.success(active ? "No longer a coach" : "Now a coach");
          onDone();
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <Headset />
      {active ? "Remove coach" : "Make coach"}
    </Button>
  );
}

function Revoke({ id, sessions, onDone }: { id: string; sessions: number; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      data-action="user:revoke"
      disabled={!sessions || pending}
      onClick={async () => {
        const yes = await ask({
          title: "Sign this account out everywhere?",
          text: `Its ${num(sessions)} signed-in ${sessions === 1 ? "device" : "devices"} will have to sign in again. Times already on those devices stay there and sync after signing in.`,
          action: "Sign out everywhere",
        });
        if (!yes) return;
        setPending(true);
        try {
          const result = await admin<{ revoked: number }>(`/users/${encodeURIComponent(id)}/revoke`, { method: "POST" });
          toast.success(`Signed out of ${num(result.revoked)} ${result.revoked === 1 ? "device" : "devices"}`);
          onDone();
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <LogOut />
      {pending ? "Signing out…" : "Sign out everywhere"}
    </Button>
  );
}

/** Deleting asks for the username, typed: the account and everything it owns go at once. */
function Delete({ id, username }: { id: string; username: string }) {
  const [typed, setTyped] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <AlertDialog
      onOpenChange={(open: boolean) => {
        if (!open) {
          setTyped("");
          setError("");
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" className="hover:text-destructive" data-action="user:delete" />}>
        <Trash2 />
        Delete account
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {username}?</AlertDialogTitle>
          <AlertDialogDescription>
            The account, its solves, sessions, learned cases and sign-ins are deleted for good. Finished duels stay for the opponents under “deleted”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="delete-confirm">
            Type <span className={cn(NUMERIC, "font-semibold")}>{username}</span> to confirm
          </FieldLabel>
          <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-action="user:delete:confirm" />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={typed !== username || pending}
            data-action="user:delete:submit"
            onClick={async (e: React.MouseEvent) => {
              e.preventDefault();
              setPending(true);
              try {
                const result = await admin<{ username: string; solves: number; sessions: number }>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
                toast.success(`Deleted ${result.username}`, { description: `${num(result.solves)} solves and ${num(result.sessions)} practice sessions removed.` });
                navigate("/admin/users", true);
              } catch (reason) {
                setError(reason instanceof AdminError ? reason.message : String(reason));
                setPending(false);
              }
            }}
          >
            {pending ? "Deleting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UserSkeleton({ back, phone }: { back: React.ReactNode; phone: boolean }) {
  return (
    <div className={VIEW} aria-busy="true" aria-label="Loading">
      <PageHead
        lead={
          <>
            {back}
            <Skeleton className="size-10 rounded-full" />
          </>
        }
        title={<Skeleton className="h-6 w-40" />}
      />
      <Strip>
        <FiguresSkeleton count={phone ? 4 : 6} className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" />
      </Strip>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-36" />
        {!phone && <Skeleton className="h-36" />}
      </div>
      <TableSkeleton cols={phone ? 2 : 6} rows={6} />
    </div>
  );
}
