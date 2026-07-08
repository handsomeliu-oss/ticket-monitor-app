import {
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_KEYWORDS,
  DEFAULT_PLATFORM_ID,
  MAX_INTERVAL_SECONDS,
  MIN_INTERVAL_SECONDS,
  PLATFORM_OPTIONS
} from "../constants.js";

export function clampInterval(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_INTERVAL_SECONDS;
  }
  return Math.max(MIN_INTERVAL_SECONDS, Math.min(MAX_INTERVAL_SECONDS, parsed));
}

export function getPlatformConfig(platformId) {
  return PLATFORM_OPTIONS.find((platform) => platform.id === platformId) || PLATFORM_OPTIONS[0];
}

export function getPlatformDefaultKeywords(platformId) {
  return getPlatformConfig(platformId).defaultKeywords || DEFAULT_KEYWORDS;
}

export function normalizeKeywords(value, platformId = DEFAULT_PLATFORM_ID) {
  const source = Array.isArray(value) ? value.join("、") : String(value || "");
  const keywords = source
    .split(/[,，、\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set([...keywords, ...getPlatformDefaultKeywords(platformId)])].slice(0, 20);
}

export function getNextCheckAt(task, checkedAt = new Date()) {
  const checkedDate = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  const base = Number.isNaN(checkedDate.getTime()) ? Date.now() : checkedDate.getTime();
  return new Date(base + clampInterval(task.intervalSeconds) * 1000).toISOString();
}

export function isTaskDue(task) {
  if (task.status !== "running") {
    return false;
  }
  if (!task.nextCheckAt) {
    return true;
  }
  const next = new Date(task.nextCheckAt).getTime();
  return Number.isNaN(next) || Date.now() >= next;
}

export function normalizeTaskInput(values) {
  const platform = getPlatformConfig(values.platformId || DEFAULT_PLATFORM_ID);
  const now = new Date().toISOString();
  const id = values.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const task = {
    id,
    platformId: platform.id,
    platformName: platform.name,
    showName: String(values.showName || "").trim(),
    city: String(values.city || "").trim(),
    venue: String(values.venue || "").trim(),
    url: String(values.url || "").trim(),
    appUrl: String(values.appUrl || "").trim(),
    sessionName: String(values.sessionName || "").trim(),
    ticketTier: String(values.ticketTier || "").trim(),
    saleTime: String(values.saleTime || "").trim(),
    keywords: normalizeKeywords(values.keywords, platform.id),
    intervalSeconds: clampInterval(values.intervalSeconds),
    status: values.status === "paused" ? "paused" : "running",
    createdAt: values.createdAt || now,
    updatedAt: now,
    lastCheckedAt: values.lastCheckedAt || "",
    nextCheckAt: values.status === "paused" ? "" : values.nextCheckAt || now,
    lastResult: values.lastResult || "监测中，等待云端检查",
    lastMessage: values.lastMessage || "监测中，等待云端检查",
    lastError: values.lastError || "",
    matchedKeywords: Array.isArray(values.matchedKeywords) ? values.matchedKeywords : [],
    lastSnapshotHash: values.lastSnapshotHash || "",
    lastPositiveHash: values.lastPositiveHash || "",
    notification: values.notification || null
  };
  validateTask(task);
  return task;
}

function validateTask(task) {
  const required = [
    ["showName", "演出名称"],
    ["url", "网页链接"],
    ["sessionName", "场次"],
    ["ticketTier", "票档"],
    ["saleTime", "开票时间"]
  ];
  for (const [key, label] of required) {
    if (!task[key]) {
      const error = new Error(`请填写${label}`);
      error.status = 400;
      throw error;
    }
  }
  try {
    const parsed = new URL(task.url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    const error = new Error("请输入有效的 http/https 网页链接");
    error.status = 400;
    throw error;
  }
}
