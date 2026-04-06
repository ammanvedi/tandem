import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getFlow, isConfigured } from "@/lib/refero";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: "Refero is not configured" }, { status: 503 });
  }

  const { id } = await params;
  const flowId = parseInt(id, 10);

  if (isNaN(flowId)) {
    return NextResponse.json({ error: "flow id must be a number" }, { status: 400 });
  }

  try {
    const data = await getFlow({ flowId });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Refero get_flow failed:", error);
    return NextResponse.json({ error: "Failed to get flow" }, { status: 502 });
  }
}
