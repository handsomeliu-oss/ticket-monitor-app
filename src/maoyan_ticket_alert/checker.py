from __future__ import annotations

import re
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .models import CheckOutcome, CheckResult, MonitorTask, digest_text


BUYABLE_WORDS = (
    "立即购买",
    "选座购买",
    "立即预订",
    "可购买",
    "有票",
    "余票",
    "开售中",
    "正在售票",
)

UNAVAILABLE_WORDS = (
    "缺货登记",
    "售罄",
    "无票",
    "暂时缺货",
    "已售罄",
    "暂未开售",
    "预售",
    "即将开售",
)

BUTTON_HINT_WORDS = BUYABLE_WORDS + UNAVAILABLE_WORDS


class PageChecker:
    """Low-frequency page text checker. It never logs in, clicks, or posts data."""

    def __init__(self, timeout_seconds: int = 15) -> None:
        self.timeout_seconds = timeout_seconds

    def check(self, task: MonitorTask) -> CheckResult:
        validation_error = validate_url(task.url)
        if validation_error:
            return CheckResult(CheckOutcome.ERROR, validation_error)

        try:
            response = requests.get(
                task.url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 ticket-alert-reminder/0.1 "
                        "(compliance: reminder only, no automation purchase)"
                    ),
                    "Accept-Language": "zh-CN,zh;q=0.9",
                },
                timeout=self.timeout_seconds,
                allow_redirects=True,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            return CheckResult(CheckOutcome.ERROR, f"页面请求失败：{exc}")

        text = extract_visible_text(response.text)
        if not text:
            return CheckResult(CheckOutcome.ERROR, "未读取到可见页面文本，可能需要登录或页面限制访问")

        relevant_text = build_relevant_text(text, task)
        snapshot_hash = digest_text(relevant_text[:8000])
        positive_text = "\n".join(
            line for line in relevant_text.splitlines() if has_any_word(line, BUTTON_HINT_WORDS)
        )
        positive_hash = digest_text(positive_text)

        has_buyable_signal = has_any_word(relevant_text, BUYABLE_WORDS)
        has_unavailable_signal = has_any_word(relevant_text, UNAVAILABLE_WORDS)

        if not task.last_snapshot_hash:
            message = summarize_first_check(has_buyable_signal, has_unavailable_signal)
            return CheckResult(CheckOutcome.NO_CHANGE, message, snapshot_hash, positive_hash)

        changed = snapshot_hash != task.last_snapshot_hash
        positive_changed = bool(positive_text) and positive_hash != task.last_positive_hash

        if has_buyable_signal and (changed or positive_changed):
            return CheckResult(
                CheckOutcome.CHANGED,
                "检测到疑似有票或购买状态变化，请手动打开页面确认",
                snapshot_hash,
                positive_hash,
            )

        if positive_changed:
            return CheckResult(
                CheckOutcome.CHANGED,
                "检测到按钮或票务关键词状态变化，请手动打开页面确认",
                snapshot_hash,
                positive_hash,
            )

        if changed:
            return CheckResult(
                CheckOutcome.NO_CHANGE,
                "页面内容有变化，但未识别到明确有票信号",
                snapshot_hash,
                positive_hash,
            )

        return CheckResult(CheckOutcome.NO_CHANGE, "暂无变化", snapshot_hash, positive_hash)


def validate_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return "请输入有效的 http/https 演出页面链接"

    host = parsed.netloc.lower()
    allowed = host == "maoyan.com" or host.endswith(".maoyan.com")
    if not allowed:
        return "为降低误用风险，请填写 maoyan.com 域名下的页面链接"

    return ""


def extract_visible_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    chunks = [chunk.strip() for chunk in soup.get_text("\n").splitlines()]
    chunks = [chunk for chunk in chunks if chunk]
    return "\n".join(chunks)


def build_relevant_text(text: str, task: MonitorTask) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    hints = [
        task.show_name.strip(),
        task.session_name.strip(),
        task.ticket_tier.strip(),
        *BUTTON_HINT_WORDS,
    ]
    hints = [hint for hint in hints if hint]

    selected: list[str] = []
    for index, line in enumerate(lines):
        if has_any_word(line, hints):
            start = max(0, index - 3)
            end = min(len(lines), index + 4)
            selected.extend(lines[start:end])

    if not selected:
        selected = lines[:200]

    compact = "\n".join(selected)
    return re.sub(r"\s+", " ", compact)


def has_any_word(text: str, words: tuple[str, ...] | list[str]) -> bool:
    return any(word and word in text for word in words)


def summarize_first_check(has_buyable_signal: bool, has_unavailable_signal: bool) -> str:
    if has_buyable_signal:
        return "首次检查发现疑似可购买关键词，后续变化会提醒"
    if has_unavailable_signal:
        return "首次检查完成，当前识别为无票/未开售类状态"
    return "首次检查完成，未识别到明确票务状态"
