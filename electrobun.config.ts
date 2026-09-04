import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Cubix",
    identifier: "dev.vitrix.cubix",
    version: "0.1.0",
  },
  build: {
    // Real Bun runtime: bun:sqlite + Elysia in the main process.
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    // The React view is pre-bundled by `bun run scripts/build-view.ts` into dist/view.
    copy: {
      "dist/view": "views/mainview",
    },
    watchIgnore: ["dist/**", "data/raw/**"],
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
