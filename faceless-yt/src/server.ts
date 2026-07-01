// Minimal web UI so a non-technical creator can drive the pipeline: type a
// topic, watch live stage progress (SSE), then preview/download the MP4. Zero
// extra deps — built-in http + a child process running the existing CLI, so the
// UI and CLI can never drift.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { config, slugify } from "./config.js";

const PORT = Number(process.env.PORT) || 3000;

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Faceless YT</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 system-ui,sans-serif; background:#0b1020; color:#e5e9f0; }
  .wrap { max-width:760px; margin:0 auto; padding:40px 20px; }
  h1 { font-size:28px; margin:0 0 4px; }
  p.sub { color:#8b93a7; margin:0 0 28px; }
  form { display:flex; gap:10px; margin-bottom:20px; }
  input { flex:1; padding:14px 16px; border-radius:10px; border:1px solid #2a3350;
          background:#111830; color:#e5e9f0; font-size:16px; }
  button { padding:14px 22px; border:0; border-radius:10px; background:#4f7cff;
           color:#fff; font-weight:600; font-size:16px; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  .log { background:#0a0f1f; border:1px solid #1c2440; border-radius:10px; padding:16px;
         font:13px/1.6 ui-monospace,monospace; white-space:pre-wrap; min-height:60px;
         color:#a8b3cf; display:none; }
  video { width:100%; border-radius:12px; margin-top:20px; display:none; background:#000; }
  .dl { display:none; margin-top:14px; }
  a.dl { color:#7fa4ff; }
  .ex { color:#6b7490; font-size:13px; margin-top:10px; }
  .ex code { cursor:pointer; color:#8b93a7; }
</style></head>
<body><div class="wrap">
  <h1>Faceless YT</h1>
  <p class="sub">One topic in → a finished, captioned YouTube video out.</p>
  <form id="f">
    <input id="topic" placeholder="e.g. 3 castles with dark histories" autocomplete="off" required>
    <button id="go" type="submit">Generate</button>
  </form>
  <div class="ex">Try:
    <code>The history of the paperclip</code> ·
    <code>3 Roman emperors who died in ridiculous ways</code>
  </div>
  <pre class="log" id="log"></pre>
  <video id="vid" controls></video>
  <a class="dl" id="dl" download>⬇ Download MP4</a>
</div>
<script>
  const f=document.getElementById('f'), log=document.getElementById('log'),
        go=document.getElementById('go'), vid=document.getElementById('vid'),
        dl=document.getElementById('dl'), topicEl=document.getElementById('topic');
  document.querySelectorAll('.ex code').forEach(c=>c.onclick=()=>{topicEl.value=c.textContent;});
  function line(t){ log.style.display='block'; log.textContent += t + "\\n"; log.scrollTop=log.scrollHeight; }
  f.onsubmit = (e) => {
    e.preventDefault();
    const topic = topicEl.value.trim(); if(!topic) return;
    go.disabled=true; log.textContent=''; vid.style.display='none'; dl.style.display='none';
    line('▶ generating "'+topic+'" — this takes a few minutes (images + voice + render)…');
    const es = new EventSource('/api/generate?topic='+encodeURIComponent(topic));
    es.addEventListener('log', ev => line(ev.data));
    es.addEventListener('done', ev => {
      const { slug } = JSON.parse(ev.data);
      const url = '/video/'+slug+'?t='+Date.now();
      vid.src=url; vid.style.display='block';
      dl.href=url; dl.style.display='inline-block';
      line('✔ done'); es.close(); go.disabled=false;
    });
    es.addEventListener('fail', ev => { line('✖ '+ev.data); es.close(); go.disabled=false; });
    es.onerror = () => { es.close(); go.disabled=false; };
  };
</script>
</body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }

  if (url.pathname === "/api/generate") {
    const topic = (url.searchParams.get("topic") || "").trim();
    if (!topic) {
      res.writeHead(400);
      res.end("missing topic");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (event: string, data: string) =>
      res.write(`event: ${event}\ndata: ${data}\n\n`);

    // Run the exact CLI the same way a terminal would, streaming its stdout.
    const child = spawn("./node_modules/.bin/tsx", ["src/cli.ts", topic], {
      cwd: config.projectRoot,
    });
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const l of lines) if (l.trim()) send("log", l.trimEnd());
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => {
      if (buf.trim()) send("log", buf.trimEnd());
      if (code === 0) send("done", JSON.stringify({ slug: slugify(topic) }));
      else send("fail", `pipeline exited with code ${code}`);
      res.end();
    });
    req.on("close", () => child.kill());
    return;
  }

  if (url.pathname.startsWith("/video/")) {
    const slug = decodeURIComponent(url.pathname.slice("/video/".length));
    const file = join(config.outDir, slug, "video.mp4");
    try {
      const info = await stat(file);
      res.writeHead(200, { "content-type": "video/mp4", "content-length": info.size });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("video not found");
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`▶ Faceless YT UI → http://localhost:${PORT}`);
});
