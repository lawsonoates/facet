import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		cli: "src/cli.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	sourcemap: true,
});
