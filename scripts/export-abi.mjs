import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const artifactPath = path.join(
  process.cwd(),
  "artifacts",
  "contracts",
  "StealthTipRegistry.sol",
  "StealthTipRegistry.json",
);
const abiPath = path.join(process.cwd(), "src", "contracts", "StealthTipRegistry.abi.json");

const artifact = JSON.parse(await readFile(artifactPath, "utf8"));

await mkdir(path.dirname(abiPath), { recursive: true });
await writeFile(abiPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);

console.log(`Exported StealthTipRegistry ABI to ${path.relative(process.cwd(), abiPath)}`);
