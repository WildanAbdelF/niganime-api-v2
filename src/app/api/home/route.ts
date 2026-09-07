import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/home
 *
 * Fetches the HiAnime homepage data including:
 * - Spotlight anime
 * - Trending anime
 * - Top 10 (today, week, month)
 * - Latest episodes
 * - Top airing, upcoming, most popular, etc.
 */
export async function GET() {
  try {
    const scraper = getScraper();
    const data = await scraper.getHomePage();
    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch home page";
    return errorResponse(message);
  }
}
