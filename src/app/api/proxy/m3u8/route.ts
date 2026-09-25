import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/proxy/m3u8?url={targetM3u8Url}&clean={true|false}
 *
 * Proxies HLS .m3u8 playlists by attaching the required Referer headers
 * that prevent 403 Forbidden errors when requested directly from client browsers.
 *
 * Features:
 * - Automatically resolves and rewrites relative .m3u8 URLs to this proxy.
 * - When `clean=true` (default), rewrites video segment URLs to `/api/proxy/segment`
 *   to automatically remove disguised PNG headers on-the-fly for universal player compatibility.
 * - When `clean=false`, leaves segment URLs pointing directly to CDN (for players using custom HLS loaders).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const targetUrl = searchParams.get("url");
    const clean = searchParams.get("clean") !== "false";

    if (!targetUrl || !targetUrl.startsWith("http")) {
      return new NextResponse("Query parameter 'url' is required and must be a valid HTTP(S) URL", {
        status: 400,
      });
    }

    const origin = request.nextUrl.origin;

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: "https://megaplay.buzz/",
        Origin: "https://megaplay.buzz",
      },
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch upstream m3u8 (${response.status})`, {
        status: response.status,
      });
    }

    const playlistText = await response.text();
    const lines = playlistText.split(/\r?\n/);
    const rewrittenLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        rewrittenLines.push(line);
        continue;
      }

      if (trimmed.startsWith("#")) {
        // Rewrite URI attributes in tags such as #EXT-X-STREAM-INF, #EXT-X-I-FRAME-STREAM-INF, or #EXT-X-KEY
        if (trimmed.includes('URI="')) {
          const rewritten = trimmed.replace(
            /URI="([^"]+)"/g,
            (_match, uriVal) => {
              try {
                const resolvedUri = new URL(uriVal, targetUrl).href;
                if (resolvedUri.includes(".m3u8")) {
                  return `URI="${origin}/api/proxy/m3u8?url=${encodeURIComponent(
                    resolvedUri
                  )}&clean=${clean}"`;
                }
                if (clean) {
                  return `URI="${origin}/api/proxy/segment?url=${encodeURIComponent(
                    resolvedUri
                  )}"`;
                }
                return `URI="${resolvedUri}"`;
              } catch {
                return _match;
              }
            }
          );
          rewrittenLines.push(rewritten);
        } else {
          rewrittenLines.push(line);
        }
      } else {
        // Line is a URL / relative link (sub-playlist or video segment)
        try {
          const resolved = new URL(trimmed, targetUrl).href;
          if (resolved.includes(".m3u8")) {
            rewrittenLines.push(
              `${origin}/api/proxy/m3u8?url=${encodeURIComponent(
                resolved
              )}&clean=${clean}`
            );
          } else {
            // Media segment URL
            if (clean) {
              rewrittenLines.push(
                `${origin}/api/proxy/segment?url=${encodeURIComponent(resolved)}`
              );
            } else {
              rewrittenLines.push(resolved);
            }
          }
        } catch {
          rewrittenLines.push(line);
        }
      }
    }

    return new NextResponse(rewrittenLines.join("\n"), {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return new NextResponse("m3u8 proxy processing error", { status: 500 });
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
