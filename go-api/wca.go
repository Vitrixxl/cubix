package main

// WCA: a player's official results and the competitions coming up, read from the World Cube Association's public API
// (no account, no OAuth) and kept here 12 hours, so the apps do not depend on the WCA's CORS and the WCA is asked at
// most twice a day per person or country. The WCA ID itself is the player's word (the journey profile's `wcaId`); a
// link verified with the WCA's OAuth would be stored apart, by the server, once an application is registered there.

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// wcaBase: the WCA's API; the tests point it at a fake server.
var wcaBase = "https://www.worldcubeassociation.org/api/v0"

// wcaID: a WCA ID, the year of a first competition, four letters of the name and a number: 2009ZEMD01.
var wcaID = regexp.MustCompile(`^[0-9]{4}[A-Z]{4}[0-9]{2}$`)

const wcaTTL = 12 * time.Hour

var (
	errWcaUnknown = apiErr(404, "Unknown WCA ID.")
	errWcaDown    = apiErr(503, "The WCA cannot be reached.")
)

// wcaCache: the WCA's answers by path, until they expire; an expired one still serves while the WCA is down.
var wcaCache struct {
	sync.Mutex
	entries map[string]wcaEntry
}

type wcaEntry struct {
	body  []byte
	until time.Time
}

// wcaFetch: the WCA's answer to `path`, from the cache when fresh. Only misses count against the client's allowance.
func wcaFetch(state *AppState, ip, path string) ([]byte, error) {
	wcaCache.Lock()
	cached, ok := wcaCache.entries[path]
	wcaCache.Unlock()
	if ok && time.Now().Before(cached.until) {
		return cached.body, nil
	}
	if err := apiLimited(state, "wca@"+ip, 60); err != nil {
		return nil, err
	}
	client := http.Client{Timeout: 10 * time.Second}
	res, err := client.Get(wcaBase + path)
	if err == nil {
		defer res.Body.Close()
	}
	if err == nil && res.StatusCode == 404 {
		return nil, errWcaUnknown
	}
	var body json.RawMessage
	if err != nil || res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&body) != nil {
		if ok {
			return cached.body, nil
		}
		return nil, errWcaDown
	}
	wcaCache.Lock()
	defer wcaCache.Unlock()
	// ponytail: emptied whole when full; an LRU if 2000 people and countries a day ever get asked about.
	if wcaCache.entries == nil || len(wcaCache.entries) >= 2000 {
		wcaCache.entries = map[string]wcaEntry{}
	}
	wcaCache.entries[path] = wcaEntry{body, time.Now().Add(wcaTTL)}
	return body, nil
}

type wcaRecord struct {
	Best          int `json:"best"`
	WorldRank     int `json:"world_rank"`
	ContinentRank int `json:"continent_rank"`
	CountryRank   int `json:"country_rank"`
}

// WcaPerson: what the apps show of a person: name, country, competitions and, per event, the single and average PRs.
type WcaPerson struct {
	ID           string                          `json:"id"`
	Name         string                          `json:"name"`
	Country      string                          `json:"country"`
	CountryName  string                          `json:"countryName"`
	Competitions int                             `json:"competitions"`
	Records      map[string]map[string]wcaRecord `json:"records"`
}

func wcaPerson(state *AppState, ip, id string) (*WcaPerson, error) {
	body, err := wcaFetch(state, ip, "/persons/"+id)
	if err != nil {
		return nil, err
	}
	var v struct {
		Person struct {
			Name    string
			WcaID   string `json:"wca_id"`
			Country struct{ Name, Iso2 string }
		}
		CompetitionCount int                             `json:"competition_count"`
		PersonalRecords  map[string]map[string]wcaRecord `json:"personal_records"`
	}
	if json.Unmarshal(body, &v) != nil || v.Person.WcaID != id {
		return nil, errWcaDown
	}
	if v.PersonalRecords == nil {
		v.PersonalRecords = map[string]map[string]wcaRecord{}
	}
	return &WcaPerson{id, v.Person.Name, v.Person.Country.Iso2, v.Person.Country.Name, v.CompetitionCount, v.PersonalRecords}, nil
}

type wcaCompetition struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	City    string `json:"city"`
	Country string `json:"country_iso2"`
	Start   string `json:"start_date"`
	End     string `json:"end_date"`
	URL     string `json:"url"`
}

// wcaCompetitions: the competitions coming up the person takes part in (as the WCA's user page lists them); none, those
// of their country.
func wcaCompetitions(state *AppState, ip, id string) (M, error) {
	today := time.Now().UTC().Format("2006-01-02")
	upcoming := func(list []wcaCompetition) []wcaCompetition {
		out := []wcaCompetition{}
		for _, c := range list {
			if c.End >= today {
				out = append(out, c)
			}
		}
		sort.SliceStable(out, func(i, j int) bool { return out[i].Start < out[j].Start })
		return out
	}
	// A WCA ID without a WCA website account has no user page: a 404, not an error.
	if body, err := wcaFetch(state, ip, "/users/"+id+"?upcoming_competitions=true"); err == nil {
		var v struct {
			Upcoming []wcaCompetition `json:"upcoming_competitions"`
		}
		if json.Unmarshal(body, &v) == nil {
			if list := upcoming(v.Upcoming); len(list) > 0 {
				return M{"mine": true, "competitions": list}, nil
			}
		}
	} else if err != errWcaUnknown {
		return nil, err
	}
	person, err := wcaPerson(state, ip, id)
	if err != nil {
		return nil, err
	}
	var list []wcaCompetition
	if person.Country != "" {
		body, err := wcaFetch(state, ip, "/competitions?country_iso2="+url.QueryEscape(person.Country)+"&start="+today)
		if err != nil {
			return nil, err
		}
		if json.Unmarshal(body, &list) != nil {
			return nil, errWcaDown
		}
	}
	return M{"mine": false, "country": person.Country, "competitions": upcoming(list)}, nil
}

// wcaRoute: `GET /api/wca/persons/<WCA ID>` and `GET /api/wca/competitions/<WCA ID>`, open to guests too.
func wcaRoute(state *AppState, ip, path string) (any, error) {
	kind, id, _ := strings.Cut(path, "/")
	id = strings.ToUpper(id)
	if !wcaID.MatchString(id) {
		return nil, validation()
	}
	switch kind {
	case "persons":
		return wcaPerson(state, ip, id)
	case "competitions":
		return wcaCompetitions(state, ip, id)
	}
	return nil, apiErr(404, "Not found")
}
