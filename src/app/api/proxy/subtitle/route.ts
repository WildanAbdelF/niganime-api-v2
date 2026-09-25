import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/proxy/subtitle?url={targetSubtitleUrl}
 *
 * Proxies WebVTT (.vtt) and other subtitle tracks by attaching the required Referer headers
 * that prevent 403 Forbidden errors when requested directly from client browsers.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const targetUrl = searchParams.get("url");

    if (!targetUrl || !targetUrl.startsWith("http")) {
      return new NextResponse(
        JSON.stringify({ error: "Query parameter 'url' is required and must be a valid HTTP(S) URL" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: "https://megaplay.buzz/",
        Origin: "https://megaplay.buzz",
      },
    });

    if (!response.ok) {
      return new NextResponse(
        JSON.stringify({ error: `Failed to fetch upstream subtitle (${response.status})` }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const subtitleContent = await response.text();

    return new NextResponse(subtitleContent, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return new NextResponse(
      JSON.stringify({ error: "Subtitle proxy processing error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
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
