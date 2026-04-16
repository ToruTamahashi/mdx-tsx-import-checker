#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { checkFile, CheckError } from "@mdx-tsx-import-checker/core";

// -----------------------------------------------------------------------
// CLI entry point
// Usage:
//   mdx-tsx-import-checker <path-or-glob> [options]
//
// Options:
//   --tsconfig <path>   Path to tsconfig.json
//   --verbose           Show debug logs
//   --format <fmt>      Output format: pretty (default) | github | json
//   --no-color          Disable color output
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Color helpers (ANSI escape codes)
// TTY でない場合（CI へのパイプ等）や --no-color 指定時は色なしにフォールバック
// -----------------------------------------------------------------------

let useColor = process.stdout.isTTY && process.stderr.isTTY;

const c = {
  red:    (s: string) => useColor ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: (s: string) => useColor ? `\x1b[33m${s}\x1b[0m` : s,
  green:  (s: string) => useColor ? `\x1b[32m${s}\x1b[0m` : s,
  gray:   (s: string) => useColor ? `\x1b[90m${s}\x1b[0m` : s,
  bold:   (s: string) => useColor ? `\x1b[1m${s}\x1b[0m`  : s,
};

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface CliOptions {
  patterns: string[];
  tsconfigPath?: string;
  verbose: boolean;
  format: "pretty" | "github" | "json";
}

// -----------------------------------------------------------------------
// Argument parser
// -----------------------------------------------------------------------

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    patterns: [],
    verbose: false,
    format: "pretty",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--tsconfig" && args[i + 1]) {
      options.tsconfigPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--no-color") {
      useColor = false;
    } else if (arg === "--format" && args[i + 1]) {
      const fmt = args[++i];
      if (fmt === "pretty" || fmt === "github" || fmt === "json") {
        options.format = fmt;
      } else {
        console.error(c.red(`Unknown format: ${fmt}. Use pretty, github, or json.`));
        process.exit(1);
      }
    } else if (!arg.startsWith("--")) {
      options.patterns.push(arg);
    }
  }

  return options;
}

// -----------------------------------------------------------------------
// File discovery
// -----------------------------------------------------------------------

function findMdxFiles(patterns: string[]): string[] {
  const files: string[] = [];

  for (const pattern of patterns) {
    const resolved = path.resolve(process.cwd(), pattern);

    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      walkDir(resolved, files);
      continue;
    }

    if (pattern.includes("*")) {
      const base = pattern.split("*")[0];
      const baseDir = path.resolve(process.cwd(), base.endsWith("/") ? base : path.dirname(base));
      if (fs.existsSync(baseDir)) walkDir(baseDir, files);
      continue;
    }

    if (fs.existsSync(resolved) && resolved.endsWith(".mdx")) {
      files.push(resolved);
    }
  }

  return [...new Set(files)];
}

function walkDir(dir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        walkDir(full, results);
      }
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      results.push(full);
    }
  }
}

// -----------------------------------------------------------------------
// Formatters
// -----------------------------------------------------------------------

function formatPretty(file: string, errors: CheckError[], cwd: string): void {
  const rel = path.relative(cwd, file);
  for (const err of errors) {
    const loc  = err.column > 0 ? `${err.line}:${err.column}` : `${err.line}`;
    const tag  = c.red("error");
    const pos  = c.gray(`${rel}:${loc}`);
    const msg  = c.red(err.message);
    console.error(`  ${pos}  ${tag}  ${msg}`);
  }
}

function formatGithub(errors: CheckError[]): void {
  for (const err of errors) {
    const col = err.column > 0 ? `,col=${err.column}` : "";
    // GitHub Actions annotations は色なし
    console.error(`::error file=${err.file},line=${err.line}${col}::${err.message}`);
  }
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

function main(): void {
  const options = parseArgs(process.argv);
  const cwd = process.cwd();

  if (options.patterns.length === 0) {
    console.error(c.bold("Usage:") + " mdx-tsx-import-checker <path-or-glob> [--tsconfig <path>] [--format pretty|github|json] [--no-color] [--verbose]");
    console.error(c.gray("Example: mdx-tsx-import-checker ./src/content/docs"));
    process.exit(1);
  }

  const files = findMdxFiles(options.patterns);

  if (files.length === 0) {
    console.log(c.yellow("No MDX files found."));
    process.exit(0);
  }

  if (options.format === "pretty") {
    console.log(c.gray(`Checking ${files.length} MDX file(s)...\n`));
  }

  const logger = options.verbose ? (msg: string) => console.log(c.gray(msg)) : undefined;

  let totalErrors = 0;
  const allErrors: CheckError[] = [];

  for (const file of files) {
    const errors = checkFile(file, {
      tsconfigPath: options.tsconfigPath,
      logger,
    });

    totalErrors += errors.length;

    if (options.format === "pretty" && errors.length > 0) {
      formatPretty(file, errors, cwd);
    } else if (options.format === "github") {
      formatGithub(errors);
    }

    allErrors.push(...errors);
  }

  if (options.format === "json") {
    console.log(JSON.stringify(allErrors, null, 2));
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  if (options.format === "pretty") {
    console.log("");
    if (totalErrors === 0) {
      console.log(c.green(`✓ No import errors found in ${files.length} file(s).`));
    } else {
      console.error(c.red(c.bold(`✗ Found ${totalErrors} error(s) in ${files.length} file(s).`)));
    }
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
