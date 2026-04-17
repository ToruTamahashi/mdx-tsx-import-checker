import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";

// -----------------------------------------------------------------------
// Types — mirrors CLI's --format json output
// -----------------------------------------------------------------------

interface CheckError {
  file: string;
  /** 1-based line number */
  line: number;
  /** 1-based column, or 0 if unknown */
  column: number;
  message: string;
}

// -----------------------------------------------------------------------
// Extension entry points
// -----------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("mdx-tsx-import-checker");
  context.subscriptions.push(collection);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isMdx(doc)) validate(doc, collection);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isMdx(doc)) validate(doc, collection);
    })
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!isMdx(event.document)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => validate(event.document, collection), 800);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
    })
  );

  for (const doc of vscode.workspace.textDocuments) {
    if (isMdx(doc)) validate(doc, collection);
  }
}

export function deactivate(): void {}

// -----------------------------------------------------------------------
// Validation — delegates to CLI via child_process
// -----------------------------------------------------------------------

function isMdx(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith(".mdx");
}

function validate(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  const config = vscode.workspace.getConfiguration("mdxImportChecker");
  if (!config.get<boolean>("enable", true)) {
    collection.delete(doc.uri);
    return;
  }

  const workspaceRoot = getWorkspaceRoot(doc);
  const tsconfigPath = resolveConfiguredTsconfig(workspaceRoot, config);

  runCli(doc.fileName, workspaceRoot, tsconfigPath)
    .then((errors) => {
      const diagnostics = errors.map((err) => makeDiagnostic(doc, err));
      collection.set(doc.uri, diagnostics);
    })
    .catch(() => {
      // CLI not found or execution failed — clear diagnostics silently
      collection.set(doc.uri, []);
    });
}

// -----------------------------------------------------------------------
// CLI runner
// -----------------------------------------------------------------------

/**
 * Resolve the CLI command to run.
 *
 * Priority:
 *   1. Local node_modules/.bin (npm install -D mdx-tsx-import-checker)
 *   2. npx (no local install required)
 */
function buildCliCommand(
  filePath: string,
  workspaceRoot: string | null,
  tsconfigPath: string | undefined
): { cmd: string; args: string[] } {
  const localBin = workspaceRoot
    ? path.join(workspaceRoot, "node_modules", ".bin", "mdx-tsx-import-checker")
    : null;
  const hasLocalBin = localBin !== null && fs.existsSync(localBin);

  const cliArgs: string[] = [
    filePath,
    "--format", "json",
    "--no-color",
    ...(tsconfigPath ? ["--tsconfig", tsconfigPath] : []),
  ];

  if (hasLocalBin) {
    return { cmd: localBin, args: cliArgs };
  }

  return {
    cmd: "npx",
    args: ["--yes", "mdx-tsx-import-checker", ...cliArgs],
  };
}

function runCli(
  filePath: string,
  workspaceRoot: string | null,
  tsconfigPath: string | undefined
): Promise<CheckError[]> {
  const { cmd, args } = buildCliCommand(filePath, workspaceRoot, tsconfigPath);
  const cwd = workspaceRoot ?? path.dirname(filePath);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === "win32",
    });

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      // exit code 0 = no errors, 1 = errors found — both are valid
      if (code !== 0 && code !== 1) {
        reject(new Error(`mdx-tsx-import-checker exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const errors = JSON.parse(stdout) as CheckError[];
        resolve(errors);
      } catch {
        // Empty output or non-JSON (e.g. npx install prompt) — treat as no errors
        resolve([]);
      }
    });

    child.on("error", reject);
  });
}

// -----------------------------------------------------------------------
// Diagnostic builder
// -----------------------------------------------------------------------

function makeDiagnostic(doc: vscode.TextDocument, err: CheckError): vscode.Diagnostic {
  const line = Math.max(0, err.line - 1);
  const col = Math.max(0, err.column - 1);
  const lineText = doc.lineAt(line).text;

  const range =
    err.column > 0
      ? new vscode.Range(line, col, line, col + extractSymbolLength(err.message))
      : new vscode.Range(line, 0, line, lineText.length);

  const diag = new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error);
  diag.source = "mdx-tsx-import-checker";
  return diag;
}

/** Extract the length of the symbol name from messages like `'Foo' is not exported...` */
function extractSymbolLength(message: string): number {
  const m = message.match(/^'(\w+)'/);
  return m ? m[1].length : 1;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function getWorkspaceRoot(doc: vscode.TextDocument): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (folder) return folder.uri.fsPath;

  // Fallback: walk up from the file's directory
  let dir = path.dirname(doc.fileName);
  const root = path.parse(dir).root;
  while (dir !== root) {
    for (const marker of ["tsconfig.json", "package.json", ".git"]) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function resolveConfiguredTsconfig(
  workspaceRoot: string | null,
  config: vscode.WorkspaceConfiguration
): string | undefined {
  const configured = config.get<string>("tsconfigPath", "");
  if (configured && workspaceRoot) {
    return path.resolve(workspaceRoot, configured);
  }
  return undefined;
}
