import { REQUEST_TIMEOUT_MS, SEARCH_TARGETS } from "../constants.js";
import { getPlatformConfig, getPlatformDefaultKeywords } from "../utils/task.js";

const CITY_WORDS = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "成都",
  "重庆",
  "杭州",
  "南京",
  "武汉",
  "西安",
  "天津",
  "长沙",
  "郑州",
  "苏州",
  "青岛",
  "厦门",
  "福州",
  "济南",
  "沈阳",
  "大连",
  "哈尔滨",
  "昆明",
  "南宁",
  "合肥",
  "宁波",
  "无锡",
  "佛山",
  "东莞",
  "珠海",
  "澳门",
  "香港",
  "台北"
];

export async function searchPerformances(query) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return [];
  }

  const infoTargets = SEARCH_TARGETS.filter((target) => target.layer !== "ticket");
  const ticketTargets = SEARCH_TARGETS.filter((target) => target.layer === "ticket");
  const infoResults = await Promise.allSettled(infoTargets.map((target) => fetchSearchTarget(target, normalizedQuery)));
  const ticketResults = await Promise.allSettled(
    ticketTargets.map((target) => fetchSearchTarget(target, buildTicketSearchQuery(normalizedQuery, target), false))
  );

  const candidates = [...infoResults, ...ticketResults]
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((candidate) => isUsableCandidate(candidate, normalizedQuery));

  return dedupeCandidates(candidates)
    .sort((left, right) => {
      const typeDiff = Number(right.isTicketPlatform) - Number(left.isTicketPlatform);
      const platformDiff = getPlatformSortRank(left.platformId) - getPlatformSortRank(right.platformId);
      return typeDiff || platformDiff || right.score - left.score;
    })
    .slice(0, 18);
}

export async function enrichPerformanceCandidate(candidate) {
  if (!candidate?.url || !isHttpUrl(candidate.url)) {
    return withParsedOptions(candidate);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(candidate.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });
    if (!response.ok) {
      return withParsedOptions(candidate);
    }
    const html = await response.text();
    const detailText = cleanText(html);
    return withParsedOptions({
      ...candidate,
      snippet: [candidate.snippet, detailText.slice(0, 5000)].filter(Boolean).join(" ")
    });
  } catch {
    return withParsedOptions(candidate);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSearchTarget(target, query, appendSuffix = true) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const searchQuery = appendSuffix ? [query, target.querySuffix].filter(Boolean).join(" ") : query;
  const url = target.searchUrl.replace("{query}", encodeURIComponent(searchQuery));
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });
    if (!response.ok) {
      return [];
    }
    const html = await response.text();
    return parseSearchHtml(html, target, query);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseSearchHtml(html, target, query) {
  const normalizedHtml = String(html || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ");
  const blocks = [
    ...normalizedHtml.matchAll(/<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>(.*?)<\/li>/gi),
    ...normalizedHtml.matchAll(/<div[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>(.*?)<\/div>/gi),
    ...normalizedHtml.matchAll(/<a[^>]+href=["'][^"']+["'][^>]*>.*?<\/a>/gi)
  ].map((match) => match[1] || match[0]);
  return blocks
    .map((block) => parseSearchBlock(block, target, query))
    .filter(Boolean)
    .slice(0, 8);
}

function parseSearchBlock(block, target, query) {
  const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i);
  if (!linkMatch) {
    return null;
  }
  const url = normalizeResultUrl(linkMatch[1]);
  if (!url || !isHttpUrl(url)) {
    return null;
  }
  const title = cleanText(linkMatch[2]);
  const snippet = cleanText(block.replace(linkMatch[0], " "));
  const platformId = inferPlatformId(url);
  const platform = getPlatformConfig(platformId);
  const sourceSite = getSourceSite(url);
  const isTicketPlatform = ["maoyan", "damai", "bilibili"].includes(platformId);
  const combined = `${title} ${snippet}`;
  const showName = normalizeShowName(title, snippet, query, sourceSite);
  const city = extractCity(combined, query);
  const sessionName = extractSessionTime(combined);
  const saleTime = extractSaleTime(combined);
  const ticketTier = extractTicketTier(combined);
  const venue = extractVenue(combined);
  const score = scoreCandidate({ title, snippet, platformId, city, venue, sessionName, saleTime }, query);
  return {
    id: `${platformId}-${url}`,
    showName,
    platformId,
    platformName: isTicketPlatform ? platform.name : "参考网页",
    platformType: isTicketPlatform ? "票务平台" : "参考网页",
    sourceSite,
    isTicketPlatform,
    canCreateTask: isTicketPlatform,
    city,
    venue,
    sessionName,
    ticketTier,
    saleTime,
    url,
    appUrl: "",
    keywords: getPlatformDefaultKeywords(platformId).join("、"),
    intervalSeconds: "",
    source: target.name,
    sourceLayer: target.layer || "info",
    snippet,
    score,
    options: extractOptions(combined, query)
  };
}

function normalizeResultUrl(value) {
  const source = decodeHtml(String(value || "").trim());
  if (!source) {
    return "";
  }
  try {
    const parsed = new URL(source);
    const redirectValue = parsed.searchParams.get("u") || parsed.searchParams.get("url") || parsed.searchParams.get("target");
    if (redirectValue && isHttpUrl(redirectValue)) {
      return redirectValue;
    }
    return parsed.href;
  } catch {
    return "";
  }
}

function inferPlatformId(url) {
  const source = String(url || "").toLowerCase();
  if (isAllowedTicketHost(source, ["show.maoyan.com", "maoyan.com", "meituan.com"])) {
    return "maoyan";
  }
  if (isAllowedTicketHost(source, ["damai.cn"])) {
    return "damai";
  }
  if (isAllowedTicketHost(source, ["bilibili.com", "mall.bilibili.com"])) {
    return "bilibili";
  }
  return "custom";
}

function buildTicketSearchQuery(query, target) {
  if (target.platformId === "damai") {
    return `${cleanText(query)} 演唱会 大麦`;
  }
  if (target.platformId === "bilibili") {
    return `${cleanText(query)} 演唱会 B站会员购`;
  }
  if (target.name?.includes("美团")) {
    return `${cleanText(query)} 演唱会 美团票务`;
  }
  return `${cleanText(query)} 演唱会 猫眼`;
}

function isAllowedTicketHost(value, allowedHosts) {
  try {
    const parsed = new URL(String(value || "").trim());
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function scoreCandidate(candidate, query) {
  const source = `${candidate.title} ${candidate.snippet}`.toLowerCase();
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const wordScore = words.reduce((score, word) => score + (source.includes(word) ? 8 : 0), 0);
  const platformScore = candidate.platformId === "custom" ? 0 : 12;
  const fieldScore = [candidate.city, candidate.venue, candidate.sessionName, candidate.saleTime].filter(Boolean).length * 4;
  return wordScore + platformScore + fieldScore;
}

function getPlatformSortRank(platformId) {
  return { maoyan: 0, damai: 1, bilibili: 2 }[platformId] ?? 3;
}

function getSourceSite(url) {
  try {
    return new URL(String(url || "")).hostname.replace(/^www\./, "");
  } catch {
    return "未知来源";
  }
}

function normalizeShowName(title, snippet, query, sourceSite) {
  const cleanedTitle = cleanText(title).replace(/[-_|\s]*(百度百科|百度|hgcha|演出信息|门票|票务平台)\s*$/i, "").trim();
  const lowerTitle = cleanedTitle.toLowerCase();
  const lowerSource = String(sourceSite || "").toLowerCase();
  const domainLike =
    !cleanedTitle ||
    lowerTitle === lowerSource ||
    lowerTitle === lowerSource.replace(/^www\./, "") ||
    /^(https?:\/\/)?(?:www\.)?[\w.-]+\.[a-z]{2,}(?:\/)?$/i.test(cleanedTitle);
  if (!domainLike) {
    return cleanedTitle;
  }
  const snippetTitle = cleanText(snippet)
    .split(/[。.!?？|]/)
    .find((part) => part && !/^(baidu\.com|baike\.baidu\.com|hgcha\.com)$/i.test(part.trim()));
  return cleanText(snippetTitle || query || "未命名演出");
}

function isUsableCandidate(candidate, query) {
  if (!candidate?.url || !candidate?.showName) {
    return false;
  }
  const combined = `${candidate.showName} ${candidate.snippet || ""}`.toLowerCase();
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2);
  const matchedWords = words.filter((word) => combined.includes(word)).length;
  const hasPerformanceSignal = /演出|演唱会|音乐会|巡演|场馆|开票|开售|门票|票价|票档|购票|专场|live|concert/i.test(combined);
  return candidate.isTicketPlatform || matchedWords > 0 || hasPerformanceSignal;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  candidates.forEach((candidate) => {
    const key = candidate.url.replace(/[?#].*$/, "");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  });
  return deduped;
}

function extractCity(source, query) {
  const text = `${query || ""} ${source || ""}`;
  return CITY_WORDS.find((city) => text.includes(city)) || "";
}

function extractCities(source, query) {
  const text = `${query || ""} ${source || ""}`;
  return CITY_WORDS.filter((city) => text.includes(city));
}

function extractVenue(source) {
  const match = String(source || "").match(/([\u4e00-\u9fa5A-Za-z0-9·\-\s]{2,24}(?:体育馆|体育场|演艺中心|剧院|音乐厅|展览馆|会展中心|艺术中心|文化中心|Livehouse|LIVEHOUSE|中心|场馆))/);
  return cleanText(match?.[1] || "");
}

function extractVenues(source) {
  return [
    ...String(source || "").matchAll(
      /([\u4e00-\u9fa5A-Za-z0-9·\-\s]{2,32}(?:体育馆|体育场|演艺中心|剧院|音乐厅|展览馆|会展中心|艺术中心|文化中心|Livehouse|LIVEHOUSE|中心|场馆))/g
    )
  ]
    .map((match) => cleanText(match[1]).replace(/^(时间|地点|场馆|城市|票价|门票|演出|艺人)[:：]?\s*/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function extractSessionTime(source) {
  const text = String(source || "");
  const match =
    text.match(/(20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}日?\s*(?:周[一二三四五六日天])?\s*\d{1,2}:\d{2})/) ||
    text.match(/(\d{1,2}月\d{1,2}日\s*(?:周[一二三四五六日天])?\s*\d{1,2}:\d{2})/);
  return normalizeDateText(match?.[1] || "");
}

function extractSessionTimes(source) {
  return [
    ...String(source || "").matchAll(/(20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}日?\s*(?:周[一二三四五六日天])?\s*\d{1,2}:\d{2})/g),
    ...String(source || "").matchAll(/(\d{1,2}月\d{1,2}日\s*(?:周[一二三四五六日天])?\s*\d{1,2}:\d{2})/g)
  ]
    .map((match) => normalizeDateText(match[1]))
    .filter(Boolean)
    .slice(0, 12);
}

function extractSaleTime(source) {
  const match = String(source || "").match(/(?:开票|开售|售票|预售)[^\d]*(20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}日?\s*\d{1,2}:\d{2})/);
  return normalizeDateText(match?.[1] || "");
}

function extractTicketTier(source) {
  return extractTicketTiers(source).join("、");
}

function extractTicketTiers(source) {
  return [
    ...String(source || "").matchAll(/(?:¥|￥)\s?(\d{2,5})/g),
    ...String(source || "").matchAll(/(\d{2,5})\s?元/g),
    ...String(source || "").matchAll(/(?:票价|门票|看台|内场|价格|价位|票档)[:：\s]*(.{0,80})/g)
  ]
    .flatMap((match) => (match[1] || "").match(/\d{2,5}/g) || [])
    .map((value) => Number.parseInt(value, 10))
    .filter((price) => price >= 50 && price <= 9999)
    .sort((left, right) => left - right)
    .map((price) => `${price}元`)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 12);
}

function extractOptions(source, query) {
  return {
    cities: dedupeValues(extractCities(source, query)),
    venues: dedupeValues(extractVenues(source)),
    sessions: dedupeValues(extractSessionTimes(source)),
    ticketTiers: dedupeValues(extractTicketTiers(source))
  };
}

function withParsedOptions(candidate) {
  const combined = `${candidate?.showName || ""} ${candidate?.snippet || ""}`;
  const options = extractOptions(combined, candidate?.showName || "");
  const platformId = inferPlatformId(candidate?.url || "");
  const platform = getPlatformConfig(platformId);
  const isTicketPlatform = ["maoyan", "damai", "bilibili"].includes(platformId);
  return {
    ...candidate,
    platformId,
    platformName: isTicketPlatform ? platform.name : "参考网页",
    platformType: isTicketPlatform ? "票务平台" : "参考网页",
    sourceSite: candidate?.sourceSite || getSourceSite(candidate?.url || ""),
    isTicketPlatform,
    canCreateTask: isTicketPlatform,
    options,
    city: candidate?.city || options.cities[0] || "",
    venue: candidate?.venue || options.venues[0] || "",
    sessionName: candidate?.sessionName || options.sessions[0] || "",
    ticketTier: candidate?.ticketTier || options.ticketTiers.join("、"),
    saleTime: candidate?.saleTime || extractSaleTime(combined),
    keywords: candidate?.keywords || getPlatformDefaultKeywords(platformId).join("、"),
    intervalSeconds: candidate?.intervalSeconds || ""
  };
}

function dedupeValues(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function normalizeDateText(value) {
  return cleanText(value).replace(/[年月/]/g, "-").replace("日", "").replace(/\s+/g, " ").trim();
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
