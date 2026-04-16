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

# Disable color output
npx mdx-tsx-import-checker ./src/content/docs --no-color
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

## License

MIT
