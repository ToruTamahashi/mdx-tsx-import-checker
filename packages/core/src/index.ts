import * as fs from "fs";
import * as path from "path";
import { CheckError, CheckOptions } from "./types";
import { parseImports } from "./parser";
import { resolveModulePath, findProjectRoot } from "./resolver";
import { resolveAliases } from "./tsconfig";
import { getNamedExports } from "./exports";

export type { ImportStatement, CheckError, CheckOptions, PathAliases } from "./types";
export { parseImports } from "./parser";
export { resolveModulePath, resolveWithExtensions, findProjectRoot } from "./resolver";
export { resolveAliases } from "./tsconfig";
export { getNamedExports } from "./exports";

/**
 * Check a single MDX file for import errors.
 * Returns an array of CheckError (empty array = no errors).
 */
export function checkFile(filePath: string, options: CheckOptions = {}): CheckError[] {
  const log = options.logger ?? (() => {});
  const errors: CheckError[] = [];

  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    errors.push({ file: filePath, line: 0, column: 0, message: `Cannot read file: ${String(e)}` });
    return errors;
  }

  const imports = parseImports(text);
  log(`  parsed ${imports.length} import(s) in ${filePath}`);
  if (imports.length === 0) return errors;

  const projectRoot = options.tsconfigPath
    ? path.dirname(options.tsconfigPath)
    : findProjectRoot(filePath);
  log(`  projectRoot: ${projectRoot ?? "(null)"}`);

  const aliases = projectRoot
    ? resolveAliases(projectRoot, options.tsconfigPath, log)
    : {};
  log(`  aliases: ${JSON.stringify(aliases)}`);

  const lines = text.split("\n");

  for (const imp of imports) {
    log(`  checking: { ${imp.namedImports.join(", ")} } from '${imp.moduleSpecifier}'`);

    const resolvedPath = resolveModulePath(imp.moduleSpecifier, filePath, aliases, projectRoot);
    log(`    resolved: ${resolvedPath ?? "(null — skipped)"}`);

    if (resolvedPath === null) continue;

    const stat = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath) : null;

    if (stat === null || stat.isDirectory()) {
      log(`    ${stat === null ? "NOT FOUND" : "RESOLVED TO DIRECTORY (no index file)"} → error`);
      errors.push({
        file: filePath,
        line: imp.line + 1,
        column: 0,
        message: `Cannot find module '${imp.moduleSpecifier}' (resolved to: ${resolvedPath})`,
      });
      continue;
    }

    const namedExports = getNamedExports(resolvedPath);
    if (namedExports === null) {
      log(`    could not read exports — skipping`);
      continue;
    }
    log(`    exports: ${[...namedExports].join(", ")}`);

    for (const name of imp.namedImports) {
      if (!namedExports.has(name)) {
        const col = lines[imp.line]?.indexOf(name) ?? -1;
        const available = [...namedExports].filter((e) => e !== "default").sort().join(", ");
        errors.push({
          file: filePath,
          line: imp.line + 1,
          column: col >= 0 ? col + 1 : 0,
          message:
            `'${name}' is not exported from '${imp.moduleSpecifier}'` +
            (available ? `. Available: ${available}` : ""),
        });
      }
    }
  }

  return errors;
}
