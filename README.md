# easy-evals

An intentionally easy way of running evals against coding agents.

## Prerequisites

- A runtime that executes TypeScript: `node` ≥ 22.18, or `bun`.
- The agent CLIs your cmds reference (`claude`, `codex`, `pi`, ...) installed and logged in.

## API

One class, three methods:

```ts
import { Evals } from "easy-evals";

const evals = new Evals();

evals.define({ name: "fix-flaky", ... });
evals.define({ name: "add-feature", ... });

await evals.run("fix-flaky");   // one eval by name
await evals.runAll();           // every eval, in definition order
```

An eval is a name, an optional mirrored workspace, a CLI command or code callback, an optional judge, and two optional TypeScript hooks:

```ts
evals.define({
	name: "fix-flaky",
	workspace: {
		sourceDir: new URL("./fixtures/fix-flaky/", import.meta.url),
	},

	run: {
		mode: "cli",
		agent: "claude",
		cmd: `claude -p --model $model --effort $thinkingLevel "Find and fix the flaky test."`,
		modelVariants: [
			{ model: "opus-4.5", thinkingLevel: "high" },
			{ model: "sonnet-4.5", thinkingLevel: "medium" },
		],
	},

	// LLM as a judge (optional)
	judge: {
		cmd: `codex exec -m $model -c model_reasoning_effort="low" "Assess whether the root cause was fixed."`,
		model: "gpt-5.6-sol",
	},

	// Hooks
	beforeRun: async (runCommand) => {
		await runCommand("bun install");
	},
	afterRun: async (runCommand) => {
		await runCommand("bun test");
	},
});
```

### Modes

Set `run.mode` explicitly:

- **`cli`** simplifies constructing and comparing CLI agent runs: provide `agent`, `cmd`, and `modelVariants`. The command runs once per variant with `$model` and `$thinkingLevel` substituted.
- **`code`** invokes `execute` once. Call packages or commands directly; your code controls models, loops, and orchestration without a predefined structure.

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

evals.define({
	name: "write-output",
	workspace: {},
	run: {
		mode: "code",
		execute: async ({ workspaceDir }) => {
			if (!workspaceDir) throw new Error("This eval requires a workspace");
			await writeFile(join(workspaceDir, "output.txt"), "hello");
		},
	},
});
```

Both modes support `beforeRun` for setup, `afterRun` for deterministic checks or teardown, and an optional judge. Code callbacks are awaited; return values are ignored. Callbacks receive only `workspaceDir`, the absolute workspace path when `workspace` is configured, otherwise `undefined`. The process working directory is unchanged, so pass `workspaceDir` explicitly to package calls. Hook `runCommand` uses the workspace or current directory and returns `{ stdout, stderr, exitCode }`; nonzero exits do not throw automatically. Thrown errors stop the eval and still trigger configured workspace cleanup.

### Skills

Tell your agent to help you with the eval setup. Point it to the repo source code and/or the [skill](./skills/setup-easy-evals).

### Workspaces

When `workspace` is set, a fresh workspace is created per CLI variant or once per code invocation. Workspaces are recommended for filesystem-based evals. If a `sourceDir` is given, it is copied in; omit it (`workspace: {}`) to start from an empty directory. Shell commands from hooks, the run, and the optional judge execute there; code callbacks receive its path as `workspaceDir`.

Workspaces are retained under `.easy-evals/runs/<name>/<MM-DD-YYYY>_<6-digit-id>/<agent>_<model>_<thinkingLevel>/` by default. Code mode uses `workspace/` in place of `<agent>_<model>_<thinkingLevel>/`. Dates use UTC; each eval execution gets a new random run ID. Set `cleanup: true` to delete them after hooks and optional judging. String sources resolve from the current directory; use `URL` for paths relative to the evals file.

Omitting `workspace` uses the current directory. `beforeRun` and `afterRun` receive `runCommand`, bound to the run's working directory.

### Templating

In CLI mode, each model variant runs sequentially with `$model` and `$thinkingLevel` substituted in `run.cmd`. In either mode, if configured, the judge runs afterward in the same workspace, with its model substituted for `$model` in `judge.cmd`.

Unknown `$` tokens (like `$HOME`) are left for bash.

## Running

An evals file is a plain program — define, then run:

```bash
node my.evals.ts
```

See [examples/](examples/) for complete files driving claude, codex, and pi.

## Development

```bash
npm install
npm run test
npm run lint
npm run typecheck
```

Development runs straight from `src/` with no build step. `npm run build` emits `dist/` (compiled JS + `.d.ts`), which is what npm consumers get.
