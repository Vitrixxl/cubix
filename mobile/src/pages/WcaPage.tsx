/**
 * The WCA's official results (src/client/lib/wca.ts), after the web's desktop/renderer/wca/page.tsx on a phone: the
 * rankings, records, competitions and people under the Challenges, each filter a pill opening its sheet, each list a
 * FlatList of rows; a person's page (their records, against the Qbix ones when it is the player, and their results by
 * competition) and a competition's (where and when, its results by event and round) pushed over them.
 */
import { useAtomValue, useSetAtom } from "jotai";
import { ArrowLeftRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Globe, MapPin, Medal, Search, Trophy, UserRound, Users, X } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, Linking, Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { fmtResult, fmtTime, plural } from "../../../src/client/lib/format";
import { eventInfo } from "../../../src/shared/puzzles";
import { journeyProfile } from "../../../src/client/lib/journey";
import {
  CONTINENTS, WCA_EVENTS, WCA_TABS, competitionsPath, countriesByName, countryName, flagOf, historyOf, monthLabel, rankingPath, readWcaView, recordReach, regionLabel, wcaAttempts, wcaDates, wcaEventLabel,
  wcaMonths, wcaPersonUrl, wcaRanks, wcaResult, wcaRound, wcaRows, wcaUrl,
  type CompetitionFilter, type WcaCompetition, type WcaCompetitionInfo, type WcaCompetitionList, type WcaCountry, type WcaHistory, type WcaPerson, type WcaRanking, type WcaRecord,
  type WcaRecordRow, type WcaResult, type WcaRound, type WcaTab, type WcaWho,
} from "../../../src/client/lib/wca";
import { said, tr } from "../../../src/client/i18n";
import { api } from "../api";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { Choice, Empty, HeadButton, Numeric, SearchField, Segmented } from "../components/layout";
import { PuzzleIcon } from "../components/PuzzlePicker";
import { Sheet, SheetFlatList } from "../components/Sheet";
import { SheetSearch } from "../components/community/people";
import { Cap } from "../components/duel/parts";
import { useBack } from "../components/tournaments/format";
import { linkWca } from "../components/Wca";
import { journeyAtom } from "../journey";
import { profileDataAtom } from "../profile";
import { openUrl } from "../lib/social";
import { guestModeAtom, replaceRouteAtom, signedInAtom } from "../state";

/** What the API answered, by path, for the next time a page shows it. */
const answers = new Map<string, unknown>();
function useWca<T>(path: string | null): { data?: T; error?: string } {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: string }>({ path, data: path ? (answers.get(path) as T) : undefined });
  useEffect(() => {
    if (!path) return;
    if (answers.has(path)) { setState({ path, data: answers.get(path) as T }); return; }
    let live = true;
    setState({ path });
    api.wca<T>(path).then(
      data => { if (answers.size > 300) answers.clear(); answers.set(path, data); if (live) setState({ path, data }); },
      (e: Error) => { if (live) setState({ path, error: said(e.message) }); },
    );
    return () => { live = false; };
  }, [path]);
  return state.path === path ? state : { data: path ? (answers.get(path) as T) : undefined };
}
const useCountries = () => useWca<WcaCountry[]>("countries").data;
const useOwnId = () => journeyProfile(useAtomValue(journeyAtom))?.wcaId;
const open = (view: string) => openUrl(wcaUrl(view));

/** The filters of each tab, kept while a person or a competition is open over them. */
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

/** @public Loaded on demand, by `require` (App.tsx). */
export function WcaPage({ view }: { view?: string }) {
  const { tab, id } = readWcaView(view);
  if (tab === "persons" && id) return <PersonPage key={id} id={id.toUpperCase()} />;
  if (tab === "competitions" && id) return <CompetitionPage key={id} id={id} />;
  return tab === "records" ? <Records /> : tab === "competitions" ? <Competitions /> : tab === "persons" ? <People /> : <Rankings />;
}

/** The top of a tab: the section's bar, the tab's buttons on it, and the WCA's tabs. */
function Head({ tab, children }: { tab: WcaTab; children?: ReactNode }) {
  const replace = useSetAtom(replaceRouteAtom);
  return <>
    <AppBar puzzle={false}>{children}</AppBar>
    <SectionTabs />
    <Choice label="WCA" value={tab} options={WCA_TABS.map(t => ({ id: t.id, label: t.label }))} onChange={t => replace({ page: "wca", view: t })} className="px-2 pt-1" />
  </>;
}

/** A filter as a pill: its icon, its value (not shown when `bare`, its mark enough), opening its sheet (or switching, `swap`, never cut). */
function Pill({ icon, label, onPress, swap = false, bare = false, accessibilityLabel }: { icon?: ReactNode; label: string; onPress: () => void; swap?: boolean; bare?: boolean; accessibilityLabel: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={said(accessibilityLabel)} accessibilityValue={{ text: said(label) }} onPress={onPress}
    className={cn("h-11 max-w-44 flex-row items-center gap-1.5 rounded-full bg-muted pr-2.5 pl-3 active:bg-muted/70", swap || bare ? "shrink-0" : "shrink")}>
    {icon}
    {bare ? null : <Text numberOfLines={1} className="shrink text-sm font-bold">{said(label)}</Text>}
    <Icon as={swap ? ArrowLeftRight : ChevronDown} size={14} className="text-muted-foreground" />
  </Pressable>;
}
/** The filters' row; `line` keeps them on one line, the pills shrinking (their values cut) rather than wrapping. */
function Filters({ line = false, children }: { line?: boolean; children: ReactNode }) {
  return <View className={cn("flex-row items-center gap-2 px-4 pt-1 pb-2", !line && "flex-wrap")}>{children}</View>;
}

/** A choice among many in a sheet, searchable when `search` names its field. */
function PickSheet({ open: shown, onClose, title, value, options, onPick, search }: {
  open: boolean; onClose: () => void; title: string; value: string; options: { id: string; label: string; prefix?: ReactNode }[]; onPick: (id: string) => void; search?: string;
}) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase();
  const list = words ? options.filter(o => said(o.label).toLowerCase().includes(words)) : options;
  return <Sheet open={shown} onClose={() => { setQ(""); onClose(); }} title={said(title)} contentClassName="gap-2 pb-2">
    {search ? <View className="px-5"><SheetSearch value={q} onChangeText={setQ} placeholder={said(search)} /></View> : null}
    <SheetFlatList data={list} keyExtractor={o => o.id || "any"} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
      renderItem={({ item: o }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: o.id === value }} onPress={() => { setQ(""); onPick(o.id); onClose(); }}
        className={cn("min-h-12 flex-row items-center gap-3 rounded-xl px-3 active:bg-muted/50", o.id === value && "bg-muted")}>
        {o.prefix}
        <Text numberOfLines={1} className={cn("min-w-0 flex-1 text-base", o.id === value ? "font-bold" : "font-medium")}>{said(o.label)}</Text>
      </Pressable>} />
  </Sheet>;
}

const eventOptions = (events = WCA_EVENTS) => events.map(id => ({ id, label: wcaEventLabel(id), prefix: <PuzzleIcon puzzle={id} size={18} /> }));
function regionOptions(countries: WcaCountry[] | undefined, anywhere?: string) {
  const globe = <Icon as={Globe} size={18} className="text-muted-foreground" />;
  return [
    ...(anywhere ? [{ id: "", label: anywhere, prefix: globe }] : [{ id: "world", label: "World", prefix: globe }, ...CONTINENTS.map(c => ({ ...c, prefix: globe }))]),
    ...countriesByName(countries ?? []).map(c => ({ id: c.iso2, label: c.name, prefix: <Text className="text-lg">{flagOf(c.iso2)}</Text> })),
  ];
}

/** Loading, failed or empty: what stands instead of a list. */
function Missing({ error, empty }: { error?: string; empty?: string | false }) {
  if (error) return <Empty icon={Globe} title={error} />;
  if (empty) return <Empty icon={Search} title={empty} />;
  return <View accessibilityLabel={tr("Loading")} className="gap-2 px-4 pt-2">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</View>;
}

/** The arrows to the previous and next pages, "3 / 20" between them. */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages < 2) return null;
  return <View className="flex-row items-center justify-center gap-2 py-2">
    <HeadButton icon={ChevronLeft} label="Previous" disabled={page <= 1} onPress={() => onPage(page - 1)} />
    <Numeric className="min-w-16 text-center text-sm text-muted-foreground">{page} / {pages}</Numeric>
    <HeadButton icon={ChevronRight} label="Next" disabled={page >= pages} onPress={() => onPage(page + 1)} />
  </View>;
}

/** A person on a row: their flag and name, on `lines` lines at most. */
function Who({ who, className, lines = 1 }: { who: WcaWho; className?: string; lines?: number }) {
  return <Text numberOfLines={lines} className={cn("min-w-0 flex-1 text-[15px] font-semibold", className)}>{flagOf(who.country)} {who.name}</Text>;
}

function Rankings() {
  const [f, set] = useKept("ranking"), countries = useCountries(), mine = useOwnId();
  const [sheet, setSheet] = useState<"" | "event" | "region">(""), [searching, setSearching] = useState(!!f.q), [text, setText] = useState(f.q);
  const update = (patch: Partial<typeof f>) => set({ ...f, page: 1, person: "", q: "", ...patch });
  useEffect(() => {
    if (text.trim() === f.q) return;
    const id = setTimeout(() => update({ q: text.trim().length >= 2 ? text.trim() : "" }), 400);
    return () => clearTimeout(id);
  }, [text]);
  const kind = f.kind === "average" && f.event !== "333mbf" ? "average" : "single";
  const { data, error } = useWca<WcaRanking>(rankingPath(f.event, kind, { region: f.region, page: f.q ? undefined : f.page, person: f.person, q: f.q }));
  useEffect(() => { if (error && f.person) set({ ...f, person: "" }); }, [error]);
  return <View className="flex-1">
    <Head tab="rankings">
      <HeadButton icon={Search} label="Find a name in the ranking" active={searching} onPress={() => { setSearching(!searching); if (searching) { setText(""); update({ q: "" }); } }} />
      {mine ? <HeadButton icon={UserRound} label="Find me in the ranking" onPress={() => update({ person: mine })} /> : null}
    </Head>
    <Filters line>
      <Pill icon={<PuzzleIcon puzzle={f.event} size={16} />} label={wcaEventLabel(f.event)} accessibilityLabel="Event" onPress={() => setSheet("event")} />
      {f.event !== "333mbf" ? <Pill label={kind === "single" ? "Single" : "Average"} swap accessibilityLabel="Result" onPress={() => update({ kind: kind === "single" ? "average" : "single" })} /> : null}
      <Pill icon={f.region.length === 2 ? <Text>{flagOf(f.region)}</Text> : <Icon as={Globe} size={15} />} label={regionLabel(f.region, countries)} bare accessibilityLabel="Region" onPress={() => setSheet("region")} />
    </Filters>
    {searching ? <SearchField value={text} onChangeText={setText} placeholder="Name" autoFocus className="mx-4 mb-2" /> : null}
    {error && f.person ? <Text className="px-4 pb-1 text-sm text-destructive">{error}</Text> : null}
    {!data?.rows.length ? <Missing error={error && !f.person ? error : undefined} empty={!!data && tr("Nobody here")} />
      : <FlatList data={data.rows} keyExtractor={r => r.id} contentContainerClassName="px-2 pb-2" accessibilityLabel={tr("Rankings")}
        renderItem={({ item: r }) => <Pressable onPress={() => open("persons/" + r.id)} accessibilityRole="link"
          className={cn("min-h-12 flex-row items-center gap-3 rounded-xl px-3 active:bg-muted/50", r.id === (f.person || mine) && "bg-primary/12")}>
          <Numeric className="w-10 text-sm font-bold text-muted-foreground">{r.rank}</Numeric>
          <Who who={r} />
          <Numeric className="text-[15px] font-bold">{wcaResult(f.event, kind, r.best)}</Numeric>
        </Pressable>}
        ListFooterComponent={f.q ? null : <Pager page={data.page} pages={data.pages} onPage={page => set({ ...f, page, person: "" })} />} />}
    <PickSheet open={sheet === "event"} onClose={() => setSheet("")} title="Event" value={f.event} options={eventOptions()} onPick={event => update({ event })} />
    <PickSheet open={sheet === "region"} onClose={() => setSheet("")} title="Region" value={f.region} options={regionOptions(countries)} onPick={region => update({ region })} search="Region" />
  </View>;
}

function Records() {
  const [region, set] = useKept("records"), countries = useCountries(), [sheet, setSheet] = useState(false);
  const { data, error } = useWca<WcaRecordRow[]>("records?region=" + region);
  const held = (event: string, kind: "single" | "average", h?: WcaRecordRow["single"]) => <View className="min-w-0 flex-1 gap-0.5">
    <Cap>{tr(kind === "single" ? "Single" : "Average")}</Cap>
    {h ? <>
      <Numeric className="text-lg font-extrabold">{wcaResult(event, kind, h.best)}</Numeric>
      {h.holders.map(w => <Pressable key={w.id} accessibilityRole="link" onPress={() => open("persons/" + w.id)}><Who who={w} className="text-sm" /></Pressable>)}
    </> : <Text className="text-muted-foreground">–</Text>}
  </View>;
  return <View className="flex-1">
    <Head tab="records" />
    <Filters>
      <Pill icon={region.length === 2 ? <Text>{flagOf(region)}</Text> : <Icon as={Globe} size={15} />} label={regionLabel(region, countries)} accessibilityLabel="Region" onPress={() => setSheet(true)} />
    </Filters>
    {!data?.length ? <Missing error={error} empty={!!data && tr("Nobody here")} />
      : <FlatList data={data} keyExtractor={r => r.event} contentContainerClassName="gap-2 px-4 pb-3" accessibilityLabel={tr("Records")}
        renderItem={({ item: r }) => <View className="gap-2 rounded-2xl bg-card px-3.5 py-3">
          <View className="flex-row items-center gap-2"><PuzzleIcon puzzle={r.event} size={16} /><Text className="text-sm font-bold">{said(wcaEventLabel(r.event))}</Text></View>
          <View className="flex-row gap-3">{held(r.event, "single", r.single)}{held(r.event, "average", r.average)}</View>
        </View>} />}
    <PickSheet open={sheet} onClose={() => setSheet(false)} title="Region" value={region} options={regionOptions(countries)} onPick={set} search="Region" />
  </View>;
}

function Competitions() {
  const [f, set] = useKept("competitions"), countries = useCountries();
  const [sheet, setSheet] = useState<"" | "country" | "month">(""), [searching, setSearching] = useState(!!f.q), [text, setText] = useState(f.q);
  const update = (patch: Partial<typeof f>) => set({ ...f, page: 1, ...patch });
  useEffect(() => {
    if (text.trim() === f.q) return;
    const id = setTimeout(() => update({ q: text.trim() }), 400);
    return () => clearTimeout(id);
  }, [text]);
  const { data, error } = useWca<WcaCompetitionList>(competitionsPath(f, f.page));
  const months = wcaMonths(f.status === "past");
  return <View className="flex-1">
    <Head tab="competitions">
      <HeadButton icon={Search} label="Find a competition by name" active={searching} onPress={() => { setSearching(!searching); if (searching) { setText(""); update({ q: "" }); } }} />
    </Head>
    <Filters line>
      <Pill label={f.status === "past" ? "Past" : "Upcoming"} swap accessibilityLabel="When" onPress={() => update({ status: f.status === "past" ? "upcoming" : "past", month: "" })} />
      <Pill icon={f.country ? <Text>{flagOf(f.country)}</Text> : <Icon as={Globe} size={15} />} label={f.country ? countryName(f.country, countries) : "Anywhere"} bare accessibilityLabel="Region" onPress={() => setSheet("country")} />
      <Pill icon={<Icon as={CalendarDays} size={15} />} label={f.month ? monthLabel(f.month) : "Any month"} bare={!f.month} accessibilityLabel="Month" onPress={() => setSheet("month")} />
    </Filters>
    {searching ? <SearchField value={text} onChangeText={setText} placeholder="Name" autoFocus className="mx-4 mb-2" /> : null}
    {!data?.items.length ? <Missing error={error} empty={!!data && tr("No competition")} />
      : <FlatList data={data.items} keyExtractor={c => c.id} contentContainerClassName="gap-1.5 px-4 pb-2" accessibilityLabel={tr("Competitions")}
        renderItem={({ item: c }) => <CompetitionRow c={c} />}
        ListFooterComponent={<Pager page={data.page} pages={data.pages} onPage={page => set({ ...f, page })} />} />}
    <PickSheet open={sheet === "country"} onClose={() => setSheet("")} title="Region" value={f.country} options={regionOptions(countries, "Anywhere")} onPick={country => update({ country })} search="Region" />
    <PickSheet open={sheet === "month"} onClose={() => setSheet("")} title="Month" value={f.month} options={[{ id: "", label: "Any month" }, ...months.map(id => ({ id, label: monthLabel(id) }))]} onPick={month => update({ month })} />
  </View>;
}

function CompetitionRow({ c }: { c: WcaCompetition }) {
  return <Pressable accessibilityRole="link" onPress={() => open("competitions/" + c.id)} className="gap-1 rounded-2xl bg-card px-3.5 py-2.5 active:bg-muted/50">
    <Text numberOfLines={1} className={cn("text-[15px] font-bold", c.cancelled && "text-muted-foreground line-through")}>{c.name}</Text>
    <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{wcaDates(c)} · {flagOf(c.country)} {c.city}</Text>
    <View className="flex-row flex-wrap gap-1.5">{c.events.map(e => <PuzzleIcon key={e} puzzle={e} size={13} />)}</View>
  </Pressable>;
}

function People() {
  const [q, set] = useKept("people"), [text, setText] = useState(q), mine = useOwnId();
  useEffect(() => {
    const id = setTimeout(() => set(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text]);
  const { data, error } = useWca<WcaWho[]>(q.length >= 2 ? "search?q=" + encodeURIComponent(q) : null);
  return <View className="flex-1">
    <Head tab="persons" />
    <SearchField value={text} onChangeText={setText} placeholder="Name or WCA ID" className="mx-4 mt-1 mb-2" />
    {mine && !q ? <Pressable accessibilityRole="link" onPress={() => open("persons/" + mine)} className="mx-2 min-h-12 flex-row items-center gap-3 rounded-xl px-3 active:bg-muted/50">
      <Icon as={UserRound} size={18} className="text-primary" />
      <Text className="text-[15px] font-bold">{tr("Me")}</Text>
      <Numeric className="text-sm text-muted-foreground">{mine}</Numeric>
    </Pressable> : null}
    {q.length < 2 ? (mine ? null : <Empty icon={Users} title={tr("Name or WCA ID")} />)
      : !data?.length ? <Missing error={error} empty={!!data && tr("Nobody here")} />
      : <FlatList data={data} keyExtractor={w => w.id} keyboardShouldPersistTaps="handled" contentContainerClassName="px-2 pb-2" accessibilityLabel={tr("People")}
        renderItem={({ item: w }) => <Pressable accessibilityRole="link" onPress={() => open("persons/" + w.id)} className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 active:bg-muted/50">
          <Who who={w} />
          <Numeric className="text-xs text-muted-foreground">{w.id}</Numeric>
        </Pressable>} />}
  </View>;
}

/** A result and its ranks. */
function Official({ event, kind, r }: { event: string; kind: "single" | "average"; r?: WcaRecord }) {
  if (!r) return <View className="flex-1"><Text className="text-muted-foreground">–</Text></View>;
  return <View className="min-w-0 flex-1">
    <Numeric className="text-[15px] font-bold">{wcaResult(event, kind, r.best)}</Numeric>
    <Numeric numberOfLines={1} className="text-[11px] text-muted-foreground">{wcaRanks(r)}</Numeric>
  </View>;
}

/** A record set in a result, in its colour. */
function RecordTag({ tag }: { tag?: string }) {
  if (!tag) return null;
  const reach = recordReach(tag);
  return <Badge variant={reach === "world" ? "destructive" : reach === "continental" ? "warning" : "success"} className="px-1 py-0"><Text className="text-[10px] font-extrabold">{tag}</Text></Badge>;
}

/** The columns over the rows of results: Single and Average (Multi-Blind has no average). */
function ResultHead({ event, className }: { event: string; className?: string }) {
  return <View className={cn("flex-row gap-2 px-1", className)}>
    <View className="flex-1" />
    <Cap className="min-w-20 text-right">{tr("Single")}</Cap>
    {event !== "333mbf" ? <Cap className="w-20 text-right">{tr("Average")}</Cap> : null}
  </View>;
}

/** A round's result as a row: its lead (the round, or who), place, single and average, the attempts under them. */
function ResultRow({ event, r, lead }: { event: string; r: WcaResult; lead: ReactNode }) {
  return <View className="gap-0.5 border-t border-border px-1 py-2">
    <View className="flex-row items-center gap-2">
      <Numeric className="w-7 text-sm text-muted-foreground">{r.pos}</Numeric>
      <View className="min-w-0 flex-1">{lead}</View>
      <View className="min-w-20 flex-row items-center justify-end gap-1"><Numeric className="text-[15px] font-bold">{wcaResult(event, "single", r.best)}</Numeric><RecordTag tag={r.single} /></View>
      {event !== "333mbf" ? <View className="w-20 flex-row items-center justify-end gap-1"><Numeric className="text-[15px] font-bold">{wcaResult(event, "average", r.average)}</Numeric><RecordTag tag={r.avg} /></View> : null}
    </View>
    <Numeric numberOfLines={1} className="pl-9 text-xs text-muted-foreground">{wcaAttempts(event, r.attempts).join("   ")}</Numeric>
  </View>;
}

function PersonPage({ id }: { id: string }) {
  const { data: person, error } = useWca<WcaPerson>("persons/" + id), { data: history, error: historyError } = useWca<WcaHistory>(`persons/${id}/results`);
  const countries = useCountries(), profile = journeyProfile(useAtomValue(journeyAtom)), own = profile?.wcaId === id, signedIn = useAtomValue(signedInAtom), signIn = useSetAtom(guestModeAtom), back = useBack(wcaUrl("persons"));
  const prepared = useAtomValue(profileDataAtom), records = prepared?.profile.records ?? [];
  const [part, setPart] = useState<"records" | "results">("records"), [event, setEvent] = useState(""), [sheet, setSheet] = useState(false), [failed, setFailed] = useState("");
  const rows = useMemo(() => (person ? wcaRows(person, records) : []), [person, records]);
  const shown = event || rows[0]?.event || "333";
  const groups = history ? historyOf(history, shown) : [];
  const link = async (wcaId?: string) => setFailed((await linkWca(wcaId)) ?? "");
  const figures = person ? ([
    [Medal, "Gold", person.medals.gold, "text-warning"], [Medal, "Silver", person.medals.silver, "text-muted-foreground"], [Medal, "Bronze", person.medals.bronze, "text-primary"],
    [Trophy, "WR", person.recordsSet.world, "text-destructive"], [Trophy, "CR", person.recordsSet.continental, "text-warning"], [Trophy, "NR", person.recordsSet.national, "text-success"],
  ] as const).filter(([, , n]) => n > 0) : [];
  return <View className="flex-1">
    <PushedBar title={person?.name ?? id} sub={person ? `${flagOf(person.country)} ${countryName(person.country, countries)} · ${id}` : undefined} onBack={back}>
      {/* The player's WCA ID: "You", a tap unlinking it; another's, "That's me" (a guest signs in first). */}
      <Pressable accessibilityRole="button" accessibilityLabel={tr(own ? "Unlink" : "That's me")} onPress={() => (own ? void link() : signedIn && profile ? void link(id) : signIn(false))}
        className={cn("h-11 flex-row items-center gap-1.5 rounded-full px-3.5", own ? "bg-muted active:bg-muted/70" : "bg-primary active:bg-primary/90")}>
        <Text className={cn("text-sm font-bold", !own && "text-primary-foreground")}>{tr(own ? "You" : "That's me")}</Text>
        {own ? <Icon as={X} size={14} className="text-muted-foreground" /> : null}
      </Pressable>
      <HeadButton icon={ExternalLink} label="Open on the WCA" onPress={() => void Linking.openURL(wcaPersonUrl(id))} />
    </PushedBar>
    {error ? <Empty icon={Globe} title={error} /> : <View className="min-h-0 flex-1 gap-2 px-4">
      {failed ? <Text className="text-sm text-destructive">{failed}</Text> : null}
      {person ? <View className="flex-row flex-wrap items-center gap-1.5">
        <Badge variant="secondary"><Text className="text-xs">{plural(person.competitions, "competition")}</Text></Badge>
        {figures.map(([I, label, n, tone]) => <View key={label} accessibilityLabel={`${said(label)} ${n}`} className="h-6 flex-row items-center gap-1 rounded-md bg-muted px-2">
          <Icon as={I} size={13} className={tone} />
          {label.length === 2 ? <Text className="text-[11px] text-muted-foreground">{label}</Text> : null}
          <Numeric className="text-xs font-bold">{n}</Numeric>
        </View>)}
      </View> : null}
      <Segmented label="WCA" value={part} onChange={setPart} options={[{ id: "records", label: "Records" }, { id: "results", label: "Results" }]} />
      {part === "records" ? (!person ? <Missing />
        : <FlatList data={rows} keyExtractor={r => r.event} contentContainerClassName="gap-1.5 pb-3" accessibilityLabel={tr("Official results")}
          renderItem={({ item: r }) => <Pressable onPress={() => { setEvent(r.event); setPart("results"); }} className="gap-1.5 rounded-2xl bg-card px-3.5 py-2.5 active:bg-muted/50">
            <View className="flex-row items-center gap-2"><PuzzleIcon puzzle={r.event} size={15} /><Text className="min-w-0 flex-1 text-sm font-bold">{said(r.label)}</Text></View>
            <View className="flex-row gap-3"><Official event={r.event} kind="single" r={r.single} /><Official event={r.event} kind="average" r={r.average} /></View>
            {own && r.qbixSingle != null ? <Text className="text-xs text-muted-foreground">Qbix <Numeric className="text-xs font-bold text-foreground">{fmtResult(r.qbixSingle, eventInfo(r.event)?.solveMode)}</Numeric>{r.qbixAverage != null ? ` · ${tr("Ao5 {0}", { 0: fmtTime(r.qbixAverage) })}` : ""}</Text> : null}
          </Pressable>} />)
        : <View className="min-h-0 flex-1 gap-2">
          {rows.length ? <View className="flex-row"><Pill icon={<PuzzleIcon puzzle={shown} size={16} />} label={wcaEventLabel(shown)} accessibilityLabel="Event" onPress={() => setSheet(true)} /></View> : null}
          {!history ? <Missing error={historyError} />
            : !groups.length ? <Empty icon={Trophy} title={tr("No result")} />
            : <><ResultHead event={shown} className="px-3.5" /><FlatList data={groups} keyExtractor={g => g.competition.id} contentContainerClassName="gap-2 pb-3" accessibilityLabel={tr("Results")}
              renderItem={({ item: g }) => <View className="rounded-2xl bg-card px-2.5 pt-2 pb-1">
                <Pressable accessibilityRole="link" onPress={() => open("competitions/" + g.competition.id)} className="px-1 pb-1.5">
                  <Text numberOfLines={1} className="text-sm font-bold">{g.competition.name}</Text>
                  <Text className="text-xs text-muted-foreground">{wcaDates(g.competition)}</Text>
                </Pressable>
                {g.rows.map(r => <ResultRow key={r.round} event={shown} r={r} lead={<Text numberOfLines={1} className="text-sm text-muted-foreground">{said(wcaRound(r.round))}</Text>} />)}
              </View>} /></>}
        </View>}
    </View>}
    <PickSheet open={sheet} onClose={() => setSheet(false)} title="Event" value={shown} options={eventOptions(rows.map(r => r.event))} onPick={setEvent} />
  </View>;
}

function CompetitionPage({ id }: { id: string }) {
  const { data: c, error } = useWca<WcaCompetitionInfo>("competitions/" + id), countries = useCountries(), back = useBack(wcaUrl("competitions"));
  const [part, setPart] = useState<"info" | "results">("info"), [event, setEvent] = useState(""), [round, setRound] = useState(""), [sheet, setSheet] = useState(false);
  const shown = event || c?.events[0] || "";
  const { data: rounds, error: roundsError } = useWca<WcaRound[]>(c?.results && shown && part === "results" ? `competitions/${id}/results/${shown}` : null);
  const picked = rounds?.find(r => r.round === round) ?? rounds?.find(r => r.results.length) ?? rounds?.[0];
  const over = !!c && c.end < new Date().toISOString().slice(0, 10);
  const fact = (label: string, body: ReactNode) => <View className="gap-0.5"><Cap>{tr(label)}</Cap>{body}</View>;
  const link = (label: string, url: string, icon = ExternalLink) => <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} className="min-h-11 flex-row items-center gap-1.5 self-start">
    <Icon as={icon} size={14} className="text-primary" /><Text className="text-sm font-semibold text-primary">{label}</Text>
  </Pressable>;
  return <View className="flex-1">
    <PushedBar title={c?.name ?? id} sub={c ? wcaDates(c) : undefined} onBack={back}>
      {c ? <HeadButton icon={ExternalLink} label="Open on the WCA" onPress={() => void Linking.openURL(c.url)} /> : null}
    </PushedBar>
    {error ? <Empty icon={Globe} title={error} /> : !c ? <Missing /> : <View className="min-h-0 flex-1 gap-2 px-4">
      <Segmented label="WCA" value={part} onChange={setPart} options={[{ id: "info", label: "Info" }, { id: "results", label: "Results" }]} />
      {part === "info" ? <ScrollView contentContainerClassName="gap-3 pb-4">
        {c.cancelled ? <Badge variant="destructive" className="self-start"><Text>{tr("Cancelled")}</Text></Badge> : null}
        {fact("Date", <Text className="text-[15px]">{wcaDates(c)}</Text>)}
        {fact("Place", <Text className="text-[15px]">{flagOf(c.country)} {countryName(c.country, countries)} · {c.city}</Text>)}
        {fact("Venue", <>
          {c.venueUrl ? link(c.venue, c.venueUrl) : <Text className="text-[15px] font-semibold">{c.venue}</Text>}
          <Text className="text-sm text-muted-foreground">{[c.address, c.details].filter(Boolean).join(" · ")}</Text>
          {c.map ? link(tr("Map"), c.map, MapPin) : null}
        </>)}
        {c.limit ? fact("Competitors", <Numeric className="text-[15px]">{c.limit}</Numeric>) : null}
        {fact("Events", <View className="flex-row flex-wrap gap-2 pt-1">{c.events.map(e => <PuzzleIcon key={e} puzzle={e} size={20} />)}</View>)}
        {c.website && c.website !== c.url ? link(tr("Website"), c.website, Globe) : null}
      </ScrollView>
        : !c.results ? <Empty icon={Trophy} title={c.cancelled ? tr("Cancelled") : over ? tr("Results not yet available") : tr("Not over yet")} />
        : <View className="min-h-0 flex-1 gap-2">
          <View className="flex-row"><Pill icon={<PuzzleIcon puzzle={shown} size={16} />} label={wcaEventLabel(shown)} accessibilityLabel="Event" onPress={() => setSheet(true)} /></View>
          {!rounds ? <Missing error={roundsError} /> : <>
            {rounds.length > 1 ? <Choice label="Round" value={picked?.round ?? ""} onChange={setRound} options={[...rounds].reverse().map(r => ({ id: r.round, label: said(wcaRound(r.round)) }))} /> : null}
            {!picked?.results.length ? <Empty icon={Trophy} title={tr("Results not yet available")} />
              : <><ResultHead event={shown} /><FlatList data={picked.results} keyExtractor={r => r.id + r.pos} contentContainerClassName="pb-3" accessibilityLabel={said(wcaRound(picked.round))}
                renderItem={({ item: r }) => <Pressable accessibilityRole="link" onPress={() => open("persons/" + r.id)}><ResultRow event={shown} r={r} lead={<Who who={r} lines={2} className="text-sm" />} /></Pressable>} /></>}
          </>}
        </View>}
    </View>}
    {c ? <PickSheet open={sheet} onClose={() => setSheet(false)} title="Event" value={shown} options={eventOptions(c.events)} onPick={e => { setEvent(e); setRound(""); }} /> : null}
  </View>;
}
