import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/proxy/segment?url={targetSegmentUrl}
 *
 * Proxies and streams MPEG-TS / media video segments.
 * Detects if the segment begins with disguised PNG image headers (252 bytes added by MegaPlay CDN)
 * and strips them on-the-fly via Web Streams so standard video players can decode MPEG-TS without error.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = searchParams.get("url");

    if (!url || !url.startsWith("http")) {
      return new NextResponse("Invalid segment URL", { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok || !response.body) {
      return new NextResponse("Failed to fetch media segment", {
        status: response.status || 502,
      });
    }

    let bytesSkipped = 0;
    let shouldStrip = false;
    let checkedFirstChunk = false;

    // Stream-based byte stripper
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!checkedFirstChunk) {
          checkedFirstChunk = true;
          // Disguised files start with PNG signature (0x89, 0x50) and have MPEG-TS sync byte 0x47 at index 252
          if (
            chunk.length > 252 &&
            chunk[0] === 0x89 &&
            chunk[1] === 0x50 &&
            chunk[252] === 0x47
          ) {
            shouldStrip = true;
          }
        }

        if (shouldStrip && bytesSkipped < 252) {
          const needed = 252 - bytesSkipped;
          if (chunk.length <= needed) {
            bytesSkipped += chunk.length;
          } else {
            const remaining = chunk.subarray(needed);
            bytesSkipped = 252;
            controller.enqueue(remaining);
          }
        } else {
          controller.enqueue(chunk);
        }
      },
    });

    const readable = response.body.pipeThrough(transformStream);

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "video/MP2T",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return new NextResponse("Segment streaming error", { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
