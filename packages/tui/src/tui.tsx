import { createCliRenderer, RGBA, SyntaxStyle } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import type { StreamTextResult } from "ai";
import { useCallback, useEffect, useState } from "react";
import type { TUIHandle, TUIOptions } from "./types";

const syntaxStyle = SyntaxStyle.fromStyles({
	"markup.heading.1": { fg: RGBA.fromHex("#7aa2f7"), bold: true },
	"markup.heading.2": { fg: RGBA.fromHex("#7aa2f7"), bold: true },
	"markup.heading.3": { fg: RGBA.fromHex("#7aa2f7"), bold: true },
	"markup.list": { fg: RGBA.fromHex("#bb9af7") },
	"markup.raw": { fg: RGBA.fromHex("#a9b1d6") },
	"markup.link": { fg: RGBA.fromHex("#7aa2f7") },
	"markup.bold": { bold: true },
	"markup.italic": { italic: true },
	default: { fg: RGBA.fromHex("#c0caf5") },
});

const SPINNER_FRAMES = ["-", "\\", "|", "/"];

type ToolCallInfo = {
	id: string;
	name: string;
	status: "running" | "done" | "error";
};

type Message = {
	role: "user" | "assistant";
	content: string;
	thinking?: string;
	toolCalls?: ToolCallInfo[];
};

type Status = "idle" | "thinking" | "streaming";
type Listener = () => void;

class Store {
	private readonly listeners = new Set<Listener>();
	messages: Message[] = [];
	streamingText = "";
	thinkingText = "";
	activeTools = new Map<string, ToolCallInfo>();
	status: Status = "idle";
	inputActive = false;
	inputResolve: ((text: string) => void) | null = null;

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

function useStore(store: Store): void {
	const [, setTick] = useState(0);

	useEffect(() => store.subscribe(() => setTick((tick) => tick + 1)), [store]);
}

function Spinner({ label }: { label: string }) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const id = setInterval(() => setFrame((value) => (value + 1) % SPINNER_FRAMES.length), 80);
		return () => clearInterval(id);
	}, []);

	return (
		<box style={{ paddingLeft: 1, flexDirection: "row", gap: 1 }}>
			<text fg="#7aa2f7">{SPINNER_FRAMES[frame]}</text>
			<text fg="#565f89">{label}</text>
		</box>
	);
}

function ThinkingBlock({ content }: { content: string }) {
	return (
		<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1 }}>
			<text fg="#565f89">
				<em>{content}</em>
			</text>
		</box>
	);
}

function ToolCallBox({ tool }: { tool: ToolCallInfo }) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		if (tool.status !== "running") {
			return;
		}

		const id = setInterval(() => setFrame((value) => (value + 1) % SPINNER_FRAMES.length), 80);
		return () => clearInterval(id);
	}, [tool.status]);

	const icon = tool.status === "running" ? SPINNER_FRAMES[frame] : tool.status === "done" ? "done" : "error";
	const iconColor = tool.status === "running" ? "#7aa2f7" : tool.status === "done" ? "#9ece6a" : "#f7768e";

	return (
		<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 0 }}>
			<box
				style={{
					border: true,
					borderStyle: "rounded",
					borderColor: "#414868",
					paddingLeft: 1,
					paddingRight: 1,
					flexDirection: "row",
					gap: 1,
					width: "100%",
				}}
			>
				<text fg={iconColor}>{icon}</text>
				<text fg="#c0caf5">
					<strong>{tool.name}</strong>
				</text>
			</box>
		</box>
	);
}

function App({ name, store }: { name: string; store: Store }) {
	const renderer = useRenderer();
	const [inputValue, setInputValue] = useState("");
	useStore(store);

	const handleSubmit = useCallback(() => {
		const text = inputValue.trim();

		if (!text || !store.inputResolve) {
			return;
		}

		setInputValue("");
		const resolve = store.inputResolve;
		store.inputResolve = null;
		store.inputActive = false;
		store.messages.push({ role: "user", content: text });
		store.emit();
		resolve(text);
	}, [inputValue, store]);

	useKeyboard((key) => {
		if (key.ctrl && key.name === "c") {
			renderer.destroy();
			process.exit(0);
		}
	});

	return (
		<box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
			<box style={{ paddingLeft: 1, paddingTop: 1, paddingBottom: 1, flexShrink: 0 }}>
				<text fg="#7aa2f7">
					<strong>{name}</strong>
				</text>
			</box>

			<scrollbox style={{ flexGrow: 1, width: "100%" }} stickyScroll stickyStart="bottom">
				<box style={{ flexDirection: "column", width: "100%" }}>
					{store.messages.map((message, index) => (
						<MessageBubble key={index} message={message} />
					))}

					{store.status === "thinking" && !store.thinkingText && <Spinner label="Thinking..." />}
					{store.thinkingText && <ThinkingBlock content={store.thinkingText} />}
					{[...store.activeTools.values()].map((tool) => (
						<ToolCallBox key={tool.id} tool={tool} />
					))}
					{store.streamingText && (
						<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1 }}>
							<markdown syntaxStyle={syntaxStyle} content={store.streamingText} streaming />
						</box>
					)}
				</box>
			</scrollbox>

			<box
				style={{
					width: "100%",
					paddingLeft: 1,
					paddingRight: 1,
					paddingBottom: 1,
					flexShrink: 0,
				}}
			>
				<box
					style={{
						width: "100%",
						border: true,
						borderStyle: "rounded",
						borderColor: store.inputActive ? "#7aa2f7" : "#414868",
					}}
				>
					<input
						placeholder={store.inputActive ? "Type a message..." : ""}
						value={inputValue}
						onInput={setInputValue}
						onSubmit={handleSubmit}
						focused={store.inputActive}
						width="100%"
					/>
				</box>
			</box>
		</box>
	);
}

function MessageBubble({ message }: { message: Message }) {
	if (message.role === "user") {
		return (
			<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1 }}>
				<box
					style={{
						border: false,
						backgroundColor: "#292e42",
						padding: 1,
						width: "100%",
					}}
				>
					<markdown syntaxStyle={syntaxStyle} content={message.content} />
				</box>
			</box>
		);
	}

	return (
		<box style={{ flexDirection: "column", width: "100%" }}>
			{message.thinking && (
				<box style={{ paddingLeft: 1, paddingRight: 1 }}>
					<text fg="#565f89">
						<em>Thought for a moment</em>
					</text>
				</box>
			)}
			{message.toolCalls?.map((tool) => (
				<ToolCallBox key={tool.id} tool={tool} />
			))}
			{message.content && (
				<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1 }}>
					<markdown syntaxStyle={syntaxStyle} content={message.content} />
				</box>
			)}
		</box>
	);
}

export async function createTUI(options: TUIOptions = {}): Promise<TUIHandle> {
	const name = options.name ?? "agent";
	const renderer = await createCliRenderer({ exitOnCtrlC: false });
	const root = createRoot(renderer);
	const store = new Store();

	root.render(<App name={name} store={store} />);

	return {
		prompt(): Promise<string> {
			return new Promise<string>((resolve) => {
				store.inputResolve = resolve;
				store.inputActive = true;
				store.emit();
			});
		},

		async displayAssistantStream(result: StreamTextResult<any, any>): Promise<string> {
			store.streamingText = "";
			store.thinkingText = "";
			store.activeTools.clear();
			store.status = "thinking";
			store.emit();

			let fullText = "";
			let fullThinking = "";
			const completedTools: ToolCallInfo[] = [];

			try {
				for await (const part of result.fullStream) {
					switch (part.type) {
						case "reasoning-delta":
							fullThinking += getDeltaText(part);
							store.thinkingText = fullThinking;
							store.emit();
							break;
						case "text-delta":
							if (store.status === "thinking") {
								store.status = "streaming";
							}

							fullText += getDeltaText(part);
							store.streamingText = fullText;
							store.emit();
							break;
						case "tool-input-start":
							store.activeTools.set(part.id, {
								id: part.id,
								name: part.toolName,
								status: "running",
							});

							if (store.status === "thinking") {
								store.status = "streaming";
							}

							store.emit();
							break;
						case "tool-call":
							if (!store.activeTools.has(part.toolCallId)) {
								store.activeTools.set(part.toolCallId, {
									id: part.toolCallId,
									name: part.toolName,
									status: "running",
								});

								if (store.status === "thinking") {
									store.status = "streaming";
								}

								store.emit();
							}
							break;
						case "tool-result": {
							const tool = store.activeTools.get(part.toolCallId);

							if (tool) {
								tool.status = "done";
								completedTools.push({ ...tool });
								store.emit();
							}
							break;
						}
						case "tool-error": {
							const tool = store.activeTools.get(part.toolCallId);

							if (tool) {
								tool.status = "error";
								completedTools.push({ ...tool });
								store.emit();
							}
							break;
						}
						case "error":
							for (const [id, tool] of store.activeTools) {
								tool.status = "error";
								completedTools.push({ ...tool });
								store.activeTools.delete(id);
							}
							store.emit();
							break;
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				for (const [, tool] of store.activeTools) {
					tool.status = "error";
					completedTools.push({ ...tool });
				}

				store.streamingText = "";
				store.thinkingText = "";
				store.activeTools.clear();
				store.status = "idle";
				store.messages.push({
					role: "assistant",
					content: `**Error:** ${message}`,
					toolCalls: completedTools.length ? completedTools : undefined,
				});
				store.emit();
				return "";
			}

			store.streamingText = "";
			store.thinkingText = "";
			store.activeTools.clear();
			store.status = "idle";
			store.messages.push({
				role: "assistant",
				content: fullText,
				thinking: fullThinking || undefined,
				toolCalls: completedTools.length ? completedTools : undefined,
			});
			store.emit();

			return fullText;
		},

		destroy() {
			renderer.destroy();
		},
	};
}

function getDeltaText(part: { delta?: string; text?: string }): string {
	return part.delta ?? part.text ?? "";
}
