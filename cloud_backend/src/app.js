import cors from "cors";
import express from "express";

import { MAX_TASKS, MIN_INTERVAL_SECONDS } from "./constants.js";
import { enrichPerformanceCandidate, searchPerformances } from "./services/search.js";
import { Scheduler } from "./services/scheduler.js";
import { TaskStore } from "./services/store.js";
import { normalizeTaskInput } from "./utils/task.js";

export function createApp({ startScheduler = true } = {}) {
  const app = express();
  const store = new TaskStore();
  const scheduler = new Scheduler(store);

  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      service: "ticket-alert-cloud-backend",
      minIntervalSeconds: MIN_INTERVAL_SECONDS,
      compliance: "no-login-no-cookie-no-captcha-bypass-no-auto-order-no-auto-click"
    });
  });

  app.get("/api/search", async (req, res, next) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query) {
        res.status(400).json({ error: "请输入搜索内容" });
        return;
      }
      res.json({ results: await searchPerformances(query) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/enrich", async (req, res, next) => {
    try {
      res.json({ candidate: await enrichPerformanceCandidate(req.body?.candidate || {}) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks", async (req, res, next) => {
    try {
      res.json({ tasks: await store.list() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks", async (req, res, next) => {
    try {
      const existing = await store.list();
      if (existing.length >= MAX_TASKS) {
        res.status(400).json({ error: `任务数量已达到上限 ${MAX_TASKS}` });
        return;
      }
      const task = normalizeTaskInput(req.body || {});
      const saved = await store.create(task);
      scheduler.checkTask(saved.id).catch((error) => console.error("initial check failed", error));
      res.status(201).json({ task: saved });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId", async (req, res, next) => {
    try {
      const task = await store.get(req.params.taskId);
      if (!task) {
        res.status(404).json({ error: "任务不存在" });
        return;
      }
      res.json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tasks/:taskId", async (req, res, next) => {
    try {
      const task = await store.get(req.params.taskId);
      if (!task) {
        res.status(404).json({ error: "任务不存在" });
        return;
      }
      const nextTask = normalizeTaskInput({ ...task, ...req.body, id: task.id, createdAt: task.createdAt });
      const saved = await store.update(task.id, nextTask);
      if (saved.status === "running") {
        scheduler.checkTask(saved.id).catch((error) => console.error("manual status check failed", error));
      }
      res.json({ task: saved });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/check", async (req, res, next) => {
    try {
      const task = await scheduler.checkTask(req.params.taskId);
      if (!task) {
        res.status(404).json({ error: "任务不存在或正在检查" });
        return;
      }
      res.json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tick", async (req, res, next) => {
    try {
      await scheduler.tick();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:taskId", async (req, res, next) => {
    try {
      const deleted = await store.delete(req.params.taskId);
      if (!deleted) {
        res.status(404).json({ error: "任务不存在" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = error.status || 500;
    res.status(status).json({ error: error.message || "服务器错误" });
  });

  if (startScheduler) {
    scheduler.start();
  }

  return app;
}
