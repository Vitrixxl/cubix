// Run before every page of the main window. On the web app's origin it gives the page what desktop/electron/preload.ts
// gives it under Electron (see DesktopBridge in desktop/renderer/bridge.ts); on offline/index.html, where to go.
(() => {
  const start = new URL("__START__");
  if (location.origin !== start.origin) return void (window.cubixStart = start.href);
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  Object.defineProperty(window, "cubixDesktop", {
    value: Object.freeze({
      legacyStorage: () => invoke("legacy_read"),
      legacyImported: () => invoke("legacy_imported"),
      open: (url) => invoke("open_external", { url }),
      // Electron's only event is Windows' mouse back/forward, which WebView2 handles as a browser does.
      onEvent: () => () => {},
    }),
  });
})();
