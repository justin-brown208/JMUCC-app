import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Public Firebase web config. These values are client identifiers, not secrets —
// they ship in every web build. Security is enforced by Firestore rules + Auth,
// never by hiding these. Pulled via `firebase apps:sdkconfig WEB`.
const firebaseConfig = {
  apiKey: "AIzaSyAwZTLGv3IboOXbCHAoFSHY1Ml2E9K-Iy0",
  authDomain: "jmucc-app.firebaseapp.com",
  projectId: "jmucc-app",
  storageBucket: "jmucc-app.firebasestorage.app",
  messagingSenderId: "799572583465",
  appId: "1:799572583465:web:fa961368b9bfa0cb2fa838",
};

export const app = initializeApp(firebaseConfig);

// Auth persists to local storage by default, so a signed-in session survives
// reloads — the "PIN remembered permanently until logout" behavior (PAGES.md).
export const auth = getAuth(app);

// Region MUST match the Cloud Functions deploy region (functions/src/index.ts).
export const functions = getFunctions(app, "northamerica-northeast1");

// Firestore client with a persistent (IndexedDB) cache, so reads paint
// instantly from local cache on repeat visits and refresh from the server in
// the background. Multi-tab manager lets tabs (e.g. admin + delegate) share one
// cache. Falls back to an in-memory cache where IndexedDB is unavailable.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Web Push (VAPID) public key from the Firebase console → Cloud Messaging →
// Web Push certificates. A public identifier like the rest of this config —
// safe to commit. Push registration no-ops until this is set.
export const VAPID_KEY =
  "BLJ3-gHjIA4ovLEwCd9oliJItWp0vBW_PetMtBG7xDJa0GzfthTWvE_kb1gXQp3emkYJBpVYm2iNk_iQPNC23Xg";
