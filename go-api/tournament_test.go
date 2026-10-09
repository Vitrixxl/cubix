package main

import (
	"fmt"
	"reflect"
	"testing"
)

func solved(ms int64) TournamentTime { return TournamentTime{done: true, ms: &ms} }

var dnf = TournamentTime{done: true}

func TestSolvesMakeSetsAndSetsTheMatch(t *testing.T) {
	// First to 2 solves takes a set, first to 2 sets the match.
	solves := [][2]TournamentTime{{solved(9000), solved(9500)}, {solved(9900), solved(9800)}, {solved(8000), dnf}, {solved(9000), solved(9000)}, {dnf, dnf}, {solved(8000), solved(8100)}, {solved(8000), solved(8100)}}
	s := tournamentScore(2, 2, solves)
	if !reflect.DeepEqual(s.solves, []int{0, 1, 0, -1, -1, 0, 0}) || s.sets != [2]int64{2, 0} || s.winner != 0 {
		t.Fatalf("%+v", s)
	}
	// Nothing after an unfinished solve, nor after the match is won.
	s = tournamentScore(2, 2, [][2]TournamentTime{{solved(9000), {}}, {solved(1), solved(2)}})
	if s.points != [2]int64{} || len(s.solves) != 0 {
		t.Fatalf("%+v", s)
	}
	s = tournamentScore(1, 1, [][2]TournamentTime{{solved(2), solved(1)}, {solved(1), solved(2)}})
	if s.winner != 1 || len(s.solves) != 1 {
		t.Fatalf("%+v", s)
	}
}

func TestBracketsGiveByesToTheFirstDrawn(t *testing.T) {
	names := []string{}
	for i := 0; i < 5; i++ {
		names = append(names, fmt.Sprintf("p%d", i))
	}
	rounds, pairs := tournamentBracket(names)
	if rounds != 3 || len(pairs) != 4 {
		t.Fatal(rounds, pairs)
	}
	// Three byes, never two byes together.
	byes := 0
	for _, p := range pairs {
		if p[1] == "" {
			byes++
		}
		if p[0] == "" {
			t.Fatal(pairs)
		}
	}
	if byes != 3 || pairs[3] != [2]string{"p3", "p4"} {
		t.Fatal(pairs)
	}
	if r, _ := tournamentBracket(names[:2]); r != 1 {
		t.Fatal(r)
	}
}
