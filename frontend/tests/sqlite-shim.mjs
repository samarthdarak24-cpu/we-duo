// Vitest loads modules through Vite's SSR transform, which strips the `node:`
// prefix from `node:sqlite` and then cannot resolve it. This shim re-exports the
// real builtin through createRequire so DB-backed tests run against the same
// engine the app uses.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sqlite = require("node:sqlite");

export const DatabaseSync = sqlite.DatabaseSync;
export const StatementSync = sqlite.StatementSync;
export default sqlite;
