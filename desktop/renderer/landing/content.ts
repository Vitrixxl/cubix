/**
 * What the landing page says, in one place: the page draws it (Landing.tsx), and the build writes it for search
 * engines and language models too (structured data, llms.txt, llms-full.txt; see desktop/web.ts). Only what the app
 * really does today: everything in one app, free, made to get faster, for every
 * cuber from the first solve to competition.
 */
export const SITE = "https://cubix.vitrixxl.fr";
export const NAME = "Qbix";
export const SOURCE = "https://github.com/Vitrixxl/cubix";
export const TITLE = "Qbix: the free speedcubing timer and algorithm trainer";
export const DESCRIPTION =
  "Qbix is a free all-in-one speedcubing app: a WCA cube timer with random-state scrambles and averages, 6,500 algorithms (F2L, OLL, PLL, ZBLL) with a 3D player, the methods taught step by step, case training, smart cubes, live duels, a daily scramble, the WCA's rankings and stats. In the browser, on computer and phone. No ads, no premium tier.";
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
    hook: "Hold, release, solve.",
    title: "A cube timer for every WCA event",
    summary: "The timer of competitions, with random-state scrambles for every WCA event generated on your device, averages, +2 and DNF by the rules.",
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
    hook: "Every algorithm, played in 3D.",
    title: "6,500 algorithms with a 3D player",
    summary: "The cases of the methods people actually use, each with several algorithms and a cube that plays them, step by step and at your speed.",
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
    hook: "Drill what you learned.",
    title: "Training that remembers what you know",
    summary: "Drill the cases you learned, the slowest first, and plan the cross.",
    points: [
      "Recommended first: your learned cases slower than usual, each with why",
      "Whole sets or single cases you learned, with random AUF and the solution hidden until you ask",
      "Every attempt compared with your mean on its case",
      "Cross, XCross and XXCross: scrambles of an exact number of moves, with their optimal solutions",
      "Smart cubes (GAN, MoYu, QiYi, GoCube, Giiker): the timer starts on your first turn, each solve cut into its steps",
    ],
  },
  {
    id: "learn",
    hook: "Never solved a cube? Start here.",
    title: "Every method explained, from your first solve to CFOP, Roux and ZZ",
    summary: "Each method explained step by step, its tips and the algorithms it needs, with a cube that shows each move.",
    points: [
      "3×3: beginner method, CFOP, Roux and ZZ",
      "2×2: beginner, Ortega, CLL and EG; 4×4 to 7×7: reduction and Yau",
      "Square-1, Pyraminx, Skewb and Megaminx, from the first solve on",
      "Blindfolded: Old Pochmann and M2, with your memo traced on each scramble",
      "Learn with a smart cube: the app sees each step done and says the next",
    ],
  },
  {
    id: "duel",
    hook: "Race a friend, live.",
    title: "Live duels",
    summary: "The same scrambles for both of you, live: see your opponent hold, start and stop. A friend, or a cuber matched to your level.",
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
    id: "challenges",
    hook: "Today's scramble, for everyone.",
    title: "A daily scramble, tournaments and the WCA's rankings",
    summary: "The same scramble for every cuber each day, tournaments between friends, and the WCA's rankings, records and competitions.",
    points: [
      "A daily scramble on every puzzle, ranked among everyone who solved it",
      "Tournaments in your groups, their rounds played live",
      "The WCA's rankings, records, competitions and cubers, and your WCA ID linked to your profile",
    ],
  },
  {
    id: "everywhere",
    hook: "Your times, on every device.",
    title: "Your times everywhere, even offline",
    summary: "Use Qbix in the browser on your computer or phone: your account follows you.",
    points: [
      "In the browser, on computer and phone, even offline",
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
  { question: "Is Qbix free?", answer: "Yes, entirely: every feature, on every platform. There are no ads, no premium tier and no subscription." },
  { question: "I cannot solve a cube yet. Is Qbix for me?", answer: "Yes. The beginner method is explained step by step, with a cube that shows each algorithm, and a smart cube can guide you through your first solve. The timer and the training are there once it is solved." },
  { question: "Do I need an account?", answer: "A free account saves your times and syncs them between your devices. You sign in with your Google or WCA account, nothing else to fill in." },
  { question: "Which puzzles does Qbix support?", answer: `Every WCA event: ${PUZZLES.join(", ")}.` },
  { question: "Can I import my times from csTimer or Twisty Timer?", answer: `Yes. Qbix reads the exports of ${IMPORTS.join(", ")}, with your dates, penalties and sessions, right on your device.` },
  { question: "Does it work offline?", answer: "Yes. The timer, the algorithms and the training work without a connection; your solves are synced as soon as you are back online." },
  { question: "Are the scrambles official?", answer: "They are random-state scrambles, like the WCA's: every position of the puzzle is equally likely. They are generated on your device." },
  { question: "Is Qbix affiliated with Rubik's or the WCA?", answer: "No. Qbix is an independent project, open source on GitHub." },
];
