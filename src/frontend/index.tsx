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
