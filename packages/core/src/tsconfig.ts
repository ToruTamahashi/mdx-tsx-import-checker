import * as fs from "fs";
import * as path from "path";
import { PathAliases, TsConfig, TsConfigCompilerOptions } from "./types";

/**
 * Reads tsconfig.json and extracts path aliases as absolute paths.
 *
 * Example tsconfig:
 *   { "compilerOptions": { "paths": { "@/*": ["./src/*"] }, "baseUrl": "." } }
 *
 * Result:
 *   { "@/*": "/abs/path/to/src" }
 */
export function resolveAliases(
  projectRoot: string,
  tsconfigPath: string | undefined,
  log: (msg: string) => void = () => {}
): PathAliases {
  const aliases: PathAliases = {};
  const tsconfig = tsconfigPath ?? findTsconfig(projectRoot);
  if (!tsconfig || !fs.existsSync(tsconfig)) return aliases;

  try {
    const raw = fs.readFileSync(tsconfig, "utf-8");
    const parsed = parseJsonWithComments(raw);
    if (!parsed) return aliases;

    const compilerOptions = (parsed.compilerOptions ?? {}) as TsConfigCompilerOptions;
    const paths = compilerOptions.paths ?? {};
    const baseUrl = compilerOptions.baseUrl ?? ".";
    const absoluteBase = path.resolve(path.dirname(tsconfig), baseUrl);

    log(`  tsconfig paths: ${JSON.stringify(paths)}, baseUrl: ${baseUrl}`);

    for (const [alias, targets] of Object.entries(paths)) {
      if (targets.length > 0) {
        // "./src/*" → "./src"  (strip trailing /*)
        const target = targets[0].endsWith("/*") ? targets[0].slice(0, -2) : targets[0];
        aliases[alias] = path.resolve(absoluteBase, target);
      }
    }
  } catch (e) {
    log(`  tsconfig error: ${String(e)}`);
  }

  return aliases;
}

/**
 * Search for tsconfig.json starting from projectRoot.
 * Also checks common monorepo locations.
 */
function findTsconfig(projectRoot: string): string | null {
  const candidates = [
    "tsconfig.json",
    "packages/docs/tsconfig.json",
    "packages/web/tsconfig.json",
  ];
  for (const c of candidates) {
    const full = path.join(projectRoot, c);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * Parse JSON that may contain comments and trailing commas (tsconfig format).
 *
 * Handles:
 *   // single-line comments
 *   /* block comments *\/
 *   trailing commas  { "a": 1, }
 */
function parseJsonWithComments(raw: string): TsConfig | null {
  try {
    let cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    cleaned = cleaned.replace(/\/\/[^\n]*/g, "");
    cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(cleaned) as TsConfig;
  } catch {
    return null;
  }
}
