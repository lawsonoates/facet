import type { StreamTextResult } from "ai";

export type TUIOptions = {
	name?: string;
};

export type TUIHandle = {
	prompt: () => Promise<string>;
	displayAssistantStream: (stream: StreamTextResult<any, any>) => Promise<string>;
	destroy: () => void;
};
