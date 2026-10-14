import { Suspense, lazy } from "react";
import App from "./App.tsx";

// /ops is the laptop monitoring dashboard, outside the phone shell. Lazy so
// phones never download it.
const Ops = lazy(() => import("./screens/Ops.tsx"));
const isOps = location.pathname.replace(/\/+$/, "") === "/ops";

export function Root() {
  return isOps ? (
    <Suspense fallback={null}>
      <Ops />
    </Suspense>
  ) : (
    <App />
  );
}
