/**
 * What the landing page says, in one place: the page draws it (Landing.tsx), and the build writes it for search
 * engines and language models too (structured data, llms.txt, llms-full.txt; see desktop/web.ts). Only what the app
 * really does today, and what PRODUCT.md commits to: everything in one app, free, made to get faster, for every
 * cuber from the first solve to competition.
 */
export const SITE = "https://cubix.vitrixxl.fr";
export const NAME = "Qbix";
export const SOURCE = "https://github.com/Vitrixxl/cubix";
export const TITLE = "Qbix: the free speedcubing timer and algorithm trainer";
export const DESCRIPTION =
  "Qbix is a free all-in-one speedcubing app: a WCA cube timer with random-state scrambles and averages, 6,500 algorithms (F2L, OLL, PLL, ZBLL) with a 3D player, case training, step-by-step courses, live duels and stats. Web, Windows, Linux, macOS and Android. No ads, no premium tier.";
export const TAGLINE = "One app to time, learn and get faster on every WCA puzzle, from your first solve to competition. Free, without ads or premium tier.";

export const PUZZLES = ["2×2", "3×3", "4×4", "5×5", "6×6", "7×7", "3×3 One-Handed", "3×3 Blindfolded", "4×4 and 5×5 Blindfolded", "Square-1", "Pyraminx", "Skewb", "Megaminx"];
export const IMPORTS = ["csTimer", "Twisty Timer", "Cubic Timer", "CubeTime", "CubeDesk", "ZKT Timer", "Cubeast", "acubemy", "Speedcuber Timer"];

export interface Feature {
  id: string;
  /** What it lets you do, in a few words: the page's big titles, one for each step of the cube's solve. */
  hook: string;
  title: string;
  summary: string;
  points: string[];
}
/** The features, most used first. */
export const FEATURES: Feature[] = [
  {
    id: "timer",
    hook: "Time every WCA event.",
    title: "A cube timer for every WCA event",
    summary: "Hold, release, solve: the timer of competitions, with official scrambles generated on your device.",
    points: [
      "14 WCA events, from 2×2 to 7×7, One-Handed and Blindfolded to Square-1, Pyraminx, Skewb and Megaminx",
      "Random-state scrambles like the WCA's, generated ahead in the background so a new one is always instant",
      "Training scrambles: 2-gen, half turns, last layer, OLL, PLL and F2L cases, cross, XCross and XXCross",
      "Ao5, Ao12 and any average you like (current, best or worst), mean, median, +2 and DNF by WCA rules",
      "A band of statistics you arrange yourself, personal best alerts, typed-in times from another timer",
    ],
  },
  {
    id: "algorithms",
    hook: "6,500 algorithms. One 3D player.",
    title: "6,500 algorithms with a 3D player",
    summary: "The 1,737 cases of the methods people actually use, each with several algorithms and a cube that plays them.",
    points: [
      "3×3: F2L (basic, advanced and expert cases), 2-look and full OLL and PLL, and all 472 ZBLL",
      "2×2 Ortega and PBL, big cube centres, edge pairing and parities, Square-1, Pyraminx, Skewb and Megaminx",
      "A 3D cube that plays, pauses, steps and slows down any algorithm, and turns under your mouse",
      "Search a case by its name in a few letters: “t perm”, “oll 21”",
      "Mark what you learned and see your own best and mean on each case",
    ],
  },
  {
    id: "training",
    hook: "Drill any case.",
    title: "Training that remembers what you know",
    summary: "Drill the cases you choose, learn a new one each day, review the ones you learned.",
    points: [
      "Free practice on any cases, with random AUF and the solution hidden until you ask",
      "Daily learning: one new F2L, OLL or PLL case a day, in the order you set",
      "Review: every case you learned, drawn at random, by stage",
      "Cross, XCross and XXCross: scrambles of an exact number of moves, with their optimal solutions",
    ],
  },
  {
    id: "learn",
    hook: "Learn CFOP, Roux and ZZ.",
    title: "Courses from your first solve to CFOP, Roux and ZZ",
    summary: "Step-by-step lessons for every puzzle, with the algorithms of each step and a cube that shows them.",
    points: [
      "3×3: beginner method, CFOP, Roux and ZZ",
      "2×2: beginner, Ortega, CLL and EG; 4×4 to 7×7: reduction and Yau",
      "Square-1, Pyraminx, Skewb and Megaminx, from the first solve on",
      "A puzzle you cannot solve yet opens on its course; everything else unlocks once it is solved",
    ],
  },
  {
    id: "duel",
    hook: "Race another cuber, live.",
    title: "Live duels",
    summary: "Race another cuber on the same five scrambles, live, matched to your level.",
    points: ["Matchmaking by your recent times", "See your opponent hold, start and stop, live", "Chat, rematch, and your record of wins on your profile"],
  },
  {
    id: "stats",
    hook: "Watch yourself get faster.",
    title: "Statistics and progress",
    summary: "A profile that shows how you improve: every solve, every average, every day you practised.",
    points: [
      "A chart of every solve with its rolling average, to zoom and browse by period",
      "Bests and averages per puzzle and mode, a calendar of your practice and your streaks",
      "Achievements for sub-X times, streaks, solves and algorithm sets mastered",
    ],
  },
  {
    id: "coaching",
    hook: "Book a coach.",
    title: "Coaching",
    summary: "Book a session with a coach, talk, share your screen and get feedback on your solves.",
    points: ["Coaches by event, language, rating and price", "A calendar in your time zone, chat with pictures and videos", "Video calls with screen sharing, and reviews"],
  },
  {
    id: "everywhere",
    hook: "Your times, on every device.",
    title: "Your times everywhere, even offline",
    summary: "Install Qbix on your computer or phone, or use it in the browser: your account follows you.",
    points: [
      "Web (installable, works offline), Windows, Linux, macOS and Android",
      "Every solve saved on the device first, then synced to your other devices",
      `Bring your history from ${IMPORTS.slice(0, 5).join(", ")} and more, in one step`,
    ],
  },
];

export interface Question {
  question: string;
  answer: string;
}
export const FAQ: Question[] = [
  { question: "Is Qbix free?", answer: "Yes, entirely: every feature, on every platform. There are no ads, no premium tier and no subscription. Only a coaching session has a price, set by its coach." },
  { question: "I cannot solve a cube yet. Is Qbix for me?", answer: "Yes. A puzzle you cannot solve yet opens on its course: step-by-step lessons from the first solve, with a cube that shows each algorithm. The timer and the training are there once it is solved." },
  { question: "Do I need an account?", answer: "A free account saves your times and syncs them between your devices. It takes a username and a password, nothing else." },
  { question: "Which puzzles does Qbix support?", answer: `Every WCA event: ${PUZZLES.join(", ")}.` },
  { question: "Can I import my times from csTimer or Twisty Timer?", answer: `Yes. Qbix reads the exports of ${IMPORTS.join(", ")}, with your dates, penalties and sessions, right on your device.` },
  { question: "Does it work offline?", answer: "Yes. The timer, the algorithms and the training work without a connection; your solves are synced as soon as you are back online." },
  { question: "Is there an iPhone or iPad app?", answer: "Not yet. On iOS, use Qbix in Safari and add it to your Home Screen: it opens like an app and works offline." },
  { question: "Are the scrambles official?", answer: "They are random-state scrambles, like the WCA's: every position of the puzzle is equally likely. They are generated on your device." },
  { question: "Is Qbix affiliated with Rubik's or the WCA?", answer: "No. Qbix is an independent project, open source on GitHub." },
];
