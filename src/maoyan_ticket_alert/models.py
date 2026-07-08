from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from hashlib import sha256
from uuid import uuid4


MIN_INTERVAL_SECONDS = 180
DEFAULT_INTERVAL_SECONDS = 240
MAX_INTERVAL_SECONDS = 1800


class TaskStatus(str, Enum):
    PAUSED = "paused"
    RUNNING = "running"


class CheckOutcome(str, Enum):
    NO_CHANGE = "no_change"
    CHANGED = "changed"
    ERROR = "error"


@dataclass
class MonitorTask:
    url: str
    show_name: str
    session_name: str
    ticket_tier: str
    interval_seconds: int = DEFAULT_INTERVAL_SECONDS
    id: str = field(default_factory=lambda: uuid4().hex)
    status: TaskStatus = TaskStatus.PAUSED
    last_checked_at: str = ""
    last_message: str = "尚未检查"
    last_snapshot_hash: str = ""
    last_positive_hash: str = ""

    def __post_init__(self) -> None:
        self.interval_seconds = clamp_interval(self.interval_seconds)
        if not isinstance(self.status, TaskStatus):
            self.status = TaskStatus(self.status)

    @property
    def display_title(self) -> str:
        bits = [self.show_name, self.session_name, self.ticket_tier]
        return " / ".join(bit for bit in bits if bit.strip())

    def to_dict(self) -> dict:
        data = asdict(self)
        data["status"] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "MonitorTask":
        return cls(
            id=data.get("id") or uuid4().hex,
            url=data.get("url", ""),
            show_name=data.get("show_name", ""),
            session_name=data.get("session_name", ""),
            ticket_tier=data.get("ticket_tier", ""),
            interval_seconds=data.get("interval_seconds", DEFAULT_INTERVAL_SECONDS),
            status=data.get("status", TaskStatus.PAUSED.value),
            last_checked_at=data.get("last_checked_at", ""),
            last_message=data.get("last_message", "尚未检查"),
            last_snapshot_hash=data.get("last_snapshot_hash", ""),
            last_positive_hash=data.get("last_positive_hash", ""),
        )


@dataclass
class CheckResult:
    outcome: CheckOutcome
    message: str
    snapshot_hash: str = ""
    positive_hash: str = ""

    @property
    def should_alert(self) -> bool:
        return self.outcome == CheckOutcome.CHANGED


def clamp_interval(value: int | str) -> int:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        seconds = DEFAULT_INTERVAL_SECONDS
    return max(MIN_INTERVAL_SECONDS, min(MAX_INTERVAL_SECONDS, seconds))


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def digest_text(text: str) -> str:
    return sha256(text.encode("utf-8", errors="ignore")).hexdigest()
