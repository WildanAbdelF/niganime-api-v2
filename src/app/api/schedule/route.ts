import { type NextRequest } from "next/server";
import { getScraper } from "@/lib/scraper";
import { successResponse, errorResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/schedule?date={YYYY-MM-DD}&tz={timezone_offset}
 *
 * Get estimated anime airing schedule for a specific date.
 *
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @param tz - Timezone offset in minutes (default: +420 = WIB/UTC+7)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];
    const tzOffset = parseInt(searchParams.get("tz") || "-420", 10);

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return errorResponse(
        "Invalid date format. Use YYYY-MM-DD (e.g. 2025-01-15)",
        400
      );
    }

    const scraper = getScraper();
    const data = await scraper.getEstimatedSchedule(date, tzOffset);

    return successResponse(data, 300); // Cache 5 minutes
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch schedule";
    return errorResponse(message);
  }
}
