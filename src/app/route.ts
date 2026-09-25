import { successResponse } from "@/lib/response";

export async function GET() {
  return successResponse({
    name: "NigAnime API",
    version: "1.0.0",
    description: "Anime scraping API powered by HiAnime",
    endpoints: {
      home: "/api/home",
      search: "/api/search?keyword={query}&page={page}",
      anime_detail: "/api/anime/{animeId}",
      anime_episodes: "/api/anime/{animeId}/episodes",
      episode_servers: "/api/episode/servers?id={episodeId}",
      episode_sources:
        "/api/episode/sources?id={episodeId}&server={server}&category={sub|dub|raw}",
      episode_skip: "/api/episode/skip?id={episodeId}",
      proxy_m3u8: "/api/proxy/m3u8?url={m3u8Url}&clean={true|false}",
      proxy_segment: "/api/proxy/segment?url={segmentUrl}",
      genre: "/api/genre/{genreName}?page={page}",
      category: "/api/category/{categoryName}?page={page}",
      producer: "/api/producer/{producerName}?page={page}",
      schedule: "/api/schedule?date={YYYY-MM-DD}",
      az_list: "/api/az-list?sort={letter}&page={page}",
      search_suggestions: "/api/search/suggestions?keyword={query}",
    },
  });
}
