import {
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_KEYWORDS,
  DEFAULT_PLATFORM_ID,
  MAX_INTERVAL_SECONDS,
  MIN_INTERVAL_SECONDS,
  PLATFORM_OPTIONS
} from "../constants";

export function clampInterval(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_INTERVAL_SECONDS;
  }
  return Math.max(MIN_INTERVAL_SECONDS, Math.min(MAX_INTERVAL_SECONDS, parsed));
}

export function createTask(values) {
  const now = new Date().toISOString();
  const platform = getPlatformConfig(values.platformId);
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    platformId: platform.id,
    platformName: platform.name,
    showName: values.showName.trim(),
    city: String(values.city || "").trim(),
    venue: String(values.venue || "").trim(),
    url: values.url.trim(),
    appUrl: String(values.appUrl || "").trim(),
    sessionName: values.sessionName.trim(),
    ticketTier: values.ticketTier.trim(),
    saleTime: values.saleTime.trim(),
    keywords: normalizeKeywords(values.keywords, platform.id),
    intervalSeconds: clampInterval(values.intervalSeconds),
    status: "paused",
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: "",
    nextCheckAt: "",
    lastResult: "尚未检查",
    lastMessage: "尚未检查",
    lastError: "",
    lastSnapshotHash: "",
    lastPositiveHash: "",
    countdownNotificationIds: []
  };
}

export function normalizeKeywords(value, platformId = DEFAULT_PLATFORM_ID) {
  const keywords = String(value || "")
    .split(/[,，、\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  const merged = [...new Set([...keywords, ...getPlatformDefaultKeywords(platformId)])];
  return merged.slice(0, 20);
}

export function getPlatformConfig(platformId) {
  return PLATFORM_OPTIONS.find((platform) => platform.id === platformId) || PLATFORM_OPTIONS[0];
}

export function getPlatformDefaultKeywords(platformId) {
  return getPlatformConfig(platformId).defaultKeywords || DEFAULT_KEYWORDS;
}

export function parseSaleTime(value) {
  const source = String(value || "").trim();
  if (!source) {
    return null;
  }

  const normalized = source
    .replace(/\//g, "-")
    .replace("T", " ")
    .replace(/年|月/g, "-")
    .replace("日", "")
    .trim();

  const date = new Date(normalized.includes(":") ? normalized : `${normalized} 00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function isTaskDue(task) {
  const interval = clampInterval(task.intervalSeconds);
  if (task.nextCheckAt) {
    const next = new Date(task.nextCheckAt).getTime();
    if (!Number.isNaN(next)) {
      return Date.now() >= next;
    }
  }
  if (!task.lastCheckedAt) {
    return true;
  }
  const last = new Date(task.lastCheckedAt).getTime();
  if (Number.isNaN(last)) {
    return true;
  }
  return Date.now() - last >= interval * 1000;
}

export function formatTime(value) {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

export function secondsUntilNextCheck(task) {
  if (task.status !== "running") {
    return null;
  }
  if (task.nextCheckAt) {
    const next = new Date(task.nextCheckAt).getTime();
    if (!Number.isNaN(next)) {
      return Math.max(0, Math.ceil((next - Date.now()) / 1000));
    }
  }
  if (!task.lastCheckedAt) {
    return 0;
  }
  const last = new Date(task.lastCheckedAt).getTime();
  if (Number.isNaN(last)) {
    return 0;
  }
  const dueAt = last + clampInterval(task.intervalSeconds) * 1000;
  return Math.max(0, Math.ceil((dueAt - Date.now()) / 1000));
}

export function getNextCheckAt(task, checkedAt = new Date()) {
  const checkedDate = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  const base = Number.isNaN(checkedDate.getTime()) ? Date.now() : checkedDate.getTime();
  return new Date(base + clampInterval(task.intervalSeconds) * 1000).toISOString();
}
