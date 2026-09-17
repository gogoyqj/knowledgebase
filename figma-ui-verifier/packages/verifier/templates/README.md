# CI/CD Integration Templates

## GitHub Actions

Copy `github-actions.yml` to `.github/workflows/figma-verify.yml` in your project.

### Prerequisites

1. **Figma API Token**: Add as repository secret `FIGMA_TOKEN`
   - Go to Figma → Settings → Personal Access Tokens
   - Create a token with `file_read` scope

2. **Figma Design JSON**: Export your Figma design as JSON
   - Use Figma API: `GET /v1/files/:file_key`
   - Or use Figma plugin to export

3. **Dev Server**: Ensure your app starts on a predictable port

### Configuration

Set these repository variables (Settings → Secrets and variables → Actions):

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGMA_VERIFY_THRESHOLD` | `80` | Minimum passing score (0-100) |

### How it works

1. On PR, the workflow:
   - Starts your dev server
   - Runs `figma-verify` against multiple viewports (1440, 768, 375)
   - Generates HTML and JSON reports
   - Posts a summary comment on the PR
   - Fails the check if score < threshold

2. HTML report is uploaded as artifact for detailed inspection

### Customization

Edit the workflow to:
- Change viewport breakpoints
- Adjust threshold per environment
- Add pixel-level comparison with `--pixel` flag
- Skip instance children with `--skip-instance-children`

## Other CI Systems

The CLI can be integrated into any CI system:

```bash
# Install
npm install -g @figma-ui-verifier/verifier

# Run
figma-verify \
  --figma-json ./design.json \
  --url http://localhost:3000 \
  --threshold 80 \
  --output ./report.json

# Check exit code
echo $?  # 0 = pass, 1 = fail, 2 = error
```

Exit codes:
- `0`: Score ≥ threshold (passed)
- `1`: Score < threshold (failed)
- `2`: Tool error