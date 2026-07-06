export type AgentMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: unknown;
};

export type AgentStreamInput = {
	messages?: AgentMessage[];
	prompt?: unknown;
};

export type AgentStreamResponse = {
	text?: string;
	textStream?: AsyncIterable<string>;
	fullStream?: AsyncIterable<unknown>;
};

export type AgentLike = {
	stream: (input: AgentStreamInput) => AgentStreamResponse | Promise<AgentStreamResponse>;
};

export type AgentContext = {
	bot?: {
		chat?: unknown;
		tools?: Record<string, unknown>;
	};
};

export type BotContext = Record<string, unknown>;

export type BotLike = {
	initialize?: () => Promise<void> | void;
	webhooks?: {
		web?: (
			request: Request,
			options?: { waitUntil?: (task: Promise<unknown>) => void },
		) => Response | Promise<Response>;
	};
};

export type AgentApp<TAgent extends AgentLike = AgentLike, TBot extends BotLike = BotLike> = {
	name: string;
	createAgent: (ctx: AgentContext) => TAgent;
	createBot?: (ctx: BotContext) => TBot;
};

export type DefinedTool<Id extends string = string, Tool = unknown> = Tool & {
	readonly id: Id;
};

export function defineAgentApp<const TApp extends AgentApp>(app: TApp): TApp {
	return app;
}

export function defineTool<const Id extends string, Tool>(id: Id, aiSdkTool: Tool): DefinedTool<Id, Tool> {
	return Object.assign(aiSdkTool as object, { id }) as DefinedTool<Id, Tool>;
}

export function toolset<const TTools extends readonly DefinedTool[]>(tools: TTools): Toolset<TTools> {
	return Object.fromEntries(tools.map((tool) => [tool.id, withoutId(tool)])) as Toolset<TTools>;
}

type Toolset<TTools extends readonly DefinedTool[]> = {
	[Tool in TTools[number] as Tool["id"]]: Omit<Tool, "id">;
};

function withoutId<Tool extends DefinedTool>(tool: Tool): Omit<Tool, "id"> {
	const { id: _id, ...aiSdkTool } = tool;
	return aiSdkTool;
}

export function isAgentApp(value: unknown): value is AgentApp {
	if (!isRecord(value)) {
		return false;
	}

	return typeof value.name === "string" && typeof value.createAgent === "function";
}

export function assertAgentApp(value: unknown): asserts value is AgentApp {
	if (!isAgentApp(value)) {
		throw new Error(
			"Facet entrypoint must export an agent app with { name, createAgent }.",
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
