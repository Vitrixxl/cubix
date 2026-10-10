import { describe, expect, test } from "bun:test";
import { parseClock, parseDelimited, readTimerExport } from "../src/client/lib/timerImport";

const pick = (r: ReturnType<typeof readTimerExport>) => r.solves.map((s) => [s.event, s.timeMs, s.penalty, s.at]);

describe("reading other timers' exports", () => {
  test("csTimer's backup: sessions, their scramble types, penalties kept apart", () => {
    const file = JSON.stringify({
      session1: [[[0, 10512], "R U2 F'", "", 1696500000], [[2000, 12345], "D2 B", "pop", 1696500060], [[-1, 9800], "L' U", "", 1696500120]],
      session2: [[[0, 95321, 62000, 31000], "R U", "", 1696600000]],
      session3: [[[0, 30000], "", "", 1696700000]],
      properties: { sessionN: 3, sessionData: JSON.stringify({ 1: { name: "main", opt: {} }, 2: { name: "OH", opt: { scrType: "333oh" } }, 3: { name: 3, opt: { scrType: "clkwca" } } }) },
    });
    const r = readTimerExport(file);
    expect(r.app).toBe("csTimer");
    expect(pick(r)).toEqual([
      ["333", 10512, "none", 1696500000000],
      ["333", 12345, "+2", 1696500060000],
      ["333", 9800, "dnf", 1696500120000],
      ["333oh", 95321, "none", 1696600000000],
    ]);
    expect(r.solves[1]).toMatchObject({ comment: "pop", scramble: "D2 B", session: "main" });
    expect(r.skipped).toEqual({ "events Cubix does not practise": 1 });
  });

  test("CubeTime's csTimer file: its 3BLD name and session names", () => {
    const file = JSON.stringify({ session1: [[[0, 41000], "R", "", 1696500000]], properties: { sessionData: JSON.stringify({ 1: { name: "CubeTime Export - BLD", scrType: "333bld" } }) } });
    const r = readTimerExport(file);
    expect(r.app).toBe("CubeTime");
    expect(r.solves[0]).toMatchObject({ event: "333bf", session: "BLD" });
  });

  test("csTimer's session CSV: printed times, +2 taken off, the event picked", () => {
    const file = "No.;Time;Comment;Scramble;Date;P.1\r\n1;10.51;;R U2 F';2023-10-05 12:00:00;10.51\r\n2;14.34+;pop;D2 B;2023-10-05 12:01:00;12.34\r\n3;DNF(9.80);;L' U;2023-10-05 12:02:00;9.80\r\n4;1:02.345;\"a;b\";U;2023-10-05 12:03:00;1:02.345\r\n";
    const r = readTimerExport(file, "444");
    expect(r.needsEvent).toBe(true);
    expect(r.solves.map((s) => [s.event, s.timeMs, s.penalty])).toEqual([["444", 10510, "none"], ["444", 12340, "+2"], ["444", 9800, "dnf"], ["444", 62345, "none"]]);
    expect(r.solves[3]!.comment).toBe("a;b");
    expect(r.solves[0]!.at).toBe(new Date(2023, 9, 5, 12, 0, 0).getTime());
  });

  test("Twisty Timer's backup: +2 in the time, categories, placeholders left out", () => {
    const file = 'Puzzle,Category,Time(millis),Date(millis),Scramble,Penalty,Comment\n"333";"Normal";"12345";"1696500000000";"R U2 F\' D2";"0";""\n"333";"Normal";"14340";"1696500060000";"D2 B";"1";"pop"\n"pyra";"OH";"5320";"1696500120000";"U R\' L";"2";"null"\n"333";"Empty";"0";"1696500180000";"null";"10";"null"\n"333fmc";"Normal";"28000";"1696500240000";"R";"0";""\n';
    const r = readTimerExport(file);
    expect(r.app).toBe("Twisty Timer");
    expect(pick(r)).toEqual([["333", 12345, "none", 1696500000000], ["333", 12340, "+2", 1696500060000], ["pyram", 5320, "dnf", 1696500120000]]);
    expect(r.solves[2]).toMatchObject({ comment: null, session: "OH" });
    expect(r.skipped).toEqual({ "events Cubix does not practise": 1 });
  });

  test("Cubic Timer's backup: quoted header, backslashed quotes, packed penalties", () => {
    const file = '"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"\n"333oh";"Normal";"20000";"1696500000000";"R U";"101";"said \\"hi\\""\n"444bld";"Normal";"300000";"1696500060000";"Rw U";"0";""\n';
    const r = readTimerExport(file);
    expect(r.app).toBe("Cubic Timer");
    expect(r.solves.map((s) => [s.event, s.timeMs, s.penalty, s.comment])).toEqual([["333oh", 18000, "+2", 'said "hi"'], ["444bf", 300000, "none", null]]);
  });

  test("CubeTime's CSV: seconds, a Square-1 scramble with commas", () => {
    const file = 'Time,Comment,Scramble,Date\n10.512,"",R U2 F,2023-10-05 10:00:00 +0000\n15.2,"nice ""one""",(1,0)/ (-3,0)/,2023-10-05 10:01:00 +0000\n';
    const r = readTimerExport(file, "sq1");
    expect(r.solves.map((s) => [s.event, s.timeMs, s.scramble, s.comment, s.at])).toEqual([
      ["sq1", 10512, "R U2 F", null, Date.UTC(2023, 9, 5, 10, 0, 0)],
      ["sq1", 15200, "(1,0)/ (-3,0)/", 'nice "one"', Date.UTC(2023, 9, 5, 10, 1, 0)],
    ]);
  });

  test("CubeDesk: raw seconds, flags, trainer solves left out, 333bl as 3BLD", () => {
    const file = JSON.stringify({
      sessions: [{ id: "s1", name: "Main" }],
      solves: [
        { time: 12.34, raw_time: 10.34, cube_type: "333", scramble: "R U", session_id: "s1", started_at: 1696500000000, dnf: false, plus_two: true, notes: null },
        { time: -1, raw_time: 30.5, cube_type: "333bl", scramble: "F", session_id: "s1", started_at: 1696500060000, dnf: true, plus_two: false, notes: "oops" },
        { time: 2, raw_time: 2, cube_type: "333", scramble: "R", session_id: null, trainer_name: "OLL", started_at: 1696500120000 },
        { time: 5, raw_time: 5, cube_type: "custom-uuid", scramble: "R", session_id: "s1", started_at: 1696500180000 },
      ],
    });
    const r = readTimerExport(file);
    expect(r.app).toBe("CubeDesk");
    expect(pick(r)).toEqual([["333", 10340, "+2", 1696500000000], ["333bf", 30500, "dnf", 1696500060000]]);
    expect(r.solves[0]!.session).toBe("Main");
    expect(r.skipped).toEqual({ "events Cubix does not practise": 1 });
  });

  test("Cubeast and acubemy: 3×3 smart cube solves in milliseconds", () => {
    const cubeast = readTimerExport("id,date,dnf,time,solving_method,one_turn_away_two_second_penalty,inspection_two_second_penalty,description,session_name,scramble\nabc,2023-10-05 10:00:00 UTC,false,11234,CFOP,false,false,,Main,R U\ndef,2023-10-05 10:01:00 UTC,true,9000,CFOP,false,false,\"pop, again\",Main,F\n");
    expect(cubeast.app).toBe("Cubeast");
    expect(pick(cubeast)).toEqual([["333", 11234, "none", Date.UTC(2023, 9, 5, 10, 0, 0)], ["333", 9000, "dnf", Date.UTC(2023, 9, 5, 10, 1, 0)]]);
    expect(cubeast.solves[1]!.comment).toBe("pop, again");
    const acubemy = readTimerExport("solve_id,date,total_time,scramble,solution\n1,2026-03-18T16:32:01.074Z,10500,R U,R' U'\n");
    expect(pick(acubemy)).toEqual([["333", 10500, "none", Date.parse("2026-03-18T16:32:01.074Z")]]);
  });

  test("Speedcuber Timer's backup: one attempt a line, WCA events", () => {
    const line = (event: string, penalty = "") => JSON.stringify({ event: { id: event }, timerStart: 1696500000000, timerStop: 1696500012345, solutions: [{ scramble: ["R", "U"] }], infractions: penalty ? [{ penalty }] : [], comment: "" });
    const r = readTimerExport([line("333"), line("pyram", "+2"), line("333mbf")].join("\n"));
    expect(r.app).toBe("Speedcuber Timer");
    expect(r.solves.map((s) => [s.event, s.timeMs, s.penalty, s.scramble])).toEqual([["333", 12345, "none", "R U"], ["pyram", 12345, "+2", "R U"]]);
  });

  test("another file is refused", () => {
    expect(() => readTimerExport("hello")).toThrow(/not an export/);
    expect(() => readTimerExport("{oops")).toThrow();
  });

  test("printed clocks and delimited rows", () => {
    expect(["12.34", "1:02.345", "1:02:03.4", "7", "x"].map(parseClock)).toEqual([12340, 62345, 3723400, 7000, null]);
    expect(parseDelimited('a;"b;c";"d\ne"\n1;2;3', ";")).toEqual([["a", "b;c", "d\ne"], ["1", "2", "3"]]);
  });
});

test("Qbix's own export: its timer solves come back by session, with its name, its training solves stay out", () => {
  const file = JSON.stringify({
    app: "Qbix",
    solves: [
      { id: 1, session_id: 7, case_id: null, time_ms: 9870, penalty: "+2", scramble: "R U", comment: "pb", created_at: "2026-10-01T10:00:00.000Z", puzzle_id: "333", solve_mode: "one-handed" },
      { id: 2, session_id: 8, case_id: "pll-t", time_ms: 1500, penalty: "none", scramble: null, created_at: "2026-10-01T10:01:00.000Z" },
    ],
    sessions: [{ id: 7, name: "OH practice" }],
  });
  const read = readTimerExport(file);
  expect(read.app).toBe("Qbix");
  expect(read.solves).toEqual([{ event: "333oh", timeMs: 9870, penalty: "+2", scramble: "R U", comment: "pb", at: Date.parse("2026-10-01T10:00:00.000Z"), session: "7", sessionName: "OH practice" }]);
  expect(read.skipped).toEqual({ "training solves": 1 });
});
