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

An eval is a name, an optional mirrored workspace, a run command (which carries its own prompt), a judge, and two optional TypeScript hooks:

```ts
evals.define({
	name: "fix-flaky",
	workspace: {
		sourceDir: new URL("./fixtures/fix-flaky/", import.meta.url),
	},

	run: {
		agent: "claude",
		cmd: `claude -p --model $model --effort $thinkingLevel "Find and fix the flaky test."`,
		modelVariants: [
			{ model: "opus-4.5", thinkingLevel: "high" },
			{ model: "sonnet-4.5", thinkingLevel: "medium" },
		],
	},

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

### Workspaces

When `workspace` is set, a fresh workspace is created for each model variant. If a `sourceDir` is given, it is copied in; omit it (`workspace: {}`) to start from an empty directory. Hooks, the run command, and the judge execute there without changing the source.

Workspaces are retained under `.easy-evals/runs/<name>/<MM-DD-YYYY>_<6-digit-id>/<model>_<thinkingLevel>/` by default. Dates use UTC; each eval execution gets a new random run ID. Set `cleanup: true` to delete them after judging. String sources resolve from the current directory; use `URL` for paths relative to the evals file.

`beforeRun` and `afterRun` receive `runCommand`, bound to the current model variant's workspace.

### Templating

Each model variant runs sequentially with `$model` and `$thinkingLevel` substituted in `run.cmd`. The judge runs afterward in the same workspace, with its model substituted for `$model` in `judge.cmd`.

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
