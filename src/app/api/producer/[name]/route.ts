import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/producer/{producerName}?page={page}
 *
 * Get anime by producer/studio.
 * Producer names in kebab-case: "toei-animation", "mappa", "ufotable", etc.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/producer/[name]">
) {
  try {
    const { name } = await ctx.params;
    const page = parseInt(
      request.nextUrl.searchParams.get("page") || "1",
      10
    );

    if (!name) {
      return errorResponse("Producer name is required", 400);
    }

    const scraper = getScraper();
    const data = await scraper.getProducerAnimes(name, page);

    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch producer anime";
    return errorResponse(message);
  }
}
