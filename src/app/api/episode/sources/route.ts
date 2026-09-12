import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/episode/sources?id={episodeId}&server={server}&category={sub|dub|raw}
 *
 * Get streaming source URLs, intro/outro skip times, and subtitle tracks for an episode.
 *
 * @param id - Episode ID (e.g. "steinsgate-3?ep=230" or "230")
 * @param server - Server name: "hd-1", "hd-2", "megacloud", "streamsb", "streamtape", "vidstreaming" (default: "hd-1")
 * @param category - "sub", "dub", or "raw" (default: "sub")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const episodeId = searchParams.get("id");
    const server = searchParams.get("server") || "hd-1";
    const category = searchParams.get("category") || "sub";

    if (!episodeId) {
      return errorResponse("Query parameter 'id' (episode ID) is required", 400);
    }

    // Validate server
    const validServers = [
      "hd-1",
      "hd-2",
      "megacloud",
      "streamsb",
      "streamtape",
      "vidstreaming",
    ];
    if (!validServers.includes(server)) {
      return errorResponse(
        `Invalid server. Valid options: ${validServers.join(", ")}`,
        400
      );
    }

    // Validate category
    const validCategories = ["sub", "dub", "raw"];
    if (!validCategories.includes(category)) {
      return errorResponse(
        `Invalid category. Valid options: ${validCategories.join(", ")}`,
        400
      );
    }

    const scraper = getScraper();
    const data = await scraper.getEpisodeSources(
      episodeId,
      server as "hd-1" | "hd-2" | "megacloud" | "streamsb" | "streamtape" | "vidstreaming",
      category as "sub" | "dub" | "raw"
    );

    return successResponse(data, 60); // Cache 1 minute (streams expire)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch episode sources";
    return errorResponse(message);
  }
}
