import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { Evals } from "./index.ts";

const judge = { cmd: "echo judged", model: "j" };

const helloDef = {
	name: "hello",
	run: { cmd: "true", model: "a" },
	judge,
};

describe("Evals", () => {
	it("runs a defined eval", async () => {
		const evals = new Evals().define(helloDef);
		await expect(evals.run("hello")).resolves.toBeUndefined();
	});

	it("templates $model per entry, and judges each", async () => {
		const file = `${tmpdir()}/easy-evals-expansion-${process.pid}`;
		const evals = new Evals().define({
			name: "expansion",
			run: {
				cmd: `echo "run $model" >> ${file}`,
				model: ["a:high", "b:low"],
			},
			judge: { cmd: `echo judge >> ${file}`, model: "j" },
		});
		await evals.runAll();
		expect(readFileSync(file, "utf8")).toBe(
			"run a:high\njudge\nrun b:low\njudge\n",
		);
		rmSync(file);
	});

	it("runs beforeRun, then per entry the run cmd and afterRun", async () => {
		const order: string[] = [];
		const evals = new Evals().define({
			name: "hooks",
			run: { cmd: "true", model: "a" },
			judge,
			beforeRun: async (exec) => {
				order.push(`before:${(await exec("echo hi")).exitCode}`);
			},
			afterRun: () => {
				order.push("after");
			},
		});
		await evals.run("hooks");
		expect(order).toEqual(["before:0", "after"]);
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
