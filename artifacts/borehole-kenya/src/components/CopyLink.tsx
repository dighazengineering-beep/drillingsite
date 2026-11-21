import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { copyText } from "@/lib/copy";

/** "Copy link" (and, on phones that have it, "Share") for a document: quote, contract or receipt. `url` may be a function when the link has to be asked from the server first. */
export default function CopyLink({ url, label = "Copy link", withShare = false, className = "", testId }: {
  url: string | (() => Promise<string>); label?: string; withShare?: boolean; className?: string; testId?: string;
}) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const get = async () => { setErr(""); try { const u = typeof url === "function" ? await url() : url; if (!/^https?:\/\//.test(u)) throw new Error("no link"); return u; } catch { setErr("No link yet"); window.setTimeout(() => setErr(""), 2500); return ""; } };
  const base = "inline-flex items-center gap-1 text-[11px] font-bold text-primary underline underline-offset-2";
  const canShare = withShare && typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" className={className || base} data-testid={testId} onClick={async () => { const u = await get(); if (!u) return; if (await copyText(u)) { setDone(true); window.setTimeout(() => setDone(false), 1800); } else window.prompt("Copy this link", u); }}>
        {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {err || (done ? "Link copied" : label)}
      </button>
      {canShare && (
        <button type="button" className={base} onClick={async () => { const u = await get(); if (u) void navigator.share({ title: label, url: u }).catch(() => {}); }}>
          <Share2 className="h-3 w-3" /> Share
        </button>
      )}
    </span>
  );
}
