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
 *   block comments (slash-star ... star-slash)
 *   trailing commas  { "a": 1, }
 *
 * Security: uses a character-level state machine so that comment
 * sequences inside string literals (e.g. "https://example.com") are
 * never mistakenly stripped. The previous regex-only approach would
 * erase `//` inside strings, corrupting string values.
 */
function parseJsonWithComments(raw: string): TsConfig | null {
  try {
    const cleaned = stripJsonComments(raw);
    // Remove trailing commas before ] or }
    const noTrailing = cleaned.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(noTrailing) as TsConfig;
  } catch {
    return null;
  }
}

/**
 * Strip `//` and block comments from a JSON-with-comments string,
 * correctly skipping content inside double-quoted string literals.
 *
 * State machine states:
 *   "code"         — normal JSON tokens
 *   "string"       — inside a "..." value
 *   "lineComment"  — after //
 *   "blockComment" — inside slash-star ... star-slash
 */
function stripJsonComments(input: string): string {
  type State = "code" | "string" | "lineComment" | "blockComment";
  let state: State = "code";
  let out = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    switch (state) {
      case "code":
        if (ch === '"') {
          state = "string";
          out += ch;
        } else if (ch === "/" && next === "/") {
          state = "lineComment";
          i += 2;
          continue;
        } else if (ch === "/" && next === "*") {
          state = "blockComment";
          i += 2;
          continue;
        } else {
          out += ch;
        }
        break;

      case "string":
        out += ch;
        if (ch === "\\" && next !== undefined) {
          // Consume escaped character so \" doesn't end the string
          out += next;
          i += 2;
          continue;
        }
        if (ch === '"') {
          state = "code";
        }
        break;

      case "lineComment":
        if (ch === "\n") {
          // Preserve newline so line numbers stay accurate
          out += "\n";
          state = "code";
        }
        break;

      case "blockComment":
        if (ch === "*" && next === "/") {
          state = "code";
          i += 2;
          continue;
        }
        // Preserve newlines inside block comments for line accuracy
        if (ch === "\n") out += "\n";
        break;
    }

    i++;
  }

  return out;
}
