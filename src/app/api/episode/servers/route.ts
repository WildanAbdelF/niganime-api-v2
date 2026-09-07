import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/episode/servers?id={episodeId}
 *
 * Get available streaming servers for a specific episode.
 * Episode ID format: "steinsgate-0-92?ep=2055"
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const episodeId = searchParams.get("id");

    if (!episodeId) {
      return errorResponse("Query parameter 'id' (episode ID) is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.getEpisodeServers(episodeId);

    return successResponse(data, 120); // Cache 2 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch episode servers";
    return errorResponse(message);
  }
}
