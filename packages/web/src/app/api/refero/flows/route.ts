import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchFlows, isConfigured, type Platform } from "@/lib/refero";

const VALID_PLATFORMS = new Set(["ios", "web"]);

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: "Refero is not configured" }, { status: 503 });
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("query");
  const platform = searchParams.get("platform");
  const page = searchParams.get("page");

  if (!query || !platform) {
    return NextResponse.json({ error: "query and platform are required" }, { status: 400 });
  }

  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "platform must be ios or web" }, { status: 400 });
  }

  try {
    const data = await searchFlows({
      query,
      platform: platform as Platform,
      page: page ? parseInt(page, 10) : undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Refero search_flows failed:", error);
    return NextResponse.json({ error: "Failed to search flows" }, { status: 502 });
  }
}
