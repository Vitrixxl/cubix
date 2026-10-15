package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

// The WCA's answers come through, trimmed, once per 12 hours; an unknown ID, a malformed one and a WCA down are told
// apart, and an answer kept from before serves while the WCA is down. A fake WCA stands in for the real one.
func TestWcaProxy(t *testing.T) {
	future := time.Now().UTC().AddDate(0, 1, 0).Format("2006-01-02")
	later := time.Now().UTC().AddDate(0, 2, 0).Format("2006-01-02")
	hits := map[string]int{}
	wca := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits[r.URL.Path]++
		switch r.URL.Path {
		case "/persons/2009ZEMD01":
			fmt.Fprint(w, `{"person":{"name":"Feliks Zemdegs","wca_id":"2009ZEMD01","country":{"id":"Australia","name":"Australia","iso2":"AU"}},
				"competition_count":178,"personal_records":{"333":{"single":{"id":1,"person_id":"2009ZEMD01","event_id":"333","best":412,"world_rank":56,"continent_rank":4,"country_rank":4},
				"average":{"best":553,"world_rank":53,"continent_rank":2,"country_rank":2}}},"medals":{}}`)
		case "/persons/2016NOCO01":
			fmt.Fprint(w, `{"person":{"name":"No Comp","wca_id":"2016NOCO01","country":{"name":"France","iso2":"FR"}},"competition_count":1,"personal_records":{}}`)
		case "/users/2009ZEMD01":
			fmt.Fprintf(w, `{"user":{},"upcoming_competitions":[{"id":"Late","name":"Late Open","start_date":%q,"end_date":%q},
				{"id":"Soon","name":"Soon Open","city":"Paris","country_iso2":"FR","start_date":%q,"end_date":%q,"url":"https://www.worldcubeassociation.org/competitions/Soon"},
				{"id":"Past","start_date":"2020-01-01","end_date":"2020-01-02"}]}`, later, later, future, future)
		case "/competitions":
			if r.URL.Query().Get("country_iso2") != "FR" || r.URL.Query().Get("start") == "" {
				t.Errorf("asked %v", r.URL.RawQuery)
			}
			fmt.Fprintf(w, `[{"id":"B","start_date":%q,"end_date":%q},{"id":"A","start_date":%q,"end_date":%q}]`, later, later, future, future)
		default:
			http.NotFound(w, r)
		}
	}))
	wcaBase, wcaCache.entries = wca.URL, nil
	state := &AppState{attempts: map[string]*attempt{}}

	value, err := wcaRoute(state, "ip", "persons/2009zemd01")
	person, _ := value.(*WcaPerson)
	if err != nil || person.Name != "Feliks Zemdegs" || person.Country != "AU" || person.Competitions != 178 ||
		person.Records["333"]["single"] != (wcaRecord{412, 56, 4, 4}) || person.Records["333"]["average"].Best != 553 {
		t.Fatal(value, err)
	}
	if encodeJSON(person.Records["333"]["single"]) != `{"best":412,"world_rank":56,"continent_rank":4,"country_rank":4}` {
		t.Fatal(encodeJSON(person.Records["333"]["single"]))
	}
	if _, err := wcaRoute(state, "ip", "persons/2009ZEMD01"); err != nil || hits["/persons/2009ZEMD01"] != 1 {
		t.Fatal("not cached", hits, err)
	}
	for path, status := range map[string]int{"persons/2009ZEMD1": 422, "persons/../x": 422, "persons/2020UNKN01": 404, "people/2009ZEMD01": 404} {
		if _, err := wcaRoute(state, "ip", path); err == nil || toApiError(err).Status != status {
			t.Fatal(path, err)
		}
	}

	// Their own competitions coming up, soonest first; none: their country's.
	value, err = wcaRoute(state, "ip", "competitions/2009ZEMD01")
	list, _ := value.(M)["competitions"].([]wcaCompetition)
	if err != nil || value.(M)["mine"] != true || len(list) != 2 || list[0].ID != "Soon" || list[0].City != "Paris" || list[1].ID != "Late" {
		t.Fatal(value, err)
	}
	value, err = wcaRoute(state, "ip", "competitions/2016NOCO01")
	list, _ = value.(M)["competitions"].([]wcaCompetition)
	if err != nil || value.(M)["mine"] != false || value.(M)["country"] != "FR" || len(list) != 2 || list[0].ID != "A" {
		t.Fatal(value, err)
	}

	// The WCA down: an answer kept, even expired, still serves; nothing kept is a 503.
	wca.Close()
	entry := wcaCache.entries["/persons/2009ZEMD01"]
	entry.until = time.Now().Add(-time.Minute)
	wcaCache.entries["/persons/2009ZEMD01"] = entry
	if value, err := wcaRoute(state, "ip", "persons/2009ZEMD01"); err != nil || value.(*WcaPerson).Name != "Feliks Zemdegs" {
		t.Fatal(value, err)
	}
	if _, err := wcaRoute(state, "ip", "persons/2015ABCD01"); err == nil || toApiError(err).Status != 503 {
		t.Fatal(err)
	}
	// Misses are limited per client: 60 every 15 minutes.
	for i := 0; i < 70; i++ {
		_, err = wcaRoute(state, "flood", fmt.Sprintf("persons/2015ABCD%02d", i))
	}
	if err == nil || toApiError(err).Status != 429 {
		t.Fatal(err)
	}
}

// The profile's WCA ID is checked like its other fields.
func TestJourneyWcaID(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	_ = db.Call(func(c *Conn) error {
		if _, err := c.Exec("INSERT INTO users(id,username) VALUES('u','sam')"); err != nil {
			t.Fatal(err)
		}
		put := func(id any) error {
			_, err := journeyPut(c, "u", M{"key": "profile", "value": M{"kind": "profile", "knownPuzzles": []any{"333"}, "priority": nil,
				"completedAt": "2026-10-10T08:00:00.000Z", "wcaId": id}})
			return err
		}
		if err := put("2009ZEMD01"); err != nil {
			t.Fatal(err)
		}
		for _, id := range []any{"2009zemd01", "2009ZEMD1", "", 2009, nil} {
			if put(id) == nil {
				t.Fatal(id, "accepted")
			}
		}
		// What a coach's profile shows of it.
		if row, err := dbOne(c, "SELECT json_extract(value,'$.wcaId') id FROM personal_entries WHERE user_id=? AND key='profile'", "u"); err != nil || idx(row, "id") != "2009ZEMD01" {
			t.Fatal(row, err)
		}
		return nil
	})
}
