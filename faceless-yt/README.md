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
| ④ assemble  | images + audio + captions → `render.sh` (ffmpeg) | ffmpeg                      |
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

```bash
cd faceless-yt
npm install
npm run demo                      # runs fully in mock mode, zero keys needed
# or:
npx tsx src/cli.ts "The history of the paperclip"
```

With no keys set, every stage runs in **mock mode** and writes a complete
project to `out/<slug>/`. Add keys from `.env.example` to light up stages one at
a time.

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

1. **MVP (this scaffold):** topic → script → storyboard → render plan. ✅
2. Wire real ElevenLabs + Flux + finish the ffmpeg concat → first full MP4.
3. YouTube Data API upload + scheduling.
4. Web UI (Next.js) with a review/edit step between script and render.
5. Brand kits (voice, niche, visual style presets) + content calendar.
6. Billing + **credit metering** (Stripe) — every render has real API cost, so
   meter it before adding features.
7. Analytics loop: pull per-video performance back to tune hooks/titles.

## Layout

```
src/
  config.ts            env + provider selection
  providers/llm.ts     the swappable-LLM seam (initChatModel)
  schemas.ts           zod schema for the video brief (structured output)
  state.ts             LangGraph shared state
  nodes/               ideate · narrate · visualize · assemble · publish
  graph.ts             StateGraph wiring
  cli.ts               entrypoint
```
