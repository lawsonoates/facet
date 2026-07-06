import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		prompt: "src/prompt.ts",
		stream: "src/stream.ts",
		tui: "src/tui.tsx",
		types: "src/types.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	sourcemap: true,
});
