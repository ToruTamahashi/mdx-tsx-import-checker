// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

export interface ImportStatement {
  namedImports: string[];
  moduleSpecifier: string;
  /** 0-based line number of the first line of the import statement */
  line: number;
  /** 0-based line number of the `from "..."` part (may differ from line in multi-line imports) */
  fromLine: number;
  raw: string;
}

export interface CheckError {
  file: string;
  /** 1-based line number */
  line: number;
  /** 1-based column, or 0 if unknown */
  column: number;
  message: string;
}

export interface CheckOptions {
  /** Absolute path to tsconfig.json. If omitted, auto-detected. */
  tsconfigPath?: string;
  /** Logger for debug output. Defaults to no-op. */
  logger?: (msg: string) => void;
}

export interface PathAliases {
  [alias: string]: string;
}

// -----------------------------------------------------------------------
// Internal types
// -----------------------------------------------------------------------

export interface TsConfigCompilerOptions {
  paths?: Record<string, string[]>;
  baseUrl?: string;
}

export interface TsConfig {
  compilerOptions?: TsConfigCompilerOptions;
}
