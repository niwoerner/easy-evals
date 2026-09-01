import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function mirrorWorkspace(
	sourceLocation: string | URL,
	destination: string,
): Promise<void> {
	const source =
		sourceLocation instanceof URL
			? fileURLToPath(sourceLocation)
			: resolve(sourceLocation);
	await mkdir(destination, { recursive: true });
	for (const entry of await readdir(source)) {
		if (entry === ".easy-evals") continue;
		await cp(join(source, entry), join(destination, entry), {
			recursive: true,
			verbatimSymlinks: true,
		});
	}
}

export async function removeWorkspace(path: string): Promise<void> {
	await rm(path, { recursive: true, force: true });
}
