export type TextStream = AsyncIterable<string>;

export type FullStreamPart =
	| string
	| {
			text?: string;
			textDelta?: string;
			delta?: string;
			type?: string;
	  };

export async function writeText(text: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		process.stdout.write(text, (error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

export function extractTextPart(part: FullStreamPart): string {
	if (typeof part === "string") {
		return part;
	}

	if (typeof part.textDelta === "string") {
		return part.textDelta;
	}

	if (typeof part.delta === "string") {
		return part.delta;
	}

	if (typeof part.text === "string" && (part.type === "text" || part.type === "text-delta")) {
		return part.text;
	}

	return "";
}

export async function renderTextStream(stream: TextStream): Promise<string> {
	let text = "";

	for await (const chunk of stream) {
		text += chunk;
		await writeText(chunk);
	}

	return text;
}

export async function renderFullStream(stream: AsyncIterable<unknown>): Promise<string> {
	let text = "";

	for await (const part of stream) {
		const chunk = extractTextPart(part as FullStreamPart);

		if (chunk.length === 0) {
			continue;
		}

		text += chunk;
		await writeText(chunk);
	}

	return text;
}
