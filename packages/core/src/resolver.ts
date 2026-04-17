import * as fs from "fs";
import * as path from "path";
import { PathAliases } from "./types";

const EXTENSIONS = [
  ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs",
  "/index.ts", "/index.tsx", "/index.d.ts", "/index.js", "/index.mjs",
];

/**
 * Resolves a module specifier to an absolute file path.
 *
 * Resolution order:
 *   1. Relative import  (`./foo`, `../bar`)
 *   2. Path alias       (`@/components/foo` via tsconfig paths)
 *   3. node_modules     (`react`, `@astrojs/starlight/components`)
 *
 * Returns null if the specifier cannot be resolved to a local file
 * (e.g. a bare package name with no node_modules found).
 */
export function resolveModulePath(
  specifier: string,
  fromFile: string,
  aliases: PathAliases,
  projectRoot: string | null
): string | null {
  let resolved: string | null = null;

  if (specifier.startsWith(".")) {
    resolved = resolveRelative(specifier, fromFile);
  } else {
    const aliasResolved = resolveAlias(specifier, aliases);
    if (aliasResolved !== null) {
      resolved = aliasResolved;
    } else {
      resolved = resolveFromNodeModules(specifier, fromFile, projectRoot);
    }
  }

  if (resolved === null) return null;

  // Security: reject any path that escapes the project root.
  // Only check paths that actually exist — non-existent paths are passed
  // through so that "Cannot find module" errors are still reported.
  if (projectRoot !== null && fs.existsSync(resolved)) {
    if (!isWithinAllowedRoots(resolved, projectRoot)) {
      return null;
    }
  }

  return resolved;
}

/**
 * Returns true if `resolved` is within the project root.
 *
 * Uses fs.realpathSync() to resolve symlinks (e.g. pnpm virtual store).
 * Only called when `resolved` is known to exist, so realpathSync will
 * not throw on the resolved path.
 */
function isWithinAllowedRoots(resolved: string, projectRoot: string): boolean {
  try {
    const realProject = fs.realpathSync(path.resolve(projectRoot)) + path.sep;
    const realResolved = fs.realpathSync(path.resolve(resolved));
    return realResolved.startsWith(realProject);
  } catch {
    // Fallback to plain string comparison
    const absProject = path.resolve(projectRoot) + path.sep;
    const absResolved = path.resolve(resolved);
    return absResolved.startsWith(absProject);
  }
}

function resolveRelative(specifier: string, fromFile: string): string {
  const dir = path.dirname(fromFile);
  return resolveWithExtensions(path.resolve(dir, specifier));
}

function resolveAlias(specifier: string, aliases: PathAliases): string | null {
  for (const [alias, aliasRoot] of Object.entries(aliases)) {
    const prefix = alias.endsWith("/*") ? alias.slice(0, -1) : alias + "/";
    const bare = alias.replace("/*", "");
    if (specifier.startsWith(prefix) || specifier === bare) {
      const rest = specifier.slice(prefix.length);
      return resolveWithExtensions(path.join(aliasRoot, rest));
    }
  }
  return null;
}

function resolveFromNodeModules(
  specifier: string,
  fromFile: string,
  projectRoot: string | null
): string | null {
  const nmRoots = collectNodeModuleRoots(fromFile, projectRoot);
  for (const nmRoot of nmRoots) {
    const result = tryResolvePackage(specifier, nmRoot);
    if (result) return result;
  }
  return null;
}

function collectNodeModuleRoots(fromFile: string, projectRoot: string | null): string[] {
  const roots: string[] = [];
  let dir = path.dirname(fromFile);
  const stopAt = projectRoot ? path.resolve(projectRoot) : path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, "node_modules");
    if (fs.existsSync(candidate)) roots.push(candidate);
    if (path.resolve(dir) === stopAt || dir === path.parse(dir).root) break;
    dir = path.dirname(dir);
  }

  return roots;
}

function tryResolvePackage(specifier: string, nmRoot: string): string | null {
  const { pkgName, subPath } = splitSpecifier(specifier);
  const pkgDir = path.join(nmRoot, pkgName);
  if (!fs.existsSync(pkgDir)) return null;

  const pkgJson = readPackageJson(pkgDir);

  if (subPath) {
    return resolveSubPath(subPath, pkgDir, pkgJson);
  }

  return resolvePackageRoot(pkgDir, pkgJson);
}

function splitSpecifier(specifier: string): { pkgName: string; subPath: string } {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return {
      pkgName: parts[0] + "/" + parts[1],
      subPath: parts.slice(2).join("/"),
    };
  }
  const slashIdx = specifier.indexOf("/");
  return {
    pkgName: slashIdx === -1 ? specifier : specifier.slice(0, slashIdx),
    subPath: slashIdx === -1 ? "" : specifier.slice(slashIdx + 1),
  };
}

function readPackageJson(pkgDir: string): Record<string, unknown> {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolveSubPath(
  subPath: string,
  pkgDir: string,
  pkgJson: Record<string, unknown>
): string | null {
  const exportsField = pkgJson["exports"] as Record<string, unknown> | undefined;
  if (exportsField) {
    const resolved = resolveExportsField(exportsField, "./" + subPath, pkgDir);
    if (resolved) return resolved;
  }
  return resolveWithExtensions(path.join(pkgDir, subPath));
}

function resolvePackageRoot(
  pkgDir: string,
  pkgJson: Record<string, unknown>
): string | null {
  for (const field of ["types", "typings"]) {
    const entry = pkgJson[field] as string | undefined;
    if (entry) {
      const candidate = path.resolve(pkgDir, entry);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  const exportsField = pkgJson["exports"] as Record<string, unknown> | undefined;
  if (exportsField) {
    const resolved = resolveExportsField(exportsField, ".", pkgDir);
    if (resolved) return resolved;
  }

  const main = pkgJson["main"] as string | undefined;
  if (main) {
    const candidate = path.resolve(pkgDir, main);
    if (fs.existsSync(candidate)) return candidate;
  }

  return resolveWithExtensions(path.join(pkgDir, "index"));
}

function resolveExportsField(
  exportsField: Record<string, unknown>,
  key: string,
  pkgDir: string
): string | null {
  const entry = exportsField[key];
  if (!entry) return null;

  for (const candidate of extractExportCandidates(entry)) {
    if (typeof candidate !== "string") continue;
    const resolved = path.resolve(pkgDir, candidate);
    if (fs.existsSync(resolved)) return resolved;
    const withExt = resolveWithExtensions(resolved.replace(/\.[^.]+$/, ""));
    if (fs.existsSync(withExt)) return withExt;
  }
  return null;
}

function extractExportCandidates(entry: unknown): string[] {
  if (typeof entry === "string") return [entry];
  if (typeof entry !== "object" || entry === null) return [];

  const obj = entry as Record<string, unknown>;
  const results: string[] = [];
  for (const cond of ["types", "import", "require", "default"]) {
    if (cond in obj) results.push(...extractExportCandidates(obj[cond]));
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!["types", "import", "require", "default"].includes(k)) {
      results.push(...extractExportCandidates(v));
    }
  }
  return results;
}

export function resolveWithExtensions(base: string): string {
  if (path.extname(base) && fs.existsSync(base)) return base;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return base;
}

export function findProjectRoot(fromFile: string): string | null {
  let dir = path.dirname(fromFile);
  const root = path.parse(dir).root;

  while (dir !== root) {
    for (const marker of ["tsconfig.json", "package.json", ".git"]) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}
