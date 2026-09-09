/** The local module tree preserves cubing.js's worker URLs in dev, production and offline. */
const moduleURL = (name: string) => `/vendor/cubing/${name}/index.js`;
export const loadScrambler = () => import(moduleURL("scramble")) as Promise<typeof import("cubing/scramble")>;
export const loadSearch = () => import(moduleURL("search")) as Promise<typeof import("cubing/search")>;
export const loadKPuzzle = () => import(moduleURL("kpuzzle")) as Promise<typeof import("cubing/kpuzzle")>;
export const loadTwisty = () => import(moduleURL("twisty")) as Promise<typeof import("cubing/twisty")>;
