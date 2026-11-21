import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./app";
import { applyCatalogFixes } from "./lib/catalogFixes";

// Entry point when the server runs on Vercel instead of a always-on host. Vercel starts the code on demand and sleeps it
// when idle, so there is no listen() and no keep-alive: each request goes straight into the same Express app.
let started = false;
export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (!started) {
    started = true;
    void applyCatalogFixes().catch(() => { /* the fixes are one-time tidy-ups, never block a request */ });
  }
  return (app as unknown as (a: IncomingMessage, b: ServerResponse) => void)(req, res);
}
