export default {
  packageManager: "bun",
  scripts: {
    install: ["hutch", "pm", "install"],
    view: ["bun", "run", "scripts/build-view.ts"],
    dev: "bun run scripts/build-view.ts && hutch electrobun dev --watch",
    start: "bun run scripts/build-view.ts && hutch electrobun dev",
    build: "bun run scripts/build-view.ts && hutch electrobun build --env=stable",
  },
};
