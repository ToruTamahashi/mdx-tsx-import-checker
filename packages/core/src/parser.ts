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
 *   imports inside fenced code blocks <- ``` ... ```
 *   imports inside indented code      <- 4-space / tab indented lines
 */

/** Maximum number of lines a single import statement may span. */
const MAX_IMPORT_LINES = 50;

export function parseImports(text: string): ImportStatement[] {
  const results: ImportStatement[] = [];
  const lines = text.split("\n");
  const codeBlockLines = buildCodeBlockSet(lines);
  let i = 0;

  while (i < lines.length) {
    if (codeBlockLines.has(i)) {
      i++;
      continue;
    }

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

    // j is the 0-based line number of the line containing `from "..."`
    const parsed = parseSingleImport(raw, i, j);
    if (parsed) results.push(parsed);
    i = j + 1;
  }

  return results;
}

/**
 * Build a Set of line indices that are inside code blocks and should be skipped.
 *
 * Handles:
 *   1. Fenced code blocks:  ``` or ~~~ (with optional language tag)
 *   2. Indented code blocks: lines starting with 4 spaces or a tab
 */
function buildCodeBlockSet(lines: string[]): Set<number> {
  const skipped = new Set<number>();
  let inFencedBlock = false;
  let fenceChar = "";
  let fenceLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFencedBlock) {
      skipped.add(i);
      const closeMatch = line.match(/^(\s*)(`{3,}|~{3,})\s*$/);
      if (
        closeMatch &&
        closeMatch[2][0] === fenceChar &&
        closeMatch[2].length >= fenceLength
      ) {
        inFencedBlock = false;
      }
    } else {
      const openMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
      if (openMatch) {
        inFencedBlock = true;
        fenceChar = openMatch[2][0];
        fenceLength = openMatch[2].length;
        skipped.add(i);
        continue;
      }

      if (line.startsWith("    ") || line.startsWith("\t")) {
        skipped.add(i);
      }
    }
  }

  return skipped;
}

/**
 * Checks whether `raw` contains a complete `from '...'` clause.
 */
function hasFromClause(raw: string): boolean {
  const fromIdx = raw.indexOf(" from ");
  if (fromIdx === -1) return false;
  const afterFrom = raw.slice(fromIdx + 6).trimStart();
  return afterFrom.startsWith("'") || afterFrom.startsWith('"');
}

function parseSingleImport(raw: string, line: number, fromLine: number): ImportStatement | null {
  const moduleSpecifier = extractModuleSpecifier(raw);
  if (moduleSpecifier === null) return null;

  const namedImports = extractNamedImports(raw);
  if (namedImports === null || namedImports.length === 0) return null;

  return { namedImports, moduleSpecifier, line, fromLine, raw };
}

/**
 * Extract the module specifier from an import statement.
 * e.g. `import { A } from '@/foo'` → `@/foo`
 */
function extractModuleSpecifier(raw: string): string | null {
  const fromIdx = raw.indexOf(" from ");
  if (fromIdx === -1) return null;

  const afterFrom = raw.slice(fromIdx + 6).trimStart();
  const quote = afterFrom[0];
  if (quote !== "'" && quote !== '"') return null;

  const end = afterFrom.indexOf(quote, 1);
  if (end === -1) return null;

  return afterFrom.slice(1, end);
}

/**
 * Extract named imports from the `{ ... }` portion of an import statement.
 * e.g. `import { A, B as C } from '...'` → `["A", "B"]`
 */
function extractNamedImports(raw: string): string[] | null {
  const open = raw.indexOf("{");
  if (open === -1) return null;

  const close = raw.indexOf("}", open + 1);
  if (close === -1) return null;

  const inner = raw.slice(open + 1, close);

  const names: string[] = [];
  for (const entry of inner.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const asIdx = trimmed.indexOf(" as ");
    const name = asIdx !== -1 ? trimmed.slice(0, asIdx).trim() : trimmed;

    if (/^\w+$/.test(name)) names.push(name);
  }

  return names.length > 0 ? names : null;
}
