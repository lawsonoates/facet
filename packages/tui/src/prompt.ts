import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export type PromptSession = {
	ask: (label?: string) => Promise<string>;
	close: () => void;
};

export function createPromptSession(): PromptSession {
	const readline = createInterface({ input, output });

	return {
		ask: (label = "> ") => readline.question(label),
		close: () => readline.close(),
	};
}
