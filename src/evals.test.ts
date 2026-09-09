import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { appendFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type Eval, Evals } from "./index.ts";

const judge = { cmd: "echo judged", model: "j" };

const helloDef: Eval = {
	name: "hello",
	run: {
		mode: "cli",
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

	it("runs hooks and cleans up every variant without a judge", async () => {
		const workspaces: string[] = [];
		const outputs: string[] = [];
		await new Evals()
			.define({
				name: "without-judge",
				workspace: { cleanup: true },
				run: {
					mode: "cli",
					agent: "test",
					cmd: "echo $model >> result.txt",
					modelVariants: [
						{ model: "a", thinkingLevel: "none" },
						{ model: "b", thinkingLevel: "none" },
					],
				},
				beforeRun: async (runCommand) => {
					workspaces.push((await runCommand("pwd")).stdout.trim());
					await runCommand("echo setup > result.txt");
				},
				afterRun: async (runCommand) => {
					outputs.push((await runCommand("cat result.txt")).stdout);
				},
			})
			.runAll();
		expect(outputs).toEqual(["setup\na\n", "setup\nb\n"]);
		for (const cwd of workspaces) {
			expect(existsSync(cwd)).toBe(false);
			expect(existsSync(dirname(cwd))).toBe(false);
		}
	});

	it("templates and judges each model variant", async () => {
		const file = `${tmpdir()}/easy-evals-expansion-${process.pid}`;
		const evals = new Evals().define({
			name: "expansion",
			run: {
				mode: "cli",
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

	it("awaits a code callback once between hooks and judges in its copied workspace", async () => {
		const source = mkdtempSync(join(tmpdir(), "easy-evals-code-"));
		writeFileSync(join(source, "result.txt"), "seed\n");
		const originalCwd = process.cwd();
		let cwd = "";
		let calls = 0;
		try {
			await new Evals()
				.define({
					name: "code-fixture",
					workspace: { sourceDir: source },
					beforeRun: async (runCommand) => {
						await runCommand("echo before >> result.txt");
					},
					run: {
						mode: "code",
						execute: async (context) => {
							calls++;
							if (!context.workspaceDir)
								throw new Error("Expected a workspace");
							cwd = context.workspaceDir;
							expect(Object.keys(context).sort()).toEqual(["workspaceDir"]);
							expect(process.cwd()).toBe(originalCwd);
							await appendFile(
								join(cwd, "result.txt"),
								"$model/$thinkingLevel\n",
							);
						},
					},
					afterRun: async (runCommand) => {
						await runCommand("echo after >> result.txt");
					},
					judge: { cmd: "echo $model >> result.txt", model: "judge" },
				})
				.run("code-fixture");
			expect(calls).toBe(1);
			expect(basename(cwd)).toBe("workspace");
			expect(dirname(dirname(cwd))).toBe(
				resolve(".easy-evals/runs/code-fixture"),
			);
			expect(readFileSync(join(cwd, "result.txt"), "utf8")).toBe(
				"seed\nbefore\n$model/$thinkingLevel\nafter\njudge\n",
			);
			expect(readFileSync(join(source, "result.txt"), "utf8")).toBe("seed\n");
		} finally {
			if (cwd) rmSync(dirname(cwd), { recursive: true, force: true });
			rmSync(source, { recursive: true, force: true });
		}
	});

	it("runs synchronous code once without a workspaceDir or judge", async () => {
		let calls = 0;
		await new Evals()
			.define({
				name: "code-current-directory",
				run: {
					mode: "code",
					execute: ({ workspaceDir }) => {
						calls++;
						expect(workspaceDir).toBeUndefined();
					},
				},
			})
			.runAll();
		expect(calls).toBe(1);
	});

	it.each([false, true])(
		"cleans up a code workspace when the callback throws: %s",
		async (throws) => {
			let cwd = "";
			let afterCalled = false;
			const result = new Evals()
				.define({
					name: "code-cleanup",
					workspace: { cleanup: true },
					run: {
						mode: "code",
						execute: async (context) => {
							if (!context.workspaceDir)
								throw new Error("Expected a workspace");
							cwd = context.workspaceDir;
							expect(await readdir(cwd)).toEqual([]);
							if (throws) throw new Error("code failed");
						},
					},
					afterRun: () => {
						afterCalled = true;
					},
				})
				.runAll();
			if (throws) await expect(result).rejects.toThrow("code failed");
			else await expect(result).resolves.toBeUndefined();
			expect(afterCalled).toBe(!throws);
			expect(cwd).not.toBe("");
			expect(existsSync(dirname(cwd))).toBe(false);
		},
	);

	it("runs hooks around every model variant", async () => {
		const order: string[] = [];
		const evals = new Evals().define({
			name: "hooks",
			run: {
				mode: "cli",
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
			workspace: { sourceDir: source },
			run: {
				mode: "cli",
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
			const runDir = dirname(firstWorkspace);
			expect(workspaces.map((cwd) => basename(cwd))).toEqual([
				"test-agent_a-model_high",
				"test-agent_b-model_low",
				"test-agent_c_medium",
			]);
			expect(dirname(workspaces[1] ?? "")).toBe(runDir);
			expect(
				workspaces.map((cwd) =>
					relative(resolve(".easy-evals/runs"), dirname(dirname(cwd))),
				),
			).toEqual(["first-eval", "first-eval", "second"]);
			expect(basename(runDir)).toMatch(/^\d{2}-\d{2}-\d{4}_\d{6}$/);
			for (const cwd of workspaces) {
				expect(existsSync(cwd)).toBe(true);
				expect(existsSync(join(cwd, ".easy-evals"))).toBe(false);
			}
			expect(existsSync(join(source, "generated.txt"))).toBe(false);
			expect(readFileSync(join(source, "seed.txt"), "utf8")).toBe("seed");
		} finally {
			for (const cwd of workspaces)
				rmSync(dirname(cwd), {
					recursive: true,
					force: true,
				});
			rmSync(source, { recursive: true, force: true });
		}
	});

	it("creates fresh empty workspaces when workspace has no sourceDir", async () => {
		const workspaces: string[] = [];
		try {
			await new Evals()
				.define({
					name: "sourceless",
					workspace: {},
					run: {
						mode: "cli",
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
			const runDir = dirname(workspaces[0] ?? "");
			expect(runDir.startsWith(resolve(".easy-evals/runs"))).toBe(true);
			expect(workspaces.map((cwd) => relative(runDir, cwd))).toEqual([
				"test_a_none",
				"test_b_none",
			]);
			for (const cwd of workspaces) expect(existsSync(cwd)).toBe(true);
		} finally {
			for (const cwd of workspaces)
				rmSync(dirname(cwd), {
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
		expect(existsSync(dirname(cwd))).toBe(false);
	});

	it("removes the workspace when cleanup is true", async () => {
		const source = mkdtempSync(join(tmpdir(), "easy-evals-cleanup-"));
		let cwd = "";
		try {
			await new Evals()
				.define({
					...helloDef,
					workspace: { sourceDir: source, cleanup: true },
					beforeRun: async (runCommand) => {
						cwd = (await runCommand("pwd")).stdout.trim();
					},
				})
				.run("hello");
			expect(cwd).not.toBe("");
			expect(existsSync(cwd)).toBe(false);
			expect(existsSync(dirname(cwd))).toBe(false);
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
					workspace: { sourceDir: source, cleanup: true },
					beforeRun: async (runCommand) => {
						cwd = (await runCommand("pwd")).stdout.trim();
						throw new Error("hook failed");
					},
				})
				.run("hello");
			await expect(run).rejects.toThrow("hook failed");
			expect(cwd).not.toBe("");
			expect(existsSync(cwd)).toBe(false);
			expect(existsSync(dirname(cwd))).toBe(false);
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
