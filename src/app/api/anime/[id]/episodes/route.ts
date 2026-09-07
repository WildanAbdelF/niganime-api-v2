import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/anime/{animeId}/episodes
 *
 * Get all episodes for a specific anime.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/anime/[id]/episodes">
) {
  try {
    const { id } = await ctx.params;

    if (!id) {
      return errorResponse("Anime ID is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.getEpisodes(id);

    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch episodes";
    return errorResponse(message);
  }
}
