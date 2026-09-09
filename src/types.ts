export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Runs a bash command in the current run's working directory. */
export type RunCommand = (cmd: string) => Promise<CommandResult>;

export interface ModelVariant {
	model: string;
	thinkingLevel: string;
}

export interface Eval {
	name: string;
	/** A fresh workspace is created per CLI variant or once for a code run. */
	workspace?: {
		/** Copied into each workspace. Omit to start from an empty directory. */
		sourceDir?: string | URL;
		/** Delete each workspace after hooks and optional judging. Defaults to false. */
		cleanup?: boolean;
	};
	run:
		| {
				mode: "cli";
				/** Agent name used in workspace paths and run logs. */
				agent: string;
				/** Bash command. $model and $thinkingLevel are replaced. */
				cmd: string;
				modelVariants: ModelVariant[];
		  }
		| {
				mode: "code";
				/** Invoked once. The return value is ignored; models and iteration are up to you. */
				execute(context: { workspaceDir?: string }): void | Promise<void>;
		  };
	judge?: {
		/** Bash command. $model is replaced with the model field. */
		cmd: string;
		model: string;
	};
	/** Hook before each CLI variant or the code callback. The return value is ignored. */
	beforeRun?(runCommand: RunCommand): void | Promise<void>;
	/** Hook after each run, before the optional judge. The return value is ignored. */
	afterRun?(runCommand: RunCommand): void | Promise<void>;
}
