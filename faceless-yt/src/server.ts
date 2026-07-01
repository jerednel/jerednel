// Web app: marketing landing page, a creation workflow (script → review →
// render), and a portal to manage generated assets. Zero extra deps — built-in
// http, static files from web/, and the shared pipeline module.
import { createServer, type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { config, slugify } from "./config.js";
import {
  runScript,
  updateBrief,
  listProjects,
  loadProject,
  deleteProject,
} from "./pipeline.js";

const PORT = Number(process.env.PORT) || 3000;
const webDir = join(config.projectRoot, "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

function json(res: import("node:http").ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function serveFile(res: import("node:http").ServerResponse, path: string) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const p = url.pathname;
  const method = req.method || "GET";

  try {
    // ── pages ──────────────────────────────────────────────
    if (p === "/") return void (await serveFile(res, join(webDir, "landing.html")));
    if (p === "/app") return void (await serveFile(res, join(webDir, "portal.html")));
    if (p === "/create") return void (await serveFile(res, join(webDir, "create.html")));
    if (p === "/style.css") return void (await serveFile(res, join(webDir, "style.css")));

    // ── workflow: 1) generate script (cheap) ───────────────
    if (p === "/api/script" && method === "POST") {
      const { topic } = await readBody(req);
      if (!topic?.trim()) return json(res, 400, { error: "missing topic" });
      const state = await runScript(topic.trim());
      return json(res, 200, { slug: state.slug, brief: state.brief });
    }

    // ── workflow: 2) save the reviewed/edited brief ────────
    if (p === "/api/brief" && method === "POST") {
      const { slug, brief } = await readBody(req);
      if (!slug || !brief) return json(res, 400, { error: "missing slug or brief" });
      await updateBrief(slug, brief);
      return json(res, 200, { ok: true });
    }

    // ── workflow: 3) render approved project (SSE) ─────────
    if (p === "/api/render" && method === "GET") {
      const slug = (url.searchParams.get("slug") || "").trim();
      if (!slug) return void json(res, 400, { error: "missing slug" });
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: string) => res.write(`event: ${event}\ndata: ${data}\n\n`);
      const child = spawn("./node_modules/.bin/tsx", ["src/cli.ts", "render", slug], {
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
        if (code === 0) send("done", JSON.stringify({ slug }));
        else send("fail", `render exited with code ${code}`);
        res.end();
      });
      req.on("close", () => child.kill());
      return;
    }

    // ── portal: list / read / delete projects ──────────────
    if (p === "/api/projects" && method === "GET") {
      return json(res, 200, { projects: await listProjects() });
    }
    if (p.startsWith("/api/project/")) {
      const slug = decodeURIComponent(p.slice("/api/project/".length));
      if (method === "DELETE") {
        await deleteProject(slug);
        return json(res, 200, { ok: true });
      }
      const state = await loadProject(slug);
      if (!state) return json(res, 404, { error: "not found" });
      return json(res, 200, state);
    }

    // ── media ──────────────────────────────────────────────
    if (p.startsWith("/video/")) {
      const slug = decodeURIComponent(p.slice("/video/".length)).replace(/\.mp4$/, "");
      const file = join(config.outDir, slugify(slug), "video.mp4");
      try {
        const info = await stat(file);
        res.writeHead(200, { "content-type": "video/mp4", "content-length": info.size });
        return void res.end(await readFile(file));
      } catch {
        res.writeHead(404);
        return void res.end("video not found");
      }
    }

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`▶ Faceless YT → http://localhost:${PORT}`);
  console.log(`  /         landing page`);
  console.log(`  /create   creation workflow`);
  console.log(`  /app      asset portal`);
});
