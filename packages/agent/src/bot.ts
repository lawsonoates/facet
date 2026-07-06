import { createChatTools, toAiMessages, type ChatBinding, type ChatToolPreset } from "chat/ai";
import type { Message } from "chat";
import type { AgentContext, AgentLike } from "./agent";

export type CreateBotAgentOptions<TBot, TAgent extends AgentLike = AgentLike> = {
	bot: TBot;
	createAgent: (ctx: AgentContext) => TAgent;
	historyLimit?: number;
	chatTools?: false | ChatToolsOptions;
};

export type ChatToolsOptions = {
	preset?: ChatToolPreset | ChatToolPreset[];
	requireApproval?: Parameters<typeof createChatTools>[0]["requireApproval"];
};

type DirectMessageThread = {
	allMessages?: AsyncIterable<unknown>;
	post: (stream: unknown) => Promise<unknown> | unknown;
};

type DirectMessageHandler = (thread: DirectMessageThread, message: unknown) => Promise<void>;

type DirectMessageBot = {
	onDirectMessage: (handler: DirectMessageHandler) => unknown;
};

export function createBotAgent<TBot extends DirectMessageBot, TAgent extends AgentLike = AgentLike>({
	bot,
	createAgent,
	historyLimit = 20,
	chatTools = { preset: "messenger", requireApproval: false },
}: CreateBotAgentOptions<TBot, TAgent>): { agent: TAgent; dispose: () => void } {
	const tools =
		chatTools === false
			? undefined
			: createChatTools({
					chat: bot as unknown as ChatBinding,
					preset: chatTools.preset ?? "messenger",
					requireApproval: chatTools.requireApproval ?? false,
				});
	const agent = createAgent({
		bot: {
			chat: bot,
			tools,
		},
	});
	const unsubscribe = bot.onDirectMessage(async (thread, message) => {
		const messages = await collectRecentMessages(thread, message, historyLimit);
		const history = await toAiMessages(messages as Message[]);
		const response = await agent.stream({ prompt: history });
		await thread.post(response.fullStream ?? response.textStream ?? response.text ?? "");
	});

	return {
		agent,
		dispose: createDispose(unsubscribe),
	};
}

async function collectRecentMessages(
	thread: DirectMessageThread,
	fallbackMessage: unknown,
	historyLimit: number,
): Promise<unknown[]> {
	const messages: unknown[] = [];

	if (thread.allMessages) {
		for await (const message of thread.allMessages) {
			messages.push(message);

			if (messages.length >= historyLimit) {
				break;
			}
		}
	}

	return messages.length > 0 ? messages : [fallbackMessage];
}

function createDispose(unsubscribe: unknown): () => void {
	if (typeof unsubscribe === "function") {
		return unsubscribe as () => void;
	}

	if (isDisposable(unsubscribe)) {
		return () => unsubscribe.dispose();
	}

	if (isDisposable(unsubscribe, "unsubscribe")) {
		return () => unsubscribe.unsubscribe();
	}

	return () => {};
}

function isDisposable<Key extends "dispose" | "unsubscribe">(
	value: unknown,
	key: Key = "dispose" as Key,
): value is Record<Key, () => void> {
	return typeof value === "object" && value !== null && typeof (value as Record<Key, unknown>)[key] === "function";
}
