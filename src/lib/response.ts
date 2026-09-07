import { NextResponse } from "next/server";

/** Standard API success response */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    status: number;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** CORS headers applied to all responses */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Create a successful JSON response.
 *
 * @param data - The response data payload
 * @param cacheSeconds - Optional HTTP cache duration in seconds (default: 300 = 5 min)
 */
export function successResponse<T>(data: T, cacheSeconds = 300) {
  return NextResponse.json<ApiSuccessResponse<T>>(
    { success: true, data },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
      },
    }
  );
}

/**
 * Create an error JSON response.
 *
 * @param message - Human-readable error message
 * @param status - HTTP status code (default: 500)
 */
export function errorResponse(message: string, status = 500) {
  return NextResponse.json<ApiErrorResponse>(
    {
      success: false,
      error: { message, status },
    },
    {
      status,
      headers: CORS_HEADERS,
    }
  );
}

/** Handle CORS preflight OPTIONS requests */
export function corsPreflightResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
