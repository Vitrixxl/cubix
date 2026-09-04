import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider>
      <Suspense fallback={<div className="boot">Loading…</div>}>
        <App />
      </Suspense>
    </Provider>
  </StrictMode>,
);
