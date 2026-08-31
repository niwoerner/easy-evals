export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Runs a bash command in the current working directory, streaming its output. */
export type Exec = (cmd: string) => Promise<ExecResult>;

export interface Eval {
	name: string;
	run: {
		/** Bash command. $model is replaced with the model field. */
		cmd: string;
		/** Passed to the CLI verbatim. An array creates one run per entry. */
		model: string | string[];
	};
	judge: {
		/** Bash command. $model is replaced with the model field. */
		cmd: string;
		model: string;
	};
	/** TypeScript hook before the run cmd. The return value is ignored. */
	beforeRun?(exec: Exec): void | Promise<void>;
	/** TypeScript hook after the run cmd, before the judge. The return value is ignored. */
	afterRun?(exec: Exec): void | Promise<void>;
}
