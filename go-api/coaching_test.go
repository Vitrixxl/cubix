package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestCancellationClosesExactlyTwentyFourHoursBeforeStart(t *testing.T) {
	at := int64(1_800_000_000_000)
	if !coachingCancellationOpen(at+accountsDayMs+1, at) || coachingCancellationOpen(at+accountsDayMs, at) ||
		coachingCancellationOpen(at+accountsDayMs-1, at) || coachingCancellationOpen(at, at) || coachingCancellationOpen(at-1, at) {
		t.Fatal("cancellation window")
	}
}

func testCoach(windows, off, tz string) M {
	return M{"timezone": tz, "session_minutes": int64(60), "windows": windows, "days_off": off, "overrides": "[]"}
}

func ms(t *testing.T, text string) int64 {
	v, err := time.Parse(time.RFC3339, text)
	if err != nil {
		t.Fatal(err)
	}
	return v.UnixMilli()
}

func starts(slots [][2]int64) []int64 {
	out := []int64{}
	for _, s := range slots {
		out = append(out, s[0])
	}
	return out
}

func TestSlotsFollowTheCoachClock(t *testing.T) {
	// Monday 2026-10-05 08:00 UTC; Paris is UTC+2 until 25 October, then UTC+1.
	from := ms(t, "2026-10-05T08:00:00Z")
	c := testCoach(`[{"weekday":0,"start":1080,"end":1200}]`, "[]", "Europe/Paris")
	slots := coachingFreeSlots(c, nil, from, 28)
	if slots[0] != [2]int64{ms(t, "2026-10-05T16:00:00Z"), ms(t, "2026-10-05T17:00:00Z")} || slots[1][0] != ms(t, "2026-10-05T17:00:00Z") {
		t.Fatal(slots)
	}
	// After the change the same 18:00 is an hour later in UTC.
	found := false
	for _, s := range slots {
		found = found || s == [2]int64{ms(t, "2026-10-26T17:00:00Z"), ms(t, "2026-10-26T18:00:00Z")}
	}
	if !found || len(slots) != 8 {
		t.Fatal(slots)
	}
}

func TestNoticeDaysOffAndBookingsRemoveSlots(t *testing.T) {
	from := ms(t, "2026-10-05T16:30:00Z")
	c := testCoach(`[{"weekday":0,"start":1080,"end":1260}]`, `["2026-10-12"]`, "Europe/Paris")
	busy := [][2]int64{{ms(t, "2026-10-19T17:00:00Z"), ms(t, "2026-10-19T18:00:00Z")}}
	// 5 Oct: 18:00 and 19:00 Paris are within the hour of notice; 20:00 stays. 12 Oct is off. 19 Oct loses 19:00.
	want := []int64{ms(t, "2026-10-05T18:00:00Z"), ms(t, "2026-10-19T16:00:00Z"), ms(t, "2026-10-19T18:00:00Z")}
	if got := starts(coachingFreeSlots(c, busy, from, 21)); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
}

func TestRulesInForceExtraHoursAndHoursTakenBack(t *testing.T) {
	// Mondays 18:00–21:00 from 12 October until 26 October only; Tuesday 6 October gets 10:00–12:00 once; on
	// Monday 19 October 19:00–20:00 is taken back; extra hours overlapping the rule do not double the slots.
	from := ms(t, "2026-10-05T00:00:00Z")
	c := testCoach(`[{"weekday":0,"start":1080,"end":1260,"from":"2026-10-12","until":"2026-10-26"}]`, "[]", "UTC")
	c["overrides"] = `[{"date":"2026-10-06","start":600,"end":720,"open":true},{"date":"2026-10-19","start":1140,"end":1200,"open":false},{"date":"2026-10-12","start":1020,"end":1140,"open":true}]`
	var want []int64
	for _, s := range []string{"2026-10-06T10", "2026-10-06T11", "2026-10-12T17", "2026-10-12T18", "2026-10-12T19", "2026-10-12T20",
		"2026-10-19T18", "2026-10-19T20", "2026-10-26T18", "2026-10-26T19", "2026-10-26T20"} {
		want = append(want, ms(t, s+":00:00Z"))
	}
	if got := starts(coachingFreeSlots(c, nil, from, 35)); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
}

// The clock's gaps and folds resolve as jiff's "compatible" disambiguation does.
func TestWallClockGapsAndFolds(t *testing.T) {
	paris, _ := coachingTimeZone("europe/PARIS")
	wall := func(s string) int64 { return ms(t, s) / 1000 }
	for _, c := range [][2]string{
		{"2026-03-29T02:30:00Z", "2026-03-29T01:30:00Z"}, // gap: 02:30 does not exist, read with the winter offset
		{"2026-10-25T02:30:00Z", "2026-10-25T00:30:00Z"}, // fold: the earlier of the two 02:30
		{"2026-10-25T03:30:00Z", "2026-10-25T02:30:00Z"},
		{"2026-07-01T12:00:00Z", "2026-07-01T10:00:00Z"},
	} {
		if got := coachingInstant(paris, wall(c[0])); got != wall(c[1]) {
			t.Fatal(c, time.Unix(got, 0).UTC())
		}
	}
}

func TestEveryBundledTimeZoneLoads(t *testing.T) {
	names := coachingZoneNames()
	if len(names) != 598 {
		t.Fatal(len(names))
	}
	for _, name := range append(names, "utc", "Etc/Unknown") {
		if _, ok := coachingTimeZone(strings.ToUpper(name)); !ok {
			t.Error(name)
		}
	}
	for _, name := range []string{"", "Local", "Mars/Olympus", "posix/Europe/Paris", "../etc/passwd"} {
		if _, ok := coachingTimeZone(name); ok {
			t.Error(name)
		}
	}
}

func TestDatesParseAsJiffDoes(t *testing.T) {
	for in, want := range map[string]string{
		"2026-10-05": "2026-10-05", "20261005": "2026-10-05", "+002026-10-05": "2026-10-05", "-000001-01-01": "-000001-01-01",
		"2026-10-05T10:30": "2026-10-05", "2026-10-05 10": "2026-10-05", "2026-10-05T10:30:00.5+02:00[Europe/Paris]": "2026-10-05",
		"2024-02-29": "2024-02-29", "2026-10-05[u-ca=iso8601]": "2026-10-05", "2026-10-05T1030-0530": "2026-10-05",
		"2026-10-05t10:30:60": "2026-10-05", "2026-10-05T10:30:00,123456789": "2026-10-05", "2026-10-05T10+25": "2026-10-05",
		"2026-10-05T10:30+05:30:15.5": "2026-10-05", "2026-10-05[+05:30]": "2026-10-05", "2026-10-05[Europe/Paris][u-ca=gregory-x]": "2026-10-05",
		"2026-10-05[foo=bar][_x-y=1-2]": "2026-10-05", "2026-10-05[a/b/c]": "2026-10-05", "2026-10-05[.a/_b]": "2026-10-05",
		"0000-01-01": "0000-01-01", "9999-12-31": "9999-12-31",
	} {
		if d, ok := coachingParseDate(in); !ok || d.String() != want {
			t.Error(in, d, ok)
		}
	}
	for _, in := range []string{"", "2026-1-05", "2026-10-5", "2026-02-29", "2026-1005", "202610-05", "-000000-01-01", "+010000-01-01",
		"2026-10-05Z", "2026-10-05T10Z", "2026-10-05T24:00", "2026-10-05x", "2026-10-05[!u-ca=iso8601]", "2026-10-05[", "26-10-05",
		"2026-10-05T10:30:00.1234567890", "2026-10-05T10+26", "2026-10-05T10:30+0530:15", "2026-10-05[+05:30:00]", "2026-10-05[Foo=bar]",
		"2026-10-05[a/]", "2026-10-05T10:3015", "2026-10-05T1030:15", "2026-10-05T10:30:00.", "2026-10-05[x=]", "2026-10-05[x=a-]"} {
		if d, ok := coachingParseDate(in); ok {
			t.Error(in, d)
		}
	}
}

// jiff prints a timestamp's fraction only as long as it needs.
func TestTimestampsPrintAsJiffDoes(t *testing.T) {
	if coachingTimestamp(1_700_000_000_120) != "2023-11-14T22:13:20.12Z" || coachingTimestamp(1_700_000_000_000) != "2023-11-14T22:13:20Z" {
		t.Fatal(coachingTimestamp(1_700_000_000_120))
	}
}

func TestLossyDecodingMatchesRust(t *testing.T) {
	for in, want := range map[string]string{
		"a\xffb": "a�b", "\xe2\x82": "�", "\xff\xfe": "��", "\xed\xa0\x80": "���", "é": "é",
	} {
		if got := coachingLossy([]byte(in)); got != want {
			t.Errorf("%q: %q", in, got)
		}
	}
}
