# @figma-ui-verifier/mcp

MCP (Model Context Protocol) server for Figma UI verification. Enables AI coding tools to directly invoke verification.

## Installation

```bash
npm install @figma-ui-verifier/mcp
```

## Usage

### As MCP Server

Start the server:

```bash
npx figma-verify-mcp
```

The server communicates via stdio and exposes three tools:

### Tools

#### `verify`

Run Figma UI verification against a live URL.

**Parameters:**
- `figma_json_path` (required): Path to Figma API JSON file
- `url` (required): Local dev server URL
- `threshold` (optional): CI gate score threshold (0-100), default: 80
- `viewports` (optional): Array of viewport widths, default: [1440]
- `skip_instance_children` (optional): Skip INSTANCE children, default: false

**Example:**
```json
{
  "figma_json_path": "./design.json",
  "url": "http://localhost:3000",
  "threshold": 85,
  "viewports": [1440, 768, 375]
}
```

#### `get_report`

Get the latest verification report.

**Parameters:**
- `format` (optional): "json" or "html", default: "json"

#### `get_fix_suggestions`

Get fix suggestions for failed verification.

**Parameters:**
- `figma_json_path` (required): Path to Figma API JSON file
- `url` (required): Local dev server URL

## Integration with AI Coding Tools

### Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "figma-verify": {
      "command": "npx",
      "args": ["figma-verify-mcp"]
    }
  }
}
```

Then use in conversation:

```
Run figma verification on my implementation at http://localhost:3000 against ./design.json
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "servers": {
    "figma-verify": {
      "command": "npx",
      "args": ["figma-verify-mcp"]
    }
  }
}
```

### Other MCP Clients

The server follows the standard MCP protocol. Connect via stdio transport.

## Response Format

### verify response

```json
{
  "score": 85.5,
  "passed": true,
  "threshold": 80,
  "viewport_scores": {
    "1440": { "score": 87 },
    "768": { "score": 84 }
  },
  "total_diffs": 45,
  "failed_diffs": 8
}
```

### get_fix_suggestions response

```json
{
  "total_suggestions": 8,
  "suggestions": [
    {
      "nodeId": "1:1",
      "nodeName": "Button",
      "property": "left",
      "expectedPx": "100px",
      "actualPx": "95px",
      "diff": "+5px",
      "fix": "Set left: 100px (current: 95px, diff: +5px)"
    }
  ]
}
```