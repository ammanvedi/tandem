import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Title generation not configured" }, { status: 501 });
  }

  const { id } = await params;
  const userId = session.user.id || session.user.email || "anonymous";

  let body: { prompt?: string };
  try {
    body = (await request.json()) as { prompt?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20250414",
      max_tokens: 30,
      system:
        "Generate a short 3-6 word title for a coding session based on the user's prompt. Return only the title text, no quotes or punctuation.",
      messages: [{ role: "user", content: prompt }],
    });

    const titleBlock = message.content[0];
    const generatedTitle = titleBlock.type === "text" ? titleBlock.text.trim().slice(0, 200) : null;

    if (!generatedTitle) {
      return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
    }

    const response = await controlPlaneFetch(`/sessions/${id}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title: generatedTitle }),
    });

    if (!response.ok) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({ title: generatedTitle });
  } catch (error) {
    console.error("Generate session title error:", error);
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}
