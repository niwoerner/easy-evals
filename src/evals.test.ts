import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Evals } from "./index.ts";

const judge = { cmd: "echo judged", model: "j" };

const helloDef = {
	name: "hello",
	run: {
		agent: "test",
		cmd: "true",
		modelVariants: [{ model: "a", thinkingLevel: "none" }],
	},
	judge,
};

describe("Evals", () => {
	it("runs one defined eval", async () => {
		const evals = new Evals().define(helloDef);
		await expect(evals.run("hello")).resolves.toBeUndefined();
	});

	it("templates and judges each model variant", async () => {
		const file = `${tmpdir()}/easy-evals-expansion-${process.pid}`;
		const evals = new Evals().define({
			name: "expansion",
			run: {
				agent: "test",
				cmd: `echo "run $model $thinkingLevel" >> ${file}`,
				modelVariants: [
					{ model: "a", thinkingLevel: "high" },
					{ model: "b", thinkingLevel: "low" },
				],
			},
			judge: { cmd: `echo judge >> ${file}`, model: "j" },
		});
		await evals.runAll();
		expect(readFileSync(file, "utf8")).toBe(
			"run a high\njudge\nrun b low\njudge\n",
		);
		rmSync(file);
	});

	it("runs hooks around every model variant", async () => {
		const order: string[] = [];
		const evals = new Evals().define({
			name: "hooks",
			run: {
				agent: "test",
				cmd: "true",
				modelVariants: [
					{ model: "a", thinkingLevel: "none" },
					{ model: "b", thinkingLevel: "none" },
				],
			},
			judge,
			beforeRun: async (runCommand) => {
				order.push(`before:${(await runCommand("echo hi")).exitCode}`);
			},
			afterRun: () => {
				order.push("after");
			},
		});
		await evals.run("hooks");
		expect(order).toEqual(["before:0", "after", "before:0", "after"]);
	});

	it("creates isolated workspaces and retains them by default", async () => {
		const source = mkdtempSync(join(tmpdir(), "easy-evals-source-"));
		writeFileSync(join(source, "seed.txt"), "seed");
		symlinkSync("seed.txt", join(source, "seed-link.txt"));
		mkdirSync(join(source, ".easy-evals"));
		writeFileSync(join(source, ".easy-evals", "ignored.txt"), "ignored");
		const workspaces: string[] = [];

		const outputs: string[] = [];
		const define = (
			name: string,
			modelVariants: { model: string; thinkingLevel: string }[],
		): Parameters<Evals["define"]>[0] => ({
			name,
			workspace: { source },
			run: {
				agent: "test-agent",
				cmd: `test ! -e generated.txt && printf '%s' '$model/$thinkingLevel' > generated.txt`,
				modelVariants,
			},
			judge: { cmd: "test -f generated.txt", model: "judge" },
			beforeRun: async (runCommand) => {
				workspaces.push((await runCommand("pwd")).stdout.trim());
				expect((await runCommand("test -f seed.txt")).exitCode).toBe(0);
			},
			afterRun: async (runCommand) => {
				outputs.push((await runCommand("cat generated.txt")).stdout);
				await runCommand("printf changed > seed-link.txt");
			},
		});

		try {
			await new Evals()
				.define(
					define("first eval", [
						{ model: "a/model", thinkingLevel: "high" },
						{ model: "b:model", thinkingLevel: "low" },
					]),
				)
				.define(define("second", [{ model: "c", thinkingLevel: "medium" }]))
				.runAll();

			expect(workspaces).toHaveLength(3);
			expect(outputs).toEqual(["a/model/high", "b:model/low", "c/medium"]);
			const firstWorkspace = workspaces[0];
			if (!firstWorkspace) throw new Error("first workspace was not created");
			const runDir = dirname(dirname(firstWorkspace));
			expect(workspaces.map((cwd) => relative(runDir, cwd))).toEqual([
				"first-eval/test-agent-a-model-high",
				"first-eval/test-agent-b-model-low",
				"second/test-agent-c-medium",
			]);
			expect(runDir.startsWith(resolve(".easy-evals/runs"))).toBe(true);
			expect(basename(runDir)).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-zA-Z0-9]{6}$/,
			);
			for (const cwd of workspaces) {
				expect(existsSync(cwd)).toBe(true);
				expect(existsSync(join(cwd, ".easy-evals"))).toBe(false);
			}
			expect(existsSync(join(source, "generated.txt"))).toBe(false);
			expect(readFileSync(join(source, "seed.txt"), "utf8")).toBe("seed");
		} finally {
			if (workspaces[0])
				rmSync(dirname(dirname(workspaces[0])), {
					recursive: true,
					force: true,
				});
			rmSync(source, { recursive: true, force: true });
		}
	});

	it("creates fresh empty workspaces when workspace has no source", async () => {
		const workspaces: string[] = [];
		try {
			await new Evals()
				.define({
					name: "sourceless",
					workspace: {},
					run: {
						agent: "test",
						cmd: "true",
						modelVariants: [
							{ model: "a", thinkingLevel: "none" },
							{ model: "b", thinkingLevel: "none" },
						],
					},
					judge,
					beforeRun: async (runCommand) => {
						const cwd = (await runCommand("pwd")).stdout.trim();
						workspaces.push(cwd);
						expect((await runCommand("ls -A")).stdout).toBe("");
					},
				})
				.run("sourceless");

			expect(workspaces).toHaveLength(2);
			expect(new Set(workspaces).size).toBe(2);
			const runDir = dirname(dirname(workspaces[0] ?? ""));
			expect(runDir.startsWith(resolve(".easy-evals/runs"))).toBe(true);
			expect(workspaces.map((cwd) => relative(runDir, cwd))).toEqual([
				"sourceless/test-a-none",
				"sourceless/test-b-none",
			]);
			for (const cwd of workspaces) expect(existsSync(cwd)).toBe(true);
		} finally {
			if (workspaces[0])
				rmSync(dirname(dirname(workspaces[0])), {
					recursive: true,
					force: true,
				});
		}
	});

	it("removes a sourceless workspace when cleanup is true", async () => {
		let cwd = "";
		await new Evals()
			.define({
				...helloDef,
				workspace: { cleanup: true },
				beforeRun: async (runCommand) => {
					cwd = (await runCommand("pwd")).stdout.trim();
				},
			})
			.run("hello");
		expect(cwd).not.toBe("");
		expect(existsSync(cwd)).toBe(false);
		expect(existsSync(dirname(dirname(cwd)))).toBe(false);
	});

	it("removes the workspace when cleanup is true", async () => {
		const source = mkdtempSync(join(tmpdir(), "easy-evals-cleanup-"));
		let cwd = "";
		try {
			await new Evals()
				.define({
					...helloDef,
					workspace: { source, cleanup: true },
					beforeRun: async (runCommand) => {
						cwd = (await runCommand("pwd")).stdout.trim();
					},
				})
				.run("hello");
			expect(cwd).not.toBe("");
			expect(existsSync(cwd)).toBe(false);
			expect(existsSync(dirname(dirname(cwd)))).toBe(false);
		} finally {
			rmSync(source, { recursive: true, force: true });
		}
	});

	it("removes the workspace when a hook throws and cleanup is true", async () => {
		const source = mkdtempSync(join(tmpdir(), "easy-evals-cleanup-error-"));
		let cwd = "";
		try {
			const run = new Evals()
				.define({
					...helloDef,
					workspace: { source, cleanup: true },
					beforeRun: async (runCommand) => {
						cwd = (await runCommand("pwd")).stdout.trim();
						throw new Error("hook failed");
					},
				})
				.run("hello");
			await expect(run).rejects.toThrow("hook failed");
			expect(cwd).not.toBe("");
			expect(existsSync(cwd)).toBe(false);
			expect(existsSync(dirname(dirname(cwd)))).toBe(false);
		} finally {
			rmSync(source, { recursive: true, force: true });
		}
	});

	it("throws on duplicate names at define time", () => {
		expect(() => new Evals().define(helloDef).define(helloDef)).toThrow(
			"already defined",
		);
	});

	it("rejects unknown names with the defined list", async () => {
		const evals = new Evals().define(helloDef);
		await expect(evals.run("nope")).rejects.toThrow("(defined: hello)");
	});
});
