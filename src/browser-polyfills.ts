// The eERC SDK currently relies on a couple of Node-compatible globals.
// Vite intentionally does not add them to browser bundles, so provide the
// browser implementations before the live eERC module is loaded.
import { Buffer } from "buffer";
import process from "process";

const globals = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: typeof process;
};

globals.Buffer ??= Buffer;
globals.process ??= process;
