---
name: setup-easy-evals
description: Set up easy-evals for end users, including agent commands, model variants, setup hooks, deterministic checks, judging, and optional workspaces.
---

# Set up easy-evals

The source code is public at [niwoerner/easy-evals](https://github.com/niwoerner/easy-evals). When in doubt about the API or runtime behavior, inspect the implementation and tests to ground your answer in code, preferably at the user's installed version.

Install `easy-evals` with the project's package manager (for example, `npm install -D easy-evals`). Use Node.js ≥ 22.18 or Bun to execute the TypeScript eval file. The CLIs you use must be installed and authenticated.

Create an `evals.ts` file that imports `Evals` from `easy-evals`. Define a named task, the agent command and model variants to compare, and optionally a judge command with explicit success criteria. Match commands and model names to the user's chosen CLIs.

## Lifecycle

Each model variant runs sequentially:

`workspace preparation → beforeRun → run.cmd → afterRun → optional judge.cmd → optional workspace cleanup`

- Put eval setup in `beforeRun`: install dependencies, seed data, or prepare services.
- Put deterministic checks in `afterRun`: tests, assertions, or output validation. It can also perform teardown, but keep files and services needed by the judge available until judging finishes.
- Invoking a judge is optional. Omit `judge` for deterministic-only evals; add it for qualitative assessment with a clear rubric.
- Hook `runCommand` calls execute in the variant's working directory and return `{ stdout, stderr, exitCode }`. Check `exitCode` explicitly: nonzero exits do not throw automatically, and hook return values are ignored. Throwing stops the eval before judging and prevents subsequent variants from running.
- `afterRun` is not guaranteed teardown: a thrown setup or execution error skips it. Use `try/finally` around `evals.runAll()` for resources that must always be released; there is no separate teardown hook.

## Optional workspaces

Recommend a workspace for filesystem-based evals, such as coding tasks, so variants start with separate copies of the same files.

- `workspace: { sourceDir: "./fixtures/fix-flaky" }` copies a fixture directory. String paths resolve from the directory where the eval process is launched.
- `workspace: {}` starts each variant in an empty directory.
- Omit `workspace` to run in the current directory, shared by all variants.

Workspaces remain in `.easy-evals/runs/<name>/<MM-DD-YYYY>_<6-digit-id>/<agent>_<model>_<thinkingLevel>/` for inspection. Dates use UTC. Set `workspace.cleanup: true` to remove them after hooks and optional judging, or on an error. Workspaces are copied directories, not security sandboxes.

## Example

Adapt the commands to the fixture's package manager and the user's agent. This example assumes a fixture with `package-lock.json` and an `npm test` script:

```ts
import { Evals } from "easy-evals";

const evals = new Evals();

evals.define({
  name: "fix-flaky",
  workspace: { sourceDir: "./fixtures/fix-flaky" },
  run: {
    agent: "claude",
    cmd: 'claude -p --model $model --effort $thinkingLevel "Find and fix the flaky test. Do not weaken assertions."',
    modelVariants: [{ model: "sonnet", thinkingLevel: "medium" }],
  },
  beforeRun: async (runCommand) => {
    const result = await runCommand("npm ci");
    if (result.exitCode !== 0) throw new Error("Dependency setup failed");
  },
  afterRun: async (runCommand) => {
    const result = await runCommand("npm test");
    if (result.exitCode !== 0) throw new Error("Tests failed");
  },
  judge: {
    cmd: 'claude -p --model $model "Assess whether the flaky test root cause was fixed without weakening assertions. Explain your verdict."',
    model: "sonnet",
  },
});

await evals.runAll();
```

Run `node evals.ts` from the project root (or `bun evals.ts`). Use `evals.run("fix-flaky")` instead of `runAll()` to select one eval. `$model` and `$thinkingLevel` are substituted in `run.cmd`; only `$model` is substituted in `judge.cmd`.
