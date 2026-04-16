# mdx-tsx-import-checker

Validates named imports of **React/TSX components** in MDX files.

Catches errors like wrong export names or missing files — before you run the dev server.

```
  src/content/docs/index.mdx:21  error  'CardGrid' is not exported from '@astrojs/starlight/components'. Available: Card, CardGrid, ...
```

---

## Installation

```bash
# Run without installing
npx mdx-tsx-import-checker <path>

# Or install locally
npm install -D mdx-tsx-import-checker
```

---

## Usage

```bash
# Check a directory (recursive)
npx mdx-tsx-import-checker ./src/content/docs

# Specify tsconfig manually
npx mdx-tsx-import-checker ./src/content/docs --tsconfig ./tsconfig.json

# Output formats
npx mdx-tsx-import-checker ./src/content/docs --format pretty   # default
npx mdx-tsx-import-checker ./src/content/docs --format github   # GitHub Actions annotations
npx mdx-tsx-import-checker ./src/content/docs --format json     # machine-readable JSON

# Verbose debug output
npx mdx-tsx-import-checker ./src/content/docs --verbose
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No errors found |
| `1` | One or more import errors found |

---

## CI Integration

### GitHub Actions

```yaml
- name: Check MDX imports
  run: npx mdx-tsx-import-checker ./src/content/docs --format github
```

`--format github` outputs [workflow annotations](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-an-error-message) that appear inline in pull request diffs.

---

## VSCode Integration

This package can be used as the backend for a VSCode extension via `child_process`. The extension calls the CLI with `--format json` and converts the output to diagnostics. See the [extension source](./packages/vscode) for reference.

If you have the package installed locally (`npm install -D mdx-tsx-import-checker`), the extension will use the local binary automatically. Otherwise it falls back to `npx`.

---

## Supported Import Types

| Type | Example | Supported |
|---|---|---|
| tsconfig path alias | `from '@/components/Button'` | ✅ |
| Relative path | `from './components/Button'` | ✅ |
| node_modules (TS/JS) | `from '@astrojs/starlight/components'` | ✅ |
| Default import | `import Foo from '...'` | ⚪ skipped |

## Not Supported

The following import targets are **not supported** and will be silently skipped:

- `.astro` components
- `.svelte` / `.vue` components
- CSS modules, images, and other non-JS assets
- Dynamic imports (`await import(...)`)

Only TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`, `.mjs`, `.cjs`) are analyzed for named exports.

---

## Repository Structure

```
packages/
├── core/   # Core logic (import parsing, module resolution, export extraction)
└── cli/    # CLI entry point — core is bundled in, no runtime dependencies
```

`core` is not published to npm separately. It is bundled into the CLI at build time.

---

## License

MIT
