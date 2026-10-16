/**
 * The timer's metronome: a soft tick on every beat while a solve runs, to keep the turning even. Web Audio, in the
 * web page, or on the phone in the hidden WebView of its scrambler (mobile/scripts/scrambler-entry.ts).
 */
import { msg } from "../i18n/msg";

/** Off (0) or the beats per minute offered. */
export const METRONOME_CHOICES = [0, 60, 80, 100, 120, 140, 160, 180, 200, 240, 300].map((bpm) => ({ id: String(bpm), label: bpm ? msg("{0} BPM", { 0: bpm }) : msg("Off") }));
/** A stored choice as beats per minute: 0 (off) for anything not offered. */
export const metronomeBpm = (value: unknown) => (METRONOME_CHOICES.some((c) => c.id === String(value)) ? Number(value) : 0);

let context: AudioContext | undefined;

/** Ticks at `bpm` until the function it returns is called. Silent where there is no Web Audio. */
export function startMetronome(bpm: number): () => void {
  if (typeof AudioContext === "undefined" || bpm <= 0) return () => {};
  const audio = (context ??= new AudioContext());
  if (audio.state === "suspended") void audio.resume();
  // Each tick is set on the audio clock a little ahead, steady whatever the page's timers do; those not played yet are
  // called off at the stop.
  const ahead: { tone: OscillatorNode; at: number }[] = [];
  let next = audio.currentTime + 0.05;
  const schedule = () => {
    while (ahead.length && ahead[0]!.at < audio.currentTime) ahead.shift();
    for (; next < audio.currentTime + 0.25; next += 60 / bpm) ahead.push({ tone: tick(audio, next), at: next });
  };
  schedule();
  const timer = setInterval(schedule, 50);
  return () => {
    clearInterval(timer);
    for (const { tone } of ahead) tone.stop(audio.currentTime);
  };
}

/** A short soft click at `at`: a high tone faded in and out within 50 ms. */
function tick(audio: AudioContext, at: number) {
  const tone = audio.createOscillator(),
    gain = audio.createGain();
  tone.frequency.value = 1100;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  tone.connect(gain).connect(audio.destination);
  tone.start(at);
  tone.stop(at + 0.06);
  return tone;
}
