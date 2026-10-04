/** Coaching end to end, in headless Chromium against a disposable API serving the web build: a player applies, the
 * administration approves, the coach fills in their profile and hours, another player books a slot, they write to each
 * other, meet in a video call (fake camera and microphone) and the student leaves a review.
 * Build first: `bun run build:api && bun desktop/web.ts`. */
import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { signIn, startServer } from "./app";
import { openDb } from "../../scripts/sqlite";

const SHOTS = "artifacts/coaching";
await mkdir(SHOTS, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-coaching-"));
const { origin, server } = await startServer(join(dir, "server"));
const db = join(dir, "server", "server.db");
const token = spawnSync(resolve("rust-api/target/release/cubix-api"), ["admin-token"], { env: { ...process.env, CUBIX_DB: db }, encoding: "utf8" }).stdout.split("\n")[0]!.trim();
const browser = await chromium.launch({
  executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--allow-loopback-in-peer-connection"],
});
const errors: string[] = [];
async function open(width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.grantPermissions(["camera", "microphone"], { origin });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
  await page.goto(origin);
  return page;
}
const settle = (page: Page) => page.waitForSelector("[data-exiting]", { state: "detached" });
async function go(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await settle(page);
}
/** The screen keeps to the window's height. */
const fits = async (page: Page) => {
  // The page slides in sideways for a quarter of a second.
  await page.waitForTimeout(350);
  const over = await page.evaluate(() => {
    if (document.scrollingElement!.scrollHeight > innerHeight) return "page " + document.scrollingElement!.scrollHeight;
    const wide = [...document.querySelectorAll("main, [data-app-shell]")].find((e) => e.scrollWidth > e.clientWidth + 1);
    return wide ? `${wide.tagName}.${wide.className.slice(0, 60)} ${wide.scrollWidth}>${wide.clientWidth}` : "";
  });
  if (over) console.log("Overflow:", over);
  return !over;
};
const sql = (query: string, ...args: (string | number)[]) => {
  const d = openDb(db);
  d.db.query(query).run(...args);
  d.db.close();
};

try {
  const coach = await open(),
    player = await open();
  await signIn(coach, "coach_anna");
  await signIn(player, "player_ben");

  // A player applies with the address to answer on.
  await go(coach, "/coaching");
  await coach.waitForURL(/\/coaching\/coaches$/);
  await coach.waitForSelector("text=No coach has opened their page yet.");
  assert.ok(await fits(coach), "the empty list fits");
  await go(coach, "/coaching/apply");
  await coach.fill("#apply-email", "anna@example.com");
  await coach.locator('[data-event="333"]').click();
  await coach.locator('[data-event="333oh"]').click();
  await coach.fill("#apply-experience", "Sub-8 average, 40 competitions");
  await coach.fill("#apply-message", "I teach CFOP, F2L lookahead and finger tricks.");
  await coach.locator('[data-action="coaching:apply:send"]').click();
  await coach.waitForSelector('[data-slot="application"][data-status="pending"]');
  assert.ok(await fits(coach), "the application fits");
  await coach.screenshot({ path: `${SHOTS}/application.png` });

  // The administration reads it, with the e-mail address, and approves.
  const admin = await open();
  await admin.goto(origin + "/admin");
  await admin.fill("#admin-token", token);
  await admin.locator('[data-action="admin:login"]').click();
  await admin.locator('[data-action="admin:nav:coaching"]').click();
  await admin.waitForSelector('[data-slot="email"]:has-text("anna@example.com")');
  await admin.screenshot({ path: `${SHOTS}/admin.png` });
  await admin.locator('[data-action="coaching:approve"]').click();
  await admin.waitForSelector('[data-coach="coach_anna"]');

  // The coach now gets the dashboard, fills in the profile and the hours.
  await coach.reload();
  await coach.waitForSelector('[data-action="nav:coaching"]');
  await go(coach, "/coaching");
  await coach.waitForURL(/\/coaching\/dashboard$/);
  await coach.waitForSelector('[data-slot="todo"]');
  await go(coach, "/coaching/profile");
  await coach.fill("#coach-headline", "Sub-8 CFOP coach");
  await coach.fill("#coach-bio", "Ten years of cubing. We film your solves and fix your lookahead.");
  await coach.fill("#coach-languages", "English, French");
  await coach.fill("#coach-price", "25");
  await coach.locator('[data-action="profile:save"]').click();
  await coach.waitForSelector("text=Profile saved");
  assert.ok(await fits(coach), "the profile form fits");
  await coach.screenshot({ path: `${SHOTS}/coach-profile.png` });
  await go(coach, "/coaching/schedule");
  // Weekly hours every day (the rule starts on weekdays), then a day off and extra hours picked in the calendar.
  const dialog = coach.locator('[data-slot="schedule-dialog"]');
  await coach.locator('[data-action="schedule:edit"]').click();
  await coach.locator('[data-action="schedule:rule"]').click();
  for (const day of ["Sat", "Sun"]) await dialog.locator(`[aria-label="${day}"]`).click();
  await coach.locator('[data-action="schedule:save-rule"]').click();
  await dialog.waitFor({ state: "detached" });
  const calendarDays = coach.locator('[data-slot="calendar"] [data-day]:not([aria-disabled])');
  await coach.locator('[data-action="schedule:edit"]').click();
  await coach.locator('[data-action="schedule:cancel-date"]').click();
  await calendarDays.nth(2).click();
  await coach.locator('[data-action="schedule:continue"]').click();
  await coach.locator('[data-action="schedule:confirm"]').click();
  await dialog.waitFor({ state: "detached" });
  assert.match((await calendarDays.nth(2).textContent())!, /Off/);
  await coach.locator('[data-action="schedule:edit"]').click();
  await coach.locator('[data-action="schedule:add-date"]').click();
  await calendarDays.nth(3).click();
  await coach.locator('[data-action="schedule:continue"]').click();
  await coach.locator('[data-action="schedule:extra"]').click();
  await dialog.waitFor({ state: "detached" });
  // A click on the day shows its extra hours.
  await calendarDays.nth(3).click();
  await coach.waitForSelector('[data-slot="day-changes"] [data-change="open"]');
  await coach.screenshot({ path: `${SHOTS}/schedule-day.png` });
  await coach.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.ok(await fits(coach), "the schedule fits");
  await coach.screenshot({ path: `${SHOTS}/schedule.png` });

  // Another player finds the coach and books the first slot.
  await go(player, "/coaching/coaches");
  await player.waitForSelector('[data-coach="coach_anna"]');
  assert.ok(await fits(player), "the coaches fit");
  await player.screenshot({ path: `${SHOTS}/coaches.png` });
  await player.locator('[data-coach="coach_anna"]').click();
  await settle(player);
  await player.waitForSelector('[data-slot="coach-about"]');
  assert.ok(await fits(player), "the coach page fits");
  await player.screenshot({ path: `${SHOTS}/coach-about.png` });
  await player.locator('[data-action="coaching:open-booking"]').click();
  await settle(player);
  await player.waitForSelector('[data-slot="slots"] button');
  assert.ok(await fits(player), "the booking page fits");
  await player.locator('[data-slot="slots"] button').first().click();
  await player.fill("#booking-note", "My F2L is slow");
  assert.ok(await player.locator('[data-action="coaching:book"]').isDisabled(), "booking requires accepting the policy");
  await player.getByRole("checkbox", { name: "I have read and accept the cancellation policy." }).check();
  await player.screenshot({ path: `${SHOTS}/coach-page.png` });
  await player.locator('[data-action="coaching:book"]').click();
  await player.waitForURL(/\/coaching\/sessions$/);
  await player.locator('[data-slot="calendar"] [data-session]').first().click();
  await player.waitForSelector('[data-slot="sessions"] [data-booking]');
  const booking = (await player.locator('[data-slot="sessions"] [data-booking]').first().getAttribute("data-booking"))!;
  await player.screenshot({ path: `${SHOTS}/sessions.png` });

  // The coach's dashboard follows live.
  await go(coach, "/coaching/dashboard");
  await coach.waitForSelector(`[data-slot="upcoming"] [data-booking="${booking}"]`);
  assert.ok(await fits(coach), "the dashboard fits");
  await coach.screenshot({ path: `${SHOTS}/dashboard.png` });

  // The session shows in the coach's calendar: a click tells who booked, and their profile opens in a dialog.
  await go(coach, "/coaching/schedule");
  const chip = coach.locator(`[data-slot="calendar"] [data-booking="${booking}"]`);
  await coach.waitForSelector('[data-slot="calendar"] [data-day]');
  if (!(await chip.count())) await coach.locator('[data-action="calendar:next"]').click();
  await chip.click();
  await coach.waitForSelector('[data-slot="session-card"]:has-text("My F2L is slow")');
  await coach.locator('[data-action="person:profile"]').click();
  await coach.waitForSelector('[data-slot="person-dialog"] :text("Sessions together")');
  await coach.screenshot({ path: `${SHOTS}/person.png` });
  await coach.keyboard.press("Escape");
  await coach.waitForSelector('[data-slot="person-dialog"]', { state: "detached" });

  // They write to each other: the coach sees the unread count, then answers.
  await go(player, "/coaching/messages");
  await player.locator('[data-slot="conversations"] a').first().click();
  const conversationUrl = player.url();
  await player.locator('form [data-action="chat:book"]').click();
  await player.waitForURL(/\/book$/);
  await player.getByRole("button", { name: "Back to conversation", exact: true }).click();
  await player.waitForURL(conversationUrl);
  await player.fill('[data-action="chat:input"]', "Hello! Should I bring my main?");
  await player.keyboard.press("Enter");
  await player.waitForSelector('[data-mine]:has-text("Should I bring my main?")');
  await coach.waitForSelector('[data-slot="coaching-unread"]:visible');
  await go(coach, "/coaching/students");
  await coach.locator('[data-slot="students"] a').first().click();
  await coach.waitForSelector('[data-slot="chat"] p:has-text("Should I bring my main?")');
  await coach.waitForSelector('[data-slot="coaching-unread"]', { state: "detached" });
  await coach.fill('[data-action="chat:input"]', "Yes, and a timer.");
  await coach.keyboard.press("Enter");
  await player.waitForSelector('[data-slot="chat"] p:has-text("Yes, and a timer.")');
  await coach.fill("#student-note", "Slow F2L, works on lookahead");
  await coach.locator("#student-note").blur();
  await coach.waitForSelector('label[for="student-note"]:not(:has-text("Unsaved")):not(:has-text("Saving"))');
  assert.ok(await fits(coach), "the students view fits");
  await coach.screenshot({ path: `${SHOTS}/students.png` });

  // The session starts now: both join the call and see each other's camera.
  sql("UPDATE coach_bookings SET starts_at=?,ends_at=? WHERE id=?", Date.now() - 60_000, Date.now() + 3_540_000, booking);
  await go(coach, "/coaching/call/" + booking);
  await coach.waitForSelector('[data-slot="stage"][data-phase="waiting"]');
  await player.waitForSelector(`text=coach_anna is waiting in your session`);
  await go(player, "/coaching/call/" + booking);
  // Offer and answer cross; then the state each side sends of its devices arrives with them.
  await Promise.all([coach.waitForSelector('[data-slot="stage"]:is([data-phase="connecting"],[data-phase="connected"])'), player.waitForSelector('[data-slot="stage"]:is([data-phase="connecting"],[data-phase="connected"])')]);
  await player.locator('[data-action="call:mic"]').click();
  await coach.waitForSelector("text=Muted");
  // The media itself needs ICE candidates, which some sandboxed Chromium builds never gather (none even for a lone
  // data channel): CUBIX_TEST_MEDIA=1 checks the connection and the received video where they do.
  if (process.env.CUBIX_TEST_MEDIA) {
    await Promise.all([coach.waitForSelector('[data-slot="stage"][data-phase="connected"]', { timeout: 20000 }), player.waitForSelector('[data-slot="stage"][data-phase="connected"]', { timeout: 20000 })]);
    for (const page of [coach, player])
      await page.waitForFunction(() => {
        const video = document.querySelector<HTMLVideoElement>('[data-slot="stage"] > video');
        return !!video && video.videoWidth > 0 && !video.paused;
      });
  }
  assert.ok(await fits(coach), "the call fits");
  await coach.waitForTimeout(800);
  await coach.screenshot({ path: `${SHOTS}/call-coach.png` });
  await player.screenshot({ path: `${SHOTS}/call-player.png` });
  await player.locator('[data-action="call:leave"]').click();
  await coach.waitForSelector('[data-slot="stage"][data-phase="waiting"]');
  await coach.locator('[data-action="call:leave"]').click();

  // Over: the student reviews it and the coach's page shows the rating.
  sql("UPDATE coach_bookings SET starts_at=?,ends_at=? WHERE id=?", Date.now() - 7_200_000, Date.now() - 3_600_000, booking);
  // The list on screen still holds the session as it was before the change above.
  await player.reload();
  await player.waitForSelector('[data-action="sessions:past"]');
  await player.locator('[data-action="sessions:past"]').click();
  await player.locator(`[data-slot="calendar"] [data-session="${booking}"]`).click();
  await player.locator('[data-action="coaching:review"]').click();
  await player.locator('[data-rating="5"]').click();
  await player.getByLabel("Comment").fill("Clear and patient, my F2L is already faster.");
  await player.locator('[data-action="coaching:review:save"]').click();
  await player.waitForSelector("text=Thanks for your review");
  await go(player, "/coaching/coaches");
  await player.locator('[data-coach="coach_anna"]').click();
  await player.waitForSelector('[data-slot="reviews"] p:has-text("Clear and patient")');
  await player.screenshot({ path: `${SHOTS}/coach-reviewed.png` });

  // Phones: the same screens keep to the window.
  await player.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/coaching/coaches", "/coaching/sessions", "/coaching/messages"]) {
    await go(player, path);
    await player.waitForTimeout(300);
    assert.ok(await fits(player), `${path} fits a phone`);
  }
  await player.screenshot({ path: `${SHOTS}/phone-messages.png` });
  assert.deepEqual(errors, []);
  console.log("Coaching UI: OK");
} finally {
  if (errors.length) console.log("Page errors:", errors);
  await browser.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
