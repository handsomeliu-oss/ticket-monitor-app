import { REQUEST_TIMEOUT_MS } from "../constants";
import { digestText } from "../utils/hash";

export async function checkTaskPage(task) {
  const platformName = task.platformName || "对应平台";
  const urlError = validatePageUrl(task.url, platformName);
  if (urlError) {
    return errorResult(urlError);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(task.url, {
      method: "GET",
      redirect: "follow",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });

    if (!response.ok) {
      if ([401, 403, 418, 429, 451, 503].includes(response.status)) {
        return errorResult(`页面可能无法直接读取，请手动打开${platformName}官方 App 检查`);
      }
      return errorResult(`页面请求失败：HTTP ${response.status}`);
    }

    const html = await response.text();
    if (!html || html.trim().length < 80) {
      return errorResult(`页面无法访问或返回内容为空，请手动打开${platformName}官方 App 检查`);
    }

    if (looksLikeBlockedPage(html)) {
      return errorResult(`页面可能无法直接读取，请手动打开${platformName}官方 App 检查`);
    }

    const keywords = normalizeSearchWords(task.keywords);
    const matchedKeywords = keywords.filter((word) => html.includes(word));
    const snapshotHash = digestText(html.slice(0, 30000));
    const positiveHash = digestText(matchedKeywords.join("|"));

    if (matchedKeywords.length > 0) {
      return {
        ok: true,
        shouldNotify: true,
        status: "positive",
        matchedKeywords,
        message: `发现疑似有票/可购买状态：命中 ${matchedKeywords.join("、")}`,
        snapshotHash,
        positiveHash
      };
    }

    return {
      ok: true,
      shouldNotify: false,
      status: "none",
      matchedKeywords: [],
      message: "暂未发现关键词",
      snapshotHash,
      positiveHash
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return errorResult("网络失败：页面请求超时，请检查网络后稍后重试");
    }
    return errorResult(`网络失败：${error?.message || "未知错误"}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function validatePageUrl(url, platformName) {
  if (!String(url || "").trim()) {
    return `链接为空，请先填写${platformName}网页链接`;
  }

  try {
    const parsed = new URL(String(url || "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return `请输入有效的 http/https ${platformName}网页链接。`;
    }
    return "";
  } catch {
    return `请输入有效的${platformName}网页链接。`;
  }
}

function normalizeSearchWords(keywords) {
  return [...new Set((keywords || []).map((word) => String(word || "").trim()).filter(Boolean))];
}

function looksLikeBlockedPage(html) {
  const lowerHtml = String(html || "").toLowerCase();
  const suspiciousWords = [
    "captcha",
    "verify",
    "forbidden",
    "access denied",
    "anti",
    "risk",
    "异常访问",
    "访问受限",
    "安全验证",
    "验证码",
    "滑块",
    "风控"
  ];
  return suspiciousWords.some((word) => lowerHtml.includes(word));
}

function errorResult(message) {
  return {
    ok: false,
    shouldNotify: false,
    status: "error",
    matchedKeywords: [],
    message,
    snapshotHash: "",
    positiveHash: ""
  };
}
