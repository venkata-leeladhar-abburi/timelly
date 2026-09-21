import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { supabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";

/**
 * Internal server-to-server callers (e.g. serverPdfLogo.ts during PDF generation)
 * have no browser session cookie to forward. They authenticate instead with this
 * shared secret, which — like NEXTAUTH_SECRET — never leaves the server.
 */
function isInternalCaller(req: Request): boolean {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-internal-secret");
  return header === secret;
}

function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  // Expected formats:
  // - https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // - https://<ref>.supabase.co/storage/v1/object/<bucket>/<path>
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "storage");
    if (idx < 0) return null;
    // ["storage","v1","object",("public")?, bucket, ...path]
    if (parts[idx + 1] !== "v1" || parts[idx + 2] !== "object") return null;
    const maybePublic = parts[idx + 3] === "public";
    const bucket = parts[idx + (maybePublic ? 4 : 3)] ?? "";
    const pathParts = parts.slice(idx + (maybePublic ? 5 : 4));
    const path = pathParts.join("/");
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    if (!isInternalCaller(req)) {
      const session = await getServerSession(authOptions);
      if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ message: "Media proxy not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const rawUrl = (searchParams.get("url") ?? "").trim();
    const rawPath = (searchParams.get("path") ?? "").trim();
    const rawBucket = (searchParams.get("bucket") ?? "").trim();

    let bucket = rawBucket || SUPABASE_BUCKET;
    let path = rawPath;

    if (!path && rawUrl) {
      const parsed = parseSupabaseStorageUrl(rawUrl);
      if (!parsed) {
        return NextResponse.json({ message: "Invalid storage URL" }, { status: 400 });
      }
      bucket = parsed.bucket;
      path = parsed.path;
    }

    if (!path) {
      return NextResponse.json({ message: "path (or url) is required" }, { status: 400 });
    }

    // Security: only allow our configured bucket unless explicitly asked (and still same project key).
    // If you use multiple buckets, you can relax this later.
    if (bucket !== SUPABASE_BUCKET) {
      return NextResponse.json({ message: "Bucket not allowed" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error || !data) {
      return NextResponse.json({ message: error?.message ?? "File not found" }, { status: 404 });
    }

    const arrayBuffer = await data.arrayBuffer();
    const contentType = data.type || "application/octet-stream";

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300", // 5 min; avoid thrashing
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

