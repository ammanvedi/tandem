#!/usr/bin/env node

/**
 * Canvas MCP Server — exposes a get_canvas_snapshot tool to the agent.
 *
 * Communicates with the control plane to request a canvas snapshot from
 * the connected browser client. Uses stdio transport for OpenCode local MCP.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL;
const SANDBOX_AUTH_TOKEN = process.env.SANDBOX_AUTH_TOKEN;
const SESSION_ID = process.env.SESSION_ID;

const server = new McpServer({
  name: "canvas",
  version: "1.0.0",
});

server.tool(
  "get_canvas_snapshot",
  "Get a snapshot of the current canvas state including all shapes, objects, and their properties. Returns the full DGM editor document as JSON.",
  {},
  async () => {
    if (!CONTROL_PLANE_URL || !SANDBOX_AUTH_TOKEN || !SESSION_ID) {
      return {
        content: [
          {
            type: "text",
            text: "Canvas MCP server is not configured (missing CONTROL_PLANE_URL, SANDBOX_AUTH_TOKEN, or SESSION_ID).",
          },
        ],
      };
    }

    try {
      const url = `${CONTROL_PLANE_URL}/sessions/${SESSION_ID}/canvas/snapshot`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SANDBOX_AUTH_TOKEN}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Failed to get canvas snapshot (HTTP ${response.status}): ${text}`,
            },
          ],
          isError: true,
        };
      }

      const result = await response.json();

      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Canvas snapshot request failed: ${result.error || "Unknown error"}. This usually means no browser client has the canvas tab open.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error requesting canvas snapshot: ${err.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
