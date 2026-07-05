export const MIN_INTERVAL_SECONDS = 180;
export const DEFAULT_INTERVAL_SECONDS = 240;
export const MAX_INTERVAL_SECONDS = 1800;
export const REQUEST_TIMEOUT_MS = 15000;

export const PLATFORM_OPTIONS = [
  {
    id: "maoyan",
    name: "猫眼/美团",
    urlPlaceholder: "https://show.maoyan.com/...",
    defaultKeywords: ["立即购买", "立即预订", "有票", "可购买", "选座购买"]
  },
  {
    id: "damai",
    name: "大麦",
    urlPlaceholder: "https://m.damai.cn/...",
    defaultKeywords: ["立即购买", "立即预订", "选座购买", "提交订单", "有票"]
  },
  {
    id: "bilibili",
    name: "B站会员购",
    urlPlaceholder: "https://mall.bilibili.com/...",
    defaultKeywords: ["立即购买", "去购买", "有票", "可购买", "售票中"]
  },
  {
    id: "custom",
    name: "其他自定义平台",
    urlPlaceholder: "https://...",
    defaultKeywords: ["立即购买", "立即预订", "有票", "可购买"]
  }
];

export const DEFAULT_PLATFORM_ID = "maoyan";

export const BUYABLE_WORDS = ["立即购买", "立即预订", "有票", "可购买", "选座购买", "去购买", "售票中", "提交订单"];

export const DEFAULT_KEYWORDS = ["立即购买", "立即预订", "有票", "可购买"];

export const UNAVAILABLE_WORDS = ["售罄", "无票", "暂未开售", "即将开售", "缺货登记", "暂时缺货"];

export const STORAGE_KEY = "multi_platform_ticket_alert_tasks_v2";
export const SERVER_URL_STORAGE_KEY = "multi_platform_ticket_alert_server_url_v1";

export const SEARCH_TARGETS = [
  {
    name: "演出信息公开搜索",
    platformId: "custom",
    layer: "info",
    querySuffix: "演出 演唱会 门票 开票 场馆 场次",
    searchUrl: "https://www.bing.com/search?q={query}"
  },
  {
    name: "猫眼票务链接搜索",
    platformId: "maoyan",
    layer: "ticket",
    querySuffix: "猫眼",
    searchUrl: "https://www.bing.com/search?q={query}"
  },
  {
    name: "大麦票务链接搜索",
    platformId: "damai",
    layer: "ticket",
    querySuffix: "大麦",
    searchUrl: "https://www.bing.com/search?q={query}"
  },
  {
    name: "B站会员购票务链接搜索",
    platformId: "bilibili",
    layer: "ticket",
    querySuffix: "B站会员购",
    searchUrl: "https://www.bing.com/search?q={query}"
  },
  {
    name: "美团票务链接搜索",
    platformId: "maoyan",
    layer: "ticket",
    querySuffix: "美团票务",
    searchUrl: "https://www.bing.com/search?q={query}"
  }
];
