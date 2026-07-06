import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/agent.ts",
		bot: "src/bot.ts",
		tui: "src/tui.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	sourcemap: true,
});
