import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const REFERO_MCP_URL = "https://api.refero.design/mcp";

function getToken(): string {
  const token = process.env.REFERO_API_TOKEN;
  if (!token) throw new Error("REFERO_API_TOKEN is not configured");
  return token;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const token = getToken();
  const authHeaders = { Authorization: `Bearer ${token}` };
  const transport = new StreamableHTTPClientTransport(new URL(REFERO_MCP_URL), {
    requestInit: { headers: authHeaders },
  });
  const client = new Client({ name: "tandem-web", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });

    if (result.isError) {
      const text = result.content
        ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      throw new Error(text || "Refero tool call failed");
    }

    const textContent = result.content
      ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    if (!textContent) return null;

    try {
      return JSON.parse(textContent);
    } catch {
      return textContent;
    }
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors in serverless context
    }
  }
}

export type Platform = "ios" | "web";

export interface SearchScreensParams {
  query: string;
  platform: Platform;
  page?: number;
}

export async function searchScreens(params: SearchScreensParams) {
  const args: Record<string, unknown> = {
    query: params.query,
    platform: params.platform,
  };
  if (params.page !== undefined) args.page = params.page;
  return callTool("refero_search_screens", args);
}

export interface GetScreenParams {
  screenId?: string;
  screenIds?: string[];
  imageSize?: "none" | "thumbnail" | "full";
  includeSimilar?: boolean;
  similarLimit?: number;
}

export async function getScreen(params: GetScreenParams) {
  const args: Record<string, unknown> = {};
  if (params.screenId) args.screen_id = params.screenId;
  if (params.screenIds) args.screen_ids = params.screenIds;
  if (params.imageSize) args.image_size = params.imageSize;
  if (params.includeSimilar !== undefined) args.include_similar = params.includeSimilar;
  if (params.similarLimit !== undefined) args.similar_limit = params.similarLimit;
  return callTool("refero_get_screen", args);
}

export interface SearchFlowsParams {
  query: string;
  platform: Platform;
  page?: number;
}

export async function searchFlows(params: SearchFlowsParams) {
  const args: Record<string, unknown> = {
    query: params.query,
    platform: params.platform,
  };
  if (params.page !== undefined) args.page = params.page;
  return callTool("refero_search_flows", args);
}

export interface GetFlowParams {
  flowId?: number;
  flowIds?: number[];
}

export async function getFlow(params: GetFlowParams) {
  const args: Record<string, unknown> = {};
  if (params.flowId !== undefined) args.flow_id = params.flowId;
  if (params.flowIds) args.flow_ids = params.flowIds;
  return callTool("refero_get_flow", args);
}

export function isConfigured(): boolean {
  return !!process.env.REFERO_API_TOKEN;
}
