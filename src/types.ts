export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Runs a bash command in the current model variant's working directory. */
export type RunCommand = (cmd: string) => Promise<CommandResult>;

export interface ModelVariant {
	model: string;
	thinkingLevel: string;
}

export interface Eval {
	name: string;
	/** A fresh workspace directory is created for each model variant. */
	workspace?: {
		/** Copied into each workspace. Omit to start from an empty directory. */
		sourceDir?: string | URL;
		/** Delete each workspace after judging. Defaults to false. */
		cleanup?: boolean;
	};
	run: {
		/** Agent name used to identify the run workspace. */
		agent: string;
		/** Bash command. $model and $thinkingLevel are replaced. */
		cmd: string;
		modelVariants: ModelVariant[];
	};
	judge: {
		/** Bash command. $model is replaced with the model field. */
		cmd: string;
		model: string;
	};
	/** TypeScript hook before each model variant's cmd. The return value is ignored. */
	beforeRun?(runCommand: RunCommand): void | Promise<void>;
	/** TypeScript hook after each run cmd, before the judge. The return value is ignored. */
	afterRun?(runCommand: RunCommand): void | Promise<void>;
}
