from __future__ import annotations

import json
from pathlib import Path

from .models import MonitorTask


APP_DIR = Path.home() / ".maoyan_ticket_alert"
TASKS_FILE = APP_DIR / "tasks.json"


class TaskStore:
    def __init__(self, path: Path = TASKS_FILE) -> None:
        self.path = path

    def load(self) -> list[MonitorTask]:
        if not self.path.exists():
            return []

        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []

        tasks = raw if isinstance(raw, list) else raw.get("tasks", [])
        return [MonitorTask.from_dict(item) for item in tasks if isinstance(item, dict)]

    def save(self, tasks: list[MonitorTask]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = [task.to_dict() for task in tasks]
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
