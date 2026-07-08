import { REQUEST_TIMEOUT_MS } from "../constants";

function normalizeBaseUrl(serverUrl) {
  return String(serverUrl || "").trim().replace(/\/+$/, "");
}

export function hasServerUrl(serverUrl) {
  return /^https?:\/\//i.test(normalizeBaseUrl(serverUrl));
}

export async function apiRequest(serverUrl, path, options = {}) {
  const baseUrl = normalizeBaseUrl(serverUrl);
  if (!hasServerUrl(baseUrl)) {
    throw new Error("请先配置云端服务器地址");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (response.status === 204) {
      return null;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `请求失败：HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("连接云端超时，请检查服务器地址或网络");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function healthCheck(serverUrl) {
  return apiRequest(serverUrl, "/api/health");
}

export async function searchPerformancesCloud(serverUrl, query) {
  const data = await apiRequest(serverUrl, `/api/search?q=${encodeURIComponent(query)}`);
  return data?.results || [];
}

export async function enrichPerformanceCandidateCloud(serverUrl, candidate) {
  const data = await apiRequest(serverUrl, "/api/enrich", {
    method: "POST",
    body: JSON.stringify({ candidate })
  });
  return data?.candidate || candidate;
}

export async function loadCloudTasks(serverUrl) {
  const data = await apiRequest(serverUrl, "/api/tasks");
  return data?.tasks || [];
}

export async function createCloudTask(serverUrl, task) {
  const data = await apiRequest(serverUrl, "/api/tasks", {
    method: "POST",
    body: JSON.stringify(task)
  });
  return data?.task;
}

export async function updateCloudTask(serverUrl, taskId, patch) {
  const data = await apiRequest(serverUrl, `/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return data?.task;
}

export async function checkCloudTask(serverUrl, taskId) {
  const data = await apiRequest(serverUrl, `/api/tasks/${encodeURIComponent(taskId)}/check`, {
    method: "POST"
  });
  return data?.task;
}

export async function deleteCloudTask(serverUrl, taskId) {
  await apiRequest(serverUrl, `/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE"
  });
}
