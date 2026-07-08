import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_PLATFORM_ID, SERVER_URL_STORAGE_KEY, STORAGE_KEY } from "../constants";
import { clampInterval, getPlatformConfig, normalizeKeywords } from "../utils/task";

const LEGACY_STORAGE_KEYS = ["maoyan_ticket_alert_tasks_v1"];

export async function loadTasks() {
  try {
    let raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = await AsyncStorage.getItem(key);
        if (raw) {
          break;
        }
      }
    }
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeStoredTask);
  } catch (error) {
    console.warn("Failed to load tasks", error);
    return [];
  }
}

export async function saveTasks(tasks) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn("Failed to save tasks", error);
  }
}

export async function loadServerUrl() {
  try {
    return (await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)) || "";
  } catch (error) {
    console.warn("Failed to load server url", error);
    return "";
  }
}

export async function saveServerUrl(serverUrl) {
  try {
    await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, String(serverUrl || "").trim());
  } catch (error) {
    console.warn("Failed to save server url", error);
  }
}

function normalizeStoredTask(task) {
  const platform = getPlatformConfig(task.platformId || DEFAULT_PLATFORM_ID);
  return {
    ...task,
    platformId: platform.id,
    platformName: task.platformName || platform.name,
    appUrl: task.appUrl || "",
    status: task.status === "running" ? "running" : "paused",
    intervalSeconds: clampInterval(task.intervalSeconds),
    keywords: normalizeKeywords((task.keywords || []).join ? task.keywords.join("、") : task.keywords, platform.id),
    nextCheckAt: task.nextCheckAt || "",
    lastResult: task.lastResult || task.lastMessage || "尚未检查",
    lastMessage: task.lastMessage || "尚未检查",
    countdownNotificationIds: Array.isArray(task.countdownNotificationIds) ? task.countdownNotificationIds : []
  };
}
