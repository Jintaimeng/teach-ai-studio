#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "math-tools-test-mcp",
  version: "1.0.0",
});

server.registerTool(
  "add_numbers",
  {
    description: "Add two numbers and return the calculation result.",
    inputSchema: {
      a: z.number().describe("First number."),
      b: z.number().describe("Second number."),
    },
  },
  async ({ a, b }) => {
    const sum = a + b;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              server: "math-tools-test-mcp",
              operation: "add_numbers",
              a,
              b,
              sum,
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
  "make_uuid",
  {
    description: "Generate a random UUID with an optional label.",
    inputSchema: {
      label: z.string().optional().describe("Optional label for the generated UUID."),
    },
  },
  async ({ label }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              server: "math-tools-test-mcp",
              operation: "make_uuid",
              label: label || null,
              uuid: randomUUID(),
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
  console.error("math-tools-test-mcp running on stdio");
}

main().catch((error) => {
  console.error("math-tools-test-mcp failed:", error);
  process.exit(1);
});
