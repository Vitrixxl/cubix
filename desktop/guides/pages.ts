/** The guides of the help dialog: name in its list, former public path (links between guides) and heading. */
export const GUIDES = {
  overviewGuide: { name: 'About Cubix', path: '/guides/about-cubix/', heading: 'About Cubix' },
  algorithmsGuide: { name: 'Algorithms', path: '/guides/cube-algorithms/', heading: 'Using the algorithm library' },
  trainingGuide: { name: 'Training', path: '/guides/algorithm-training/', heading: 'Using the algorithm trainer' },
  timerGuide: { name: 'Timer', path: '/guides/how-to-use-a-cube-timer/', heading: 'Using the cube timer' },
  duelGuide: { name: 'Duel', path: '/guides/cube-duel/', heading: 'Racing another cuber' },
  methodsGuide: { name: 'Solving methods', path: '/guides/solving-methods/', heading: 'Solving methods' },
  notationGuide: { name: 'Notation', path: '/guides/cube-notation/', heading: 'Reading move notation' },
  averagesGuide: { name: 'Ao5 and Ao12', path: '/guides/ao5-ao12/', heading: 'Ao5 and Ao12: how cube timer averages work' },
} as const;
export type Guide = keyof typeof GUIDES;
