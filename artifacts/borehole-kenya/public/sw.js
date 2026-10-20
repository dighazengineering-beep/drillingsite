// Minimal service worker: it makes the site installable as an app. It does not cache anything, so visitors always get the latest site.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
