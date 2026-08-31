import { Evals } from "../src/index.ts";

const evals = new Evals();

const runPrompt = "Create hello.ts in the current directory that prints 'hi'";
const judgePrompt =
	"Assess whether hello.ts exists and prints 'hi' when run with node.";

// pi: prompt is a positional message in -p (print) mode; --model accepts
// "provider/id" patterns with an optional ":<thinking>" suffix.
evals.define({
	name: "hello-pi",
	run: {
		cmd: `pi -p --model $model "${runPrompt}"`,
		model: [
			"openai-codex/gpt-5.6-luna:medium",
			"openai-codex/gpt-5.6-terra:medium",
		],
	},
	judge: {
		cmd: `pi -p --model $model "${judgePrompt}"`,
		model: "openai-codex/gpt-5.6-luna:medium",
	},
});

await evals.runAll();
