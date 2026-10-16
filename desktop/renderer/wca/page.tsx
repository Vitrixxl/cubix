/**
 * The WCA's official results (src/client/lib/wca.ts), open to anyone: the rankings of an event in a region, the
 * records, the competitions and the people, each a tab with its filters on one bar and its list scrolling in its pane;
 * a person's page (their records against the Qbix ones when it is the player, their results by competition) and a
 * competition's (where and when, its results by event and round) have their own address.
 */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Globe, Link2, MapPin, Medal, Search, Trophy, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";
import { store as s } from "../store";
import { call } from "../bridge";
import { go } from "../navigation";
import { Empty, Icon, NUMERIC, PAGE, PageHead, ROW, SearchField, Segmented, SelectMenu, Surface, Tip, usePhone } from "../ui";
import { PanelHead } from "../tournaments/format";
import { linkWca } from "../profile/wca";
import { tr } from "../../../src/client/i18n";
import { Back, said } from "../base";
import { fmtResult, fmtTime, plural } from "../../../src/client/lib/format";
import { eventInfo } from "../../../src/shared/puzzles";
import { journeyProfile } from "../../../src/client/lib/journey";
import {
  CONTINENTS, WCA_EVENTS, WCA_TABS, competitionsPath, countriesByName, countryName, flagOf, historyOf, monthLabel, rankingPath, readWcaView, recordReach, regionLabel, wcaAttempts, wcaDates, wcaEventLabel,
  wcaFormat, wcaMonths, wcaPersonUrl, wcaResult, wcaRound, wcaRows, wcaUrl,
  type CompetitionFilter, type WcaCompetition, type WcaCompetitionInfo, type WcaCompetitionList, type WcaCountry, type WcaHistory, type WcaPerson, type WcaRanking, type WcaRecord,
  type WcaRecordRow, type WcaResult, type WcaRound, type WcaTab, type WcaWho,
} from "../../../src/client/lib/wca";
import type { EventRecordDto } from "../../../src/shared/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton, buttonVariants } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** What the API answered, by path, for the next time a page shows it (going back to a list, to a person). */
const answers = new Map<string, unknown>();
/** The WCA's answer to `path` (none for null), or why there is none. */
function useWca<T>(path: string | null): { data?: T; error?: string } {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: string }>({ path, data: path ? (answers.get(path) as T) : undefined });
  useEffect(() => {
    if (!path) return;
    if (answers.has(path)) return setState({ path, data: answers.get(path) as T });
    let live = true;
    setState({ path });
    call("wca", path).then(
      (data: T) => {
        if (answers.size > 300) answers.clear();
        answers.set(path, data);
        if (live) setState({ path, data });
      },
      (reason: Error) => live && setState({ path, error: said(reason.message) }),
    );
    return () => void (live = false);
  }, [path]);
  return state.path === path ? state : { data: path ? (answers.get(path) as T) : undefined };
}
const useCountries = () => useWca<WcaCountry[]>("countries").data;
const ownId = () => journeyProfile(s.journey)?.wcaId;
const personUrl = (id: string) => wcaUrl("persons/" + id);
/** Back where the player came from in the app, else to `to` (an address opened from outside). */
const back = (to: string) => ((window.history.state?.idx ?? 0) > 0 ? go(-1) : go(to));

/** The filters of each tab, kept while the page is left for a person or a competition. */
const kept = {
  ranking: { event: "333", kind: "single", region: "world", page: 1, person: "", q: "" },
  records: "world",
  competitions: { status: "upcoming", country: "", month: "", q: "", page: 1 } as CompetitionFilter & { page: number },
  people: "",
};
function useKept<K extends keyof typeof kept>(key: K) {
  const [value, set] = useState(kept[key]);
  return [value, (next: (typeof kept)[K]) => set((kept[key] = next))] as const;
}

export function WcaPage() {
  const { tab, id } = readWcaView(s.view);
  if (tab === "persons" && id) return <PersonPage key={id} id={id.toUpperCase()} />;
  if (tab === "competitions" && id) return <CompetitionPage key={id} id={id} />;
  return <Browse tab={tab} />;
}

/** The tabs and the current tab's filters on one bar, its list in a pane under them. */
function Frame({ tab, tools, children }: { tab: WcaTab; tools?: React.ReactNode; children: React.ReactNode }) {
  const phone = usePhone();
  return (
    <div className={cn(PAGE, "wca")}>
      {phone && <PageHead title="WCA" />}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Segmented label="WCA" value={tab} options={[...WCA_TABS]} onChange={(next) => go(wcaUrl(next), true)} action="wca:tab:" />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{tools}</div>
      </div>
      <Surface className="min-h-0 flex-1 gap-2 p-3">{children}</Surface>
    </div>
  );
}

function Browse({ tab }: { tab: WcaTab }) {
  if (tab === "records") return <Records />;
  if (tab === "competitions") return <Competitions />;
  if (tab === "persons") return <People />;
  return <Rankings />;
}

/** Loading, failed or empty: what stands in the pane instead of its list. */
function Missing({ error, rows = 8, empty }: { error?: string; rows?: number; empty?: React.ReactNode }) {
  if (error) return <Empty icon={Globe} title={error} className="flex-1" />;
  if (empty) return <Empty icon={Search} title={empty} className="flex-1" />;
  return (
    <div aria-busy="true" aria-label={tr("Loading")} className="flex flex-col gap-2 p-1">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 rounded-xl" />)}
    </div>
  );
}

/** "3 / 20" between the arrows to the previous and next pages. */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages < 2) return null;
  return (
    <div className="flex shrink-0 items-center justify-end gap-1 border-t pt-2">
      <UiButton variant="ghost" size="icon" aria-label={tr("Previous")} data-action="wca:previous" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></UiButton>
      <span className={cn(NUMERIC, "min-w-14 text-center text-sm text-muted-foreground")}>{page} / {pages}</span>
      <UiButton variant="ghost" size="icon" aria-label={tr("Next")} data-action="wca:next" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></UiButton>
    </div>
  );
}

/** A country's flag and name, or its flag alone. */
function Flag({ iso2, named = false, countries }: { iso2: string; named?: boolean; countries?: WcaCountry[] }) {
  const name = countryName(iso2, countries);
  return named ? (
    <span className="flex min-w-0 items-center gap-1.5"><span aria-hidden="true">{flagOf(iso2)}</span><span className="truncate">{name}</span></span>
  ) : (
    <span role="img" aria-label={name} title={name}>{flagOf(iso2) || iso2}</span>
  );
}

/** The WCA's events as a menu, each with its icon. */
function EventMenu({ value, onChange, events = WCA_EVENTS }: { value: string; onChange: (event: string) => void; events?: string[] }) {
  return (
    <SelectMenu action="wca:event" label="Event" value={value} onChange={onChange} icon={<Icon name={"Puzzle" + value} />} variant="secondary"
      options={events.map((id) => ({ id, label: wcaEventLabel(id), icon: <Icon name={"Puzzle" + id} /> }))} />
  );
}

/**
 * A region (or a country) picked in a searchable list: the world and the continents first, unless `anywhere` replaces
 * them. `compact`, the flag (or the globe) alone on the button, its name in the tooltip.
 */
function RegionPicker({ value, onChange, anywhere, compact = false }: { value: string; onChange: (region: string) => void; anywhere?: string; compact?: boolean }) {
  const countries = useCountries(),
    [open, setOpen] = useState(false),
    pick = (region: string) => (setOpen(false), onChange(region)),
    label = value ? regionLabel(value, countries) : anywhere!;
  const item = (id: string, name: string, prefix?: React.ReactNode) => (
    <CommandItem key={id || "any"} value={`${name} ${id}`} onSelect={() => pick(id)} data-checked={id === value ? "true" : undefined}>
      {prefix}
      {said(name)}
    </CommandItem>
  );
  const trigger = (
    <PopoverTrigger render={<UiButton variant="secondary" size={compact ? "icon" : "default"} data-action="wca:region" aria-label={compact ? `${tr("Region")} · ${said(label)}` : tr("Region")} className="max-w-56" />}>
      {value.length === 2 ? <span aria-hidden="true">{flagOf(value)}</span> : <Globe />}
      {!compact && <span className="truncate">{said(label)}</span>}
    </PopoverTrigger>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {compact ? <Tip content={said(label)}>{trigger}</Tip> : trigger}
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={tr("Region")} />
          <CommandList>
            <CommandGroup>{anywhere ? item("", anywhere, <Globe />) : [item("world", "World", <Globe />), ...CONTINENTS.map((c) => item(c.id, c.label, <Globe />))]}</CommandGroup>
            <CommandGroup>{countriesByName(countries ?? []).map((c) => item(c.iso2, c.name, <span aria-hidden="true">{flagOf(c.iso2)}</span>))}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A person on a row: their flag and name, opening their page. */
function PersonLink({ who, className }: { who: WcaWho; className?: string }) {
  return (
    <button type="button" onClick={() => go(personUrl(who.id))} className={cn("flex min-w-0 items-center gap-2 rounded-md text-left hover:text-primary", className)}>
      <Flag iso2={who.country} />
      <span className="truncate font-semibold">{who.name}</span>
    </button>
  );
}

const LIST = "-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1";
const ROW_GRID = "grid items-center gap-3 rounded-xl px-3 py-2";

function Rankings() {
  const [f, set] = useKept("ranking"),
    update = (patch: Partial<typeof f>) => set({ ...f, page: 1, person: "", q: "", ...patch }),
    mine = ownId(),
    average = f.kind === "average" && f.event !== "333mbf",
    kind = average ? "average" : "single",
    { data, error } = useWca<WcaRanking>(rankingPath(f.event, kind, { region: f.region, page: f.q ? undefined : f.page, person: f.person, q: f.q }));
  // A person outside the ranking: said, and the ranking left as it was.
  useEffect(() => {
    if (error && f.person) {
      toast(error);
      set({ ...f, person: "" });
    }
  }, [error]);
  // The person found, in sight.
  useEffect(() => {
    if (f.person && data) document.querySelector('.wca [role="listitem"][aria-current]')?.scrollIntoView({ block: "center" });
  }, [data, f.person]);
  return (
    <Frame
      tab="rankings"
      tools={
        <>
          <EventMenu value={f.event} onChange={(event) => update({ event })} />
          {f.event !== "333mbf" && <Segmented label="Result" value={kind} options={[{ id: "single", label: "Single" }, { id: "average", label: "Average" }]} onChange={(next) => update({ kind: next })} action="wca:kind:" />}
          <RegionPicker value={f.region} onChange={(region) => update({ region })} />
          <SearchField value={f.q} onChange={(q) => update({ q })} placeholder="Name" label="Find a name in the ranking" delay={400} action="wca:find" className="w-44" />
          {mine && (
            <Tip content={tr("Find me in the ranking")}>
              <UiButton variant="secondary" size="icon" aria-label={tr("Find me in the ranking")} data-action="wca:me" onClick={() => update({ person: mine })}><UserRound /></UiButton>
            </Tip>
          )}
        </>
      }
    >
      {!data?.rows.length ? (
        <Missing error={error && !f.person ? error : undefined} empty={data && tr("Nobody here")} />
      ) : (
        <>
          <div className={LIST} role="list" aria-label={tr("Rankings")}>
            {data.rows.map((row) => (
              <div key={row.id} role="listitem" aria-current={row.id === (f.person || mine) ? "true" : undefined}
                className={cn(ROW_GRID, "grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,12rem)_6rem] hover:bg-muted aria-[current]:bg-primary/12")}>
                <span className={cn(NUMERIC, "font-bold text-muted-foreground")}>{row.rank}</span>
                <PersonLink who={row} />
                <span className="truncate text-sm text-muted-foreground">{countryName(row.country)}</span>
                <span className={cn(NUMERIC, "text-right font-bold")}>{wcaResult(f.event, kind, row.best)}</span>
              </div>
            ))}
          </div>
          {!f.q && <Pager page={data.page} pages={data.pages} onPage={(page) => set({ ...f, page, person: "" })} />}
        </>
      )}
    </Frame>
  );
}

/** A record's value and who holds it. */
function Held({ event, kind, held }: { event: string; kind: "single" | "average"; held?: WcaRecordRow["single"] }) {
  if (!held) return <span className="text-muted-foreground">–</span>;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={cn(NUMERIC, "text-lg font-extrabold")}>{wcaResult(event, kind, held.best)}</span>
      {held.holders.map((who) => <PersonLink key={who.id} who={who} className="text-sm" />)}
    </div>
  );
}

function Records() {
  const [region, set] = useKept("records"),
    { data, error } = useWca<WcaRecordRow[]>("records?region=" + region);
  return (
    <Frame tab="records" tools={<RegionPicker value={region} onChange={set} />}>
      {!data?.length ? (
        <Missing error={error} empty={data && tr("Nobody here")} />
      ) : (
        <div className={LIST} role="list" aria-label={tr("Records")}>
          <div className={cn(ROW_GRID, "sticky top-0 z-10 grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)] bg-card py-1.5 text-xs font-bold text-muted-foreground uppercase")}>
            <span>{tr("Event")}</span>
            <span>{tr("Single")}</span>
            <span>{tr("Average")}</span>
          </div>
          {data.map((row) => (
            <div key={row.event} role="listitem" className={cn(ROW_GRID, "grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)] items-start border-b border-edge/50 py-2.5 last:border-0")}>
              <span className="flex items-center gap-2 font-semibold"><Icon name={"Puzzle" + row.event} size={18} />{said(wcaEventLabel(row.event))}</span>
              <Held event={row.event} kind="single" held={row.single} />
              <Held event={row.event} kind="average" held={row.average} />
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

function Competitions() {
  const [f, set] = useKept("competitions"),
    update = (patch: Partial<typeof f>) => set({ ...f, page: 1, ...patch }),
    { data, error } = useWca<WcaCompetitionList>(competitionsPath(f, f.page)),
    months = wcaMonths(f.status === "past"),
    [searching, setSearching] = useState(!!f.q);
  // The filters hold on one line: the region and the month as their mark (the month's value once picked), the name's
  // field opened by its magnifier and closed again when left empty.
  return (
    <Frame
      tab="competitions"
      tools={
        <>
          <Segmented label="When" value={f.status} options={[{ id: "upcoming", label: "Upcoming" }, { id: "past", label: "Past" }]} onChange={(status) => update({ status: status as "upcoming" | "past", month: "" })} action="wca:status:" />
          <RegionPicker value={f.country} onChange={(country) => update({ country })} anywhere="Anywhere" compact />
          <SelectMenu action="wca:month" label="Month" value={f.month} onChange={(month) => update({ month })} variant="secondary" icon={<CalendarDays />} bare={!f.month}
            options={[{ id: "", label: "Any month" }, ...months.map((id) => ({ id, label: monthLabel(id) }))]} />
          {searching || f.q ? (
            <div onBlur={(e) => !(e.target as HTMLInputElement).value && setSearching(false)}>
              <SearchField value={f.q} onChange={(q) => update({ q })} placeholder="Name" label="Find a competition by name" delay={400} action="wca:find" autoFocus={!f.q} className="w-44" />
            </div>
          ) : (
            <Tip content={tr("Find a competition by name")}>
              <UiButton variant="secondary" size="icon" aria-label={tr("Find a competition by name")} data-action="wca:search" onClick={() => setSearching(true)}><Search /></UiButton>
            </Tip>
          )}
        </>
      }
    >
      {!data?.items.length ? (
        <Missing error={error} empty={data && tr("No competition")} />
      ) : (
        <>
          <div className={LIST} role="list" aria-label={tr("Competitions")}>
            {data.items.map((c) => <CompetitionRow key={c.id} c={c} />)}
          </div>
          <Pager page={data.page} pages={data.pages} onPage={(page) => set({ ...f, page })} />
        </>
      )}
    </Frame>
  );
}

function CompetitionRow({ c }: { c: WcaCompetition }) {
  return (
    <button type="button" role="listitem" onClick={() => go(wcaUrl("competitions/" + c.id))} className={cn(ROW, ROW_GRID, "grid-cols-[minmax(0,1fr)_auto]")}>
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-bold", c.cancelled && "text-muted-foreground line-through")}>{c.name}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className={cn(NUMERIC, "shrink-0")}>{wcaDates(c)}</span>·<Flag iso2={c.country} />
          <span className="truncate">{c.city}</span>
          {c.cancelled && <Badge variant="secondary">{tr("Cancelled")}</Badge>}
        </span>
      </span>
      <span className="flex max-w-72 flex-wrap justify-end gap-1 text-muted-foreground">
        {c.events.map((e) => <Icon key={e} name={"Puzzle" + e} size={16} />)}
      </span>
    </button>
  );
}

function People() {
  const [q, set] = useKept("people"),
    mine = ownId(),
    { data, error } = useWca<WcaWho[]>(q.length >= 2 ? "search?q=" + encodeURIComponent(q) : null);
  return (
    <Frame tab="persons" tools={<SearchField value={q} onChange={set} placeholder="Name or WCA ID" delay={350} action="wca:people" autoFocus className="w-64" />}>
      <div className={LIST} role="list" aria-label={tr("People")}>
        {mine && !q && (
          <button type="button" role="listitem" onClick={() => go(personUrl(mine))} className={cn(ROW, ROW_GRID, "grid-cols-[auto_minmax(0,1fr)]")}>
            <UserRound className="size-4 text-primary" />
            <span className="truncate font-bold">{tr("Me")} <span className={cn(NUMERIC, "font-normal text-muted-foreground")}>{mine}</span></span>
          </button>
        )}
        {q.length < 2 ? (
          !mine && <Empty icon={Users} title={tr("Name or WCA ID")} className="flex-1" />
        ) : !data?.length ? (
          <Missing error={error} empty={data && tr("Nobody here")} />
        ) : (
          data.map((who) => (
            <button key={who.id} type="button" role="listitem" onClick={() => go(personUrl(who.id))} className={cn(ROW, ROW_GRID, "grid-cols-[minmax(0,1fr)_minmax(0,12rem)_6.5rem]")}>
              <span className="flex min-w-0 items-center gap-2"><Flag iso2={who.country} /><span className="truncate font-semibold">{who.name}</span></span>
              <span className="truncate text-sm text-muted-foreground">{countryName(who.country)}</span>
              <span className={cn(NUMERIC, "text-right text-sm text-muted-foreground")}>{who.id}</span>
            </button>
          ))
        )}
      </div>
    </Frame>
  );
}

/** A page under the tabs: the way back, its title, its tools. */
function Sub({ title, sub, to, tools, children }: { title: React.ReactNode; sub?: React.ReactNode; to: string; tools?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn(PAGE, "wca")}>
      <PageHead lead={<Back onClick={() => back(to)} action="wca:back" />} title={title} sub={sub}>{tools}</PageHead>
      {children}
    </div>
  );
}

/** An external page of the WCA (or another site), as the app's buttons are drawn. */
function Outside({ href, label, children }: { href: string; label: string; children?: React.ReactNode }) {
  return (
    <Tip content={said(label)}>
      <a href={href} target="_blank" rel="noreferrer" aria-label={said(label)} className={cn(buttonVariants({ variant: "secondary" }), "text-muted-foreground")}>
        {children ?? "WCA"} <ExternalLink />
      </a>
    </Tip>
  );
}

/** A result with its ranks under it. */
function Official({ event, kind, r }: { event: string; kind: "single" | "average"; r?: WcaRecord }) {
  if (!r) return <span className="text-muted-foreground">–</span>;
  return (
    <div className="flex flex-col">
      <span className={cn(NUMERIC, "font-bold")}>{wcaResult(event, kind, r.best)}</span>
      <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
        <Tip content={tr("National rank")}><span>NR {r.country_rank}</span></Tip> · <Tip content={tr("Continental rank")}><span>CR {r.continent_rank}</span></Tip> · <Tip content={tr("World rank")}><span>WR {r.world_rank}</span></Tip>
      </span>
    </div>
  );
}

/** "That's me", for the player's own WCA ID; theirs already, its mark. A guest is asked to sign in first. */
function ThatsMe({ id }: { id: string }) {
  const profile = journeyProfile(s.journey);
  if (profile?.wcaId === id)
    return (
      <UiButton variant="secondary" data-action="wca:unlink" onClick={() => void linkWca()} className="group/me">
        <Link2 className="group-hover/me:hidden" />
        <X className="hidden group-hover/me:block" />
        <span className="group-hover/me:hidden">{tr("You")}</span>
        <span className="hidden group-hover/me:inline">{tr("Unlink")}</span>
      </UiButton>
    );
  return (
    <Tip content={tr("Link this WCA ID to your profile")}>
      <UiButton data-action="wca:link" onClick={() => (s.user.isGuest || !profile ? s.askSignIn() : void linkWca(id))}>
        <UserRound />
        {tr("That's me")}
      </UiButton>
    </Tip>
  );
}

function PersonPage({ id }: { id: string }) {
  const { data: person, error } = useWca<WcaPerson>("persons/" + id),
    { data: history, error: historyError } = useWca<WcaHistory>(`persons/${id}/results`),
    countries = useCountries(),
    own = ownId() === id,
    records = (s.profile?.records ?? []) as EventRecordDto[],
    rows = person ? wcaRows(person, records) : [],
    events = rows.map((r) => r.event),
    [event, setEvent] = useState(""),
    shown = event || events[0] || "333",
    figures = person && [
      [Medal, "Gold", person.medals.gold, "text-warning"],
      [Medal, "Silver", person.medals.silver, "text-muted-foreground"],
      [Medal, "Bronze", person.medals.bronze, "text-primary"],
      [Trophy, "WR", person.recordsSet.world, "text-destructive"],
      [Trophy, "CR", person.recordsSet.continental, "text-warning"],
      [Trophy, "NR", person.recordsSet.national, "text-success"],
    ] as const;
  const gender = person?.gender === "f" ? tr("Woman") : person?.gender === "m" ? tr("Man") : "";
  return (
    <Sub
      title={person?.name ?? id}
      to={wcaUrl("persons")}
      sub={person && [`${flagOf(person.country)} ${countryName(person.country, countries)}`, id, plural(person.competitions, "competition"), gender].filter(Boolean).join(" · ")}
      tools={!error && <><ThatsMe id={id} /><Outside href={wcaPersonUrl(id)} label="Open on the WCA" /></>}
    >
      {error ? (
        <Empty icon={Globe} title={error} className="flex-1" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
          <Surface className="min-h-0 gap-3 p-5">
            <PanelHead title={tr("Records")} />
            {!!figures?.some(([, , n]) => n > 0) && (
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {figures.filter(([, , n]) => n > 0).map(([I, label, n, tone]) => (
                  <Tip key={label} content={said(label)}>
                    <span className={cn(NUMERIC, "flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-sm font-bold")}>
                      <I className={cn("size-3.5", tone)} />
                      {label.length === 2 && <span className="text-xs text-muted-foreground">{label}</span>}
                      {n}
                    </span>
                  </Tip>
                ))}
              </div>
            )}
            {!person ? (
              <Missing />
            ) : (
              <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
                <Table aria-label={tr("Official results")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tr("Event")}</TableHead>
                      <TableHead>{tr("Single")}</TableHead>
                      <TableHead>{tr("Average")}</TableHead>
                      {own && <TableHead className="text-right">Qbix</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.event} aria-selected={row.event === shown} onClick={() => setEvent(row.event)} className="cursor-pointer aria-selected:bg-muted">
                        <TableCell className="font-semibold whitespace-normal"><span className="flex items-center gap-2"><Icon name={"Puzzle" + row.event} />{said(row.label)}</span></TableCell>
                        <TableCell className="whitespace-normal"><Official event={row.event} kind="single" r={row.single} /></TableCell>
                        <TableCell className="whitespace-normal"><Official event={row.event} kind="average" r={row.average} /></TableCell>
                        {own && (
                          <TableCell className={cn(NUMERIC, "text-right")}>
                            <div className="flex flex-col">
                              <span className="font-bold">{fmtResult(row.qbixSingle, eventInfo(row.event)?.solveMode)}</span>
                              {row.qbixAverage != null && <span className="text-xs text-muted-foreground">{tr("Ao5 {0}", { 0: fmtTime(row.qbixAverage) })}</span>}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Surface>
          <Surface className="min-h-0 gap-3 p-5">
            <PanelHead title={tr("Results")}>{events.length > 0 && <EventMenu value={shown} onChange={setEvent} events={events} />}</PanelHead>
            {!history ? <Missing error={historyError} /> : <History history={history} event={shown} />}
          </Surface>
        </div>
      )}
    </Sub>
  );
}

/** A record set in a result, in its colour: the world's, a continent's, a country's. */
function RecordTag({ tag }: { tag?: string }) {
  if (!tag) return null;
  const reach = recordReach(tag);
  return <span className={cn("ml-1 rounded px-1 text-[10px] font-extrabold", reach === "world" ? "bg-destructive/20 text-destructive" : reach === "continental" ? "bg-warning/20 text-warning" : "bg-success/20 text-success")}>{tag}</span>;
}

/** A list of results' columns, its attempts on a line of their own when the pane is narrow: a person's results, a round's. */
type Columns = { grid: string; attempts: string; head: string };
const HISTORY_COLUMNS: Columns = {
  grid: "grid-cols-[minmax(0,6.5rem)_1.75rem_minmax(0,4.75rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,6.5rem)_1.75rem_minmax(0,4.75rem)_minmax(0,4.75rem)_minmax(0,1fr)]",
  attempts: "col-span-full -mt-2.5 text-xs 2xl:col-span-1 2xl:mt-0 2xl:text-sm",
  head: "hidden 2xl:block",
};
const ROUND_COLUMNS: Columns = {
  grid: "grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,5.5rem)_minmax(0,5.5rem)] xl:grid-cols-[minmax(0,16rem)_2.5rem_minmax(0,5.5rem)_minmax(0,5.5rem)_minmax(0,1fr)]",
  attempts: "col-span-full -mt-2.5 text-xs xl:col-span-1 xl:mt-0 xl:text-sm",
  head: "hidden xl:block",
};
/** A round's result on a row: its place, best and average (with the records they set; none for a round without averages), its attempts. */
function ResultRow({ event, r, lead, averaged, columns = HISTORY_COLUMNS }: { event: string; r: WcaResult; lead: React.ReactNode; averaged: boolean; columns?: Columns }) {
  return (
    <div role="listitem" className={cn(ROW_GRID, columns.grid, "py-1.5 text-sm")}>
      {lead}
      <span className={cn(NUMERIC, "text-right text-muted-foreground")}>{r.pos}</span>
      {/* A Multi-Blind result runs into the average's place, which it leaves empty. */}
      <span className={cn(NUMERIC, "font-bold whitespace-nowrap")}>{wcaResult(event, "single", r.best)}<RecordTag tag={r.single} /></span>
      <span className={cn(NUMERIC, "font-bold")}>{averaged && wcaResult(event, "average", r.average)}<RecordTag tag={r.avg} /></span>
      <span className={cn(NUMERIC, columns.attempts, "truncate text-muted-foreground")}>{wcaAttempts(event, r.attempts).join("  ")}</span>
    </div>
  );
}
/** The names of a list of results' columns, kept above it. */
function ResultHead({ averaged, columns = HISTORY_COLUMNS }: { averaged: boolean; columns?: Columns }) {
  return (
    <div aria-hidden="true" className={cn(ROW_GRID, columns.grid, "sticky top-0 z-10 bg-card py-1.5 text-xs font-bold text-muted-foreground uppercase")}>
      <span />
      <span className="text-right">#</span>
      <span>{tr("Single")}</span>
      <span>{averaged && tr("Average")}</span>
      <span className={columns.head}>{tr("Attempts")}</span>
    </div>
  );
}

/** A person's results in an event, per competition, newest first. */
function History({ history, event }: { history: WcaHistory; event: string }) {
  const groups = historyOf(history, event),
    averaged = groups.some((g) => g.rows.some((r) => r.average !== 0));
  if (!groups.length) return <Empty icon={Trophy} title={tr("No result")} className="flex-1" />;
  // ponytail: every competition drawn at once; a VirtualList if someone's hundreds of rounds ever drag.
  return (
    <div className={LIST} role="list" aria-label={tr("Results")}>
      <ResultHead averaged={averaged} />
      {groups.map(({ competition: c, rows }) => (
        <div key={c.id} className="flex flex-col border-b border-edge/50 pb-1.5 last:border-0">
          <button type="button" onClick={() => go(wcaUrl("competitions/" + c.id))} className="flex min-w-0 items-baseline gap-2 rounded-md px-3 pt-2 text-left hover:text-primary">
            <span className="truncate font-bold">{c.name}</span>
            <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{wcaDates(c)}</span>
          </button>
          {rows.map((r) => <ResultRow key={r.round} event={event} r={r} averaged={averaged} lead={<span className="truncate text-muted-foreground">{said(wcaRound(r.round))}</span>} />)}
        </div>
      ))}
    </div>
  );
}

function CompetitionPage({ id }: { id: string }) {
  const { data: c, error } = useWca<WcaCompetitionInfo>("competitions/" + id),
    countries = useCountries(),
    [event, setEvent] = useState(""),
    shown = event || c?.events[0] || "",
    over = !!c && c.end < new Date().toISOString().slice(0, 10),
    { data: rounds, error: roundsError } = useWca<WcaRound[]>(c?.results && shown ? `competitions/${id}/results/${shown}` : null),
    [round, setRound] = useState(""),
    picked = rounds?.find((r) => r.round === round) ?? rounds?.find((r) => r.results.length) ?? rounds?.[0],
    averaged = !!picked?.results.some((r) => r.average !== 0);
  return (
    <Sub
      title={c?.name ?? id}
      to={wcaUrl("competitions")}
      tools={c && <>{c.website && c.website !== c.url && <Outside href={c.website} label="Website"><Globe /></Outside>}<Outside href={c.url} label="Open on the WCA" /></>}
    >
      {error ? (
        <Empty icon={Globe} title={error} className="flex-1" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-5">
          <Surface className="min-h-0 gap-4 overflow-y-auto p-5">
            {!c ? (
              <Missing rows={5} />
            ) : (
              <>
                <PanelHead title={tr("Info")}>{c.cancelled && <Badge variant="destructive">{tr("Cancelled")}</Badge>}</PanelHead>
                <dl className="grid gap-3 text-sm">
                  <Fact label="Date">{wcaDates(c)}</Fact>
                  <Fact label="Place"><Flag iso2={c.country} named countries={countries} /><span className="text-muted-foreground">{c.city}</span></Fact>
                  <Fact label="Venue">
                    {c.venueUrl ? <a href={c.venueUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">{c.venue}</a> : <span className="font-semibold">{c.venue}</span>}
                    <span className="text-muted-foreground">{[c.address, c.details].filter(Boolean).join(" · ")}</span>
                    {c.map && <a href={c.map} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline"><MapPin className="size-3.5" />{tr("Map")}</a>}
                  </Fact>
                  {c.limit ? <Fact label="Competitors"><span className={NUMERIC}>{c.limit}</span></Fact> : null}
                  <Fact label="Events">
                    <span className="flex flex-wrap gap-1.5 text-muted-foreground">{c.events.map((e) => <Tip key={e} content={said(wcaEventLabel(e))}><span className="flex"><Icon name={"Puzzle" + e} size={20} /></span></Tip>)}</span>
                  </Fact>
                </dl>
              </>
            )}
          </Surface>
          <Surface className="min-h-0 gap-3 p-5">
            <PanelHead title={tr("Results")}>
              {c && c.events.length > 0 && c.results && <EventMenu value={shown} onChange={(e) => (setEvent(e), setRound(""))} events={c.events} />}
            </PanelHead>
            {!c ? (
              <Missing />
            ) : !c.results ? (
              <Empty icon={Trophy} title={c.cancelled ? tr("Cancelled") : over ? tr("Results not yet available") : tr("Not over yet")} className="flex-1" />
            ) : !rounds ? (
              <Missing error={roundsError} />
            ) : (
              <>
                {rounds.length > 1 && (
                  <Segmented label="Round" value={picked?.round ?? ""} onChange={setRound} action="wca:round:" className="self-start"
                    options={[...rounds].reverse().map((r) => ({ id: r.round, label: said(wcaRound(r.round)) }))} />
                )}
                {!picked?.results.length ? (
                  <Empty icon={Trophy} title={tr("Results not yet available")} className="flex-1" />
                ) : (
                  <div className={LIST} role="list" aria-label={said(wcaRound(picked.round)) + " · " + wcaFormat(picked.format)}>
                    <ResultHead averaged={averaged} columns={ROUND_COLUMNS} />
                    {picked.results.map((r) => <ResultRow key={r.id + r.pos} event={shown} r={r} averaged={averaged} lead={<PersonLink who={r} className="text-sm" />} columns={ROUND_COLUMNS} />)}
                  </div>
                )}
              </>
            )}
          </Surface>
        </div>
      )}
    </Sub>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{said(label)}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">{children}</dd>
    </div>
  );
}
