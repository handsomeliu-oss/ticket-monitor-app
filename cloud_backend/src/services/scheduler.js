import { checkTaskPage } from "./checker.js";
import { getNextCheckAt, isTaskDue } from "../utils/task.js";

export class Scheduler {
  constructor(store, { intervalMs = 10000 } = {}) {
    this.store = store;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = new Set();
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick().catch((error) => console.error("scheduler tick failed", error)), this.intervalMs);
    this.tick().catch((error) => console.error("initial scheduler tick failed", error));
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    const dueTasks = (await this.store.list()).filter((task) => isTaskDue(task));
    for (const task of dueTasks.slice(0, 3)) {
      await this.checkTask(task.id);
    }
  }

  async checkTask(taskId) {
    if (this.running.has(taskId)) {
      return null;
    }
    const task = await this.store.get(taskId);
    if (!task) {
      return null;
    }
    this.running.add(taskId);
    try {
      const result = await checkTaskPage(task);
      const checkedAt = new Date();
      const patch = {
        lastCheckedAt: checkedAt.toISOString(),
        nextCheckAt: task.status === "running" ? getNextCheckAt(task, checkedAt) : "",
        lastResult: result.message,
        lastMessage: result.message,
        lastError: result.ok ? "" : result.message,
        matchedKeywords: result.matchedKeywords || [],
        lastSnapshotHash: result.snapshotHash || task.lastSnapshotHash,
        lastPositiveHash: result.positiveHash || task.lastPositiveHash,
        notification: result.shouldNotify
          ? {
              id: `${task.id}-${Date.now()}`,
              createdAt: checkedAt.toISOString(),
              title: "发现疑似有票/可购买状态",
              body: `${task.platformName || "对应平台"}：${task.showName || "演出"} 命中关键词，请手动打开页面或官方 App 确认。`,
              url: task.url,
              matchedKeywords: result.matchedKeywords || []
            }
          : task.notification || null
      };
      return this.store.update(taskId, patch);
    } finally {
      this.running.delete(taskId);
    }
  }
}
