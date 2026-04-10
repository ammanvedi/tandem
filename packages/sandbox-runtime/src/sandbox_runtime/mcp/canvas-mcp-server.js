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

server.tool(
  "get_canvas_screenshot",
  "Capture a screenshot of the current canvas as a PNG image. Returns a base64-encoded data URL.",
  {},
  async () => {
    if (!CONTROL_PLANE_URL || !SANDBOX_AUTH_TOKEN || !SESSION_ID) {
      return {
        content: [
          {
            type: "text",
            text: "Canvas MCP server is not configured.",
          },
        ],
      };
    }

    try {
      const url = `${CONTROL_PLANE_URL}/sessions/${SESSION_ID}/canvas/screenshot`;
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
              text: `Failed to get canvas screenshot (HTTP ${response.status}): ${text}`,
            },
          ],
          isError: true,
        };
      }

      const result = await response.json();

      if (!result.ok || !result.dataUrl) {
        return {
          content: [
            {
              type: "text",
              text: `Canvas screenshot failed: ${result.error || "No browser client responded."}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "image",
            data: result.dataUrl.replace(/^data:image\/png;base64,/, ""),
            mimeType: "image/png",
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error requesting canvas screenshot: ${err.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "update_canvas",
  "Apply operations to the canvas (add shapes, update properties, remove shapes, add text). Each operation has a type and relevant properties.",
  {
    operations: {
      type: "array",
      description: "Array of canvas operations to apply",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["add_shape", "update_shape", "remove_shape", "add_text"],
          },
          shapeId: { type: "string" },
          shape: { type: "object" },
          properties: { type: "object" },
          position: { type: "array", items: { type: "number" } },
          text: { type: "string" },
        },
        required: ["type"],
      },
    },
  },
  async ({ operations }) => {
    if (!CONTROL_PLANE_URL || !SANDBOX_AUTH_TOKEN || !SESSION_ID) {
      return {
        content: [
          {
            type: "text",
            text: "Canvas MCP server is not configured.",
          },
        ],
      };
    }

    try {
      const url = `${CONTROL_PLANE_URL}/sessions/${SESSION_ID}/canvas/update`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SANDBOX_AUTH_TOKEN}`,
        },
        body: JSON.stringify({ operations }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Failed to update canvas (HTTP ${response.status}): ${text}`,
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
              text: `Canvas update failed: ${result.error || "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: "Canvas updated successfully.",
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating canvas: ${err.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
