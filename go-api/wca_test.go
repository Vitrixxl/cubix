package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The WCA's answers come through, trimmed, and are kept: a person, their results; an unknown ID, a malformed one and
// a WCA down are told apart, and an answer kept from before serves while the WCA is down. A fake WCA stands in.
func TestWcaProxy(t *testing.T) {
	hits := map[string]int{}
	wca := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits[r.URL.Path]++
		switch r.URL.Path {
		case "/persons/2009ZEMD01":
			fmt.Fprint(w, `{"person":{"name":"Feliks Zemdegs","gender":"m","wca_id":"2009ZEMD01","country":{"id":"Australia","name":"Australia","iso2":"AU"}},
				"competition_count":178,"personal_records":{"333":{"single":{"id":1,"person_id":"2009ZEMD01","event_id":"333","best":412,"world_rank":56,"continent_rank":4,"country_rank":4},
				"average":{"best":553,"world_rank":53,"continent_rank":2,"country_rank":2}}},"medals":{"gold":801,"silver":168,"bronze":82,"total":1051},"records":{"national":7,"continental":228,"world":121,"total":356}}`)
		case "/persons/2009ZEMD01/results":
			fmt.Fprint(w, `[{"pos":3,"best":900,"average":1100,"competition_id":"Old","event_id":"333","round_type_id":"f","format_id":"a","attempts":[900,1000,1100,1200,-1]},
				{"pos":1,"best":500,"average":600,"competition_id":"New","event_id":"222","round_type_id":"1","attempts":[500,600,700]},
				{"pos":2,"best":412,"average":700,"competition_id":"New","event_id":"333","round_type_id":"1","attempts":[412],"regional_single_record":"WR"},
				{"pos":1,"best":450,"average":550,"competition_id":"New","event_id":"333","round_type_id":"f","attempts":[450]}]`)
		case "/persons/2009ZEMD01/competitions":
			fmt.Fprint(w, `[{"id":"Old","name":"Old Open","start_date":"2010-01-01","end_date":"2010-01-01","event_ids":["333"]},
				{"id":"New","name":"New Open","start_date":"2020-01-01","end_date":"2020-01-02","event_ids":["333","222"]}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	wcaBase, wcaCache.index, wcaCache.size = wca.URL, nil, 0
	state := &AppState{attempts: map[string]*attempt{}}
	route := func(path string, query map[string]string) (any, error) { return wcaRoute(state, "ip", path, query) }

	value, err := route("persons/2009zemd01", nil)
	person, _ := value.(*WcaPerson)
	if err != nil || person.Name != "Feliks Zemdegs" || person.Country != "AU" || person.Competitions != 178 || person.Gender != "m" ||
		person.Records["333"]["single"] != (wcaRecord{412, 56, 4, 4}) || person.Records["333"]["average"].Best != 553 ||
		person.Medals.Gold != 801 || person.RecordsSet.World != 121 {
		t.Fatal(value, err)
	}
	if encodeJSON(person.Records["333"]["single"]) != `{"best":412,"world_rank":56,"continent_rank":4,"country_rank":4}` {
		t.Fatal(encodeJSON(person.Records["333"]["single"]))
	}
	if _, err := route("persons/2009ZEMD01", nil); err != nil || hits["/persons/2009ZEMD01"] != 1 {
		t.Fatal("not cached", hits, err)
	}
	for path, status := range map[string]int{"persons/2009ZEMD1": 422, "persons/../x": 404, "persons/2020UNKN01": 404, "people/2009ZEMD01": 404, "competitions/a.b": 422, "competitions/WC2025/results/magic": 422} {
		if _, err := route(path, nil); err == nil || toApiError(err).Status != status {
			t.Fatal(path, err)
		}
	}

	// Their results: the latest competition first, the WCA's order of events, the final before the first round.
	value, err = route("persons/2009ZEMD01/results", nil)
	history, _ := value.(*wcaHistory)
	if err != nil || len(history.Competitions) != 2 || history.Competitions[0].ID != "New" {
		t.Fatal(value, err)
	}
	order := ""
	for _, r := range history.Results {
		order += r.Competition + ":" + r.Event + ":" + r.Round + " "
	}
	if order != "New:333:f New:333:1 New:222:1 Old:333:f " || history.Results[1].Single != "WR" || len(history.Results[3].Attempts) != 5 {
		t.Fatal(order, history.Results)
	}

	// The WCA down: an answer kept, even expired, still serves; nothing kept is a 503.
	wca.Close()
	wcaCache.index["person/2009ZEMD01"].Value.(*wcaEntry).until = time.Now().Add(-time.Minute)
	if value, err := route("persons/2009ZEMD01", nil); err != nil || value.(*WcaPerson).Name != "Feliks Zemdegs" {
		t.Fatal(value, err)
	}
	if _, err := route("persons/2015ABCD01", nil); err == nil || toApiError(err).Status != 503 {
		t.Fatal(err)
	}
	// Misses are limited per client: 120 every 15 minutes, a request counting once.
	for i := 0; i < 130; i++ {
		_, err = wcaRoute(state, "flood", fmt.Sprintf("persons/2015ABCD%02d", i%100), nil)
	}
	if err == nil || toApiError(err).Status != 429 {
		t.Fatal(err)
	}
}

// The rankings: the export's top of a region by rank, its names from the WCA, a page, a person's page, the people of a
// name; the records with their holders; the competitions and a competition's results.
func TestWcaRankingsRecordsCompetitions(t *testing.T) {
	asked := []string{}
	wca := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path+"?"+r.URL.RawQuery)
		q := r.URL.Query()
		switch r.URL.Path {
		case "/rank/FR/single/333.json":
			items := []string{}
			for i := 120; i >= 1; i-- {
				items = append(items, fmt.Sprintf(`{"personId":"20%02dPERS%02d","best":%d,"rank":{"world":%d,"continent":%d,"country":%d}}`, i/100, i%100, 400+i, i*10, i*3, i))
			}
			// One filed under France who no longer represents it.
			items = append(items, `{"personId":"2016UKAJ01","best":401,"rank":{"world":5,"continent":2,"country":1}}`)
			fmt.Fprintf(w, `{"total":4812,"items":[%s]}`, strings.Join(items, ","))
		case "/rank/europe/single/333.json":
			// Listed twice, and one now representing a country of Asia.
			fmt.Fprint(w, `{"total":3,"items":[{"personId":"2000PERS01","best":401,"rank":{"continent":1}},{"personId":"2000PERS01","best":401,"rank":{"continent":1}},
				{"personId":"2000ASIA01","best":402,"rank":{"continent":2}},{"personId":"2016UKAJ01","best":403,"rank":{"continent":3}}]}`)
		case "/countries":
			fmt.Fprint(w, `[{"id":"France","name":"France","iso2":"FR","continent_id":"_Europe"},{"id":"Kosovo","name":"Kosovo","iso2":"XK","continent_id":"_Europe"},{"id":"Japan","name":"Japan","iso2":"JP","continent_id":"_Asia"}]`)
		case "/rank/world/single/333.json":
			fmt.Fprint(w, `{"total":9,"items":[{"personId":"2023GENG02","best":251,"rank":{"world":1}},{"personId":"2009ZEMD01","best":300,"rank":{"world":2}}]}`)
		case "/rank/world/average/333.json":
			fmt.Fprint(w, `{"total":9,"items":[{"personId":"2019WANY36","best":351,"rank":{"world":1}}]}`)
		case "/persons":
			out := []string{}
			for _, id := range strings.Split(q.Get("wca_ids"), ",") {
				country := "FR"
				if id == "2016UKAJ01" {
					country = "XK"
				} else if id == "2000ASIA01" {
					country = "JP"
				}
				out = append(out, fmt.Sprintf(`{"person":{"wca_id":%q,"name":"Name %s","country_iso2":%q}}`, id, id, country))
			}
			fmt.Fprintf(w, "[%s]", strings.Join(out, ","))
		case "/search/persons":
			fmt.Fprint(w, `{"result":[{"wca_id":"2000PERS07","name":"Name 2000PERS07","country_iso2":"FR"},{"wca_id":"","name":"No ID"},{"wca_id":"2000PERS77","name":"Elsewhere"},{"wca_id":"2009ZEMD01","name":"Not ranked here"}]}`)
		case "/records":
			fmt.Fprint(w, `{"world_records":{"333":{"single":251,"average":351},"333mbf":{"single":380350302}},"continental_records":{"_Europe":{"333":{"single":401,"average":400}}},"national_records":{}}`)
		case "/rank/europe/average/333.json":
			// The record's holder, now of Asia, filed with a better average set since.
			fmt.Fprint(w, `{"total":2,"items":[{"personId":"2000ASIA01","best":380,"rank":{"continent":1}},{"personId":"2000PERS01","best":420,"rank":{"continent":2}}]}`)
		case "/persons/2000ASIA01/results":
			fmt.Fprint(w, `[{"best":350,"average":380,"event_id":"333","country_iso2":"JP","competition_id":"B"},{"best":390,"average":400,"event_id":"333","country_iso2":"FR","competition_id":"A"}]`)
		case "/persons/2000ASIA01/competitions":
			fmt.Fprint(w, `[]`)
		case "/competitions":
			w.Header().Set("Total", "51")
			fmt.Fprintf(w, `[{"id":"Soon","name":"Soon Open","city":"Paris","country_iso2":"FR","start_date":"2030-01-01","end_date":"2030-01-02","event_ids":["333"],"cancelled_at":null},
				{"id":"Still","start_date":"2000-01-01","end_date":"2999-01-01"},{"id":"Done","start_date":"2001-01-01","end_date":"2001-01-02"}]`)
		case "/competitions/Soon":
			fmt.Fprint(w, `{"id":"Soon","name":"Soon Open","venue":"[Hall](https://hall.example)","latitude_degrees":48.5,"longitude_degrees":2.25,"results_posted_at":"2030-01-03T00:00:00Z","event_ids":["333"]}`)
		case "/competitions/Soon/results/333":
			fmt.Fprint(w, `{"id":"333","rounds":[{"roundTypeId":"1","results":[{"pos":1,"best":500,"average":600,"name":"A","wca_id":"2000PERS01","country_iso2":"FR","format_id":"a","attempts":[500,600,700,800,900]}]},{"roundTypeId":"f","results":[]}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer wca.Close()
	wcaBase, wcaRankBase, wcaCache.index, wcaCache.size, wcaNames.known = wca.URL, wca.URL, nil, 0, nil
	state := &AppState{attempts: map[string]*attempt{}}
	route := func(path string, query map[string]string) M {
		t.Helper()
		value, err := wcaRoute(state, "ip", path, query)
		if err != nil {
			t.Fatal(path, query, err)
		}
		var out M
		_ = json.Unmarshal([]byte(encodeJSON(value)), &out)
		return out
	}

	// By rank, 50 a page; the one filed under the wrong country left out.
	page := route("rankings/333/single", map[string]string{"region": "fr"})
	rows := page["rows"].([]any)
	first := rows[0].(map[string]any)
	if page["pages"] != 3.0 || page["page"] != 1.0 || page["ranked"] != 4812.0 || len(rows) != 49 || first["id"] != "2000PERS01" || first["rank"] != 1.0 || first["name"] != "Name 2000PERS01" || first["best"] != 401.0 {
		t.Fatal(page)
	}
	page = route("rankings/333/single", map[string]string{"region": "FR", "person": "2001pers20"})
	if page["page"] != 3.0 || len(page["rows"].([]any)) != 21 {
		t.Fatal(page)
	}
	page = route("rankings/333/single", map[string]string{"region": "FR", "q": "name"})
	if rows := page["rows"].([]any); len(rows) != 2 || rows[0].(map[string]any)["id"] != "2000PERS07" {
		t.Fatal(page)
	}
	for _, query := range []map[string]string{{"region": "Mars"}, {"region": "FR", "q": "x"}} {
		if _, err := wcaRoute(state, "ip", "rankings/333/single", query); err == nil || toApiError(err).Status != 422 {
			t.Fatal(query, err)
		}
	}
	if _, err := wcaRoute(state, "ip", "rankings/333/single", map[string]string{"region": "FR", "person": "2009ZEMD01"}); err == nil || toApiError(err).Status != 404 {
		t.Fatal(err)
	}
	// A continent: each person once, those of other continents left out.
	if rows := route("rankings/333/single", map[string]string{"region": "europe"})["rows"].([]any); len(rows) != 2 || rows[1].(map[string]any)["id"] != "2016UKAJ01" {
		t.Fatal(rows)
	}
	// Nobody of a region in an event: an empty ranking.
	if page := route("rankings/444/single", map[string]string{"region": "europe"}); len(page["rows"].([]any)) != 0 {
		t.Fatal(page)
	}
	// The rank file and the names were read once.
	files := 0
	for _, a := range asked {
		if strings.HasPrefix(a, "/rank/FR/") {
			files++
		}
	}
	if files != 1 {
		t.Fatal(asked)
	}

	// The world's records with their holders.
	value, err := wcaRoute(state, "ip", "records", nil)
	list, _ := value.([]wcaRecordRow)
	if err != nil || len(list) != 2 || list[0].Event != "333" || list[0].Single.Best != 251 || list[0].Single.Holders[0].ID != "2023GENG02" ||
		list[0].Average.Holders[0].Name != "Name 2019WANY36" || list[1].Event != "333mbf" || list[1].Average != nil {
		t.Fatal(value, err)
	}

	// A continent's: a holder who has since moved away found in their results, with the country they set it for.
	value, err = wcaRoute(state, "ip", "records", map[string]string{"region": "europe"})
	list, _ = value.([]wcaRecordRow)
	if err != nil || len(list) != 1 || list[0].Single.Holders[0].ID != "2000PERS01" || len(list[0].Average.Holders) != 1 ||
		list[0].Average.Holders[0] != (wcaWho{"2000ASIA01", "Name 2000ASIA01", "FR"}) {
		t.Fatal(value, err)
	}

	// The competitions coming up, their pages; a competition's page and an event's rounds, the final first.
	page = route("competitions", map[string]string{"country": "fr", "q": "open", "page": "2"})
	if items := page["items"].([]any); page["pages"] != 3.0 || len(items) != 3 || items[0].(map[string]any)["city"] != "Paris" {
		t.Fatal(page)
	}
	if last := asked[len(asked)-1]; !strings.Contains(last, "country_iso2=FR") || !strings.Contains(last, "q=open") || !strings.Contains(last, "sort=start_date") || !strings.Contains(last, "page=2") {
		t.Fatal(last)
	}
	// Past: one still under way is left out.
	if items := route("competitions", map[string]string{"status": "past"})["items"].([]any); len(items) != 1 || !strings.Contains(asked[len(asked)-1], "sort=-end_date") {
		t.Fatal(items)
	}
	if _, err := wcaRoute(state, "ip", "competitions", map[string]string{"from": "tomorrow"}); err == nil {
		t.Fatal("a date unread")
	}
	info := route("competitions/Soon", nil)
	if info["venue"] != "Hall" || info["venueUrl"] != "https://hall.example" || info["results"] != true || !strings.Contains(info["map"].(string), "mlat=48.500000") {
		t.Fatal(info)
	}
	value, err = wcaRoute(state, "ip", "competitions/Soon/results/333", nil)
	rounds, _ := value.([]wcaRound)
	if err != nil || len(rounds) != 2 || rounds[0].Round != "f" || rounds[1].Format != "a" || rounds[1].Results[0].Name != "A" || len(rounds[1].Results[0].Attempts) != 5 {
		t.Fatal(value, err)
	}
	if _, err := wcaRoute(state, "ip", "competitions/Gone", nil); err == nil || toApiError(err).Status != 404 {
		t.Fatal(err)
	}
}

// The cache keeps within its budget, the least recently used going first.
func TestWcaCacheBudget(t *testing.T) {
	wcaCache.index, wcaCache.size = nil, 0
	free := func() error { return nil }
	big := strings.Repeat("x", wcaBudget/4)
	for _, key := range []string{"a", "b", "c"} {
		_, _ = wcaMemo(key, time.Hour, free, func() (string, error) { return big, nil })
	}
	_, _ = wcaMemo("a", time.Hour, free, func() (string, error) { t.Fatal("a was not kept"); return "", nil })
	_, _ = wcaMemo("d", time.Hour, free, func() (string, error) { return big, nil })
	if _, ok := wcaCache.index["b"]; ok || wcaCache.size > wcaBudget {
		t.Fatal("b kept", wcaCache.size)
	}
	if _, ok := wcaCache.index["a"]; !ok {
		t.Fatal("a gone")
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
