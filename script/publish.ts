#!/usr/bin/env bun

import { $ } from "bun";

// ---- guard ----

const version = Bun.argv[2];
if (!version) {
	console.error("Usage: bun run publish <version>");
	process.exit(1);
}

const branch = (await $`git branch --show-current`.text()).trim();
if (branch !== "master") {
	console.error(`Refusing to release from "${branch}"`);
	process.exit(1);
}

const status = (await $`git status --porcelain`.text()).trim();
if (status) {
	console.error("Working tree is not clean; commit or stash changes first.");
	process.exit(1);
}

console.log(`\n=== releasing facet v${version} ===\n`);

// ---- bump versions ----

const pkgJsons = await Array.fromAsync(new Bun.Glob("**/package.json").scan({ absolute: true }));

for (const file of pkgJsons) {
	if (file.includes("node_modules") || file.includes("dist")) {
		continue;
	}

	const text = await Bun.file(file).text();
	const next = text.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`);

	if (text !== next) {
		await Bun.file(file).write(next);
		console.log("updated:", file);
	}
}

// ---- install + build ----

await $`bun install`;
await $`bun run build`;
await $`bun run typecheck`;

// ---- publish (dependency order: tui -> agent -> cli) ----

const packages = [
	{ dir: "tui", name: "@lawsonoates/facet-tui" },
	{ dir: "agent", name: "@lawsonoates/facet-agent" },
	{ dir: "cli", name: "@lawsonoates/facet-cli" },
];

for (const { dir, name } of packages) {
	console.log(`\n=== publishing ${name} ===\n`);
	await $`bun publish --access public`.cwd(`packages/${dir}`);
}

// ---- commit + tag + push ----

const releaseStatus = (await $`git status --porcelain`.text()).trim();
if (releaseStatus) {
	await $`git commit -am "release: facet v${version}"`;
} else {
	console.log("no version changes to commit; skipping release commit");
}

await $`git tag v${version}`;
await $`git push --follow-tags`;

console.log(`\n=== done: facet v${version} ===\n`);
