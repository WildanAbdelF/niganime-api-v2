import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/anime/{animeId}
 *
 * Get detailed information about a specific anime.
 * Returns: info, moreInfo, seasons, related, recommended, most popular.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/anime/[id]">
) {
  try {
    const { id } = await ctx.params;

    if (!id) {
      return errorResponse("Anime ID is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.getInfo(id);

    return successResponse(data, 600); // Cache 10 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch anime info";
    return errorResponse(message);
  }
}
