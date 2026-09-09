import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import { App } from "./App";

const root = import.meta.hot
  ? (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!))
  : createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <Provider>
      <Suspense fallback={<div className="boot">Loading…</div>}>
        <App />
      </Suspense>
    </Provider>
  </StrictMode>,
);

// Development uses Bun HMR; production can reopen without a reachable server.
if (!import.meta.hot && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(error => console.error("Offline installation failed",error)); }, {once:true});
}
