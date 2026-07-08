from __future__ import annotations

import threading
import time

from PyQt6.QtCore import QObject, QThread, pyqtSignal

from .checker import PageChecker
from .models import CheckResult, MonitorTask, TaskStatus, now_text


class MonitorWorker(QObject):
    task_checked = pyqtSignal(str, object)
    task_alert = pyqtSignal(str, object)
    task_error = pyqtSignal(str, str)
    stopped = pyqtSignal()

    def __init__(self, tasks: list[MonitorTask]) -> None:
        super().__init__()
        self.tasks = tasks
        self.checker = PageChecker()
        self._stop_event = threading.Event()
        self._next_check_at: dict[str, float] = {}

    def run(self) -> None:
        while not self._stop_event.is_set():
            now = time.time()
            for task in list(self.tasks):
                if self._stop_event.is_set():
                    break
                if task.status != TaskStatus.RUNNING:
                    continue

                due_at = self._next_check_at.get(task.id, 0)
                if due_at > now:
                    continue

                result = self.checker.check(task)
                self._apply_result(task, result)
                self.task_checked.emit(task.id, result)
                if result.should_alert:
                    self.task_alert.emit(task.id, result)

                self._next_check_at[task.id] = time.time() + task.interval_seconds

            self._stop_event.wait(1)

        self.stopped.emit()

    def stop(self) -> None:
        self._stop_event.set()

    def check_soon(self, task_id: str) -> None:
        self._next_check_at[task_id] = 0

    @staticmethod
    def _apply_result(task: MonitorTask, result: CheckResult) -> None:
        task.last_checked_at = now_text()
        task.last_message = result.message
        if result.snapshot_hash:
            task.last_snapshot_hash = result.snapshot_hash
        if result.positive_hash:
            task.last_positive_hash = result.positive_hash


class MonitorRuntime:
    def __init__(self, tasks: list[MonitorTask]) -> None:
        self.thread = QThread()
        self.worker = MonitorWorker(tasks)
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.worker.stop()
        self.thread.quit()
        self.thread.wait(3000)
