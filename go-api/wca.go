package main

// WCA: the official rankings, records, competitions and people of the World Cube Association, for anyone (no account,
// no OAuth), read from two public sources and served here in slices the apps can show:
//
//   - the WCA's own API (wcaBase): persons and their results, competitions and their results, the records, the
//     countries, the search;
//   - for the rankings, which the WCA's API does not give, the daily static export of github.com/robiningelbrecht/
//     wca-rest-api (wcaRankBase): rank/<world|continent|ISO 2>/<single|average>/<event>.json, the top 1000 of each
//     (about 125 kB), built from the WCA's results export once a day; the names come from the WCA's API.
//
// Everything is kept in one LRU of at most wcaBudget bytes (measured as JSON), each kind for its own time (rankings and
// records a day, competitions an hour, the results of a competition over a week); an expired answer still serves while
// a source is down. A request counts once against its client's allowance, and only when something was not kept.

import (
	"container/list"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The sources; the tests point them at a fake server.
var (
	wcaBase     = "https://www.worldcubeassociation.org/api/v0"
	wcaRankBase = "https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/v1"
)

// wcaID: a WCA ID, the year of a first competition, four letters of the name and a number: 2009ZEMD01.
var wcaID = regexp.MustCompile(`^[0-9]{4}[A-Z]{4}[0-9]{2}$`)
var wcaCompetitionID = regexp.MustCompile(`^[A-Za-z0-9]{3,48}$`)
var wcaDate = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)
var wcaCountryCode = regexp.MustCompile(`^[A-Z]{2}$`)

// wcaEvents: the WCA's current events, in its order.
var wcaEvents = []string{"333", "222", "444", "555", "666", "777", "333bf", "333fm", "333oh", "clock", "minx", "pyram", "skewb", "sq1", "444bf", "555bf", "333mbf"}

// wcaContinents: the rankings' names of the continents, and the WCA's.
var wcaContinents = map[string]string{"africa": "_Africa", "asia": "_Asia", "europe": "_Europe", "north-america": "_North America", "oceania": "_Oceania", "south-america": "_South America"}

const (
	wcaBudget = 16 << 20
	wcaPage   = 50
)

var (
	errWcaUnknown = apiErr(404, "Unknown WCA ID.")
	errWcaMissing = apiErr(404, "Not found")
	errWcaDown    = apiErr(503, "The WCA cannot be reached.")
)

type wcaEntry struct {
	key   string
	value any
	size  int
	until time.Time
}

// wcaCache: what was read, newest use first, within wcaBudget.
var wcaCache struct {
	sync.Mutex
	order *list.List
	index map[string]*list.Element
	size  int
}

// wcaMemo: `build`'s value for `key`, kept `ttl`. A miss first asks `limit` (the client's allowance); a source down
// (errWcaDown) serves the value kept before, expired or not.
// ponytail: two clients missing the same key at once both build it; a singleflight if the Pi ever notices.
func wcaMemo[T any](key string, ttl time.Duration, limit func() error, build func() (T, error)) (T, error) {
	var zero T
	wcaCache.Lock()
	if wcaCache.index == nil {
		wcaCache.order, wcaCache.index = list.New(), map[string]*list.Element{}
	}
	var kept *wcaEntry
	if element, ok := wcaCache.index[key]; ok {
		kept = element.Value.(*wcaEntry)
		wcaCache.order.MoveToFront(element)
	}
	wcaCache.Unlock()
	if kept != nil && time.Now().Before(kept.until) {
		return kept.value.(T), nil
	}
	if err := limit(); err != nil {
		return zero, err
	}
	value, err := build()
	if err != nil {
		if kept != nil && err == errWcaDown {
			return kept.value.(T), nil
		}
		return zero, err
	}
	body, _ := json.Marshal(value)
	wcaCache.Lock()
	defer wcaCache.Unlock()
	if old, ok := wcaCache.index[key]; ok {
		wcaCache.size -= old.Value.(*wcaEntry).size
		wcaCache.order.Remove(old)
	}
	entry := &wcaEntry{key, value, len(body) + len(key), time.Now().Add(ttl)}
	wcaCache.index[key] = wcaCache.order.PushFront(entry)
	wcaCache.size += entry.size
	for wcaCache.size > wcaBudget && wcaCache.order.Len() > 1 {
		last := wcaCache.order.Back()
		gone := last.Value.(*wcaEntry)
		wcaCache.order.Remove(last)
		delete(wcaCache.index, gone.key)
		wcaCache.size -= gone.size
	}
	return value, nil
}

// A veteran's results (about 1 MB) can take the WCA close to 20 s.
var wcaClient = http.Client{Timeout: 25 * time.Second}

// wcaGet reads the JSON at `address` into `into` (only the fields it names are kept); its headers for the paging.
func wcaGet(address string, into any) (http.Header, error) {
	request, err := http.NewRequest("GET", address, nil)
	if err != nil {
		return nil, errWcaDown
	}
	request.Header.Set("User-Agent", "Qbix")
	response, err := wcaClient.Do(request)
	if err != nil {
		return nil, errWcaDown
	}
	defer response.Body.Close()
	if response.StatusCode == 404 {
		return nil, errWcaMissing
	}
	if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 32<<20)).Decode(into) != nil {
		return nil, errWcaDown
	}
	return response.Header, nil
}

// wcaWho: a person as a row shows them.
type wcaWho struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Country string `json:"country"`
}

// wcaNames: the names and countries of the people the rankings and records showed.
// ponytail: never expire, emptied whole past 50,000; names and nationalities hardly change.
var wcaNames struct {
	sync.Mutex
	known map[string]wcaWho
}

func wcaRemember(people []wcaWho) {
	wcaNames.Lock()
	defer wcaNames.Unlock()
	if wcaNames.known == nil || len(wcaNames.known) > 50000 {
		wcaNames.known = map[string]wcaWho{}
	}
	for _, p := range people {
		wcaNames.known[p.ID] = p
	}
}

type wcaUpstreamPerson struct {
	WcaID   string `json:"wca_id"`
	Name    string `json:"name"`
	Country string `json:"country_iso2"`
}

// wcaWhoOf: who each WCA ID is, those not known yet asked of the WCA a hundred at a time.
func wcaWhoOf(limit func() error, ids []string) (map[string]wcaWho, error) {
	out, missing := map[string]wcaWho{}, []string{}
	wcaNames.Lock()
	for _, id := range ids {
		if who, ok := wcaNames.known[id]; ok {
			out[id] = who
		} else {
			missing = append(missing, id)
		}
	}
	wcaNames.Unlock()
	for start := 0; start < len(missing); start += 100 {
		chunk := missing[start:min(start+100, len(missing))]
		if err := limit(); err != nil {
			return nil, err
		}
		var found []struct {
			Person wcaUpstreamPerson `json:"person"`
		}
		if _, err := wcaGet(wcaBase+"/persons?per_page=100&wca_ids="+strings.Join(chunk, ","), &found); err != nil {
			return nil, err
		}
		people := []wcaWho{}
		for _, f := range found {
			people = append(people, wcaWho{f.Person.WcaID, f.Person.Name, f.Person.Country})
		}
		wcaRemember(people)
		for _, p := range people {
			out[p.ID] = p
		}
	}
	for _, id := range ids {
		if _, ok := out[id]; !ok {
			out[id] = wcaWho{ID: id, Name: id}
		}
	}
	return out, nil
}

type wcaRecord struct {
	Best          int `json:"best"`
	WorldRank     int `json:"world_rank"`
	ContinentRank int `json:"continent_rank"`
	CountryRank   int `json:"country_rank"`
}

// WcaPerson: a person's page: who they are, their competitions, medals and records set, and per event the single and
// average PRs with their ranks.
type WcaPerson struct {
	ID           string                          `json:"id"`
	Name         string                          `json:"name"`
	Country      string                          `json:"country"`
	CountryName  string                          `json:"countryName"`
	Gender       string                          `json:"gender,omitempty"`
	Competitions int                             `json:"competitions"`
	Records      map[string]map[string]wcaRecord `json:"records"`
	Medals       struct {
		Gold   int `json:"gold"`
		Silver int `json:"silver"`
		Bronze int `json:"bronze"`
	} `json:"medals"`
	RecordsSet struct {
		World       int `json:"world"`
		Continental int `json:"continental"`
		National    int `json:"national"`
	} `json:"recordsSet"`
}

func wcaPerson(limit func() error, id string) (*WcaPerson, error) {
	return wcaMemo("person/"+id, 12*time.Hour, limit, func() (*WcaPerson, error) {
		var v struct {
			Person struct {
				Name    string
				Gender  string
				WcaID   string `json:"wca_id"`
				Country struct{ Name, Iso2 string }
			}
			CompetitionCount int                             `json:"competition_count"`
			PersonalRecords  map[string]map[string]wcaRecord `json:"personal_records"`
			Medals           json.RawMessage
			Records          json.RawMessage
		}
		if _, err := wcaGet(wcaBase+"/persons/"+id, &v); err != nil {
			if err == errWcaMissing {
				return nil, errWcaUnknown
			}
			return nil, err
		}
		if v.Person.WcaID != id {
			return nil, errWcaDown
		}
		p := &WcaPerson{ID: id, Name: v.Person.Name, Country: v.Person.Country.Iso2, CountryName: v.Person.Country.Name, Gender: v.Person.Gender,
			Competitions: v.CompetitionCount, Records: v.PersonalRecords}
		_ = json.Unmarshal(v.Medals, &p.Medals)
		_ = json.Unmarshal(v.Records, &p.RecordsSet)
		if p.Records == nil {
			p.Records = map[string]map[string]wcaRecord{}
		}
		wcaRemember([]wcaWho{{id, p.Name, p.Country}})
		return p, nil
	})
}

// wcaRoundOrder: a round's place, the first round lowest, the final highest.
var wcaRoundOrder = map[string]int{"0": 0, "h": 0, "1": 1, "d": 1, "2": 2, "e": 2, "3": 3, "g": 3, "b": 4, "c": 5, "f": 5}

// wcaResult: a result of a round, as upstream gives it.
type wcaResult struct {
	Pos      int    `json:"pos"`
	Best     int    `json:"best"`
	Average  int    `json:"average"`
	Name     string `json:"name"`
	Country  string `json:"country_iso2"`
	WcaID    string `json:"wca_id"`
	Event    string `json:"event_id"`
	Round    string `json:"round_type_id"`
	Format   string `json:"format_id"`
	Comp     string `json:"competition_id"`
	Attempts []int  `json:"attempts"`
	Single   string `json:"regional_single_record"`
	Avg      string `json:"regional_average_record"`
}

// wcaRow: a result as the apps show it.
type wcaRow struct {
	Pos      int    `json:"pos"`
	Best     int    `json:"best"`
	Average  int    `json:"average"`
	Attempts []int  `json:"attempts"`
	Single   string `json:"single,omitempty"`
	Avg      string `json:"avg,omitempty"`
}

func (r wcaResult) row() wcaRow {
	if r.Attempts == nil {
		r.Attempts = []int{}
	}
	return wcaRow{r.Pos, r.Best, r.Average, r.Attempts, r.Single, r.Avg}
}

// wcaBrief: a competition in a list.
type wcaBrief struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	City      string   `json:"city"`
	Country   string   `json:"country"`
	Start     string   `json:"start"`
	End       string   `json:"end"`
	Events    []string `json:"events"`
	Cancelled bool     `json:"cancelled,omitempty"`
}

// wcaUpstreamCompetition: a competition, as upstream gives it.
type wcaUpstreamCompetition struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	City      string   `json:"city"`
	Country   string   `json:"country_iso2"`
	Start     string   `json:"start_date"`
	End       string   `json:"end_date"`
	Events    []string `json:"event_ids"`
	Cancelled *string  `json:"cancelled_at"`
	Posted    *string  `json:"results_posted_at"`
	Venue     string   `json:"venue"`
	Address   string   `json:"venue_address"`
	Details   string   `json:"venue_details"`
	Website   string   `json:"website"`
	URL       string   `json:"url"`
	Limit     int      `json:"competitor_limit"`
	Latitude  float64  `json:"latitude_degrees"`
	Longitude float64  `json:"longitude_degrees"`
}

func (c wcaUpstreamCompetition) brief() wcaBrief {
	if c.Events == nil {
		c.Events = []string{}
	}
	return wcaBrief{c.ID, c.Name, c.City, c.Country, c.Start, c.End, c.Events, c.Cancelled != nil}
}

// wcaHistory: a person's results, per competition (newest first), event (in the WCA's order) and round (the final first).
type wcaHistory struct {
	Competitions []wcaBrief      `json:"competitions"`
	Results      []wcaHistoryRow `json:"results"`
}

type wcaHistoryRow struct {
	Competition string `json:"competition"`
	Event       string `json:"event"`
	Round       string `json:"round"`
	wcaRow
	// The country they represented then, for the records (wcaSetBy).
	Country string `json:"-"`
}

func wcaPersonResults(limit func() error, id string) (*wcaHistory, error) {
	return wcaMemo("results/"+id, 12*time.Hour, limit, func() (*wcaHistory, error) {
		var results []wcaResult
		var competitions []wcaUpstreamCompetition
		// Both at once: each can take the WCA many seconds for a veteran.
		var listed error
		done := make(chan struct{})
		go func() {
			defer close(done)
			_, listed = wcaGet(wcaBase+"/persons/"+id+"/competitions", &competitions)
		}()
		_, err := wcaGet(wcaBase+"/persons/"+id+"/results", &results)
		<-done
		if err == errWcaMissing {
			return nil, errWcaUnknown
		}
		if err == nil {
			err = listed
		}
		if err != nil {
			return nil, err
		}
		sort.SliceStable(competitions, func(i, j int) bool { return competitions[i].Start > competitions[j].Start })
		place := map[string]int{}
		h := &wcaHistory{Competitions: []wcaBrief{}}
		for i, c := range competitions {
			place[c.ID] = i
			h.Competitions = append(h.Competitions, c.brief())
		}
		event := map[string]int{}
		for i, e := range wcaEvents {
			event[e] = i
		}
		sort.SliceStable(results, func(i, j int) bool {
			a, b := results[i], results[j]
			if a.Comp != b.Comp {
				return place[a.Comp] < place[b.Comp]
			}
			if a.Event != b.Event {
				return event[a.Event] < event[b.Event]
			}
			return wcaRoundOrder[a.Round] > wcaRoundOrder[b.Round]
		})
		h.Results = make([]wcaHistoryRow, len(results))
		for i, r := range results {
			h.Results[i] = wcaHistoryRow{r.Comp, r.Event, r.Round, r.row(), r.Country}
		}
		return h, nil
	})
}

// wcaCompetitions: a page of the competitions coming up (soonest first) or past (latest first), in a country, between
// two dates, or named so.
func wcaCompetitions(limit func() error, query map[string]string) (any, error) {
	page, _ := strconv.Atoi(query["page"])
	page = max(1, min(page, 400))
	from, to, country, text := query["from"], query["to"], strings.ToUpper(query["country"]), strings.TrimSpace(query["q"])
	if (from != "" && !wcaDate.MatchString(from)) || (to != "" && !wcaDate.MatchString(to)) || (country != "" && !wcaCountryCode.MatchString(country)) || len(text) > 60 {
		return nil, validation()
	}
	today := time.Now().UTC().Format("2006-01-02")
	params := url.Values{"per_page": {"25"}, "page": {strconv.Itoa(page)}}
	if query["status"] == "past" {
		// Over: ended before today.
		yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
		if to == "" || to > yesterday {
			to = yesterday
		}
		params.Set("sort", "-end_date")
	} else {
		if from < today {
			from = today
		}
		params.Set("sort", "start_date")
	}
	// The WCA's `start` keeps those ending on it or after, `end` those starting on it or before.
	if from != "" {
		params.Set("start", from)
	}
	if to != "" {
		params.Set("end", to)
	}
	if country != "" {
		params.Set("country_iso2", country)
	}
	if text != "" {
		params.Set("q", text)
	}
	return wcaMemo("competitions?"+params.Encode(), time.Hour, limit, func() (M, error) {
		var list []wcaUpstreamCompetition
		header, err := wcaGet(wcaBase+"/competitions?"+params.Encode(), &list)
		if err != nil {
			return nil, err
		}
		if query["status"] == "past" {
			// The WCA's `end` bounds the start: one still under way is not over.
			kept := list[:0:0]
			for _, c := range list {
				if c.End <= to {
					kept = append(kept, c)
				}
			}
			list = kept
		}
		items := []wcaBrief{}
		for _, c := range list {
			items = append(items, c.brief())
		}
		total, _ := strconv.Atoi(header.Get("Total"))
		return M{"items": items, "page": page, "pages": max(1, int(math.Ceil(float64(total)/25)))}, nil
	})
}

// wcaCompetitionInfo: a competition's page: where, when, its events, and whether its results are posted.
type wcaCompetitionInfo struct {
	wcaBrief
	Venue    string `json:"venue"`
	VenueURL string `json:"venueUrl,omitempty"`
	Address  string `json:"address"`
	Details  string `json:"details,omitempty"`
	Website  string `json:"website"`
	URL      string `json:"url"`
	Map      string `json:"map,omitempty"`
	Limit    int    `json:"limit,omitempty"`
	Results  bool   `json:"results"`
}

var wcaMarkdownLink = regexp.MustCompile(`^\[([^\]]*)\]\((https?://[^)\s]+)\)$`)

func wcaCompetition(limit func() error, id string) (*wcaCompetitionInfo, error) {
	return wcaMemo("competition/"+id, 6*time.Hour, limit, func() (*wcaCompetitionInfo, error) {
		var c wcaUpstreamCompetition
		if _, err := wcaGet(wcaBase+"/competitions/"+id, &c); err != nil {
			return nil, err
		}
		info := &wcaCompetitionInfo{wcaBrief: c.brief(), Venue: c.Venue, Address: c.Address, Details: c.Details, Website: c.Website, URL: c.URL, Limit: c.Limit, Results: c.Posted != nil}
		if m := wcaMarkdownLink.FindStringSubmatch(c.Venue); m != nil {
			info.Venue, info.VenueURL = m[1], m[2]
		}
		if c.Latitude != 0 || c.Longitude != 0 {
			info.Map = "https://www.openstreetmap.org/?mlat=" + strconv.FormatFloat(c.Latitude, 'f', 6, 64) + "&mlon=" + strconv.FormatFloat(c.Longitude, 'f', 6, 64) + "#map=16/" +
				strconv.FormatFloat(c.Latitude, 'f', 6, 64) + "/" + strconv.FormatFloat(c.Longitude, 'f', 6, 64)
		}
		return info, nil
	})
}

// wcaRound: a round of an event at a competition, its results by place.
type wcaRound struct {
	Round   string `json:"round"`
	Format  string `json:"format"`
	Results []struct {
		wcaWho
		wcaRow
	} `json:"results"`
}

// wcaCompetitionResults: an event's rounds at a competition, the final first; kept a week once posted, an hour before.
func wcaCompetitionResults(limit func() error, id, event string) ([]wcaRound, error) {
	info, err := wcaCompetition(limit, id)
	if err != nil {
		return nil, err
	}
	ttl := time.Hour
	if info.Results {
		ttl = 7 * 24 * time.Hour
	}
	return wcaMemo("competition/"+id+"/"+event, ttl, limit, func() ([]wcaRound, error) {
		var v struct {
			Rounds []struct {
				RoundTypeID string      `json:"roundTypeId"`
				Results     []wcaResult `json:"results"`
			} `json:"rounds"`
		}
		if _, err := wcaGet(wcaBase+"/competitions/"+id+"/results/"+event, &v); err != nil {
			return nil, err
		}
		rounds := []wcaRound{}
		for _, r := range v.Rounds {
			round := wcaRound{Round: r.RoundTypeID, Results: make([]struct {
				wcaWho
				wcaRow
			}, len(r.Results))}
			for i, x := range r.Results {
				round.Format = x.Format
				round.Results[i].wcaWho, round.Results[i].wcaRow = wcaWho{x.WcaID, x.Name, x.Country}, x.row()
			}
			rounds = append(rounds, round)
		}
		sort.SliceStable(rounds, func(i, j int) bool { return wcaRoundOrder[rounds[i].Round] > wcaRoundOrder[rounds[j].Round] })
		return rounds, nil
	})
}

// wcaRegion: "world", a continent as the rankings name it ("europe"), or a country's ISO 2 code ("FR").
func wcaRegion(region string) (string, bool) {
	if region == "" {
		return "world", true
	}
	if _, ok := wcaContinents[region]; ok || region == "world" {
		return region, true
	}
	region = strings.ToUpper(region)
	return region, wcaCountryCode.MatchString(region)
}

type wcaRanked struct {
	ID   string
	Best int
	Rank int
}

// wcaRankList: the top of a ranking, by its rank in the region, and how many are ranked in all.
type wcaRankList struct {
	Total int
	Items []wcaRanked
}

func wcaRankFile(limit func() error, region, kind, event string) (*wcaRankList, error) {
	return wcaMemo("rank/"+region+"/"+kind+"/"+event, 24*time.Hour, limit, func() (*wcaRankList, error) {
		var file struct {
			Total int `json:"total"`
			Items []struct {
				PersonID string `json:"personId"`
				Best     int    `json:"best"`
				Rank     struct{ World, Continent, Country int }
			} `json:"items"`
		}
		_, err := wcaGet(wcaRankBase+"/rank/"+region+"/"+kind+"/"+event+".json", &file)
		if err == errWcaMissing {
			// Nobody of that region in that event.
			return &wcaRankList{Items: []wcaRanked{}}, nil
		}
		if err != nil {
			return nil, err
		}
		out := &wcaRankList{Total: file.Total, Items: make([]wcaRanked, 0, len(file.Items))}
		seen := map[string]bool{}
		for _, it := range file.Items {
			// The export lists a few people twice.
			if seen[it.PersonID] {
				continue
			}
			seen[it.PersonID] = true
			rank := it.Rank.Country
			if region == "world" {
				rank = it.Rank.World
			} else if _, ok := wcaContinents[region]; ok {
				rank = it.Rank.Continent
			}
			out.Items = append(out.Items, wcaRanked{it.PersonID, it.Best, rank})
		}
		sort.SliceStable(out.Items, func(i, j int) bool { return out.Items[i].Rank < out.Items[j].Rank })
		return out, nil
	})
}

type wcaRankRow struct {
	Rank int `json:"rank"`
	wcaWho
	Best int `json:"best"`
}

// wcaRankings: a page of a ranking; `person` the page they are on, `q` the people of that name in it.
func wcaRankings(limit func() error, event, kind string, query map[string]string) (any, error) {
	region, ok := wcaRegion(query["region"])
	if !ok || (kind != "single" && kind != "average") || !wcaKnownEvent(event) {
		return nil, validation()
	}
	ranked, err := wcaRankFile(limit, region, kind, event)
	if err != nil {
		return nil, err
	}
	items, pages := ranked.Items, max(1, (len(ranked.Items)+wcaPage-1)/wcaPage)
	page, _ := strconv.Atoi(query["page"])
	var shown []wcaRanked
	if text := strings.TrimSpace(query["q"]); text != "" {
		if len(text) < 2 || len(text) > 60 {
			return nil, validation()
		}
		people, err := wcaSearch(limit, text)
		if err != nil {
			return nil, err
		}
		named := map[string]bool{}
		for _, p := range people {
			named[p.ID] = true
		}
		for _, it := range items {
			if named[it.ID] && len(shown) < wcaPage {
				shown = append(shown, it)
			}
		}
		page = 0
	} else {
		if person := strings.ToUpper(query["person"]); person != "" {
			at := -1
			for i, it := range items {
				if it.ID == person {
					at = i
					break
				}
			}
			if at < 0 {
				return nil, apiErr(404, "Not in this ranking")
			}
			page = at/wcaPage + 1
		}
		page = max(1, min(page, pages))
		shown = items[min((page-1)*wcaPage, len(items)):min(page*wcaPage, len(items))]
	}
	ids := make([]string, len(shown))
	for i, it := range shown {
		ids[i] = it.ID
	}
	who, err := wcaWhoOf(limit, ids)
	if err != nil {
		return nil, err
	}
	in, err := wcaInRegion(limit, region, len(shown) > 0)
	if err != nil {
		return nil, err
	}
	rows := []wcaRankRow{}
	for _, it := range shown {
		w := who[it.ID]
		if !in(w.Country) {
			continue
		}
		rows = append(rows, wcaRankRow{it.Rank, w, it.Best})
	}
	return M{"rows": rows, "page": page, "pages": pages, "ranked": ranked.Total}, nil
}

// wcaInRegion: whether a person of that country belongs to the region: the export files a few people under a country
// (and its continent) they no longer represent. `needed` false: no country list asked for.
func wcaInRegion(limit func() error, region string, needed bool) (func(country string) bool, error) {
	if region == "world" || !needed {
		return func(string) bool { return true }, nil
	}
	if len(region) == 2 {
		return func(country string) bool { return country == "" || country == region }, nil
	}
	countries, err := wcaCountries(limit)
	if err != nil {
		return nil, err
	}
	continent := map[string]string{}
	for _, c := range countries {
		continent[c.ISO2] = c.Continent
	}
	return func(country string) bool { c, ok := continent[country]; return !ok || c == region }, nil
}

func wcaKnownEvent(event string) bool {
	for _, e := range wcaEvents {
		if e == event {
			return true
		}
	}
	return false
}

// wcaSearch: the people of that name or WCA ID.
func wcaSearch(limit func() error, text string) ([]wcaWho, error) {
	return wcaMemo("search/"+strings.ToLower(text), time.Hour, limit, func() ([]wcaWho, error) {
		var v struct {
			Result []wcaUpstreamPerson `json:"result"`
		}
		if _, err := wcaGet(wcaBase+"/search/persons?q="+url.QueryEscape(text), &v); err != nil {
			return nil, err
		}
		out := []wcaWho{}
		for _, r := range v.Result {
			if r.WcaID != "" {
				out = append(out, wcaWho{r.WcaID, r.Name, r.Country})
			}
		}
		wcaRemember(out)
		return out, nil
	})
}

type wcaCountry struct {
	ID        string `json:"-"`
	ISO2      string `json:"iso2"`
	Name      string `json:"name"`
	Continent string `json:"continent"`
}

// wcaCountries: the WCA's countries, by name, each with its continent as the rankings name it; without the codes
// standing for several countries (XA, XE…).
func wcaCountries(limit func() error) ([]wcaCountry, error) {
	return wcaMemo("countries", 7*24*time.Hour, limit, func() ([]wcaCountry, error) {
		var list []struct {
			ID, Name, Iso2 string
			Continent      string `json:"continent_id"`
		}
		if _, err := wcaGet(wcaBase+"/countries", &list); err != nil {
			return nil, err
		}
		out := []wcaCountry{}
		for _, c := range list {
			if len(c.Iso2) == 2 && (c.Iso2[0] != 'X' || c.Iso2 == "XK") {
				out = append(out, wcaCountry{c.ID, c.Iso2, c.Name, strings.ToLower(strings.ReplaceAll(strings.TrimPrefix(c.Continent, "_"), " ", "-"))})
			}
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
		return out, nil
	})
}

type wcaHeld struct {
	Best    int      `json:"best"`
	Holders []wcaWho `json:"holders"`
}

type wcaRecordRow struct {
	Event   string   `json:"event"`
	Single  *wcaHeld `json:"single,omitempty"`
	Average *wcaHeld `json:"average,omitempty"`
}

// wcaRecords: the region's records per event (the world's, a continent's or a country's), each with who holds it: the
// value from the WCA, its holders the top of the region's ranking at that value. Someone who set it and has since
// moved to another country is in the region's file with their best of any time, not the record (wcaSetBy).
func wcaRecords(limit func() error, region string) ([]wcaRecordRow, error) {
	return wcaMemo("records/"+region, 24*time.Hour, limit, func() ([]wcaRecordRow, error) {
		var all struct {
			World       map[string]map[string]int            `json:"world_records"`
			Continental map[string]map[string]map[string]int `json:"continental_records"`
			National    map[string]map[string]map[string]int `json:"national_records"`
		}
		if _, err := wcaGet(wcaBase+"/records", &all); err != nil {
			return nil, err
		}
		values := all.World
		if continent, ok := wcaContinents[region]; ok {
			values = all.Continental[continent]
		} else if region != "world" {
			countries, err := wcaCountries(limit)
			if err != nil {
				return nil, err
			}
			values = nil
			for _, c := range countries {
				if c.ISO2 == region {
					values = all.National[c.ID]
				}
			}
		}
		rows := []wcaRecordRow{}
		type job struct {
			row  int
			kind string
			held *wcaHeld
		}
		jobs := []job{}
		for _, event := range wcaEvents {
			if values[event]["single"] <= 0 {
				continue
			}
			row := wcaRecordRow{Event: event, Single: &wcaHeld{Best: values[event]["single"]}}
			jobs = append(jobs, job{len(rows), "single", row.Single})
			if best := values[event]["average"]; best > 0 {
				row.Average = &wcaHeld{Best: best}
				jobs = append(jobs, job{len(rows), "average", row.Average})
			}
			rows = append(rows, row)
		}
		// The rankings' files, six at a time.
		// Per record, those ranked at its value or better.
		holders := make([][]wcaRanked, len(jobs))
		var wait sync.WaitGroup
		var failed error
		var mu sync.Mutex
		slots := make(chan struct{}, 6)
		for i, j := range jobs {
			wait.Add(1)
			go func() {
				defer wait.Done()
				slots <- struct{}{}
				defer func() { <-slots }()
				ranked, err := wcaRankFile(limit, region, j.kind, rows[j.row].Event)
				if err != nil {
					mu.Lock()
					failed = err
					mu.Unlock()
					return
				}
				for _, it := range ranked.Items {
					if it.Best <= j.held.Best {
						holders[i] = append(holders[i], it)
					} else if len(holders[i]) > 0 {
						break
					}
				}
			}()
		}
		wait.Wait()
		if failed != nil {
			return nil, failed
		}
		ids := []string{}
		for _, h := range holders {
			for _, it := range h {
				ids = append(ids, it.ID)
			}
		}
		who, err := wcaWhoOf(limit, ids)
		if err != nil {
			return nil, err
		}
		in, err := wcaInRegion(limit, region, len(ids) > 0)
		if err != nil {
			return nil, err
		}
		for i, j := range jobs {
			j.held.Holders = []wcaWho{}
			for _, it := range holders[i] {
				if w := who[it.ID]; it.Best == j.held.Best && in(w.Country) {
					j.held.Holders = append(j.held.Holders, w)
				}
			}
			if len(j.held.Holders) == 0 {
				if j.held.Holders, err = wcaSetBy(limit, holders[i], rows[j.row].Event, j.kind, j.held.Best, in, who); err != nil {
					return nil, err
				}
			}
		}
		return rows, nil
	})
}

// wcaSetBy: who of `ranked` (at the record's value or better in the region's file) set it there: a result of theirs
// at that value, under a country of the region; named with that country. The first five asked, their results kept.
func wcaSetBy(limit func() error, ranked []wcaRanked, event, kind string, best int, in func(country string) bool, who map[string]wcaWho) ([]wcaWho, error) {
	out := []wcaWho{}
	for _, it := range ranked[:min(len(ranked), 5)] {
		history, err := wcaPersonResults(limit, it.ID)
		if err == errWcaUnknown {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, r := range history.Results {
			value := r.Best
			if kind == "average" {
				value = r.Average
			}
			if r.Event == event && value == best && r.Country != "" && in(r.Country) {
				out = append(out, wcaWho{it.ID, who[it.ID].Name, r.Country})
				break
			}
		}
	}
	return out, nil
}

// wcaRoute: `GET /api/wca/…`, open to guests too:
//
//	persons/<WCA ID>                     a person, their PRs, medals and records
//	persons/<WCA ID>/results             their results, per competition, event and round
//	search?q=                            people by name or WCA ID
//	rankings/<event>/<single|average>    ?region=world|<continent>|<ISO 2>&page= or &person=<WCA ID> or &q=<name>
//	records?region=                      the records of the world, a continent or a country
//	competitions                         ?status=upcoming|past&country=&from=&to=&q=&page=
//	competitions/<id>                    a competition
//	competitions/<id>/results/<event>    its results in that event, by round
//	countries                            the countries, with their continents
func wcaRoute(state *AppState, ip, path string, query map[string]string) (any, error) {
	limit := sync.OnceValue(func() error { return apiLimited(state, "wca@"+ip, 120) })
	parts := strings.Split(path, "/")
	switch {
	case path == "countries":
		return wcaCountries(limit)
	case path == "search":
		text := strings.TrimSpace(query["q"])
		if len(text) < 2 || len(text) > 60 {
			return nil, validation()
		}
		return wcaSearch(limit, text)
	case path == "records":
		region, ok := wcaRegion(query["region"])
		if !ok {
			return nil, validation()
		}
		return wcaRecords(limit, region)
	case path == "competitions":
		return wcaCompetitions(limit, query)
	case parts[0] == "rankings" && len(parts) == 3:
		return wcaRankings(limit, parts[1], parts[2], query)
	case parts[0] == "persons" && (len(parts) == 2 || len(parts) == 3 && parts[2] == "results"):
		id := strings.ToUpper(parts[1])
		if !wcaID.MatchString(id) {
			return nil, validation()
		}
		if len(parts) == 2 {
			return wcaPerson(limit, id)
		}
		return wcaPersonResults(limit, id)
	case parts[0] == "competitions" && (len(parts) == 2 || len(parts) == 4 && parts[2] == "results"):
		if !wcaCompetitionID.MatchString(parts[1]) || len(parts) == 4 && !wcaKnownEvent(parts[3]) {
			return nil, validation()
		}
		if len(parts) == 2 {
			return wcaCompetition(limit, parts[1])
		}
		return wcaCompetitionResults(limit, parts[1], parts[3])
	}
	return nil, apiErr(404, "Not found")
}
