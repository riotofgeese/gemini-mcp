# Gemini MCP Server

An MCP (Model Context Protocol) server that provides access to Google's Gemini API. Drop-in alternative to Codex MCP with matching interface.

## Features

- **gemini** - Start a new Gemini conversation with configurable context
- **gemini-reply** - Continue multi-turn conversations
- **gemini-image** - Generate images using Imagen 4.0

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file or set environment variables:

```bash
# Required: Your Google Gemini API key
GEMINI_API_KEY=your_api_key_here

# Optional: Override the model (default: gemini-3-pro-preview)
GEMINI_MODEL=gemini-3-pro-preview
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Usage with Claude Code

Add to your MCP settings (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/path/to/gemini-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Tools

### gemini

Start a new conversation with Gemini.

**Parameters:**
- `prompt` (required) - The initial prompt
- `cwd` - Working directory context
- `sandbox` - Access policy: "read-only", "workspace-write", or "danger-full-access"
- `base-instructions` - Override default system instructions
- `developer-instructions` - Additional context for the model

**Returns:** Response text and a `conversationId` for follow-up.

### gemini-reply

Continue an existing conversation.

**Parameters:**
- `conversationId` (required) - ID from a previous gemini call
- `prompt` (required) - Your follow-up message

### gemini-image

Generate images from text prompts.

**Parameters:**
- `prompt` (required) - Description of the image to generate
- `numberOfImages` - How many images (1-4, default: 1)
- `aspectRatio` - Image ratio: "1:1", "3:4", "4:3", "9:16", "16:9"
- `outputPath` - Directory to save generated images

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## License

MIT
