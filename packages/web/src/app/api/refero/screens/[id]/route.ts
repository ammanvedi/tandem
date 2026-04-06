import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScreen, isConfigured } from "@/lib/refero";

const VALID_IMAGE_SIZES = new Set(["none", "thumbnail", "full"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: "Refero is not configured" }, { status: 503 });
  }

  const { id: screenId } = await params;
  const { searchParams } = request.nextUrl;
  const imageSize = searchParams.get("image_size") ?? "none";
  const includeSimilar = searchParams.get("include_similar");
  const similarLimit = searchParams.get("similar_limit");

  if (!VALID_IMAGE_SIZES.has(imageSize)) {
    return NextResponse.json(
      { error: "image_size must be none, thumbnail, or full" },
      { status: 400 }
    );
  }

  try {
    const data = await getScreen({
      screenId,
      imageSize: imageSize as "none" | "thumbnail" | "full",
      includeSimilar: includeSimilar === "true",
      similarLimit: similarLimit ? parseInt(similarLimit, 10) : undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Refero get_screen failed:", error);
    return NextResponse.json({ error: "Failed to get screen" }, { status: 502 });
  }
}
