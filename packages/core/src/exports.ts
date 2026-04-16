import * as fs from "fs";

/**
 * Extracts named exports from a TypeScript/JavaScript file using regex-based
 * static analysis. Covers the most common export patterns:
 *
 *   export function Foo
 *   export const Foo / export let Foo / export var Foo
 *   export class Foo
 *   export type Foo / export interface Foo / export enum Foo
 *   export async function Foo
 *   export { Foo, Bar }
 *   export { Foo as Bar }   ← Bar is the exported name
 *   export default          ← registered as "default"
 *
 * Returns null if the file cannot be read.
 */
export function getNamedExports(filePath: string): Set<string> | null {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const namedExports = new Set<string>();

  collectDeclarationExports(source, namedExports);
  collectBraceExports(source, namedExports);

  if (/export\s+default\b/.test(source)) {
    namedExports.add("default");
  }

  return namedExports;
}

/** Matches: export [async] function|const|let|var|class|type|interface|enum Name */
function collectDeclarationExports(source: string, result: Set<string>): void {
  const pattern =
    /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g;
  for (const m of source.matchAll(pattern)) {
    result.add(m[1]);
  }
}

/** Matches: export { Foo, Bar as Baz } */
function collectBraceExports(source: string, result: Set<string>): void {
  const pattern = /export\s*\{([^}]+)\}/g;
  for (const m of source.matchAll(pattern)) {
    for (const entry of m[1].split(",")) {
      const asMatch = entry.match(/\w+\s+as\s+(\w+)/);
      if (asMatch) {
        result.add(asMatch[1]);
      } else {
        const name = entry.trim();
        if (name) result.add(name);
      }
    }
  }
}
