import { ImportStatement } from "./types";

/**
 * Extracts all named import statements from MDX text.
 *
 * Handles:
 *   import { A, B } from 'mod'
 *   import { A as B } from 'mod'      <- original name A is checked
 *   import Default, { A } from 'mod'
 *   multi-line imports
 *
 * Skipped:
 *   import Default from 'mod'         <- no named imports
 *
 * Security: multi-line collection is capped at MAX_IMPORT_LINES to
 * prevent memory exhaustion from malformed or adversarial MDX files.
 */

/** Maximum number of lines a single import statement may span. */
const MAX_IMPORT_LINES = 50;

export function parseImports(text: string): ImportStatement[] {
  const results: ImportStatement[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trimStart().startsWith("import ")) {
      i++;
      continue;
    }

    // Collect continuation lines until `from '...'` is complete,
    // but never beyond MAX_IMPORT_LINES to prevent memory exhaustion.
    let raw = line;
    let j = i;
    const limit = Math.min(i + MAX_IMPORT_LINES, lines.length - 1);

    while (!hasFromClause(raw) && j < limit) {
      j++;
      raw += " " + lines[j];
    }

    const parsed = parseSingleImport(raw, i);
    if (parsed) results.push(parsed);
    i = j + 1;
  }

  return results;
}

/**
 * Checks whether `raw` contains a complete `from '...'` clause.
 *
 * Uses a simple indexOf-based approach instead of a regex on a
 * potentially huge string to avoid ReDoS risk.
 */
function hasFromClause(raw: string): boolean {
  const fromIdx = raw.indexOf(" from ");
  if (fromIdx === -1) return false;
  const afterFrom = raw.slice(fromIdx + 6).trimStart();
  return afterFrom.startsWith("'") || afterFrom.startsWith('"');
}

function parseSingleImport(raw: string, line: number): ImportStatement | null {
  const fromMatch = raw.match(/from\s+['"]([^'"]+)['"]/);
  if (!fromMatch) return null;
  const moduleSpecifier = fromMatch[1];

  const braceMatch = raw.match(/\{([^}]+)\}/);
  if (!braceMatch) return null;

  const namedImports = braceMatch[1]
    .split(",")
    .map((s) => {
      // "X as Y" → we check the original export name X
      const m = s.match(/^\s*(\w+)(?:\s+as\s+\w+)?\s*$/);
      return m ? m[1] : s.trim();
    })
    .filter(Boolean);

  if (namedImports.length === 0) return null;
  return { namedImports, moduleSpecifier, line, raw };
}
