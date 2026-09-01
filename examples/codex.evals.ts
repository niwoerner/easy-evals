import { Evals } from "../src/index.ts";

const evals = new Evals();

const runPrompt = "Create hello.ts in the current directory that prints 'hi'";
const judgePrompt =
	"Assess whether hello.ts exists and prints 'hi' when run with node.";

// codex: prompt is positional in exec mode; model via -m,
// reasoning effort via -c model_reasoning_effort.
evals.define({
	name: "hello-codex",
	run: {
		agent: "codex",
		cmd: `codex exec -m $model -c model_reasoning_effort="$thinkingLevel" --sandbox workspace-write --skip-git-repo-check "${runPrompt}"`,
		modelVariants: [{ model: "gpt-5.6-luna", thinkingLevel: "high" }],
	},
	judge: {
		cmd: `codex exec -m $model -c model_reasoning_effort="low" --sandbox read-only --skip-git-repo-check "${judgePrompt}"`,
		model: "gpt-5.6-luna",
	},
});

await evals.runAll();
