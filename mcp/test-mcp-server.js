#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "local-agent-test-mcp",
  version: "1.0.0",
});

server.registerTool(
  "ping",
  {
    description: "Return a simple success response to verify the custom MCP server is connected.",
    inputSchema: {},
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              server: "local-agent-test-mcp",
              message: "pong",
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "echo",
  {
    description: "Echo text back from the MCP server to verify tool arguments are passed correctly.",
    inputSchema: {
      text: z.string().describe("Text to echo back from the test MCP server."),
    },
  },
  async ({ text }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              server: "local-agent-test-mcp",
              echo: text,
              textLength: text.length,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("local-agent-test-mcp running on stdio");
}

main().catch((error) => {
  console.error("local-agent-test-mcp failed:", error);
  process.exit(1);
});
