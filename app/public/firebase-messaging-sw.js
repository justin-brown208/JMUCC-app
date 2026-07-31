/*
 * Firebase Cloud Messaging service worker.
 *
 * The FCM SDK auto-registers this file at its own scope
 * (/firebase-cloud-messaging-push-scope), so it lives alongside the PWA's
 * Workbox service worker at "/" without conflict.
 *
 * Config below is the same public web config as app/src/firebase.ts — a service
 * worker can't import from src, so it's repeated here (public identifiers only).
 *
 * Because sends include a `notification` payload, FCM displays background
 * notifications automatically once messaging is initialized — no explicit
 * onBackgroundMessage handler (one that also displayed would double them).
 */
importScripts(
  "https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyAwZTLGv3IboOXbCHAoFSHY1Ml2E9K-Iy0",
  authDomain: "jmucc-app.firebaseapp.com",
  projectId: "jmucc-app",
  storageBucket: "jmucc-app.firebasestorage.app",
  messagingSenderId: "799572583465",
  appId: "1:799572583465:web:fa961368b9bfa0cb2fa838",
});

firebase.messaging();
