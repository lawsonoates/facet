# Facet

Facet is a small TypeScript-first way to build agents with the AI SDK and expose them through reusable interaction surfaces.

The app owns its TypeScript modules. The Facet CLI loads an app entrypoint and decides how to run it.

## Packages

- `@facet/agent`: app contract, stable tool IDs, toolset helper, TUI surface, and bot bridge.
- `@facet/cli`: `facet tui`, `facet prompt`, `facet serve`, and `facet init`.
- `@facet/tui`: OpenTUI terminal UI plus low-level stream rendering helpers.

## App Entrypoint

```ts
import { defineAgentApp } from "@facet/agent";
import { createAgent } from "./agent";
import { createBot } from "./bot";

export default defineAgentApp({
	name: "badperf",
	createAgent,
	createBot,
});
```

`createBot` is optional. `createAgent` should return an AI SDK-compatible agent with a `stream` method.

## Tools

```ts
import { tool } from "ai";
import { z } from "zod";
import { defineTool, toolset } from "@facet/agent";

const lighthouseTool = defineTool(
	"lighthouse",
	tool({
		description: "Run Lighthouse against a website.",
		inputSchema: z.object({
			url: z.string().url(),
		}),
		execute: async ({ url }) => ({ url, score: 92 }),
	}),
);

export const tools = toolset([lighthouseTool]);
```

## CLI

```bash
facet tui [entrypoint]
facet prompt [entrypoint] "audit https://example.com"
facet serve [entrypoint] --port 3000
facet init [name] --dir .
```

The default entrypoint is `src/index.ts`.

## TUI

`facet tui` uses the OpenTUI-based `@facet/tui` surface. It renders markdown, reasoning text, streaming assistant output, and tool-call status while `@facet/agent/tui` owns the message loop.

## Bot

`createBotAgent` in `@facet/agent/bot` bridges Chat SDK bots to an AI SDK agent:

- creates Chat SDK tools with `createChatTools`
- listens with `bot.onDirectMessage`
- collects recent `thread.allMessages`
- converts history with `toAiMessages`
- posts `response.fullStream` back to the thread

## Development

```bash
bun install
bun run check
bun run typecheck
```
