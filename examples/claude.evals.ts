import { Evals } from "../src/index.ts";

const evals = new Evals();

const runPrompt = "Create hello.ts in the current directory that prints 'hi'";
const judgePrompt =
	"Assess whether hello.ts exists and prints 'hi' when run with node.";

// claude: prompt is positional in -p (print) mode; effort via --effort.
evals.define({
	name: "hello-claude",
	run: {
		cmd: `claude -p --model $model --effort high --permission-mode acceptEdits "${runPrompt}"`,
		model: "opus",
	},
	judge: {
		cmd: `claude -p --model $model --effort low "${judgePrompt}"`,
		model: "haiku",
	},
});

await evals.runAll();
