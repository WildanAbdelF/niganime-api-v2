import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";

const BASE_URL = "https://hianime.at";

/** Utility: decrypt MegaPlay encrypted stream payload */
export function decryptMegaplayCipher(cipherText: string): any {
  try {
    const keyStr = "i?LMTAx0Q6,:}50U";
    const ivStr = "W0;27ToaUpl_P%'c";

    const key = Buffer.alloc(32);
    Buffer.from(keyStr, "utf8").copy(key, 0, 0, Math.min(32, keyStr.length));

    const iv = Buffer.alloc(16);
    Buffer.from(ivStr, "utf8").copy(iv, 0, 0, Math.min(16, ivStr.length));

    let base64 = cipherText.replace(/-/g, "+").replace(/_/g, "/");
    const mod = base64.length % 4;
    if (mod) {
      base64 += "====".slice(mod);
    }
    const encryptedBuf = Buffer.from(base64, "base64");

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: `${BASE_URL}/`,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Utility: extract clean anime slug ID from href */
function cleanId(href: string): string {
  if (!href) return "";
  let clean = href.replace(/^https?:\/\/[^\/]+/, "");
  clean = clean.replace(/^\/watch\//, "").replace(/^\//, "");
  clean = clean.split("?")[0];
  return clean;
}

/** Utility: extract numeric ID from slug or ID (e.g. naruto-1335 -> 1335) */
function extractNumericId(idOrSlug: string): string {
  if (!idOrSlug) return "";
  const match = idOrSlug.match(/-(\d+)$/);
  if (match) return match[1];
  const digits = idOrSlug.match(/^\d+$/);
  if (digits) return digits[0];
  return idOrSlug;
}

export interface AnimeCard {
  id: string;
  name: string;
  jname?: string;
  poster: string;
  duration?: string;
  type?: string;
  rating?: string;
  episodes: {
    sub: number;
    dub: number;
    eps?: number;
  };
}

export interface SkipInterval {
  start: number;
  end: number;
}

export interface SubtitleTrack {
  file: string;
  label: string;
  kind: string;
  default?: boolean;
  rawFile?: string;
}

export class HiAnimeScraper {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: DEFAULT_HEADERS,
      timeout: 15000,
    });
  }

  /** Helper to parse standard .flw-item anime card */
  private parseAnimeCard($: cheerio.CheerioAPI, el: any): AnimeCard {
    const $el = $(el);
    const nameEl = $el.find(".film-name a, .dynamic-name");
    const name = nameEl.text().trim();
    const jname = nameEl.attr("data-jname") || undefined;
    const href =
      $el.find(".film-poster a, .film-name a").attr("href") ||
      $el.find(".film-poster-ahref").attr("href") ||
      "";
    const id = cleanId(href);
    const posterImg = $el.find(".film-poster-img");
    const poster =
      posterImg.attr("data-src") || posterImg.attr("src") || "";

    const sub = parseInt($el.find(".tick-sub").text().trim(), 10) || 0;
    const dub = parseInt($el.find(".tick-dub").text().trim(), 10) || 0;
    const eps = parseInt($el.find(".tick-eps").text().trim(), 10) || 0;

    const type =
      $el.find(".fd-infor .fdi-item").first().text().trim() || "TV";
    const duration = $el.find(".fdi-duration").text().trim() || undefined;
    const rating =
      $el.find(".tick-pg, .tick-rate").text().trim() || undefined;

    return {
      id,
      name,
      jname,
      poster,
      duration,
      type,
      rating,
      episodes: { sub, dub, eps },
    };
  }

  /** Helper to parse pagination from .pagination / .pre-pagination */
  private parsePagination($: cheerio.CheerioAPI): {
    currentPage: number;
    hasNextPage: boolean;
    totalPages: number;
  } {
    const activePage =
      parseInt($(".pagination .page-item.active .page-link").text().trim(), 10) ||
      1;
    const lastPageHref = $(".pagination .page-item a[title='Last']").attr(
      "href"
    );
    let totalPages = activePage;
    if (lastPageHref) {
      const match = lastPageHref.match(/page=(\d+)/);
      if (match) totalPages = parseInt(match[1], 10);
    } else {
      const pageLinks = $(".pagination .page-item .page-link");
      pageLinks.each((_, el) => {
        const num = parseInt($(el).text().trim(), 10);
        if (num && num > totalPages) totalPages = num;
      });
    }

    const hasNextPage =
      $(".pagination .page-item a[title='Next']").length > 0 ||
      activePage < totalPages;

    return {
      currentPage: activePage,
      hasNextPage,
      totalPages,
    };
  }

  /**
   * GET /api/home
   * Scrapes homepage data: spotlight, trending, latest, upcoming, top 10, top airing, genres
   */
  async getHomePage() {
    const { data: html } = await this.client.get("/home");
    const $ = cheerio.load(html);

    // 1. Spotlight
    const spotlightAnimes: any[] = [];
    $(".deslide-item").each((i, el) => {
      const $el = $(el);
      const nameEl = $el.find(".desi-head-title");
      const name = nameEl.text().trim();
      const jname = nameEl.attr("data-jname") || undefined;
      const rankText = $el.find(".desi-sub-text").text().trim();
      const rankMatch = rankText.match(/\d+/);
      const rank = rankMatch ? parseInt(rankMatch[0], 10) : i + 1;
      const poster =
        $el.find(".deslide-cover-img img").attr("data-src") ||
        $el.find(".deslide-cover-img img").attr("src") ||
        "";
      const description = $el.find(".desi-description").text().trim();
      const href =
        $el.find(".desi-buttons a.btn-secondary").attr("href") ||
        $el.find(".desi-buttons a.btn-primary").attr("href") ||
        "";
      const id = cleanId(href);

      const sub = parseInt($el.find(".tick-sub").text().trim(), 10) || 0;
      const dub = parseInt($el.find(".tick-dub").text().trim(), 10) || 0;

      let type = "TV";
      let duration = "";
      $el.find(".sc-detail .scd-item").each((_, item) => {
        const t = $(item).text().trim();
        if ($(item).find(".fa-play-circle").length > 0) type = t;
        if ($(item).find(".fa-clock").length > 0) duration = t;
      });

      if (name) {
        spotlightAnimes.push({
          id,
          name,
          jname,
          description,
          poster,
          rank,
          episodes: { sub, dub },
          type,
          duration,
        });
      }
    });

    // 2. Trending
    const trendingAnimes: any[] = [];
    $("#trending-home .swiper-slide").each((i, el) => {
      const $el = $(el);
      const name = $el.find(".film-title, .dynamic-name").text().trim();
      const href =
        $el.find("a.film-poster, a.item-qtip").attr("href") || "";
      const id = cleanId(href);
      const poster =
        $el.find("img").attr("data-src") || $el.find("img").attr("src") || "";
      const rank = i + 1;
      if (name) {
        trendingAnimes.push({ id, name, poster, rank });
      }
    });

    // 3. Latest Episodes
    const latestEpisodeAnimes: AnimeCard[] = [];
    $("#main-content .block_area:has(.block_area-header:contains('Latest Episode')) .flw-item").each(
      (_, el) => {
        latestEpisodeAnimes.push(this.parseAnimeCard($, el));
      }
    );

    // 4. Top Upcoming
    const topUpcomingAnimes: AnimeCard[] = [];
    $("#main-content .block_area:has(.block_area-header:contains('Top Upcoming')) .flw-item").each(
      (_, el) => {
        topUpcomingAnimes.push(this.parseAnimeCard($, el));
      }
    );

    // 5. Top 10 (today, week, month)
    const parseTop10List = (selector: string) => {
      const list: any[] = [];
      $(selector).find("li").each((i, el) => {
        const $el = $(el);
        const name = $el.find(".film-name a, .dynamic-name").text().trim();
        const href =
          $el.find(".film-name a").attr("href") ||
          $el.find(".film-poster a").attr("href") ||
          "";
        const id = cleanId(href);
        const poster =
          $el.find("img").attr("data-src") ||
          $el.find("img").attr("src") ||
          "";
        const rank =
          parseInt($el.find(".film-number span").text().trim(), 10) || i + 1;
        const sub = parseInt($el.find(".tick-sub").text().trim(), 10) || 0;
        const dub = parseInt($el.find(".tick-dub").text().trim(), 10) || 0;
        const eps = parseInt($el.find(".tick-eps").text().trim(), 10) || 0;
        if (name) {
          list.push({
            id,
            name,
            poster,
            rank,
            episodes: { sub, dub, eps },
          });
        }
      });
      return list;
    };

    const top10Animes = {
      today: parseTop10List("#top-viewed-day ul"),
      week: parseTop10List("#top-viewed-week ul"),
      month: parseTop10List("#top-viewed-month ul"),
    };

    // 6. Top Airing
    const topAiringAnimes: any[] = [];
    $("#anime-featured .anif-block-ul li").each((_, el) => {
      const $el = $(el);
      const name = $el.find(".film-name a, .dynamic-name").text().trim();
      const href =
        $el.find(".film-name a").attr("href") ||
        $el.find(".film-poster a").attr("href") ||
        "";
      const id = cleanId(href);
      const poster =
        $el.find("img").attr("data-src") || $el.find("img").attr("src") || "";
      const sub = parseInt($el.find(".tick-sub").text().trim(), 10) || 0;
      const dub = parseInt($el.find(".tick-dub").text().trim(), 10) || 0;
      const eps = parseInt($el.find(".tick-eps").text().trim(), 10) || 0;
      if (name) {
        topAiringAnimes.push({
          id,
          name,
          poster,
          episodes: { sub, dub, eps },
        });
      }
    });

    // 7. Genres list
    const genres: string[] = [];
    $("a[href*='/genres/']").each((_, el) => {
      const genre = $(el).text().trim();
      if (genre && !genres.includes(genre)) {
        genres.push(genre);
      }
    });

    return {
      spotlightAnimes,
      trendingAnimes,
      latestEpisodeAnimes,
      topUpcomingAnimes,
      top10Animes,
      topAiringAnimes,
      genres,
    };
  }

  /**
   * GET /api/search?keyword=...&page=...
   */
  async search(
    keyword: string,
    page = 1,
    filters?: Record<string, string>
  ) {
    const params: Record<string, string | number> = {
      keyword,
      page,
      ...filters,
    };
    const { data: html } = await this.client.get("/search", { params });
    const $ = cheerio.load(html);

    const animes: AnimeCard[] = [];
    $(".flw-item").each((_, el) => {
      animes.push(this.parseAnimeCard($, el));
    });

    const pagination = this.parsePagination($);

    return {
      animes,
      mostPopularAnimes: [],
      currentPage: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
    };
  }

  /**
   * GET /api/search/suggestions?keyword=...
   */
  async searchSuggestions(keyword: string) {
    const { data: html } = await this.client.get("/search", {
      params: { keyword },
    });
    const $ = cheerio.load(html);

    const suggestions: any[] = [];
    $(".flw-item")
      .slice(0, 10)
      .each((_, el) => {
        const card = this.parseAnimeCard($, el);
        suggestions.push({
          id: card.id,
          name: card.name,
          jname: card.jname,
          poster: card.poster,
          duration: card.duration,
          type: card.type,
        });
      });

    return { suggestions };
  }

  /**
   * GET /api/anime/{id}
   */
  async getInfo(id: string) {
    const clean = cleanId(id);
    const { data: html } = await this.client.get(`/${clean}`);
    const $ = cheerio.load(html);

    const name = $(".anisc-detail .film-name").text().trim();
    const jname = $(".anisc-detail .film-name").attr("data-jname") || "";
    const poster =
      $(".film-poster-img").attr("data-src") ||
      $(".film-poster-img").attr("src") ||
      "";
    const description = $(".film-description .text").text().trim();

    const info: Record<string, any> = {};
    $(".anisc-info .item").each((_, el) => {
      const label = $(el)
        .find(".item-head")
        .text()
        .replace(":", "")
        .trim();
      const val = $(el).find(".name, .text").text().trim();
      if (label && val) {
        info[label] = val;
      }
    });

    // Related / Recommended
    const recommendedAnimes: AnimeCard[] = [];
    $(".block_area_category .flw-item, #main-content .block_area:has(.block_area-header:contains('Recommended')) .flw-item").each(
      (_, el) => {
        recommendedAnimes.push(this.parseAnimeCard($, el));
      }
    );

    const mostPopularAnimes: any[] = [];
    $("#top-viewed-day ul li, .block_area-realtime ul li").each((i, el) => {
      const $el = $(el);
      const title = $el.find(".film-name a, .dynamic-name").text().trim();
      const href = $el.find("a").attr("href") || "";
      const itemPoster =
        $el.find("img").attr("data-src") || $el.find("img").attr("src") || "";
      if (title) {
        mostPopularAnimes.push({
          id: cleanId(href),
          name: title,
          poster: itemPoster,
          rank: i + 1,
        });
      }
    });

    const sub = parseInt($(".tick-sub").first().text().trim(), 10) || 0;
    const dub = parseInt($(".tick-dub").first().text().trim(), 10) || 0;
    const eps = parseInt($(".tick-eps").first().text().trim(), 10) || 0;

    const ageRating =
      $(".film-stats .tick-pg, .tick-pg").first().text().trim() || undefined;
    const quality =
      $(".film-stats .tick-quality, .tick-quality, .quality")
        .first()
        .text()
        .trim() || "HD";
    const malScore = info["MAL Score"] || undefined;

    return {
      anime: {
        info: {
          id: clean,
          name,
          poster,
          description,
          stats: {
            rating: ageRating,
            quality,
            episodes: { sub, dub, eps },
            type: info["Type"] || $(".film-stats .item").first().text().trim() || "TV",
            duration: info["Duration"] || undefined,
            score: malScore,
            malScore,
          },
          promotionalVideos: [],
          charactersAndVoiceActors: [],
        },
        moreInfo: {
          japanese: jname || info["Japanese"],
          synonyms: info["Synonyms"],
          aired: info["Aired"],
          premiered: info["Premiered"],
          duration: info["Duration"],
          status: info["Status"],
          malScore: info["MAL Score"],
          score: info["MAL Score"],
          rating: ageRating,
          genres: info["Genres"]
            ? info["Genres"].split(",").map((g: string) => g.trim())
            : [],
          studios: info["Studios"],
          producers: info["Producers"]
            ? info["Producers"].split("\n").map((p: string) => p.trim()).filter(Boolean)
            : [],
        },
      },
      seasons: [],
      mostPopularAnimes,
      relatedAnimes: [],
      recommendedAnimes,
    };
  }

  /**
   * GET /api/anime/{id}/episodes
   */
  async getEpisodes(id: string) {
    const numericId = extractNumericId(id);
    const { data } = await this.client.get(
      `/api/theme/episode/list/${numericId}`,
      {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${BASE_URL}/watch/${id}`,
        },
      }
    );

    const episodes: any[] = [];
    if (data?.html) {
      const $ = cheerio.load(data.html);
      $(".ep-item").each((i, el) => {
        const epId = $(el).attr("data-id") || String(i + 1);
        const number =
          parseInt($(el).attr("data-number") || "", 10) || i + 1;
        const title =
          $(el).attr("title") ||
          $(el).find(".ep-name").text().trim() ||
          `Episode ${number}`;
        const isFiller = $(el).hasClass("ssl-item-filler");

        episodes.push({
          id: `${id}?ep=${epId}`,
          episodeId: `${id}?ep=${epId}`,
          epId,
          number,
          title,
          isFiller,
        });
      });
    }

    return {
      totalEpisodes: episodes.length,
      episodes,
    };
  }

  /**
   * GET /api/episode/servers?id=...
   */
  async getEpisodeServers(episodeId: string) {
    // episodeId might be "erased-1030?ep=17306", "17306", or just "erased-1030"
    let id = episodeId;
    const epIdMatch = episodeId.match(/ep=(\d+)/);
    if (epIdMatch) {
      id = epIdMatch[1];
    } else if (!episodeId.match(/^\d+$/)) {
      // If someone passed only anime slug without ep (e.g. "erased-1030"), resolve first episode
      try {
        const epsData = await this.getEpisodes(episodeId);
        if (epsData.episodes && epsData.episodes.length > 0) {
          const firstEp = epsData.episodes[0];
          const firstMatch = firstEp.id.match(/ep=(\d+)/);
          id = firstMatch ? firstMatch[1] : (firstEp.epId || firstEp.episodeId);
        }
      } catch {}
    }

    const { data } = await this.client.get(
      `/api/theme/episode/servers?episodeId=${id}`,
      {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${BASE_URL}/watch/${episodeId}`,
        },
      }
    );

    const sub: any[] = [];
    const dub: any[] = [];

    if (data?.html) {
      const $ = cheerio.load(data.html);
      $(".server-item").each((i, el) => {
        const serverName = $(el).text().trim();
        const type = $(el).attr("data-type") || "sub";
        const hash = $(el).attr("data-hash") || "";
        let url = "";
        try {
          url = Buffer.from(hash, "base64").toString("utf8");
        } catch {
          url = "";
        }

        const serverObj = {
          serverId: i + 1,
          serverName,
          hash,
          url,
        };

        if (type.toLowerCase() === "dub") {
          dub.push(serverObj);
        } else {
          sub.push(serverObj);
        }
      });
    }

    const isAdServer = (name: string, url: string) => {
      const lowerName = name.toLowerCase();
      const lowerUrl = (url || "").toLowerCase();
      return lowerName.includes("zoko") || lowerUrl.includes("zokoanime");
    };

    const sortServers = (list: any[]) => {
      return [...list]
        .sort((a, b) => {
          const aIsAd = isAdServer(a.serverName, a.url);
          const bIsAd = isAdServer(b.serverName, b.url);
          if (aIsAd && !bIsAd) return 1;
          if (!aIsAd && bIsAd) return -1;
          const aIsHd = a.serverName.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith("hd");
          const bIsHd = b.serverName.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith("hd");
          if (aIsHd && !bIsHd) return -1;
          if (!aIsHd && bIsHd) return 1;
          return 0;
        })
        .map((item, idx) => ({
          ...item,
          serverId: idx + 1,
        }));
    };

    return {
      episodeId,
      episodeNo: 1,
      sub: sortServers(sub),
      dub: sortServers(dub),
    };
  }

  /**
   * Helper to extract MAL ID and episode number from servers list (e.g. ZokoAnime server URL)
   */
  extractMalInfo(serversData: { sub: any[]; dub: any[] }): { malId: string; episodeNo: string } | null {
    const allServers = [...(serversData?.sub || []), ...(serversData?.dub || [])];
    for (const s of allServers) {
      const match = s.url?.match(/\/mal\/(\d+)\/(\d+)/);
      if (match) {
        return { malId: match[1], episodeNo: match[2] };
      }
    }
    return null;
  }

  /**
   * Helper to fetch opening & ending skip timestamps from AniSkip using MAL ID & episode number
   */
  async getAniSkipTimes(
    malId: string | number,
    episodeNo: string | number
  ): Promise<{ intro: SkipInterval; outro: SkipInterval } | null> {
    try {
      const res = await axios.get(
        `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNo}?types=op&types=ed&episodeLength=0`,
        { timeout: 5000 }
      );
      if (res.data?.found && Array.isArray(res.data?.results)) {
        let intro: SkipInterval = { start: 0, end: 0 };
        let outro: SkipInterval = { start: 0, end: 0 };
        for (const item of res.data.results) {
          if (item.skipType === "op" && item.interval) {
            intro = {
              start: Math.round(item.interval.startTime) || 0,
              end: Math.round(item.interval.endTime) || 0,
            };
          } else if (item.skipType === "ed" && item.interval) {
            outro = {
              start: Math.round(item.interval.startTime) || 0,
              end: Math.round(item.interval.endTime) || 0,
            };
          }
        }
        return { intro, outro };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to extract intro & outro skip intervals + subtitle tracks from Megaplay.
   * Resolves the real internal file data-id from the player HTML to guarantee the exact correct anime episode.
   */
  async getMegaplaySources(streamIdOrUrl: string) {
    try {
      const embedUrl = streamIdOrUrl.startsWith("http")
        ? streamIdOrUrl
        : `https://megaplay.buzz/stream/s-2/${streamIdOrUrl}/sub`;

      // 1. Fetch player page to extract the real internal file data-id
      // (The URL route ID is data-realid, which differs from the internal data-id used by getSources)
      let fileId = "";
      try {
        const pageRes = await axios.get(embedUrl, {
          headers: {
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            Referer: `${BASE_URL}/`,
          },
          timeout: 8000,
        });
        const match =
          pageRes.data.match(/id="megaplay-player"[^>]*data-id="([^"]+)"/i) ||
          pageRes.data.match(/data-id="([^"]+)"/i);
        if (match) {
          fileId = match[1];
        }
      } catch {
        // Fallback: extract ID from route if page fetch fails
        const match = embedUrl.match(/\/stream\/s-\d+\/([^\/?#]+)/i);
        if (match) fileId = match[1];
      }

      if (!fileId) return null;

      const sParamMatch = embedUrl.match(/[?&]s=([a-z0-9_-]+)/i);
      const sQuery = sParamMatch ? `&s=${encodeURIComponent(sParamMatch[1])}` : "";

      const { data } = await axios.get(
        `https://megaplay.buzz/stream/getSources?id=${fileId}${sQuery}`,
        {
          headers: {
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            Referer: embedUrl,
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 10000,
        }
      );

      const parseInterval = (val: any): SkipInterval => {
        if (!val) return { start: 0, end: 0 };
        if (Array.isArray(val)) {
          return {
            start: Number(val[0]) || 0,
            end: Number(val[1]) || 0,
          };
        }
        if (typeof val === "object") {
          return {
            start: Number(val.start) || 0,
            end: Number(val.end) || 0,
          };
        }
        return { start: 0, end: 0 };
      };

      const tracks: SubtitleTrack[] = Array.isArray(data?.tracks)
        ? data.tracks.map((t: any) => ({
            file: t.file || "",
            label: t.label || "",
            kind: t.kind || "captions",
            default: Boolean(t.default),
          }))
        : [];

      // Extract and decrypt M3U8 streaming sources
      let m3u8Url: string | null = null;
      if (data?.enc) {
        const decrypted = decryptMegaplayCipher(data.enc);
        if (decrypted) {
          if (typeof decrypted === "string" && decrypted.includes(".m3u8")) {
            m3u8Url = decrypted;
          } else if (typeof decrypted.file === "string") {
            m3u8Url = decrypted.file;
          } else if (Array.isArray(decrypted) && decrypted[0]?.file) {
            m3u8Url = decrypted[0].file;
          } else if (Array.isArray(decrypted.sources) && decrypted.sources[0]?.file) {
            m3u8Url = decrypted.sources[0].file;
          }
        }
      } else if (data?.sources) {
        if (typeof data.sources === "string") {
          m3u8Url = data.sources;
        } else if (Array.isArray(data.sources) && data.sources[0]?.file) {
          m3u8Url = data.sources[0].file;
        }
      }

      return {
        intro: parseInterval(data?.intro),
        outro: parseInterval(data?.outro),
        tracks,
        m3u8Url,
      };
    } catch {
      return null;
    }
  }

  /**
   * GET /api/episode/sources?id=...&server=...&category=...
   */
  async getEpisodeSources(
    episodeId: string,
    server: string = "hd-1",
    category: "sub" | "dub" | "raw" = "sub"
  ) {
    const serversData = await this.getEpisodeServers(episodeId);
    const targetList = category === "dub" ? serversData.dub : serversData.sub;

    const normalize = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetServer = normalize(server);

    let selected = targetList.find((s) => {
      const serverNorm = normalize(s.serverName);
      return (
        serverNorm === targetServer ||
        serverNorm.includes(targetServer) ||
        targetServer.includes(serverNorm)
      );
    });

    if (
      !selected ||
      selected.serverName.toLowerCase().includes("zoko") ||
      selected.url?.includes("zokoanime")
    ) {
      selected =
        targetList.find((s) => normalize(s.serverName).includes("hd1")) ||
        targetList.find((s) => normalize(s.serverName).includes("hd2")) ||
        targetList.find((s) => s.url?.includes("megaplay.buzz")) ||
        targetList.find((s) => !s.serverName.toLowerCase().includes("zoko")) ||
        targetList[0];
    }

    const embedUrl = selected?.url || "";

    // Locate Megaplay stream URL for dynamic skip timestamps, subtitle tracks, and m3u8 decryption
    let megaplayUrl = embedUrl.includes("megaplay.buzz") ? embedUrl : "";
    if (!megaplayUrl) {
      const megaServer =
        targetList.find((s) => s.url?.includes("megaplay.buzz")) ||
        serversData.sub.find((s) => s.url?.includes("megaplay.buzz")) ||
        serversData.dub.find((s) => s.url?.includes("megaplay.buzz"));
      if (megaServer) megaplayUrl = megaServer.url;
    }

    let intro: SkipInterval = { start: 0, end: 0 };
    let outro: SkipInterval = { start: 0, end: 0 };
    let tracks: SubtitleTrack[] = [];
    let rawM3u8Url: string | null = null;

    if (megaplayUrl) {
      const megaData = await this.getMegaplaySources(megaplayUrl);
      if (megaData) {
        intro = megaData.intro;
        outro = megaData.outro;
        tracks = megaData.tracks;
        rawM3u8Url = megaData.m3u8Url;
      }
    }

    // If Megaplay has missing skip times, fallback to AniSkip
    if (intro.end === 0 || outro.end === 0) {
      const malInfo = this.extractMalInfo(serversData);
      if (malInfo) {
        const aniSkip = await this.getAniSkipTimes(malInfo.malId, malInfo.episodeNo);
        if (aniSkip) {
          if (intro.end === 0 && aniSkip.intro.end > 0) {
            intro = aniSkip.intro;
          }
          if (outro.end === 0 && aniSkip.outro.end > 0) {
            outro = aniSkip.outro;
          }
        }
      }
    }

    const sources: Array<{
      url: string;
      type: string;
      isM3U8: boolean;
      quality?: string;
    }> = [];

    if (rawM3u8Url) {
      // Proxied clean m3u8 stream URL that plays directly in HTML5 / Hls.js / Plyr without ads or iframe
      sources.push({
        url: `/api/proxy/m3u8?url=${encodeURIComponent(rawM3u8Url)}`,
        type: "hls",
        isM3U8: true,
        quality: "auto",
      });
    }

    const directSource = rawM3u8Url
      ? {
          url: rawM3u8Url,
          type: "hls",
          isM3U8: true,
          headers: {
            Referer: "https://megaplay.buzz/",
          },
        }
      : null;

    return {
      headers: {
        Referer: "https://megaplay.buzz/",
      },
      sources:
        sources.length > 0
          ? sources
          : [
              {
                url: embedUrl,
                type: "iframe",
                isM3U8: false,
              },
            ],
      directSource,
      embedUrl,
      intro,
      outro,
      tracks: tracks.map((t) => ({
        ...t,
        file: t.file
          ? `/api/proxy/subtitle?url=${encodeURIComponent(t.file)}`
          : t.file,
        rawFile: t.file,
      })),
      server: selected?.serverName || server,
      type: category,
    };
  }

  /**
   * GET /api/episode/skip?id=...
   * Dynamically retrieves skip opening and skip ending intervals for an episode.
   */
  async getEpisodeSkipTimes(episodeId: string) {
    const serversData = await this.getEpisodeServers(episodeId);
    const allServers = [...serversData.sub, ...serversData.dub];
    const megaServer = allServers.find((s) => s.url?.includes("megaplay.buzz"));

    let intro: SkipInterval = { start: 0, end: 0 };
    let outro: SkipInterval = { start: 0, end: 0 };

    if (megaServer?.url) {
      const megaData = await this.getMegaplaySources(megaServer.url);
      if (megaData) {
        intro = megaData.intro;
        outro = megaData.outro;
      }
    }

    // Fallback to AniSkip if Megaplay has missing skip times
    if (intro.end === 0 || outro.end === 0) {
      const malInfo = this.extractMalInfo(serversData);
      if (malInfo) {
        const aniSkip = await this.getAniSkipTimes(malInfo.malId, malInfo.episodeNo);
        if (aniSkip) {
          if (intro.end === 0 && aniSkip.intro.end > 0) {
            intro = aniSkip.intro;
          }
          if (outro.end === 0 && aniSkip.outro.end > 0) {
            outro = aniSkip.outro;
          }
        }
      }
    }

    return {
      episodeId,
      intro,
      outro,
    };
  }

  /**
   * GET /api/genre/{name}?page=...
   */
  async getGenreAnime(name: string, page = 1) {
    // supports genres/action
    const { data: html } = await this.client.get(`/genres/${name}`, {
      params: { page },
    });
    const $ = cheerio.load(html);

    const animes: AnimeCard[] = [];
    $(".flw-item").each((_, el) => {
      animes.push(this.parseAnimeCard($, el));
    });

    const pagination = this.parsePagination($);

    return {
      genreName: name,
      animes,
      genres: [],
      topAiringAnimes: [],
      currentPage: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
    };
  }

  /**
   * GET /api/category/{name}?page=...
   */
  async getCategoryAnime(name: string, page = 1) {
    const { data: html } = await this.client.get(`/${name}`, {
      params: { page },
    });
    const $ = cheerio.load(html);

    const animes: AnimeCard[] = [];
    $(".flw-item").each((_, el) => {
      animes.push(this.parseAnimeCard($, el));
    });

    const pagination = this.parsePagination($);

    return {
      category: name,
      animes,
      genres: [],
      top10Animes: { today: [], week: [], month: [] },
      topAiringAnimes: [],
      currentPage: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
    };
  }

  /**
   * GET /api/producer/{name}?page=...
   */
  async getProducerAnimes(name: string, page = 1) {
    const { data: html } = await this.client.get(`/producer/${name}`, {
      params: { page },
    });
    const $ = cheerio.load(html);

    const animes: AnimeCard[] = [];
    $(".flw-item").each((_, el) => {
      animes.push(this.parseAnimeCard($, el));
    });

    const pagination = this.parsePagination($);

    return {
      producerName: name,
      animes,
      top10Animes: { today: [], week: [], month: [] },
      topAiringAnimes: [],
      currentPage: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
    };
  }

  /**
   * GET /api/schedule?date=...
   */
  async getEstimatedSchedule(date: string, _tzOffset = -420) {
    // Airing schedule
    return {
      scheduledAnimes: [],
    };
  }

  /**
   * GET /api/az-list?sort=...&page=...
   */
  async getAZList(sort = "all", page = 1) {
    const path = sort === "all" ? "/az-list" : `/az-list/${sort}`;
    const { data: html } = await this.client.get(path, {
      params: { page },
    });
    const $ = cheerio.load(html);

    const animes: AnimeCard[] = [];
    $(".flw-item").each((_, el) => {
      animes.push(this.parseAnimeCard($, el));
    });

    const pagination = this.parsePagination($);

    return {
      animes,
      currentPage: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
    };
  }
}

/** Singleton instance */
let scraperInstance: HiAnimeScraper | null = null;

export function getScraper(): HiAnimeScraper {
  if (!scraperInstance) {
    scraperInstance = new HiAnimeScraper();
  }
  return scraperInstance;
}
