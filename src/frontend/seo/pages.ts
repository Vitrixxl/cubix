export const SEO_PAGES = {
  playground: { path: '/', title: "Rubik's Cube Timer – Free Online Speedcubing Timer | Cubix", heading: "Free online Rubik’s cube timer", description: 'Time your Rubik’s cube solves with Cubix. Free keyboard and mobile cube timer with scrambles, Ao5 and Ao12 averages, solve history and algorithm training.', index: true },
  algorithms: { path: '/algorithms/', title: 'Rubik’s Cube Algorithms: F2L, OLL & PLL | Cubix', heading: 'Rubik’s cube algorithms, with 3D playback', description: 'Explore F2L, OLL and PLL algorithms in Cubix. View case diagrams, play moves on a 3D cube and practise selected cases with a built-in training timer.', index: true },
  training: { path: '/training/', title: 'Rubik’s Cube Algorithm Trainer & Practice Timer | Cubix', heading: 'Practise cube algorithms with a training timer', description: 'Build a focused speedcubing practice session. Select cube cases, repeat their setups, reveal solutions and track your times with the Cubix algorithm trainer.', index: true },
  community: { path: '/community/', title: 'Speedcubing Community | Cubix', heading: 'Cubix community', description: 'Connect with other cubers on Cubix.', index: false },
  messages: { path: '/messages/', title: 'Messages | Cubix', heading: 'Your messages', description: 'Your Cubix conversations and shared solves.', index: false },
  profile: { path: '/account/', title: 'Your Speedcubing Account | Cubix', heading: 'Your Cubix account', description: 'Manage your Cubix account and solve history.', index: false },
  overviewGuide: { path: '/guides/about-cubix/', title: 'Cubix: Free Cube Timer and Speedcubing Practice | Cubix', heading: 'Free online Rubik’s cube timer', description: 'Discover Cubix: keyboard and touch timing, supported puzzles, session statistics, offline practice and frequently asked questions.', index: true },
  algorithmsGuide: { path: '/guides/cube-algorithms/', title: 'How to Practise F2L, OLL and PLL Algorithms | Cubix', heading: 'Rubik’s cube algorithms, with 3D playback', description: 'Learn how to browse cube algorithms, inspect cases and 3D solutions, and turn reference moves into repeated practice with Cubix.', index: true },
  trainingGuide: { path: '/guides/algorithm-training/', title: 'How to Use the Algorithm Trainer | Cubix', heading: 'Practise cube algorithms with a training timer', description: 'Set up a focused algorithm training session in Cubix: select cases, apply setups, reveal solutions and review your attempts.', index: true },
  timerGuide: { path: '/guides/how-to-use-a-cube-timer/', title: 'How to Use a Rubik’s Cube Timer on Desktop & Mobile | Cubix', heading: 'How to use an online cube timer', description: 'Learn how to start and stop the Cubix timer with the spacebar or touchscreen, use scrambles, record penalties and review your speedcubing practice.', index: true },
  averagesGuide: { path: '/guides/ao5-ao12/', title: 'Ao5 & Ao12 Explained: Cube Timer Averages and DNF | Cubix', heading: 'Ao5 and Ao12: how cube timer averages work', description: 'Understand average of 5, average of 12, +2 penalties and DNF in Cubix. Follow worked examples and learn how averages differ from your best solve and mean.', index: true },
  cubeModelsGuide: { path: '/guides/cube-models/', title: 'Cube Models and Reference Sources | Cubix', heading: 'Physical cube models', description: 'Explore photo-based cube surface models, their reference sources, and browser caching for the selected 3D model.', index: true },
} as const;
export type SeoPage = keyof typeof SEO_PAGES;
export const PUBLIC_PAGES = (Object.keys(SEO_PAGES) as SeoPage[]).filter(key => SEO_PAGES[key].index);
export const isGuide = (page: SeoPage) => SEO_PAGES[page].path.startsWith('/guides/');
export function structuredData(page: SeoPage, origin: string) {
  if (!origin || !SEO_PAGES[page].index) return null;
  const info = SEO_PAGES[page], url = origin + info.path;
  const website = { '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: 'Cubix', inLanguage: 'en' };
  const webpage = { '@type': 'WebPage', '@id': url + '#webpage', url, name: info.title, description: info.description, inLanguage: 'en', isPartOf: { '@id': website['@id'] } };
  const graph: object[] = [website, webpage];
  if (page === 'playground') graph.push({ '@type': 'WebApplication', '@id': origin + '/#app', name: 'Cubix', url, description: info.description, applicationCategory: 'SportsApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript. A modern browser is recommended.', isAccessibleForFree: true, inLanguage: 'en', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: ['Keyboard and touchscreen timer', 'Cube scrambles', 'Ao5 and Ao12 averages', 'Solve history', 'Algorithm training', 'Offline practice after the app is cached'] });
  if (page !== 'playground') graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Cube timer', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: info.heading, item: url }] });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export const helpPath = (page: SeoPage) => SEO_PAGES[page === 'training' ? 'trainingGuide' : page === 'algorithms' ? 'algorithmsGuide' : 'overviewGuide'].path;
