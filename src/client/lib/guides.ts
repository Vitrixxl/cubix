/**
 * The guides of the help dialog, one text for the web app (desktop/guides/Content.tsx) and the Android app
 * (mobile/src/components/GuidesDialog.tsx): each guide as blocks both draw in their own way. Texts are English,
 * marked with `msg` and translated where they are drawn.
 */
import { msg } from "../i18n/msg";

/** The guides: name in their list, former public path (links between guides) and heading. */
export const GUIDES = {
  overviewGuide: { name: msg("About Qbix"), path: "/guides/about-cubix/", heading: msg("About Qbix") },
  algorithmsGuide: { name: msg("Algorithms"), path: "/guides/cube-algorithms/", heading: msg("Using the algorithm library") },
  trainingGuide: { name: msg("Training"), path: "/guides/algorithm-training/", heading: msg("Using the algorithm trainer") },
  timerGuide: { name: msg("Timer"), path: "/guides/how-to-use-a-cube-timer/", heading: msg("Using the cube timer") },
  smartCubeGuide: { name: msg("Connected cube"), path: "/guides/smart-cube/", heading: msg("Solving and training on a connected cube") },
  duelGuide: { name: msg("Duel"), path: "/guides/cube-duel/", heading: msg("Racing another cuber") },
  communityGuide: { name: msg("Messages and tournaments"), path: "/guides/community-tournaments/", heading: msg("Friends, groups, battles and tournaments") },
  coachingGuide: { name: msg("Coaching"), path: "/guides/cubing-coaching/", heading: msg("Getting coached, and coaching") },
  methodsGuide: { name: msg("Solving methods"), path: "/guides/solving-methods/", heading: msg("Solving methods") },
  notationGuide: { name: msg("Notation"), path: "/guides/cube-notation/", heading: msg("Reading move notation") },
  averagesGuide: { name: msg("Ao5 and Ao12"), path: "/guides/ao5-ao12/", heading: msg("Ao5 and Ao12: how cube timer averages work") },
} as const;
export type Guide = keyof typeof GUIDES;

/** A piece of a paragraph: text, a link (another guide's path, a page of the app or an address) or a figure in bold. */
export type Inline = string | { href: string; text: string } | { strong: string };
/**
 * A block of a guide: a section heading, a paragraph, a numbered list, a folded question, or the overview's cards (a
 * heading, a sentence and links). The first paragraph is the lead.
 */
export type Block = { h: string } | { p: Inline[] } | { ol: string[] } | { q: string; a: string } | { cards: { h: string; p: string; links: { href: string; text: string }[] }[] };

const a = (href: string, text: string) => ({ href, text });
const p = (...parts: Inline[]): Block => ({ p: parts });
const h = (text: string): Block => ({ h: text });
/** A section: its heading and one paragraph of text. */
const section = (title: string, text: string): Block[] => [h(title), p(text)];

/** Each guide's text. The methods and the notation guides add their own interactive part under it. */
export const GUIDE_TEXT: Record<Guide, Block[]> = {
  overviewGuide: [
    p(msg("Qbix is a free cube timer and algorithm trainer for desktop and mobile. Sign in and tell Qbix the puzzles you can solve to start.")),
    { cards: [
      { h: msg("Timer"), p: msg("Apply the scramble, hold Space (or touch the screen), release to start, press any key to stop. Times, Ao5 and Ao12 are kept per puzzle."),
        links: [a("/guides/how-to-use-a-cube-timer/", msg("Timer guide")), a("/guides/cube-duel/", msg("Duel guide")), a("/guides/cubing-coaching/", msg("Coaching guide"))] },
      { h: msg("Algorithms"), p: msg("F2L, OLL and PLL cases with diagrams, setups and algorithms from trusted sources. 2×2 to 7×7, Square-1, Pyraminx, Skewb and Megaminx are included."),
        links: [a("/guides/cube-algorithms/", msg("Algorithm guide"))] },
      { h: msg("Training"), p: msg("Pick the cases you want to drill. Qbix shows a setup, times your execution and tracks your progress per case."),
        links: [a("/guides/algorithm-training/", msg("Training guide"))] },
      { h: msg("Averages"), p: msg("Best, mean, Ao5 and Ao12 with +2 and DNF handled the WCA way."), links: [a("/guides/ao5-ao12/", msg("Ao5 and Ao12 explained"))] },
    ] },
    ...section(msg("Assisted solve (3×3 beginner)"), msg("In the 3×3 beginner course, Assisted solve solves your own cube with you. Show its six faces to the camera as each instruction says, then check the colours on the net: pick a colour and click a sticker read wrong. Hold the cube yellow on top and green in front all the way through: each step of the course shows its turns, piece by piece, on a 3D copy of your cube. Press Next turn (or the right arrow) after each turn, Back to undo one. Lost? Read the cube again: the solve starts over from where your cube stands, the steps already done are kept.")),
    h(msg("Your account page")),
    p(msg("Change the puzzles you can solve, and the methods you use on each, with Redo the introduction in the guides; Replay tour replays the guided visit.")),
    p(msg("The Account tab is your dashboard. Overview shows four cards for the selected puzzle and solve mode: your best time with Ao5 and Ao12, the cases you have trained and learned, your unlocked achievements with the next goal, and your active days. Click a card to open its section.")),
    p(msg("Timer lists best, mean, Ao5 and Ao12 for one puzzle, scramble type and solve mode, with a chart of every solve and the rolling Ao5; hover the chart to read a solve, click a row to edit it. Training shows each case with its best attempt; open one for its own chart. Achievements groups goals per puzzle. Settings holds the theme, the accent colour and sign-out.")),
    h(msg("Questions")),
    { q: msg("Is Qbix free? Do I need an account?"), a: msg("Yes, it is free, with a free account: your practice is saved on your device first, then synchronised between your devices with achievements that follow you everywhere.") },
    { q: msg("Does it work offline?"), a: msg("Once installed, the app works without a connection. Sync needs a connection.") },
    { q: msg("Does it work on a phone?"), a: msg("Yes. Hold a free area of the screen to arm the timer, release to start, tap to stop.") },
    { q: msg("Is this an official competition timer?"), a: msg("No. Qbix is a practice tool and is not affiliated with Rubik’s or the World Cube Association.") },
  ],
  algorithmsGuide: [
    p(msg("The library lists every case with its diagram, setup and algorithms. Open a case to compare its algorithms and see your statistics.")),
    ...section(msg("3D case player"), msg("The cube of a case shows the case, then plays its algorithm move by move: play or pause, step one move back or forward, restart, change the speed, or drag the bar under it to any point. The move being played is lit in the algorithm; click a move to turn it, click another algorithm to play that one, and press Replay to watch again from the case. Space plays or pauses and the arrow keys step while the player has the focus. Drag the cube to see it from another angle and double-click it to come back. Blue is the front reference and red is the right reference. OLL highlights orientation, PLL highlights the last layer, and F2L hides last-layer pieces. Notation, in the toolbar, explains every move letter on the cube.")),
    ...section(msg("Browse by stage"), msg("F2L pairs a corner and an edge to finish the first two layers. OLL orients the last layer. PLL permutes it. ZBLL finishes the last layer in one algorithm when its edges are already oriented, sorted by corner pattern (T, U, L, Pi, H, S, AS). Use the stage tabs to jump between them and the set switches to choose 2-look or full variants.")),
    h(msg("Solving methods")),
    p(msg("Methods in the toolbar opens a short explanation of each way to solve the selected puzzle, such as CFOP, Roux or ZZ on the 3×3. See"), " ", a("/guides/solving-methods/", msg("Solving methods")), a("/guides/cube-notation/", msg("Notation")), "."),
    h(msg("From reference to practice")),
    p(msg("Press Train on a case or Train all on a group to open the"), " ", a("/training/", msg("trainer")), " ", msg("with that selection. Trained cases show their best and mean time on their card.")),
    p(msg("Sources are shown next to each algorithm. The"), " ", a("https://github.com/Vitrixxl/cubix", msg("Qbix source repository")), " ", msg("documents the catalogue.")),
  ],
  trainingGuide: [
    p(msg("The trainer repeats the cases you choose so you can work on recognition and execution separately from full solves.")),
    ...section(msg("Choose what to train"), msg("Training opens on its setup screen: the modes are listed on the left and the chosen one is described on the right with its Start button. The back arrow in the header of a running training returns to this screen; your selection and settings are kept.")),
    ...section(msg("Cross (3×3)"), msg("Cross trains planning the start of the solve in inspection. After scrambling, turn the cube over with z2 so white is on the bottom and green stays in front. Choose what to build: the Cross (the four white edges), an XCross (the cross and one F2L pair) or an XXCross (the cross and two pairs), then a number of moves; every scramble is a random cube whose shortest one takes exactly that number of face turns. Build it, then stop the timer. Show solution lists optimal ways to build it in that orientation and the slots of the pairs each one solves. What to build and the number of moves can be changed in the header; times are kept per choice and appear in Account → Timer under their own scramble type.")),
    ...section(msg("Review everything learned"), msg("Choose Review learned on the setup screen to mix every case marked learned for the selected puzzle, across all stages and sets. Each timed attempt or Next picks another case. New learned cases join automatically; removing a learned mark removes the case from review after the current attempt. Daily assignments and your free-practice selection are preserved.")),
    ...section(msg("Daily learning (3×3)"), msg("Choose Learn F2L, Learn OLL or Learn PLL on the 3×3 setup screen. Repeat the algorithm of the day as often as you like, then mark it learned. It stays assigned across restarts and missed days until learned; the next case arrives on the following local calendar day. You can keep practising today’s case after learning it, or undo Learned. Open Groups and use the up and down arrows to choose the order of case families. The order is saved per track on this device. Reordering keeps today’s case and affects future assignments; already learned cases are skipped. Each track remembers its own case. Press Train learned to repeat every case of the track you have already marked learned, one random case per attempt; press it again to return to today’s case. Free practice restores your manual selection. Daily assignments stay on this device for each account; learned marks synchronise with your account.")),
    h(msg("Set up a session")),
    { ol: [
      msg("Choose Free practice, select the cases to practise (a whole set, a group or single cases) and press Start."),
      msg("Apply the setup shown on your cube."),
      msg("Hold Space (or a free area of the screen), release to start, press any key to stop."),
      msg("Review the session in Times. Undo removes the last time."),
    ] },
    ...section(msg("Tips"), msg("Start with a few cases you confuse. Keep the solution hidden to train recognition, reveal it when needed. Random U turns before the setup make recognition harder, as in a real solve.")),
    p(msg("For full solves, open the"), " ", a("/", msg("timer")), msg(". The"), " ", a("/guides/ao5-ao12/", msg("averages guide")), " ", msg("explains the statistics.")),
  ],
  timerGuide: [
    p(msg("Qbix times physical solves with your keyboard or touchscreen."), " ", a("/", msg("Open the timer")), " ", msg("and follow these steps.")),
    ...section(msg("1. Choose a puzzle and scramble"), msg("The puzzle selector at the top of the sidebar changes the puzzle everywhere. The scramble type, solve mode and entry are chosen in the page header, next to Replay and New scramble. Normal generates a scramble for the selected WCA event. The session figures run along the bottom: best in green, worst in red, the current Ao5 and Ao12 in the accent colour, with their best values beside them.")),
    p(msg("The 3D cube plays the complete scramble in three seconds for 2×2 and 3×3 cubes. Each larger size adds one second, from four seconds for 4×4 to seven seconds for 7×7. Drag it to change the viewing angle or use Replay to watch the scramble again. Long scrambles scroll inside their text area while the cube and timer remain visible.")),
    ...section(msg("2. Start"), msg("Hold Space for 0.3 seconds until the time turns green, then release. Releasing early cancels. On a phone, hold a free area of the screen and release when ready.")),
    ...section(msg("3. Stop and review"), msg("Press any key or tap the screen to stop. The time is saved and the next scramble appears. Buttons under the time let you add a +2, mark it DNF, write a comment or delete it. Each time in the Times list has the same +2, DNF and delete buttons, and its i button opens the solve with its scramble and comment.")),
    ...section(msg("Typing and casual entry"), msg("The entry menu next to the scramble type chooses how times come in. Timer is the built-in timer. Typing replaces it with a field for a time measured on an external timer such as a speed-stacking mat: type it and press Enter. Bare digits are read from the right, so 1234 is 12.34 and 12345 is 1:23.45; 12.34 and 1:23.45 work too. Casual runs the timer without recording anything: the time is shown, then forgotten, and the session, statistics and profile stay untouched.")),
    ...section(msg("Explore your progress"), msg("In Account → Timer, the chart sits above your times. Scroll over the chart to zoom around the pointer, or drag across it to select a period. Hold Shift while dragging to move through the history; horizontal trackpad scrolling also moves the visible period. Dates along the bottom show the visible period and the list below follows it. Hover to read a single time and its rolling Ao5. Double-click the chart or use Reset zoom inside it to return to the full history. With the chart focused, use + and − to zoom, the arrow keys to move, Home to reset, and Escape to cancel a selection. The summary cards always describe the full history for the selected puzzle and mode.")),
    ...section(msg("Modes"), msg("Standard, one-handed and blindfolded keep separate histories. Blindfolded time includes memorisation. Times are saved on your device first, then synchronised with your account.")),
    p(msg("For official competitions, follow the"), " ", a("https://www.worldcubeassociation.org/regulations/", msg("WCA Regulations")), "."),
  ],
  smartCubeGuide: [
    p(msg("A connected cube tells Qbix every turn you make. On the 3×3 timer and in the trainer it starts and stops the timer by itself, and every solve it records is analysed step by step. Connect it with the cube button in the header of the timer or of a running training.")),
    ...section(msg("Timed solves"), msg("The scramble colours its turns as you make them; a wrong turn shows the turns that undo it. Once the cube is scrambled, your first turn starts the timer and the solved cube stops it, with the cube’s own clock. Stopping with a key before the cube is solved gives a +2 when one face turn is left, a DNF otherwise. The turns are saved with the solve: every list marks these solves with a small 3D cube, and opening one replays it and shows its analysis.")),
    ...section(msg("Analysis"), msg("Account → Analysis gathers every solve done on a connected cube; it stays empty until you have one. Each solve is split into the cross, the four F2L pairs, the OLL and the PLL, and each step’s time into recognition (the pause before its first turn) and execution. The method buttons show every solve together, or only the solves of one method: CFOP with a one-look last layer, CFOP with the last layer in two looks, or CFOP finished with a ZBLL. Steps lists each step’s mean time, its part of the solve, its turns, its turns per second while turning and how often it was skipped. Cases lists every case of the catalogue met in your solves, the slowest first; click one to open it, or train it from its row.")),
    ...section(msg("Suggested training"), msg("From your solves Qbix suggests what to train: your slowest F2L pairs, OLLs and PLLs, the last-layer cases you take longest to recognise, Cross training when your cross is long, or the full OLL or PLL when you solve the last layer in two looks. Train starts it on the 3×3.")),
    ...section(msg("Case times in the algorithm library"), msg("A case done during a solve on a connected cube counts as an attempt of that case, timed from the end of the step before to its last turn. In a case’s statistics, All shows these attempts with the trainer’s, In solves only the ones from solves (marked In solve; a click opens the solve), and Training only the trainer’s. The best time on each case’s card follows the same choice.")),
    ...section(msg("Training on the cube"), msg("In a 3×3 training of F2L, OLL, PLL or ZBLL cases, the setup is shown as the face turns to make on the cube and lights up as you make them from a solved cube. Qbix sees the case once it is set up, whatever the angle; your first turn starts the timer, turns of the top alone excepted, and the case solved stops it: the first two layers for an F2L case, the oriented top for an OLL, the solved cube, a turn of the top away, for a PLL or a ZBLL. An OLL can be set up straight from the end of the previous one; an F2L case needs the other pairs and the cross solved, a PLL the rest of the cube.")),
    p(msg("Bluetooth cubes will connect as their drivers arrive; until then the development version plays a virtual cube.")),
  ],
  communityGuide: [
    p(msg("Messages (Alt+7) is where you meet other players: your conversations with friends and groups, the battles and tournaments launched in them. Tournaments (Alt+6) lists every tournament you can play. Both need an account.")),
    ...section(msg("Friends"), msg("Friends, at the top of Messages, finds a player by the start of their username: Add sends them a request. It also gives your link: whoever opens it is asked to add you, even if they create their account for it. The bell counts what waits for an answer: the friend requests you received, the group invitations, and the requests you sent, which you can take back. Friends can write to each other; removing a friend keeps the conversation but closes it.")),
    ...section(msg("Conversations"), msg("Your conversations with friends and with groups are one list, the latest first, with the invitations to groups on top. Enter sends, Shift+Enter starts a new line. A message arriving while you are elsewhere shows a notice, and Messages in the sidebar counts what you have not read yet, with what waits for an answer. The button on the right of a conversation opens its details: a friend's battles with you and your record, or a group's members, tournaments and battles.")),
    ...section(msg("Groups"), msg("New group creates a group with the friends you tick, who are invited at once. Its owner and the admins the owner names invite and remove members and organise its tournaments; every member talks in it and launches battles. The owner deletes the group; the others leave it from its details.")),
    ...section(msg("Battles"), msg("Battle, at the top of a conversation, challenges your friend, or in a group one member or anyone in it, with the event and the format you choose. The battle shows in the conversation as a card that follows it live: accept it, play it, or open it to see every solve, both times and its scramble. Either player can call it off before it starts.")),
    ...section(msg("Matches"), msg("Tournament matches and battles are races of sets: both players solve the same scramble, the faster takes the solve, a DNF loses to any time and a tie gives nothing. The first to the number of solves chosen takes the set, the first to the number of sets chosen takes the match. The match waits until both players have its page open; hold Space as on the timer, and correct your latest solve with +2, DNF or Redo while your opponent has not solved it. After each solve the page says who took it and by how much, and a won set is announced. Forfeit gives the match away.")),
    ...section(msg("Tournaments"), msg("A tournament is a knockout bracket. Register before its date; at its date registration closes and the players are drawn into the bracket, the first drawn going straight through when the count is not a power of two. A round opens only once every match of the round before is over: everyone waits for everyone. The bracket shows each match as it stands, live, over or waiting, and Play takes you to yours. The tournaments open to every player are created by the Qbix team; a group's are created by its owner and admins from the top of its conversation, where its card lets members register. They can also start it early, cancel it, or give a match to a player whose opponent never came.")),
  ],
  duelGuide: [
    p(msg("Duel races you against another cuber, live, on the same scrambles. Open it from the crossed swords in the sidebar (Alt+5).")),
    ...section(msg("1. Find an opponent"), msg("Choose the puzzle in the sidebar, then Find an opponent. There is no rating: your level is the mean of your last twelve timer solves on that puzzle, without the best and the worst, once five of them count. You meet the player searching the same puzzle whose level is closest to yours. The range accepted widens the longer you wait, from 15% at once to anyone after 30 seconds, so a quiet moment still gives you a race. Without a level you first meet other new players, then anyone after 10 seconds. Players race under their username.")),
    ...section(msg("2. Race five rounds"), msg("Both of you get the same five scrambles, one round at a time. Your timer is on the left, your opponent's on the right, with the scrambled cube between them: drag it to turn it, or hide it with its × or the Cube cell of the header. Start and stop like on the timer page. You see your opponent hold, start and stop as it happens, and the next round opens once you have both finished.")),
    ...section(msg("3. +2, DNF and Cancel"), msg("The cells at the end of your row put a +2 or a DNF on your latest solve, or take it off again. Cancel takes your solve back so you can redo it on the same scramble, as long as your opponent has not finished that round.")),
    ...section(msg("4. The result"), msg("After five rounds the best Ao5 wins: best and worst dropped, one DNF counts as the worst, two make the average DNF. The result dialog offers a rematch, which starts once you both accept it on five new scrambles, or a new opponent. Your recent battles appear in Account.")),
    ...section(msg("Chat"), msg("The chat runs beside the race on wide screens and behind the Chat cell otherwise. Messages last as long as the race.")),
  ],
  coachingGuide: [
    p(msg("Coaching puts you in a video call with a cuber who teaches. Open it from the headset in the sidebar (Alt+8).")),
    ...section(msg("1. Find a coach"), msg("Find a coach lists every coach with their rating, the events they teach, their best times, their price per session and their next free slot. Search by name, language or method, or keep one event. A coach's page shows who they are, what their students wrote about them and the share of each rating.")),
    ...section(msg("2. Book a session"), msg("A coach's page opens on booking, in three numbered steps. The calendar shows the coach's free slots over the next four weeks, month by month and in your own time zone: click a time in a day to pick it, or the day to see all its times. Pick a day, then a time, say what you want to work on and Book: the session is confirmed at once. Payment is not asked for yet. Slots start an hour from now at the earliest.")),
    ...section(msg("3. Talk with your coach"), msg("Booking opens a conversation with the coach, and Message on a coach's page opens one before booking. Messages arrive live; the sidebar counts the unread ones and a notice offers to open them from any page. To show your solves, send pictures (up to 10 MB) or videos (up to 64 MB): pick them with the clip beside the message box, paste them, or drop them on the conversation. Only you and the other party can open them.")),
    ...section(msg("4. The call"), msg("Sessions lists what is coming. Join call opens a quarter of an hour before the session and stays open half an hour after it; when the other party is already in, you are told on any page. The browser asks once for the camera and the microphone. In the call you can mute, turn the camera off, share your screen to show an algorithm sheet, and keep the chat beside the video. Cancel a session from its row: the other party is told and the slot opens again.")),
    ...section(msg("5. Review"), msg("Once a session is over, Review gives the coach one to five stars and a few words. You can change your review later; it appears on the coach's page under your username.")),
    ...section(msg("Becoming a coach"), msg("Become a coach sends the team your e-mail address, the events you would teach, your level and how you would coach. The team answers by e-mail. Once you are accepted, the Coaching section gains your Dashboard, Students, Schedule and Coach profile.")),
    ...section(msg("For coaches"), msg("Schedule shows your month as a calendar, on your own clock, with the sessions booked in it: click one to see who booked, their practice and your notes, and open their whole profile. Edit availability asks what you want to change. Add a date opens hours on days you are usually closed, and Cancel a date gives a whole day off or takes back a few hours: pick the days in the calendar (a click adds or removes a day, shift-click adds a run of days, to set holidays at once), press Continue, then choose the hours. Add weekly hours repeats some hours on chosen weekdays, for good or between two dates (for example Monday to Friday, 18:00–21:00, until the end of June); the same dialog lists your weekly hours to change or remove them, with the length of a session and your time zone. A click on a day shows what it holds, its sessions and its exceptions, which you can remove. Every change is saved at once. Players see the slots all this makes, minus the sessions already booked. Coach profile sets your picture, headline, presentation, events, languages and price; it pauses bookings when you need to, or keeps them to the students you already coached. Dashboard sums up the next four weeks: booked sessions and hours, the income they will bring, the free slots left and the next sessions. Students lists everyone who booked or wrote to you, with your conversation, the sessions you had together and private notes only you can read.")),
  ],
  methodsGuide: [],
  notationGuide: [p(msg("Algorithms are written as a list of moves, one letter per face. Choose a move to watch it turn on the cube."))],
  averagesGuide: [
    p(msg("A single best shows what happened once. An average shows how you usually solve. Here is how the"), " ", a("/", msg("Qbix timer")), " ", msg("calculates them.")),
    h(msg("Average of 5 (Ao5)")),
    p(msg("Take five consecutive results, drop the fastest and the slowest, average the remaining three. For 10.00, 12.00, 13.00, 14.00 and 20.00: (12 + 13 + 14) ÷ 3 ="), " ", { strong: "13.00" }, "."),
    h(msg("Average of 12 (Ao12)")),
    p(msg("Same idea with twelve results: drop the best and worst, average the ten left. Twelve solves from 10 to 21 seconds give an Ao12 of"), " ", { strong: "15.50" }, "."),
    ...section(msg("+2 and DNF"), msg("A +2 adds two seconds before sorting. A DNF counts as the worst result. One DNF is dropped as the worst; two or more make the average DNF.")),
    ...section(msg("Best and mean"), msg("Best is the fastest valid result. Mean averages all valid results without dropping any. Ao5 and Ao12 use the most recent five or twelve results and stay blank until enough solves exist.")),
    ...section(msg("Personal bests"), msg("A timer solve that beats your all-time best single, Ao5 or Ao12 for the puzzle, scramble type and solve mode shows a brief green message. The first result sets the record without beating one.")),
    p(msg("Official rules:"), " ", a("https://www.worldcubeassociation.org/regulations/#9b", msg("WCA formats")), " ", msg("and"), " ", a("https://www.worldcubeassociation.org/regulations/#9f", msg("results")), "."),
  ],
};

/** The links under every guide: the app's pages and the guides. */
export const GUIDE_LINKS = [
  a("/", msg("Timer")), a("/algorithms/", msg("Algorithms")), a("/training/", msg("Trainer")), a("/guides/about-cubix/", msg("About")),
  a("/guides/cube-algorithms/", msg("Algorithm guide")), a("/guides/algorithm-training/", msg("Training guide")), a("/guides/how-to-use-a-cube-timer/", msg("Timer guide")),
  a("/guides/cube-duel/", msg("Duel guide")), a("/guides/cubing-coaching/", msg("Coaching guide")), a("/guides/solving-methods/", msg("Solving methods")),
  a("/guides/cube-notation/", msg("Notation")), a("/guides/ao5-ao12/", msg("Ao5 and Ao12")),
];
/** The line at the foot of every guide, and its link. */
export const GUIDE_FOOTER = [msg("Qbix is an independent speedcubing app. Rubik’s is a trademark of its respective owner."), a("https://github.com/Vitrixxl/cubix", msg("Source code"))] as const;

/** The guide a link points at, if it is one. */
export const guideOfPath = (href: string) => (Object.keys(GUIDES) as Guide[]).find((id) => GUIDES[id].path === href);
