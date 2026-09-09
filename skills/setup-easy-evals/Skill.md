---
name: setup-easy-evals
description: Set up easy-evals for end users, adapting agent commands, model variants, checks, and judging to their task.
---

# Set up easy-evals

Read the [repository README](https://raw.githubusercontent.com/niwoerner/easy-evals/main/README.md) before configuring an eval. Use it as the source of truth for prerequisites, API usage, workspaces, templating, and execution. When runtime behavior is unclear, inspect the [implementation and tests](https://github.com/niwoerner/easy-evals), preferably at the user's installed version.

If not install yet, install `easy-evals` with the project's package manager and adapt the README example to the user's task, chosen CLIs, and models.

- Choose `run.mode: "cli"` for automatic model variant comparisons, or `run.mode: "code"` for a single `execute({ workspaceDir })` callback that controls its own package calls and iteration. Code mode creates one `workspace/` directory when workspace setup is enabled; pass `workspaceDir` explicitly to packages. It is `undefined` when no workspace is configured.
- Put setup in `beforeRun` and deterministic checks in `afterRun`. Add a judge only when qualitative assessment is useful, with explicit success criteria. Keep files and services needed by the judge available until judging finishes.
- Check hook `runCommand` results explicitly: they return `{ stdout, stderr, exitCode }`; nonzero exits do not throw, and hook return values are ignored. Throwing stops the eval before judging and prevents subsequent variants from running.
- `afterRun` is skipped if setup or execution throws. Use `try/finally` around `evals.runAll()` for resources that must always be released.
- Recommend workspaces for filesystem-based evals so variants start from separate copies of the same files. Workspaces are copied directories, not security sandboxes.
