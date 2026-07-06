import { createTUI } from "@lawsonoates/facet-tui/tui";
import { renderFullStream, renderTextStream, writeText } from "@lawsonoates/facet-tui/stream";
import type { AgentApp, AgentContext, AgentMessage, AgentStreamResponse } from "./agent";

export type TuiSurfaceOptions = {
	ctx?: AgentContext;
	/**
	 * Kept for compatibility with the earlier readline implementation. OpenTUI
	 * renders its own input placeholder instead of a terminal prompt label.
	 */
	promptLabel?: string;
};

export type TuiSurface = {
	run: () => Promise<void>;
};

export function createTuiSurface(app: AgentApp, options: TuiSurfaceOptions = {}): TuiSurface {
	return {
		async run() {
			const agent = app.createAgent(options.ctx ?? {});
			const tui = await createTUI({ name: app.name });
			const messages: AgentMessage[] = [];

			try {
				for (;;) {
					const input = (await tui.prompt()).trim();

					if (input.length === 0) {
						continue;
					}

					if (input === "/exit" || input === "/quit") {
						break;
					}

					messages.push({ role: "user", content: input });
					const response = await agent.stream({ messages });
					const assistantText = response.fullStream
						? await tui.displayAssistantStream(response as never)
						: await renderAgentResponse(response);

					if (assistantText.length > 0) {
						messages.push({ role: "assistant", content: assistantText });
					}
				}
			} finally {
				tui.destroy();
			}
		},
	};
}

export async function renderAgentResponse(response: AgentStreamResponse): Promise<string> {
	if (response.textStream) {
		return renderTextStream(response.textStream);
	}

	if (response.fullStream) {
		return renderFullStream(response.fullStream);
	}

	if (typeof response.text === "string") {
		await writeText(response.text);
		return response.text;
	}

	return "";
}
