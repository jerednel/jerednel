# Faceless YT

A **LangGraph.js** pipeline that turns a single topic into a ready-to-upload
faceless YouTube video: title, script, voiceover, visuals, captions, and an
assembled MP4.

This is the shovel we sell to the faceless-YouTube gold miners. The moat is the
**workflow + brand memory + distribution loop**, not any single model — so every
model call goes through a provider seam you can swap with a config change.

## The graph

```
START → ① ideate → ② narrate → ③ visualize → ④ assemble → ⑤ publish → END
```

| Node        | Does                                             | Provider (swappable)        |
| ----------- | ------------------------------------------------ | --------------------------- |
| ① ideate    | topic → title, description, tags, hook, scenes   | Anthropic / OpenAI / Google |
| ② narrate   | script → per-scene voiceover + timing            | ElevenLabs                  |
| ③ visualize | scenes → image/b-roll prompts + assets           | Flux / stock (stub)         |
| ④ assemble  | crop-to-fill + Ken Burns + captions + music → MP4 | ffmpeg                      |
| ⑤ publish   | upload as draft/scheduled                        | YouTube Data API (stub)     |

It's a `StateGraph`, so adding a human-review node between `ideate` and
`narrate`, or a regenerate loop, is a one-line edge change — not a rewrite.

## Swapping providers

The whole point. The LLM is resolved once, from config, via LangChain's
`initChatModel` (`src/providers/llm.ts`). To move from Claude to GPT to Gemini,
change two env vars — no code touches:

```bash
LLM_PROVIDER=anthropic     LLM_MODEL=claude-sonnet-5     # default
LLM_PROVIDER=openai        LLM_MODEL=gpt-4.1
LLM_PROVIDER=google-genai  LLM_MODEL=gemini-2.5-pro
```

The non-LLM stages (TTS, image, publish) follow the same pattern: a
`*_PROVIDER` env var selects the adapter, with `auto` = use the real vendor if
its key is present, else fall back to mock.

## Quick start

Web app — landing page, creation workflow, and asset portal:

```bash
cd faceless-yt
npm install
npm run serve                     # → http://localhost:3000
```

- `/` — marketing landing page
- `/create` — the workflow: topic → **review/edit script** → render
- `/app` — your portal: preview, download, delete every video

The workflow gates the expensive step: generating the script is fast and cheap,
and you approve (or edit) it before any voice/image credits are spent.

Or drive it from the CLI:

```bash
npm run demo                             # full pipeline, mock mode, zero keys
npx tsx src/cli.ts "The paperclip"       # full pipeline
npx tsx src/cli.ts script "The paperclip"  # script only (cheap propose phase)
npx tsx src/cli.ts render <slug>           # render an approved project
```

With no keys set, every stage runs in **mock mode** — and if `ffmpeg` is
installed it still renders a real `video.mp4`: mock narration is silent audio at
the estimated per-scene duration, and mock visuals are text-card placeholders.
Dropping in ElevenLabs audio and Flux images changes nothing downstream — the
same scene/concat render path consumes them. (No ffmpeg → it writes a plan-only
`render.sh` instead.)

```bash
# real script generation, everything else mock:
ANTHROPIC_API_KEY=sk-... npx tsx src/cli.ts "3 castles with dark histories"
```

## Output

```
out/<slug>/
  project.json   full structured project (brief + assets + plan)
  script.md      human-readable script for review/editing
  render.sh      ffmpeg render plan (annotates any missing assets)
  assets/        narration audio + scene images (when real stages run)
```

## Roadmap (MVP → product)

1. **MVP:** topic → script → storyboard → rendered MP4. ✅
2. **Real vendors wired:** OpenAI (script + gpt-image-2 visuals) + ElevenLabs
   (voice) → genuinely postable video. ✅
3. **Cinematic render:** crop-to-fill 16:9, Ken Burns motion, fades, optional
   music bed. ✅
4. **Web UI:** type a topic, live progress, preview/download. ✅
5. YouTube Data API upload + scheduling (the `publish` node stub).
6. A review/edit step between script and render (approve before spending render $).
7. Brand kits (voice, niche, visual style presets) + content calendar.
8. Billing + **credit metering** (Stripe) — every render has real API cost, so
   meter it before adding features.
9. Analytics loop: pull per-video performance back to tune hooks/titles.

## Layout

```
src/
  config.ts            env + provider selection
  providers/llm.ts     the swappable-LLM seam (initChatModel)
  schemas.ts           zod schema for the video brief (structured output)
  state.ts             LangGraph shared state
  render/ffmpeg.ts     ffmpeg primitives (Ken Burns scene, concat, music)
  providers/image.ts   swappable image gen (OpenAI gpt-image-*, Replicate/Flux)
  nodes/               ideate · narrate · visualize · assemble · publish
  graph.ts             full / script-only / production StateGraphs
  pipeline.ts          project lifecycle (script, render, list, delete)
  cli.ts               entrypoint (full | script | render modes)
  server.ts            web app (landing, workflow, portal) + APIs
web/
  landing.html         marketing page
  create.html          creation workflow (topic → review → render)
  portal.html          asset library
  style.css            shared styles
```
