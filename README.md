# Gemini MCP Server

An MCP (Model Context Protocol) server that provides access to Google's Gemini API. Drop-in alternative to Codex MCP with matching interface.

## Features

- **gemini** - Start a new Gemini conversation with configurable context
- **gemini-reply** - Continue multi-turn conversations
- **gemini-image** - Generate images using Nano Banana (Gemini's native image generation)
- **gemini-video-generate** - Start video generation with Veo 3.1
- **gemini-video-check** - Check video generation status and retrieve completed videos

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

Generate images using Nano Banana, Google's native image generation built into Gemini.

**Models:**
- **Nano Banana** (`gemini-2.5-flash-image`) - Fast, cost-effective (~$0.04/image), good for most use cases
- **Nano Banana Pro** (`gemini-3-pro-image-preview`) - Advanced model with better text rendering, ideal for infographics, diagrams, and text-heavy images

**Auto-Detection:** The server automatically uses Nano Banana Pro when your prompt contains keywords like:
- "nano banana pro", "pro model"
- "infographic", "diagram", "chart", "graph"
- "text", "typography", "font", "lettering"
- "logo", "brand", "poster", "flyer", "banner"
- "slide", "presentation", "document"
- "high quality", "4k", "detailed text"

**Parameters:**
- `prompt` (required) - Description of the image to generate
- `numberOfImages` - How many images (1-4, default: 1)
- `aspectRatio` - Image ratio: "1:1", "3:4", "4:3", "9:16", "16:9"
- `usePro` - Force Nano Banana Pro (auto-detected from prompt if not specified)
- `outputPath` - Directory to save generated images

**Example:**
```
// Auto-detects Pro model
"Create an infographic showing the software development lifecycle"

// Explicitly request Pro
{ "prompt": "A sunset over mountains", "usePro": true }

// Fast generation (default)
"A cute cat wearing a hat"
```

### gemini-video-generate

Start video generation using Veo 3.1, Google's advanced video generation model.

**Important:** Video generation is asynchronous. This tool returns immediately with an operation ID. Use `gemini-video-check` to poll for completion (typically 30-60 seconds).

**Parameters:**
- `prompt` (required) - Description of the video to generate
- `aspectRatio` - Video ratio: "16:9" (default), "9:16"
- `resolution` - Video resolution: "480p", "720p" (default)
- `firstFrameBase64` - Optional base64 image to use as first frame (generate with gemini-image first)

**Returns:** Operation ID for checking status

**Example Workflow:**
```
1. gemini-video-generate: "A cat playing with a ball of yarn"
   → Returns: { operationId: "op-123..." }

2. Wait 30-60 seconds

3. gemini-video-check: { operationId: "op-123..." }
   → Returns: { status: "processing", elapsed: "45s" }
   OR
   → Returns: { status: "complete", videoData: "..." }
```

### gemini-video-check

Check the status of a video generation operation and retrieve completed videos.

**Parameters:**
- `operationId` - Operation ID from gemini-video-generate (optional - uses last operation if omitted)
- `outputPath` - Directory to save the completed video

**Returns:**
- If processing: Status and elapsed time
- If complete: Video data (base64) and optional saved file path

**Tip:** You can create a custom first frame using `gemini-image`, then pass it to `gemini-video-generate` with `firstFrameBase64` for more control over your video.

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
