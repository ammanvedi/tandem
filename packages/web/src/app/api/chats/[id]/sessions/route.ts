import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const response = await controlPlaneFetch(`/chats/${id}/sessions`);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch chat sessions:", error);
    return NextResponse.json({ error: "Failed to fetch chat sessions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const jwt = await getToken({ req: request });
    const accessToken = jwt?.accessToken as string | undefined;
    const user = session.user;

    const sessionBody = {
      ...body,
      scmToken: accessToken,
      scmRefreshToken: jwt?.refreshToken as string | undefined,
      scmTokenExpiresAt: jwt?.accessTokenExpiresAt as number | undefined,
      scmUserId: user.id,
      userId: user.id || user.email || "anonymous",
      scmLogin: user.login,
      scmName: user.name,
      scmEmail: user.email,
    };

    const response = await controlPlaneFetch(`/chats/${id}/sessions`, {
      method: "POST",
      body: JSON.stringify(sessionBody),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to add session to chat:", error);
    return NextResponse.json({ error: "Failed to add session to chat" }, { status: 500 });
  }
}
