import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandResult, Eval, RunCommand } from "./types.ts";
import { mirrorWorkspace, removeWorkspace } from "./workspace.ts";

const EASY_EVALS_DIR = ".easy-evals/runs";

export class Evals {
	private readonly evalDefs: Eval[] = [];

	define(evalDef: Eval): this {
		if (this.evalDefs.some((definedEval) => definedEval.name === evalDef.name))
			throw new Error(`eval "${evalDef.name}" is already defined`);
		this.evalDefs.push(evalDef);
		return this;
	}

	async run(name: string): Promise<void> {
		const evalDef = this.evalDefs.find(
			(definedEval) => definedEval.name === name,
		);
		if (!evalDef) {
			const known =
				this.evalDefs.map((definedEval) => definedEval.name).join(", ") ||
				"none";
			throw new Error(`unknown eval "${name}" (defined: ${known})`);
		}
		await this.execute([evalDef]);
	}

	async runAll(): Promise<void> {
		await this.execute(this.evalDefs);
	}

	private async execute(evalDefs: readonly Eval[]): Promise<void> {
		let runDir: string | undefined;
		let retainRunDir = false;
		try {
			for (const evalDef of evalDefs) {
				for (const modelVariant of evalDef.run.modelVariants) {
					const workspace = evalDef.workspace;
					let cwd = process.cwd();
					if (workspace) {
						runDir ??= await createRunDirectory();
						cwd = join(
							runDir,
							sanitizePathSegment(evalDef.name),
							`${sanitizePathSegment(evalDef.run.agent)}-${sanitizePathSegment(modelVariant.model)}-${sanitizePathSegment(modelVariant.thinkingLevel)}`,
						);
						if (!workspace.cleanup) retainRunDir = true;
					}

					try {
						if (workspace) {
							if (workspace.source) {
								await mirrorWorkspace(workspace.source, cwd);
							} else {
								await mkdir(cwd, { recursive: true });
							}
						}
						const runCommand: RunCommand = (cmd) => executeCommand(cmd, cwd);

						console.log(
							`${evalDef.name} — ${evalDef.run.agent}/${modelVariant.model}/${modelVariant.thinkingLevel}\n${cwd}`,
						);
						await evalDef.beforeRun?.(runCommand);
						console.log(`\n── run ${modelVariant.model} ──`);
						await runCommand(
							evalDef.run.cmd
								.replaceAll("$model", modelVariant.model)
								.replaceAll("$thinkingLevel", modelVariant.thinkingLevel),
						);
						await evalDef.afterRun?.(runCommand);
						console.log(`\n── judge ${evalDef.judge.model} ──`);
						await runCommand(
							evalDef.judge.cmd.replaceAll("$model", evalDef.judge.model),
						);
					} finally {
						if (workspace?.cleanup) await removeWorkspace(cwd);
					}
				}
			}
		} finally {
			if (runDir && !retainRunDir) await removeWorkspace(runDir);
		}
	}
}

const executeCommand = (cmd: string, cwd: string) =>
	new Promise<CommandResult>((resolve, reject) => {
		const child = spawn("bash", ["-c", cmd], {
			cwd,
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

async function createRunDirectory(): Promise<string> {
	const runsDir = resolve(EASY_EVALS_DIR);
	await mkdir(runsDir, { recursive: true });
	const timestamp = new Date()
		.toISOString()
		.replaceAll(":", "-")
		.replace(".", "-");
	return mkdtemp(join(runsDir, `${timestamp}-`));
}

function sanitizePathSegment(value: string): string {
	const segment = value
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return segment && segment !== "." && segment !== ".." ? segment : "unknown";
}
