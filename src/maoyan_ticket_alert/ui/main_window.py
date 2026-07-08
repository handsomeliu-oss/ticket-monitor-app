from __future__ import annotations

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QAction, QDesktopServices, QFont
from PyQt6.QtWidgets import (
    QApplication,
    QAbstractItemView,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)
from PyQt6.QtCore import QUrl

from ..models import (
    DEFAULT_INTERVAL_SECONDS,
    MIN_INTERVAL_SECONDS,
    MonitorTask,
    TaskStatus,
    clamp_interval,
)
from ..storage import TASKS_FILE, TaskStore
from ..worker import MonitorRuntime


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.store = TaskStore()
        self.tasks = self.store.load()
        self.runtime = MonitorRuntime(self.tasks)
        self.selected_task_id: str | None = None

        self.setWindowTitle("猫眼演出票务余票提醒助手")
        self.resize(1100, 720)
        self._build_ui()
        self._connect_signals()
        self._refresh_table()
        self.runtime.start()

        self.save_timer = QTimer(self)
        self.save_timer.setInterval(2000)
        self.save_timer.timeout.connect(self._save_tasks)
        self.save_timer.start()

    def closeEvent(self, event) -> None:  # noqa: N802
        self._save_tasks()
        self.runtime.stop()
        super().closeEvent(event)

    def _build_ui(self) -> None:
        root = QWidget()
        layout = QHBoxLayout(root)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(16)

        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["状态", "演出", "场次", "票档", "最近结果"])
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.verticalHeader().setVisible(False)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        self.table.setMinimumWidth(640)

        side = QFrame()
        side.setObjectName("sidePanel")
        side_layout = QVBoxLayout(side)
        side_layout.setContentsMargins(18, 18, 18, 18)
        side_layout.setSpacing(12)

        title = QLabel("任务设置")
        title.setFont(QFont("", 18, QFont.Weight.DemiBold))
        self.notice = QLabel(
            "仅做低频提醒：不登录、不下单、不验证码、不点击购买。收到提醒后请手动打开页面确认。"
        )
        self.notice.setWordWrap(True)
        self.notice.setObjectName("notice")

        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("https://...maoyan.com/...")
        self.show_input = QLineEdit()
        self.show_input.setPlaceholderText("演出名称")
        self.session_input = QLineEdit()
        self.session_input.setPlaceholderText("例如：2026-07-10 19:30")
        self.tier_input = QLineEdit()
        self.tier_input.setPlaceholderText("例如：看台 580 / 内场 1280")
        self.interval_input = QSpinBox()
        self.interval_input.setRange(MIN_INTERVAL_SECONDS, 1800)
        self.interval_input.setSingleStep(30)
        self.interval_input.setSuffix(" 秒")
        self.interval_input.setValue(DEFAULT_INTERVAL_SECONDS)

        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        form.addRow("页面链接", self.url_input)
        form.addRow("演出名称", self.show_input)
        form.addRow("场次", self.session_input)
        form.addRow("票档", self.tier_input)
        form.addRow("检查间隔", self.interval_input)

        self.save_button = QPushButton("保存任务")
        self.start_button = QPushButton("开始")
        self.pause_button = QPushButton("暂停")
        self.delete_button = QPushButton("删除")
        self.open_button = QPushButton("打开页面")

        controls = QHBoxLayout()
        controls.addWidget(self.save_button)
        controls.addWidget(self.start_button)
        controls.addWidget(self.pause_button)
        controls.addWidget(self.delete_button)

        self.detail = QTextEdit()
        self.detail.setReadOnly(True)
        self.detail.setMinimumHeight(120)
        self.detail.setPlaceholderText("选择任务后显示最近状态")

        side_layout.addWidget(title)
        side_layout.addWidget(self.notice)
        side_layout.addLayout(form)
        side_layout.addLayout(controls)
        side_layout.addWidget(self.open_button)
        side_layout.addWidget(self.detail)
        side_layout.addStretch()

        layout.addWidget(self.table, stretch=7)
        layout.addWidget(side, stretch=4)
        self.setCentralWidget(root)
        self._build_menu()
        self._apply_style()

    def _build_menu(self) -> None:
        help_menu = self.menuBar().addMenu("帮助")
        data_action = QAction("查看数据文件位置", self)
        data_action.triggered.connect(self._show_data_path)
        compliance_action = QAction("合规说明", self)
        compliance_action.triggered.connect(self._show_compliance)
        help_menu.addAction(data_action)
        help_menu.addAction(compliance_action)

    def _apply_style(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow {
                background: #f5f7fb;
                color: #20242a;
            }
            QTableWidget, QTextEdit, QLineEdit, QSpinBox {
                background: #ffffff;
                border: 1px solid #d7dde8;
                border-radius: 6px;
                padding: 6px;
            }
            QHeaderView::section {
                background: #eef2f7;
                border: 0;
                padding: 9px;
                font-weight: 600;
            }
            QTableWidget::item {
                padding: 8px;
            }
            QTableWidget::item:selected {
                background: #dcecff;
                color: #111827;
            }
            #sidePanel {
                background: #ffffff;
                border: 1px solid #d9e0ea;
                border-radius: 8px;
            }
            #notice {
                background: #fff7e6;
                border: 1px solid #ffd591;
                border-radius: 6px;
                padding: 10px;
                color: #684100;
            }
            QPushButton {
                background: #1769e0;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 9px 12px;
                font-weight: 600;
            }
            QPushButton:hover {
                background: #0f5fce;
            }
            QPushButton:pressed {
                background: #0b4ea8;
            }
            """
        )

    def _connect_signals(self) -> None:
        self.table.itemSelectionChanged.connect(self._load_selected_task)
        self.save_button.clicked.connect(self._save_form_task)
        self.start_button.clicked.connect(self._start_selected_task)
        self.pause_button.clicked.connect(self._pause_selected_task)
        self.delete_button.clicked.connect(self._delete_selected_task)
        self.open_button.clicked.connect(self._open_selected_url)
        self.runtime.worker.task_checked.connect(self._on_task_checked)
        self.runtime.worker.task_alert.connect(self._on_task_alert)

    def _save_form_task(self) -> None:
        url = self.url_input.text().strip()
        show_name = self.show_input.text().strip()
        session_name = self.session_input.text().strip()
        ticket_tier = self.tier_input.text().strip()

        if not all([url, show_name, session_name, ticket_tier]):
            QMessageBox.warning(self, "信息不完整", "请填写页面链接、演出名称、场次和票档。")
            return

        interval = clamp_interval(self.interval_input.value())
        existing = self._task_by_id(self.selected_task_id)
        if existing:
            existing.url = url
            existing.show_name = show_name
            existing.session_name = session_name
            existing.ticket_tier = ticket_tier
            existing.interval_seconds = interval
            existing.last_message = "任务已更新，等待下次检查"
            self.runtime.worker.check_soon(existing.id)
        else:
            task = MonitorTask(
                url=url,
                show_name=show_name,
                session_name=session_name,
                ticket_tier=ticket_tier,
                interval_seconds=interval,
            )
            self.tasks.append(task)
            self.selected_task_id = task.id

        self._save_tasks()
        self._refresh_table()

    def _start_selected_task(self) -> None:
        task = self._selected_task()
        if not task:
            return
        task.status = TaskStatus.RUNNING
        task.last_message = "已开始，等待检查"
        self.runtime.worker.check_soon(task.id)
        self._save_tasks()
        self._refresh_table()

    def _pause_selected_task(self) -> None:
        task = self._selected_task()
        if not task:
            return
        task.status = TaskStatus.PAUSED
        task.last_message = "已暂停"
        self._save_tasks()
        self._refresh_table()

    def _delete_selected_task(self) -> None:
        task = self._selected_task()
        if not task:
            return
        reply = QMessageBox.question(self, "删除任务", f"确定删除“{task.display_title}”？")
        if reply != QMessageBox.StandardButton.Yes:
            return
        self.tasks[:] = [item for item in self.tasks if item.id != task.id]
        self.selected_task_id = None
        self._clear_form()
        self._save_tasks()
        self._refresh_table()

    def _open_selected_url(self) -> None:
        task = self._selected_task()
        if task:
            QDesktopServices.openUrl(QUrl(task.url))

    def _load_selected_task(self) -> None:
        selected = self.table.selectedItems()
        if not selected:
            return
        row = selected[0].row()
        item = self.table.item(row, 0)
        task_id = item.data(Qt.ItemDataRole.UserRole)
        task = self._task_by_id(task_id)
        if not task:
            return
        self.selected_task_id = task.id
        self.url_input.setText(task.url)
        self.show_input.setText(task.show_name)
        self.session_input.setText(task.session_name)
        self.tier_input.setText(task.ticket_tier)
        self.interval_input.setValue(task.interval_seconds)
        self._show_detail(task)

    def _refresh_table(self) -> None:
        self.table.setRowCount(len(self.tasks))
        for row, task in enumerate(self.tasks):
            status_text = "运行中" if task.status == TaskStatus.RUNNING else "已暂停"
            values = [
                status_text,
                task.show_name,
                task.session_name,
                task.ticket_tier,
                task.last_message,
            ]
            for column, value in enumerate(values):
                item = QTableWidgetItem(value)
                if column == 0:
                    item.setData(Qt.ItemDataRole.UserRole, task.id)
                self.table.setItem(row, column, item)

        self.table.resizeRowsToContents()
        if self.selected_task_id:
            for row in range(self.table.rowCount()):
                if self.table.item(row, 0).data(Qt.ItemDataRole.UserRole) == self.selected_task_id:
                    self.table.selectRow(row)
                    break

    def _on_task_checked(self, task_id: str, _result) -> None:
        self._save_tasks()
        self._refresh_table()
        if self.selected_task_id == task_id:
            task = self._task_by_id(task_id)
            if task:
                self._show_detail(task)

    def _on_task_alert(self, task_id: str, result) -> None:
        task = self._task_by_id(task_id)
        if not task:
            return
        QApplication.beep()
        QMessageBox.information(
            self,
            "余票提醒",
            f"{task.display_title}\n\n{result.message}\n\n请手动打开页面确认，程序不会自动点击或下单。",
        )

    def _show_detail(self, task: MonitorTask) -> None:
        self.detail.setPlainText(
            "\n".join(
                [
                    f"任务：{task.display_title}",
                    f"状态：{'运行中' if task.status == TaskStatus.RUNNING else '已暂停'}",
                    f"间隔：{task.interval_seconds} 秒",
                    f"最近检查：{task.last_checked_at or '尚未检查'}",
                    f"最近结果：{task.last_message}",
                    f"链接：{task.url}",
                ]
            )
        )

    def _show_data_path(self) -> None:
        QMessageBox.information(self, "数据文件", str(TASKS_FILE))

    def _show_compliance(self) -> None:
        QMessageBox.information(
            self,
            "合规说明",
            "本工具只做低频页面变化提醒，不登录、不下单、不绕过验证码、不模拟购买点击。"
            "请遵守猫眼平台规则和相关法律法规。",
        )

    def _selected_task(self) -> MonitorTask | None:
        return self._task_by_id(self.selected_task_id)

    def _task_by_id(self, task_id: str | None) -> MonitorTask | None:
        if not task_id:
            return None
        return next((task for task in self.tasks if task.id == task_id), None)

    def _save_tasks(self) -> None:
        self.store.save(self.tasks)

    def _clear_form(self) -> None:
        self.url_input.clear()
        self.show_input.clear()
        self.session_input.clear()
        self.tier_input.clear()
        self.interval_input.setValue(DEFAULT_INTERVAL_SECONDS)
        self.detail.clear()
