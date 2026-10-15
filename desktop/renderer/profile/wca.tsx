/**
 * The player's WCA ID and official results (src/client/lib/wca.ts): a button beside the name opens them, the Qbix
 * bests beside each event; their competitions coming up are behind a button, in a drawer. A WCA ID not given yet is
 * typed there, the person found shown before it is saved with their setup.
 */
import React, { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { store as s } from "../store";
import { call } from "../bridge";
import { tr } from "../../../src/client/i18n";
import { fmtTime, plural, shortDate } from "../../../src/client/lib/format";
import { PROFILE_KEY, journeyProfile, type JourneyProfile } from "../../../src/client/lib/journey";
import { wcaIdOf, wcaPersonUrl, wcaRanks, wcaResult, wcaRows, type WcaCompetitions, type WcaPerson, type WcaRecord } from "../../../src/client/lib/wca";
import { Empty, Modal, NUMERIC, ROW, Tip, said } from "../ui";
import { useProfileData } from "./data";
import { Button as UiButton, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A link to the WCA's page, drawn as the app's buttons are. */
export function WcaLink({ id, className }: { id: string; className?: string }) {
  return (
    <a href={wcaPersonUrl(id)} target="_blank" rel="noreferrer" data-action="wca:page" aria-label={tr("Open on the WCA")} className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground", className)}>
      WCA <ExternalLink />
    </a>
  );
}

/** The button beside the name, and what it opens. */
export function WcaButton() {
  const [open, setOpen] = useState(false),
    profile = journeyProfile(s.journey);
  if (!profile) return null;
  return (
    <>
      <Tip content="World Cube Association">
        <UiButton variant="ghost" size="sm" data-action="wca:open" aria-label={profile.wcaId ? `WCA ${profile.wcaId}` : tr("WCA ID")} onClick={() => setOpen(true)} className="ml-auto shrink-0 bg-muted text-muted-foreground hover:bg-accent hover:text-foreground">
          WCA
        </UiButton>
      </Tip>
      <Modal open={open} onOpenChange={setOpen} title="WCA" className="flex max-h-[min(86vh,720px)] flex-col sm:max-w-2xl">
        {open && <WcaBody key={profile.wcaId ?? ""} profile={profile} />}
      </Modal>
    </>
  );
}

function WcaBody({ profile }: { profile: JourneyProfile }) {
  const [editing, setEditing] = useState(!profile.wcaId);
  return editing || !profile.wcaId ? <LinkForm profile={profile} /> : <Results id={profile.wcaId} onEdit={() => setEditing(true)} />;
}

/** The WCA ID typed, the person it names found, then saved; or removed. */
function LinkForm({ profile }: { profile: JourneyProfile }) {
  const [text, setText] = useState(profile.wcaId ?? ""),
    [found, setFound] = useState<WcaPerson | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    id = wcaIdOf(text);
  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      setFound(await call("wcaPerson", id));
    } catch (reason) {
      setError(said((reason as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function save(wcaId?: string) {
    const { wcaId: _, ...rest } = profile;
    try {
      await s.updateJourney({ [PROFILE_KEY]: wcaId ? { ...rest, wcaId } : rest });
    } catch (reason) {
      toast.error(said((reason as Error).message));
    }
  }
  return (
    <form onSubmit={(e) => void find(e)} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => (setText(e.target.value), setFound(null), setError(""))} placeholder="2009ZEMD01" autoFocus spellCheck={false}
          aria-label={tr("WCA ID")} aria-invalid={!!text.trim() && !id} className="uppercase" />
        <UiButton type="submit" variant="outline" disabled={!id || busy} data-action="wca:find">{tr("Find")}</UiButton>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {found && (
        <div className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{found.name}</p>
            <p className="truncate text-sm text-muted-foreground">{[found.countryName, plural(found.competitions, "competition")].join(" · ")}</p>
          </div>
          <UiButton type="button" data-action="wca:link" onClick={() => void save(found.id)}>{tr("Link")}</UiButton>
        </div>
      )}
      {profile.wcaId && (
        <UiButton type="button" variant="ghost" className="self-start text-muted-foreground" onClick={() => void save()}>{tr("Remove")}</UiButton>
      )}
    </form>
  );
}

/** A WCA result with its ranks under it. */
function Official({ event, kind, r }: { event: string; kind: "single" | "average"; r?: WcaRecord }) {
  if (!r) return <span className="text-muted-foreground">–</span>;
  return (
    <div className="flex flex-col">
      <span className={cn(NUMERIC, "font-bold")}>{wcaResult(event, kind, r.best)}</span>
      <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{wcaRanks(r)}</span>
    </div>
  );
}

/** Who the WCA ID is, their records per event against the Qbix ones, and the way to their competitions. */
function Results({ id, onEdit }: { id: string; onEdit: () => void }) {
  const d = useProfileData(),
    [person, setPerson] = useState<WcaPerson | null>(null),
    [failed, setFailed] = useState(false),
    [competitions, setCompetitions] = useState(false);
  useEffect(() => {
    let live = true;
    call("wcaPerson", id).then((p: WcaPerson) => live && setPerson(p), () => live && setFailed(true));
    return () => void (live = false);
  }, [id]);
  const head = (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-extrabold">{person?.name ?? id}</p>
        {person && <p className="truncate text-sm text-muted-foreground">{[id, person.countryName, plural(person.competitions, "competition")].join(" · ")}</p>}
      </div>
      <WcaLink id={id} />
      <Tip content={tr("Change")}>
        <UiButton variant="ghost" size="icon" aria-label={tr("Change")} data-action="wca:edit" onClick={onEdit}><Pencil /></UiButton>
      </Tip>
    </div>
  );
  if (failed) return <>{head}<p className="text-sm text-muted-foreground">{tr("WCA unavailable")}</p></>;
  if (!person) return <>{head}<Skeleton className="h-64" /></>;
  const rows = wcaRows(person, d.records);
  return (
    <>
      {head}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <Table aria-label={tr("Official results")}>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("Event")}</TableHead>
              <TableHead>{tr("Single")}</TableHead>
              <TableHead>{tr("Average")}</TableHead>
              <TableHead className="text-right">Qbix</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.event}>
                <TableCell className="font-semibold">{said(row.label)}</TableCell>
                <TableCell><Official event={row.event} kind="single" r={row.single} /></TableCell>
                <TableCell><Official event={row.event} kind="average" r={row.average} /></TableCell>
                <TableCell className={cn(NUMERIC, "text-right")}>
                  <div className="flex flex-col">
                    <span className="font-bold">{fmtTime(row.qbixSingle)}</span>
                    {row.qbixAverage != null && <span className="text-xs text-muted-foreground">{tr("Ao5 {0}", { 0: fmtTime(row.qbixAverage) })}</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <UiButton variant="outline" className="self-start" data-action="wca:competitions" onClick={() => setCompetitions(true)}>
        <CalendarDays />
        {tr("Competitions")}
      </UiButton>
      <Sheet open={competitions} onOpenChange={setCompetitions}>
        <SheetContent side="right" className="w-96 gap-3 p-5">
          <SheetTitle className="text-lg font-extrabold">{tr("Competitions")}</SheetTitle>
          {competitions && <Upcoming id={id} country={person.countryName} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Their competitions coming up, or their country's, each opening its WCA page. */
function Upcoming({ id, country }: { id: string; country: string }) {
  const [list, setList] = useState<WcaCompetitions | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    call("wcaCompetitions", id).then((v: WcaCompetitions) => live && setList(v), () => live && setFailed(true));
    return () => void (live = false);
  }, [id]);
  if (failed) return <p className="text-sm text-muted-foreground">{tr("WCA unavailable")}</p>;
  if (!list) return <Skeleton className="h-16" />;
  if (!list.competitions.length) return <Empty icon={CalendarDays} title={tr("Nothing coming up")} />;
  const day = (iso: string) => shortDate(iso + "T12:00:00");
  return (
    <div className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
      <p className="px-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{list.mine ? tr("Registered") : country}</p>
      {list.competitions.map((c) => (
        <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className={cn(ROW, "flex flex-col px-2 py-2")}>
          <span className="truncate font-bold">{c.name}</span>
          <span className="truncate text-sm text-muted-foreground">{[c.start_date === c.end_date ? day(c.start_date) : `${day(c.start_date)} – ${day(c.end_date)}`, c.city].filter(Boolean).join(" · ")}</span>
        </a>
      ))}
    </div>
  );
}
