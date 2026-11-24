// Small service: POST /convert with a .docx (header x-key = DOCS_KEY) -> JSON-free reply: the PDF bytes, and the updated .docx at /convert?out=docx
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), { execFile } = require("child_process");
const KEY = process.env.DOCS_KEY || "";
let queue = Promise.resolve(); // one report at a time, so the memory is safe

function convert(buf, want) {
  return new Promise((ok, bad) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "c-"));
    fs.writeFileSync(d + "/in.docx", buf);
    execFile("python3", [path.join(__dirname, "conv.py"), d + "/in.docx", d], { timeout: 240000 }, (e) => {
      try { if (e) throw e; const out = fs.readFileSync(d + (want === "docx" ? "/out.docx" : "/out.pdf")); ok(out); }
      catch (x) { bad(x); } finally { fs.rmSync(d, { recursive: true, force: true }); }
    });
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/" || u.pathname === "/health") { res.end("ok"); return; }
  if (req.method !== "POST" || u.pathname !== "/convert") { res.statusCode = 404; res.end(); return; }
  if (!KEY || req.headers["x-key"] !== KEY) { res.statusCode = 401; res.end("no"); return; }
  const want = u.searchParams.get("out") === "docx" ? "docx" : "pdf";
  const chunks = []; let n = 0;
  req.on("data", (c) => { n += c.length; if (n > 60e6) req.destroy(); else chunks.push(c); });
  req.on("end", () => {
    queue = queue.then(() => convert(Buffer.concat(chunks), want)).then(
      (b) => { res.setHeader("content-type", want === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf"); res.end(b); },
      (e) => { res.statusCode = 500; res.end(String((e && e.message) || e).slice(0, 300)); });
  });
}).listen(7860, "0.0.0.0");
