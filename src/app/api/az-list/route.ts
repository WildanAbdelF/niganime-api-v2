import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/az-list?sort={letter}&page={page}
 *
 * Get anime sorted alphabetically.
 *
 * @param sort - Letter filter: "all", "other", "0-9", "a"-"z" (default: "all")
 * @param page - Page number (default: 1)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const sort = searchParams.get("sort") || "all";
    const page = parseInt(searchParams.get("page") || "1", 10);

    const scraper = getScraper();
    const data = await scraper.getAZList(
      sort as Parameters<typeof scraper.getAZList>[0],
      page
    );

    return successResponse(data, 600); // Cache 10 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch AZ list";
    return errorResponse(message);
  }
}
