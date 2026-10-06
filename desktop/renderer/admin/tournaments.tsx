/**
 * Tournaments open to every player: the administration creates them (an event, a date, how a match is won), starts
 * them early or calls them off, and follows their bracket, where it gives a match to a player whose opponent never
 * came. Players register for them on the app's Tournaments page.
 */
import { useState } from "react";
import { ChevronLeft, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { admin, navigate, useAdmin } from "./api";
import { Failure, NUMERIC, Nothing, RowsSkeleton, ViewHead, num, when } from "./parts";
import { Icon } from "../base";
import { eventInfo } from "../../../src/shared/puzzles";
import { Bracket, roundName } from "../tournaments/bracket";
import { FormatFields, STATUS_TEXT, formatText, localInput } from "../tournaments/format";
import type { Tournament, TournamentDetail } from "../community/client";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";


async function act(path: string, method: string, done: string, body?: unknown) {
  try {
    const value = await admin(path, { method, body });
    toast.success(done);
    return value;
  } catch (e) {
    toast.error((e as Error).message);
    return null;
  }
}

export function Tournaments({ id }: { id?: string }) {
  return id ? <Detail id={Number(id)} /> : <List />;
}

function List() {
  const data = useAdmin<Tournament[]>("/tournaments");
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <ViewHead title="Tournaments" sub="Open to every player">
        <Button onClick={() => setCreating(!creating)} variant={creating ? "outline" : "default"} data-action="tournaments:new">
          {creating ? <X /> : <Plus />}
          {creating ? "Close" : "New tournament"}
        </Button>
      </ViewHead>
      {creating && (
        <Create
          onCreated={() => {
            setCreating(false);
            data.reload();
          }}
        />
      )}
      {data.error && !data.data ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <RowsSkeleton cols={6} rows={4} />
      ) : !data.data.length ? (
        <Nothing>No tournament yet.</Nothing>
      ) : (
        <Table data-slot="tournaments">
          <TableHeader>
            <TableRow>
              <TableHead>Tournament</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Format</TableHead>
              <TableHead className="text-right">Players</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((t) => (
              <TableRow key={t.id} data-tournament={t.id}>
                <TableCell>
                  <a href={`/admin/tournaments/${t.id}`} onClick={(e) => (e.preventDefault(), navigate(`/admin/tournaments/${t.id}`))} className="font-medium hover:underline">
                    {t.name}
                  </a>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Icon name={"Puzzle" + t.event} size={16} />
                    {eventInfo(t.event)?.label ?? t.event}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{when(t.startsAt)}</TableCell>
                <TableCell className="text-muted-foreground">{formatText(t)}</TableCell>
                <TableCell className={cn(NUMERIC, "text-right")}>
                  {num(t.players)}
                  {t.maxPlayers ? ` / ${t.maxPlayers}` : ""}
                </TableCell>
                <TableCell>
                  <Badge variant={t.status === "running" ? "default" : "secondary"}>{t.status === "running" ? roundName(t.round, t.rounds) : STATUS_TEXT[t.status]}</Badge>
                </TableCell>
                <TableCell>
                  <Actions t={t} reload={data.reload} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Actions({ t, reload }: { t: Tournament; reload: () => void }) {
  return (
    <span className="flex justify-end gap-1">
      {t.status === "open" && (
        <Button size="sm" variant="outline" onClick={async () => (await act(`/tournaments/${t.id}/start`, "POST", "Started")) && reload()}>
          <Play />
          Start now
        </Button>
      )}
      {(t.status === "open" || t.status === "running") && (
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={async () => (await act(`/tournaments/${t.id}/cancel`, "POST", "Cancelled")) && reload()}>
          Cancel
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Delete" className="text-muted-foreground hover:text-destructive" />}>
          <Trash2 />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {t.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its registrations, bracket and results go with it. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => (await act(`/tournaments/${t.id}`, "DELETE", "Deleted")) && afterDelete(t, reload)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
/** Back to the list once the tournament on screen is gone. */
const afterDelete = (t: Tournament, reload: () => void) => (location.pathname.endsWith("/" + t.id) ? navigate("/admin/tournaments") : reload());

function Create({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", event: "333", startsAt: localInput(Date.now() + 2 * 86_400_000), points: 3, sets: 2, maxPlayers: "" });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-6"
          data-slot="new-tournament"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const done = await act("/tournaments", "POST", "Tournament created", {
              name: form.name.trim(),
              description: form.description.trim(),
              event: form.event,
              startsAt: new Date(form.startsAt).getTime(),
              points: form.points,
              sets: form.sets,
              maxPlayers: form.maxPlayers ? Number(form.maxPlayers) : null,
            });
            setBusy(false);
            if (done) onCreated();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="t-name">Name</FieldLabel>
              <Input id="t-name" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} autoFocus />
            </Field>
            <FormatFields value={form} onChange={({ event, points, sets }) => set({ event, points, sets })} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="t-start">Starts</FieldLabel>
                <Input id="t-start" type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
                <FieldDescription>Registration closes then and the bracket is drawn.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="t-cap">Most players</FieldLabel>
                <Input id="t-cap" type="number" min={2} max={256} placeholder="No limit" value={form.maxPlayers} onChange={(e) => set({ maxPlayers: e.target.value })} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="t-description">Description</FieldLabel>
              <Textarea id="t-description" value={form.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} className="min-h-16" />
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || form.name.trim().length < 2 || !form.startsAt}>
              Create the tournament
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Detail({ id }: { id: number }) {
  const data = useAdmin<TournamentDetail>(`/tournaments/${id}`);
  const t = data.data;
  return (
    <div className="flex flex-col gap-6">
      <ViewHead
        title={t?.name ?? "Tournament"}
        sub={t ? `${eventInfo(t.event)?.label ?? t.event} · ${formatText(t)} · ${when(t.startsAt)}` : undefined}
        lead={
          <Button variant="outline" size="icon" aria-label="Back" className="size-8" onClick={() => navigate("/admin/tournaments")}>
            <ChevronLeft />
          </Button>
        }
      >
        {t && <Actions t={t} reload={data.reload} />}
      </ViewHead>
      {data.error && !t ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !t ? (
        <RowsSkeleton cols={4} rows={6} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {STATUS_TEXT[t.status]} · {num(t.entrants.length)} players{t.winner ? ` · won by ${t.winner.username}` : ""}
            {t.status === "open" && t.entrants.length ? `: ${t.entrants.map((p) => p.username).join(", ")}` : ""}
          </p>
          {t.matches.length > 0 && (
            <div className="flex h-[70vh] flex-col rounded-xl border p-4">
              <Bracket tournament={t} onAward={async (m, p) => (await act(`/matches/${m.id}/award`, "POST", `Given to ${p.username}`, { winner: p.id })) && data.reload()} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
