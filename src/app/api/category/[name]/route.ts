import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/** Valid anime categories */
const VALID_CATEGORIES = [
  "most-favorite",
  "most-popular",
  "subbed-anime",
  "dubbed-anime",
  "recently-updated",
  "recently-added",
  "top-upcoming",
  "top-airing",
  "movie",
  "special",
  "ova",
  "ona",
  "tv",
  "completed",
] as const;

type AnimeCategory = (typeof VALID_CATEGORIES)[number];

/**
 * GET /api/category/{categoryName}?page={page}
 *
 * Get anime by category.
 * Valid categories: most-favorite, most-popular, subbed-anime, dubbed-anime,
 * recently-updated, recently-added, top-upcoming, top-airing, movie, special,
 * ova, ona, tv, completed
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/category/[name]">
) {
  try {
    const { name } = await ctx.params;
    const page = parseInt(
      request.nextUrl.searchParams.get("page") || "1",
      10
    );

    if (!name) {
      return errorResponse("Category name is required", 400);
    }

    if (!VALID_CATEGORIES.includes(name as AnimeCategory)) {
      return errorResponse(
        `Invalid category. Valid options: ${VALID_CATEGORIES.join(", ")}`,
        400
      );
    }

    const scraper = getScraper();
    const data = await scraper.getCategoryAnime(name as AnimeCategory, page);

    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch category anime";
    return errorResponse(message);
  }
}
