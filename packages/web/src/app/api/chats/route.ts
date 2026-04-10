import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const queryParts: string[] = [];
  for (const key of ["status", "excludeStatus", "limit", "offset"]) {
    const val = params.get(key);
    if (val) queryParts.push(`${key}=${encodeURIComponent(val)}`);
  }
  const path = `/chats${queryParts.length ? `?${queryParts.join("&")}` : ""}`;

  try {
    const response = await controlPlaneFetch(path);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch chats:", error);
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const jwt = await getToken({ req: request });
    const accessToken = jwt?.accessToken as string | undefined;
    const user = session.user;
    const userId = user.id || user.email || "anonymous";

    const chatBody = {
      repoOwner: body.repoOwner,
      repoName: body.repoName,
      model: body.model,
      reasoningEffort: body.reasoningEffort,
      branch: body.branch,
      title: body.title,
      prompt: body.prompt,
      category: body.category,
      scmToken: accessToken,
      scmRefreshToken: jwt?.refreshToken as string | undefined,
      scmTokenExpiresAt: jwt?.accessTokenExpiresAt as number | undefined,
      scmUserId: user.id,
      userId,
      scmLogin: user.login,
      scmName: user.name,
      scmEmail: user.email,
    };

    const response = await controlPlaneFetch("/chats", {
      method: "POST",
      body: JSON.stringify(chatBody),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to create chat:", error);
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
