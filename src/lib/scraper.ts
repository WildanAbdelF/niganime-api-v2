import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://hianime.at";

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
          episodeId: epId,
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
    // episodeId might be "one-piece-1?ep=1" or just "1"
    const epIdMatch = episodeId.match(/ep=(\d+)/);
    const id = epIdMatch ? epIdMatch[1] : episodeId;

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

    return {
      episodeId,
      episodeNo: 1,
      sub,
      dub,
    };
  }

  /**
   * Helper to extract intro & outro skip intervals + subtitle tracks from Megaplay.
   */
  async getMegaplaySources(streamIdOrUrl: string) {
    try {
      let streamId = streamIdOrUrl;
      const match = streamIdOrUrl.match(/\/stream\/s-\d+\/([^\/?#]+)/i);
      if (match) {
        streamId = match[1];
      }
      if (!streamId) return null;

      const { data } = await axios.get(
        `https://megaplay.buzz/stream/getSources?id=${streamId}`,
        {
          headers: {
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            Referer: `https://megaplay.buzz/stream/s-2/${streamId}/sub`,
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

      return {
        intro: parseInterval(data?.intro),
        outro: parseInterval(data?.outro),
        tracks,
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

    let selected = targetList[0];
    if (server) {
      const found = targetList.find((s) =>
        s.serverName.toLowerCase().includes(server.toLowerCase().replace("-", ""))
      );
      if (found) selected = found;
    }

    const embedUrl = selected?.url || "";

    // Locate Megaplay stream URL for dynamic skip timestamps and subtitle tracks
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

    if (megaplayUrl) {
      const megaData = await this.getMegaplaySources(megaplayUrl);
      if (megaData) {
        intro = megaData.intro;
        outro = megaData.outro;
        tracks = megaData.tracks;
      }
    }

    return {
      headers: {
        Referer: "https://megaplay.buzz/",
      },
      sources: [
        {
          url: embedUrl,
          type: "iframe",
          isM3U8: false,
        },
      ],
      embedUrl,
      intro,
      outro,
      tracks,
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
