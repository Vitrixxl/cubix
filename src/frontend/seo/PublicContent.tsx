import { SEO_PAGES, isGuide, type SeoPage } from './pages';

export function PublicContent({ page }: { page: SeoPage }) {
  if (!isGuide(page)) return null;
  return <section className="public-content" id="about-cubix" aria-label="About Cubix" data-timer-ignore>
    <header><p className="public-eyebrow">CUBIX · GUIDES</p><h1>{SEO_PAGES[page].heading}</h1></header>
    {page === 'overviewGuide' && <>
      <p className="public-lead">Cubix is a free cube timer and algorithm trainer that runs in your browser. No account is needed to start.</p>
      <div className="public-grid">
        <section><h2>Timer</h2><p>Apply the scramble, hold Space (or touch the screen), release to start, press any key to stop. Times, Ao5 and Ao12 are kept per puzzle.</p><p><a href="/guides/how-to-use-a-cube-timer/">Timer guide</a></p></section>
        <section><h2>Algorithms</h2><p>F2L, OLL and PLL cases with diagrams, setups and algorithms from trusted sources. 2×2 to 7×7, Square-1, Pyraminx, Skewb, Megaminx and Clock are included.</p><p><a href="/guides/cube-algorithms/">Algorithm guide</a></p></section>
        <section><h2>Training</h2><p>Pick the cases you want to drill. Cubix shows a setup, times your execution and tracks your progress per case.</p><p><a href="/guides/algorithm-training/">Training guide</a></p></section>
        <section><h2>Averages</h2><p>Best, mean, Ao5 and Ao12 with +2 and DNF handled the WCA way.</p><p><a href="/guides/ao5-ao12/">Ao5 and Ao12 explained</a></p></section>
      </div>
      <h2>Questions</h2>
      <details><summary>Is Cubix free? Do I need an account?</summary><p>Yes, it is free. Guest practice is saved in your browser. An account adds sync between devices and friends.</p></details>
      <details><summary>Does it work offline?</summary><p>After one online visit the app is cached and can be reopened without a connection. Sync and messages need a connection.</p></details>
      <details><summary>Does it work on a phone?</summary><p>Yes. Hold a free area of the screen to arm the timer, release to start, tap to stop.</p></details>
      <details><summary>Is this an official competition timer?</summary><p>No. Cubix is a practice tool and is not affiliated with Rubik’s or the World Cube Association.</p></details>
    </>}
    {page === 'algorithmsGuide' && <>
      <p className="public-lead">The library lists every case with its diagram, setup and algorithms. Open a case to compare its algorithms and see your statistics.</p>
      <h2>Browse by stage</h2><p>F2L pairs a corner and an edge to finish the first two layers. OLL orients the last layer. PLL permutes it. Use the stage tabs to jump between them and the set switches to choose 2-look or full variants.</p>
      <h2>From reference to practice</h2><p>Press Train on a case or Train all on a group to open the <a href="/training/">trainer</a> with that selection. Trained cases show their best and mean time on their card.</p>
      <p>Sources are shown next to each algorithm. The <a href="https://github.com/Vitrixxl/cubix">Cubix source repository</a> documents the catalogue.</p>
    </>}
    {page === 'trainingGuide' && <>
      <p className="public-lead">The trainer repeats the cases you choose so you can work on recognition and execution separately from full solves.</p>
      <h2>Set up a session</h2><ol><li>Open Cases and select the cases to practise.</li><li>Apply the setup shown on your cube.</li><li>Hold Space (or a free area of the screen), release to start, press any key to stop.</li><li>Review the session in Times. Undo removes the last time.</li></ol>
      <h2>Tips</h2><p>Start with a few cases you confuse. Keep the solution hidden to train recognition, reveal it when needed. Random U turns before the setup make recognition harder, as in a real solve.</p>
      <p>For full solves, open the <a href="/">timer</a>. The <a href="/guides/ao5-ao12/">averages guide</a> explains the statistics.</p>
    </>}
    {page === 'timerGuide' && <>
      <p className="public-lead">Cubix times physical solves with your keyboard or touchscreen. <a href="/">Open the timer</a> and follow these steps.</p>
      <h2>1. Choose a puzzle and scramble</h2><p>The puzzle selector in the navigation bar changes the puzzle everywhere. The scramble type is chosen below the timer. New scramble generates another one.</p>
      <h2>2. Start</h2><p>Hold Space for 0.3 seconds until the time turns green, then release. Releasing early cancels. On a phone, hold a free area of the screen and release when ready.</p>
      <h2>3. Stop and review</h2><p>Press any key or tap the screen to stop. The time is saved and the next scramble appears. Open Times to see scrambles, apply +2 or DNF, or delete a time with a right click or long press.</p>
      <h2>Modes</h2><p>Standard, one-handed and blindfolded keep separate histories. Blindfolded time includes memorisation. Guest times stay in your browser; sign in to sync them.</p>
      <p>For official competitions, follow the <a href="https://www.worldcubeassociation.org/regulations/">WCA Regulations</a>.</p>
    </>}
    {page === 'averagesGuide' && <>
      <p className="public-lead">A single best shows what happened once. An average shows how you usually solve. Here is how the <a href="/">Cubix timer</a> calculates them.</p>
      <h2>Average of 5 (Ao5)</h2><p>Take five consecutive results, drop the fastest and the slowest, average the remaining three. For 10.00, 12.00, 13.00, 14.00 and 20.00: (12 + 13 + 14) ÷ 3 = <strong>13.00</strong>.</p>
      <h2>Average of 12 (Ao12)</h2><p>Same idea with twelve results: drop the best and worst, average the ten left. Twelve solves from 10 to 21 seconds give an Ao12 of <strong>15.50</strong>.</p>
      <h2>+2 and DNF</h2><p>A +2 adds two seconds before sorting. A DNF counts as the worst result. One DNF is dropped as the worst; two or more make the average DNF.</p>
      <h2>Best and mean</h2><p>Best is the fastest valid result. Mean averages all valid results without dropping any. Ao5 and Ao12 use the most recent five or twelve results and stay blank until enough solves exist.</p>
      <p>Official rules: <a href="https://www.worldcubeassociation.org/regulations/#9b">WCA formats</a> and <a href="https://www.worldcubeassociation.org/regulations/#9f">results</a>.</p>
    </>}
    <nav className="public-links" aria-label="Guides"><a href="/">Timer</a><a href="/algorithms/">Algorithms</a><a href="/training/">Trainer</a><a href="/guides/about-cubix/">About</a><a href="/guides/cube-algorithms/">Algorithm guide</a><a href="/guides/algorithm-training/">Training guide</a><a href="/guides/how-to-use-a-cube-timer/">Timer guide</a><a href="/guides/ao5-ao12/">Ao5 &amp; Ao12</a></nav>
    <footer><p>Cubix is an independent speedcubing app. Rubik’s is a trademark of its respective owner. <a href="https://github.com/Vitrixxl/cubix">Source code</a></p></footer>
  </section>;
}
