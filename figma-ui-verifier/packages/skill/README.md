# @figma-ui-verifier/skill

Claude Code skill for Figma UI verification. Provides a guided `/figma-verify` command.

## Installation

```bash
npm install @figma-ui-verifier/skill
```

## Usage

### In Claude Code

The skill is automatically available when installed. Use:

```
/figma-verify
```

### Options

```
/figma-verify [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--figma-json <path>` | Path to Figma API JSON file | Auto-detect |
| `--url <url>` | Local dev server URL | `http://localhost:3000` |
| `--threshold <number>` | Minimum passing score (0-100) | `80` |
| `--viewports <widths>` | Comma-separated viewport widths | `1440` |
| `--html` | Generate HTML report | `true` |
| `--pixel` | Enable pixel-level comparison | `false` |
| `--skip-instance-children` | Skip INSTANCE children | `false` |

### Examples

```bash
# Basic usage (auto-detects figma-design.json)
/figma-verify

# Specify custom paths
/figma-verify --figma-json ./design.json --url http://localhost:3000

# High threshold with responsive testing
/figma-verify --threshold 90 --viewports 1440,768,375

# Skip component internals
/figma-verify --skip-instance-children
```

## Workflow

1. **Validate inputs**: Checks for Figma JSON file and dev server
2. **Run verification**: Executes `figma-verify` CLI
3. **Display results**: Shows score, status, and viewport breakdown
4. **Provide suggestions**: Lists top fix recommendations if failed

## Auto-detection

The skill automatically searches for Figma JSON in:
- `figma-design.json`
- `design.json`
- `figma.json`
- `.figma/design.json`

## Output

### Console output

```
🎨 Figma UI Verification Skill
================================

📁 Found Figma JSON: figma-design.json

🚀 Running verification...

✅ Verification PASSED
   Score: 85/80
   Total Diffs: 45
   Failed Diffs: 8

📊 Viewport Scores:
   1440px: 87
   768px: 84
```

### HTML Report

When `--html` is enabled (default), generates `./figma-verify-report.html` with:
- Side-by-side screenshot comparison
- Diff overlay visualization
- Per-node property details
- Fix suggestions with exact CSS values

## Integration

### With Claude Code

Add to your project's `.claude/skills/`:

```json
{
  "name": "figma-verify",
  "command": "npx figma-verify"
}
```

### Programmatic usage

```typescript
import { run, metadata } from '@figma-ui-verifier/skill';

// Run with options
await run({
  figmaJson: './design.json',
  url: 'http://localhost:3000',
  threshold: 85,
  viewports: [1440, 768, 375],
});
```