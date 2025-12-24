#!/usr/bin/env node
/**
 * Gemini MCP Server
 *
 * A drop-in replacement for Codex MCP that uses Google Gemini 3 Pro Preview.
 * Mirrors the exact interface: gemini (like codex) and gemini-reply (like codex-reply)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI, Content } from "@google/genai";

// Configuration - Gemini 3 Pro Preview (latest)
const MODEL = process.env.GEMINI_MODEL || "gemini-3-pro-preview";
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error("Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable required");
  process.exit(1);
}

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Session storage for multi-turn conversations
interface ConversationSession {
  history: Content[];
  createdAt: number;
  lastUsed: number;
  cwd?: string;
}

const sessions = new Map<string, ConversationSession>();

// Clean up old sessions (older than 1 hour)
function cleanupSessions() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (session.lastUsed < oneHourAgo) {
      sessions.delete(id);
    }
  }
}

// Generate unique conversation ID
function generateConversationId(): string {
  return `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Build system instruction based on config
function buildSystemInstruction(config: {
  cwd?: string;
  sandbox?: string;
  baseInstructions?: string;
  developerInstructions?: string;
}): string {
  const parts: string[] = [];

  // Base instructions
  if (config.baseInstructions) {
    parts.push(config.baseInstructions);
  } else {
    parts.push(`You are an expert software engineer assistant powered by Gemini 3 Pro Preview.
You help with code review, analysis, planning, and problem-solving.
Provide clear, concise, and actionable responses.
When reviewing code or plans, be thorough but practical.`);
  }

  // Working directory context
  if (config.cwd) {
    parts.push(`\nWorking directory: ${config.cwd}`);
  }

  // Sandbox mode context
  if (config.sandbox) {
    const sandboxDescriptions: Record<string, string> = {
      "read-only": "You are in read-only mode. You can analyze and review but cannot make changes.",
      "workspace-write": "You can read and write within the workspace directory.",
      "danger-full-access": "You have full access to read and write files.",
    };
    if (sandboxDescriptions[config.sandbox]) {
      parts.push(`\nAccess level: ${sandboxDescriptions[config.sandbox]}`);
    }
  }

  // Developer instructions
  if (config.developerInstructions) {
    parts.push(`\nDeveloper Instructions:\n${config.developerInstructions}`);
  }

  return parts.join("\n");
}

// Image generation models - Imagen 4.0 is latest
const IMAGE_MODEL = "imagen-4.0-generate-001";

// Generate images using Imagen
async function generateImage(
  prompt: string,
  options: {
    numberOfImages?: number;
    aspectRatio?: string;
    outputDir?: string;
  } = {}
): Promise<{ images: Array<{ base64: string; mimeType: string }>; prompt: string }> {
  const numberOfImages = options.numberOfImages || 1;
  const aspectRatio = options.aspectRatio || "1:1";

  const response = await ai.models.generateImages({
    model: IMAGE_MODEL,
    prompt: prompt,
    config: {
      numberOfImages: numberOfImages,
      aspectRatio: aspectRatio,
    },
  });

  const images: Array<{ base64: string; mimeType: string }> = [];

  if (response.generatedImages) {
    for (const generatedImage of response.generatedImages) {
      if (generatedImage.image?.imageBytes) {
        images.push({
          base64: generatedImage.image.imageBytes,
          mimeType: "image/png",
        });
      }
    }
  }

  return { images, prompt };
}

// Call Gemini API
async function callGemini(
  prompt: string,
  history: Content[] = [],
  systemInstruction?: string
): Promise<{ text: string; history: Content[] }> {

  // Create the chat with history and config
  const chat = ai.chats.create({
    model: MODEL,
    config: systemInstruction ? { systemInstruction } : undefined,
    history: history,
  });

  // Send the message
  const response = await chat.sendMessage({ message: prompt });

  // Build updated history
  const newHistory: Content[] = [
    ...history,
    { role: "user", parts: [{ text: prompt }] },
    { role: "model", parts: [{ text: response.text || "" }] },
  ];

  return {
    text: response.text || "",
    history: newHistory,
  };
}

// Define tools - mirrors Codex MCP interface
const tools: Tool[] = [
  {
    name: "gemini",
    description: `Run a Gemini session. Similar to Codex but uses Google Gemini 3 Pro Preview.

Supports configuration parameters matching the Codex Config struct:
- prompt: The initial user prompt to start the conversation (required)
- cwd: Working directory context
- sandbox: Access policy ("read-only", "workspace-write", "danger-full-access")
- base-instructions: Override default system instructions
- developer-instructions: Additional developer context
- model: Optional override for model (default: ${MODEL})`,
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "The initial user prompt to start the Gemini conversation",
        },
        cwd: {
          type: "string",
          description: "Working directory for context",
        },
        sandbox: {
          type: "string",
          enum: ["read-only", "workspace-write", "danger-full-access"],
          description: "Access policy mode",
        },
        "base-instructions": {
          type: "string",
          description: "Override the default system instructions",
        },
        "developer-instructions": {
          type: "string",
          description: "Developer instructions for additional context",
        },
        model: {
          type: "string",
          description: `Model override (default: ${MODEL})`,
        },
        config: {
          type: "object",
          description: "Additional config settings (passthrough)",
          additionalProperties: true,
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "gemini-reply",
    description: `Continue a Gemini conversation by providing the conversation ID and prompt.

Use this to continue a multi-turn conversation started with the 'gemini' tool.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        conversationId: {
          type: "string",
          description: "The conversation ID from a previous gemini call",
        },
        prompt: {
          type: "string",
          description: "The next user prompt to continue the conversation",
        },
      },
      required: ["conversationId", "prompt"],
    },
  },
  {
    name: "gemini-image",
    description: `Generate images using Google Imagen 4.0.

Create AI-generated images from text prompts. Returns base64-encoded PNG images.
Supports multiple images per request and various aspect ratios.

Parameters:
- prompt: Text description of the image to generate (required)
- numberOfImages: How many images to generate (1-4, default: 1)
- aspectRatio: Image aspect ratio ("1:1", "3:4", "4:3", "9:16", "16:9", default: "1:1")
- outputPath: Optional path to save images (will save as prompt-1.png, prompt-2.png, etc.)`,
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the image to generate",
        },
        numberOfImages: {
          type: "number",
          description: "Number of images to generate (1-4)",
          minimum: 1,
          maximum: 4,
        },
        aspectRatio: {
          type: "string",
          enum: ["1:1", "3:4", "4:3", "9:16", "16:9"],
          description: "Aspect ratio of generated images",
        },
        outputPath: {
          type: "string",
          description: "Optional directory path to save generated images",
        },
      },
      required: ["prompt"],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: "gemini-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Cleanup old sessions periodically
  cleanupSessions();

  try {
    if (name === "gemini") {
      const {
        prompt,
        cwd,
        sandbox,
        "base-instructions": baseInstructions,
        "developer-instructions": developerInstructions,
        model,
      } = args as {
        prompt: string;
        cwd?: string;
        sandbox?: string;
        "base-instructions"?: string;
        "developer-instructions"?: string;
        model?: string;
      };

      // Build system instruction
      const systemInstruction = buildSystemInstruction({
        cwd,
        sandbox,
        baseInstructions,
        developerInstructions,
      });

      // Call Gemini
      const result = await callGemini(prompt, [], systemInstruction);

      // Create new session
      const conversationId = generateConversationId();
      sessions.set(conversationId, {
        history: result.history,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        cwd,
      });

      return {
        content: [
          {
            type: "text",
            text: result.text,
          },
        ],
        // Include conversation ID in metadata for continuation
        _meta: {
          conversationId,
        },
      };

    } else if (name === "gemini-reply") {
      const { conversationId, prompt } = args as {
        conversationId: string;
        prompt: string;
      };

      // Get existing session
      const session = sessions.get(conversationId);
      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Conversation ${conversationId} not found. It may have expired or never existed.`,
            },
          ],
          isError: true,
        };
      }

      // Build system instruction (use stored context)
      const systemInstruction = buildSystemInstruction({
        cwd: session.cwd,
      });

      // Continue conversation
      const result = await callGemini(prompt, session.history, systemInstruction);

      // Update session
      session.history = result.history;
      session.lastUsed = Date.now();

      return {
        content: [
          {
            type: "text",
            text: result.text,
          },
        ],
        _meta: {
          conversationId,
        },
      };

    } else if (name === "gemini-image") {
      const { prompt, numberOfImages, aspectRatio, outputPath } = args as {
        prompt: string;
        numberOfImages?: number;
        aspectRatio?: string;
        outputPath?: string;
      };

      // Generate images
      const result = await generateImage(prompt, {
        numberOfImages: numberOfImages || 1,
        aspectRatio: aspectRatio || "1:1",
      });

      // If outputPath provided, save images to disk
      let savedPaths: string[] = [];
      if (outputPath && result.images.length > 0) {
        const fs = await import("fs");
        const path = await import("path");

        // Ensure directory exists
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }

        // Generate safe filename from prompt
        const safePrompt = prompt.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_");

        for (let i = 0; i < result.images.length; i++) {
          const filename = `${safePrompt}_${i + 1}.png`;
          const fullPath = path.join(outputPath, filename);
          const buffer = Buffer.from(result.images[i].base64, "base64");
          fs.writeFileSync(fullPath, buffer);
          savedPaths.push(fullPath);
        }
      }

      // Return response with image data
      const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

      // Add summary text
      content.push({
        type: "text",
        text: `Generated ${result.images.length} image(s) for prompt: "${prompt}"${savedPaths.length > 0 ? `\n\nSaved to:\n${savedPaths.join("\n")}` : ""}`,
      });

      // Add images as base64
      for (const img of result.images) {
        content.push({
          type: "image",
          data: img.base64,
          mimeType: img.mimeType,
        });
      }

      return { content };

    } else {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Gemini API error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gemini MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
