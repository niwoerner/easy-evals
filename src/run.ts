import { spawn } from "node:child_process";
import type { Eval, Exec, ExecResult } from "./types.ts";

export class Evals {
	private readonly evalDefs: Eval[] = [];

	define(def: Eval): this {
		if (this.evalDefs.some((d) => d.name === def.name))
			throw new Error(`eval "${def.name}" is already defined`);
		this.evalDefs.push(def);
		return this;
	}

	async run(name: string): Promise<void> {
		const def = this.evalDefs.find((d) => d.name === name);
		if (!def) {
			const known = this.evalDefs.map((d) => d.name).join(", ") || "none";
			throw new Error(`unknown eval "${name}" (defined: ${known})`);
		}
		await this.runEval(def);
	}

	async runAll(): Promise<void> {
		for (const def of this.evalDefs) await this.runEval(def);
	}

	private async runEval(def: Eval): Promise<void> {
		console.log(`${def.name} — ${process.cwd()}`);
		await def.beforeRun?.(exec);
		const models = Array.isArray(def.run.model)
			? def.run.model
			: [def.run.model];
		for (const model of models) {
			console.log(`\n── run ${model} ──`);
			await exec(def.run.cmd.replaceAll("$model", model));
			await def.afterRun?.(exec);
			console.log(`\n── judge ${def.judge.model} ──`);
			await exec(def.judge.cmd.replaceAll("$model", def.judge.model));
		}
	}
}

const exec: Exec = (cmd) =>
	new Promise<ExecResult>((resolve, reject) => {
		const child = spawn("bash", ["-c", cmd], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			process.stdout.write(chunk);
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			process.stderr.write(chunk);
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) =>
			resolve({ stdout, stderr, exitCode: code ?? 1 }),
		);
	});
