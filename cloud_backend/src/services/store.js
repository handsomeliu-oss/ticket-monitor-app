import fs from "node:fs/promises";
import path from "node:path";

const defaultDataFile = process.env.VERCEL ? "/tmp/ticket-alert-tasks.json" : path.join(process.cwd(), "data", "tasks.json");

export class TaskStore {
  constructor(dataFile = process.env.DATA_FILE || defaultDataFile) {
    this.dataFile = dataFile;
    this.tasks = [];
    this.ready = this.load();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.dataFile, "utf8");
      const parsed = JSON.parse(raw);
      this.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    } catch {
      this.tasks = [];
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
    await fs.writeFile(this.dataFile, JSON.stringify({ tasks: this.tasks }, null, 2));
  }

  async list() {
    await this.ready;
    return [...this.tasks].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  async get(taskId) {
    await this.ready;
    return this.tasks.find((task) => task.id === taskId) || null;
  }

  async create(task) {
    await this.ready;
    this.tasks = [task, ...this.tasks];
    await this.save();
    return task;
  }

  async update(taskId, patch) {
    await this.ready;
    let updated = null;
    this.tasks = this.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      updated = { ...task, ...patch, updatedAt: new Date().toISOString() };
      return updated;
    });
    if (updated) {
      await this.save();
    }
    return updated;
  }

  async delete(taskId) {
    await this.ready;
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.id !== taskId);
    if (this.tasks.length !== before) {
      await this.save();
      return true;
    }
    return false;
  }
}
