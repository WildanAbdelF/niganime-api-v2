import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?keyword={query}&page={page}&type={type}&status={status}&rated={rated}&score={score}&season={season}&language={language}&start_date={date}&end_date={date}&sort={sort}&genres={genres}
 *
 * Search for anime with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword");
    const page = parseInt(searchParams.get("page") || "1", 10);

    if (!keyword) {
      return errorResponse("Query parameter 'keyword' is required", 400);
    }

    // Collect optional search filters
    const filterKeys = [
      "type",
      "status",
      "rated",
      "score",
      "season",
      "language",
      "start_date",
      "end_date",
      "sort",
      "genres",
    ];

    const filters: Record<string, string> = {};
    for (const key of filterKeys) {
      const value = searchParams.get(key);
      if (value) {
        filters[key] = value;
      }
    }

    const scraper = getScraper();
    const data = await scraper.search(
      keyword,
      page,
      Object.keys(filters).length > 0 ? filters : undefined
    );

    return successResponse(data, 180); // Cache 3 minutes
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to search anime";
    return errorResponse(message);
  }
}
