import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/search/suggestions?keyword={query}
 *
 * Get search autocomplete suggestions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword");

    if (!keyword) {
      return errorResponse("Query parameter 'keyword' is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.searchSuggestions(keyword);

    return successResponse(data, 60); // Cache 1 minute
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch search suggestions";
    return errorResponse(message);
  }
}
