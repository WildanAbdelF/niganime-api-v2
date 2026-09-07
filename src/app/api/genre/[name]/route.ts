import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/genre/{genreName}?page={page}
 *
 * Get anime by genre.
 * Genre names in kebab-case: "action", "adventure", "shounen", "isekai", etc.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/genre/[name]">
) {
  try {
    const { name } = await ctx.params;
    const page = parseInt(
      request.nextUrl.searchParams.get("page") || "1",
      10
    );

    if (!name) {
      return errorResponse("Genre name is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.getGenreAnime(name, page);

    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch genre anime";
    return errorResponse(message);
  }
}
