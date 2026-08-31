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

An eval is a name, a run command (which carries its own prompt), a judge, and two optional TypeScript hooks:

```ts
evals.define({
	name: "fix-flaky",

	run: {
		cmd: `claude -p --model $model --effort high "Find and fix the flaky test."`,
		model: ["opus-4.5", "sonnet-4.5"],
	},

	judge: {
		cmd: `codex exec -m $model -c model_reasoning_effort="low" "Assess whether the root cause was fixed."`,
		model: "gpt-5.6-sol",
	},

	beforeRun: async (exec) => {
		await exec("bun install");
	},
	afterRun: async (exec) => {
		await exec("bun test");
	},
});
```

### Templating

`run` and `judge` share one shape and one mechanism: `$model` in the cmd is replaced with the `model` field, which is otherwise passed to the CLI verbatim.

An **array** of models on `run` creates one run per entry, executed sequentially. Everything else — thinking levels, efforts, flags — lives in the cmd string, where plain TypeScript template literals and consts cover reuse.

Unknown `$` tokens (like `$HOME`) are left for bash.

The judge runs in the eval's directory after each run entry; whatever it outputs is the output of the eval.

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
