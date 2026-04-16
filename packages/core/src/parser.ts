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
 */
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

    // Collect continuation lines until `from '...'` is complete
    let raw = line;
    let j = i;
    while (!raw.match(/from\s+['"][^'"]+['"]/) && j + 1 < lines.length) {
      j++;
      raw += " " + lines[j];
    }

    const parsed = parseSingleImport(raw, i);
    if (parsed) results.push(parsed);
    i = j + 1;
  }

  return results;
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
