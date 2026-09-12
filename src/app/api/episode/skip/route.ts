import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/episode/skip?id={episodeId}
 *
 * Get dynamic opening (intro) and ending (outro) skip timestamps for an episode.
 *
 * @param id - Episode ID (e.g. "naruto-1335?ep=22676" or "22676")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const episodeId = searchParams.get("id");

    if (!episodeId) {
      return errorResponse("Query parameter 'id' (episode ID) is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.getEpisodeSkipTimes(episodeId);

    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch episode skip timestamps";
    return errorResponse(message);
  }
}
