#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertAgentApp, type AgentApp } from "@lawsonoates/facet-agent";
import { createTuiSurface, renderAgentResponse } from "@lawsonoates/facet-agent/tui";

const DEFAULT_ENTRYPOINT = "src/index.ts";

type ParsedArgs = {
	positionals: string[];
	flags: Map<string, string | boolean>;
};

async function main(): Promise<void> {
	const [command = "help", ...args] = Bun.argv.slice(2);

	switch (command) {
		case "tui":
			await runTui(parseArgs(args));
			return;
		case "prompt":
			await runPrompt(parseArgs(args));
			return;
		case "serve":
			await runServe(parseArgs(args));
			return;
		case "init":
			await runInit(parseArgs(args));
			return;
		case "help":
		case "--help":
		case "-h":
			printHelp();
			return;
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

async function runTui(args: ParsedArgs): Promise<void> {
	const entrypoint = args.positionals[0] ?? getStringFlag(args, "entrypoint") ?? DEFAULT_ENTRYPOINT;
	const app = await loadAgentApp(entrypoint);
	await createTuiSurface(app).run();
}

async function runPrompt(args: ParsedArgs): Promise<void> {
	const { entrypoint, prompt } = resolvePromptArgs(args);
	const app = await loadAgentApp(entrypoint);
	const agent = app.createAgent({});
	const response = await agent.stream({ prompt });
	await renderAgentResponse(response);
	process.stdout.write("\n");
}

async function runServe(args: ParsedArgs): Promise<void> {
	const entrypoint = firstEntrypointArg(args) ?? getStringFlag(args, "entrypoint") ?? DEFAULT_ENTRYPOINT;
	const port = Number(getStringFlag(args, "port") ?? "3000");
	const app = await loadAgentApp(entrypoint);

	if (!app.createBot) {
		throw new Error("This app does not define a bot surface.");
	}

	const bot = app.createBot({});
	await bot.initialize?.();

	if (!bot.webhooks?.web) {
		throw new Error("Bot surface must expose bot.webhooks.web for serve mode.");
	}

	Bun.serve({
		port,
		routes: {
			"/webhook": {
				POST: (request) =>
					bot.webhooks?.web?.(request, {
						waitUntil: (task) => {
							task.catch((error) => console.error(error));
						},
					}) ?? new Response("Webhook handler is unavailable.", { status: 503 }),
			},
		},
	});

	console.log(`Facet serving ${app.name} on http://localhost:${port}/webhook`);
}

async function runInit(args: ParsedArgs): Promise<void> {
	const name = args.positionals[0] ?? getStringFlag(args, "name") ?? "facet-app";
	const target = resolve(getStringFlag(args, "dir") ?? ".");
	const packageName = getStringFlag(args, "package") ?? name;

	await mkdir(resolve(target, "src"), { recursive: true });
	await writeFile(resolve(target, "src/index.ts"), appTemplate(packageName));
	await writeFile(resolve(target, "src/agent.ts"), agentTemplate());
	await writeFile(resolve(target, "src/bot.ts"), botTemplate(packageName));
	await writeFile(resolve(target, "src/tools.ts"), toolsTemplate());

	console.log(`Created Facet app template in ${target}`);
}

async function loadAgentApp(entrypoint: string): Promise<AgentApp> {
	const specifier = toImportSpecifier(entrypoint);
	const module = (await import(specifier)) as { default?: unknown; app?: unknown };
	const app = module.default ?? module.app;
	assertAgentApp(app);
	return app;
}

function toImportSpecifier(entrypoint: string): string {
	if (entrypoint.startsWith("file:")) {
		return entrypoint;
	}

	const path = isAbsolute(entrypoint) ? entrypoint : resolve(process.cwd(), entrypoint);
	return pathToFileURL(path).href;
}

function resolvePromptArgs(args: ParsedArgs): { entrypoint: string; prompt: string } {
	const explicitEntrypoint = getStringFlag(args, "entrypoint");

	if (explicitEntrypoint) {
		return {
			entrypoint: explicitEntrypoint,
			prompt: joinPrompt(args.positionals),
		};
	}

	const [first, ...rest] = args.positionals;

	if (first && looksLikeEntrypoint(first) && rest.length > 0) {
		return {
			entrypoint: first,
			prompt: joinPrompt(rest),
		};
	}

	return {
		entrypoint: DEFAULT_ENTRYPOINT,
		prompt: joinPrompt(args.positionals),
	};
}

function firstEntrypointArg(args: ParsedArgs): string | undefined {
	return args.positionals.find(looksLikeEntrypoint);
}

function looksLikeEntrypoint(value: string): boolean {
	return (
		value.endsWith(".ts") ||
		value.endsWith(".tsx") ||
		value.endsWith(".js") ||
		value.endsWith(".mjs") ||
		value.includes("/")
	);
}

function joinPrompt(parts: string[]): string {
	const prompt = parts.join(" ").trim();

	if (prompt.length === 0) {
		throw new Error("Prompt text is required.");
	}

	return prompt;
}

function parseArgs(args: string[]): ParsedArgs {
	const positionals: string[] = [];
	const flags = new Map<string, string | boolean>();

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (!arg) {
			continue;
		}

		if (!arg.startsWith("--")) {
			positionals.push(arg);
			continue;
		}

		const [name, inlineValue] = arg.slice(2).split("=", 2);

		if (!name) {
			continue;
		}

		if (inlineValue !== undefined) {
			flags.set(name, inlineValue);
			continue;
		}

		const next = args[index + 1];

		if (next && !next.startsWith("--")) {
			flags.set(name, next);
			index += 1;
			continue;
		}

		flags.set(name, true);
	}

	return { positionals, flags };
}

function getStringFlag(args: ParsedArgs, name: string): string | undefined {
	const value = args.flags.get(name);
	return typeof value === "string" ? value : undefined;
}

function appTemplate(name: string): string {
	return `import { defineAgentApp } from "@lawsonoates/facet-agent";
import { createAgent } from "./agent";
import { createBot } from "./bot";

export default defineAgentApp({
\tname: ${JSON.stringify(name)},
\tcreateAgent,
\tcreateBot,
});
`;
}

function agentTemplate(): string {
	return `import { createOpenAI } from "@ai-sdk/openai";
import type { AgentContext } from "@lawsonoates/facet-agent";
import { ToolLoopAgent } from "ai";
import { tools } from "./tools";

const openai = createOpenAI({
\tapiKey: process.env.OPENAI_API_KEY,
});

export function createAgent(ctx: AgentContext = {}) {
\treturn new ToolLoopAgent({
\t\tmodel: openai.responses("gpt-5.5"),
\t\tinstructions: "You are a focused agent.",
\t\ttools: {
\t\t\t...ctx.bot?.tools,
\t\t\t...tools,
\t\t},
\t});
}
`;
}

function botTemplate(userName: string): string {
	return `import { createMemoryState } from "@chat-adapter/state-memory";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createWebAdapter } from "@chat-adapter/web";
import { createBotAgent } from "@lawsonoates/facet-agent/bot";
import { Chat } from "chat";
import { createAgent } from "./agent";

export function createBot() {
\tconst bot = new Chat({
\t\tadapters: {
\t\t\tweb: createWebAdapter({
\t\t\t\tgetUser: () => ({ id: "123" }),
\t\t\t\tuserName: ${JSON.stringify(userName)},
\t\t\t}),
\t\t\ttelegram: createTelegramAdapter({ mode: "polling" }),
\t\t},
\t\tconcurrency: "queue",
\t\tfallbackStreamingPlaceholderText: "Thinking...",
\t\tstate: createMemoryState(),
\t\tuserName: ${JSON.stringify(userName)},
\t});

\tcreateBotAgent({
\t\tbot,
\t\tcreateAgent,
\t\thistoryLimit: 20,
\t});

\treturn bot;
}
`;
}

function toolsTemplate(): string {
	return `import { tool } from "ai";
import { z } from "zod";
import { defineTool, toolset } from "@lawsonoates/facet-agent";

const echoTool = defineTool(
\t"echo",
\ttool({
\t\tdescription: "Echo text back to the caller.",
\t\tinputSchema: z.object({
\t\t\ttext: z.string(),
\t\t}),
\t\texecute: async ({ text }) => ({ text }),
\t}),
);

export const tools = toolset([echoTool]);
`;
}

function printHelp(): void {
	console.log(`facet

Usage:
  facet tui [entrypoint]
  facet prompt [entrypoint] <prompt>
  facet serve [entrypoint] [--port 3000]
  facet init [name] [--dir .]

Default entrypoint: ${DEFAULT_ENTRYPOINT}
`);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
