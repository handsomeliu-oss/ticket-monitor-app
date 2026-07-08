from __future__ import annotations

import sys

from PyQt6.QtWidgets import QApplication

try:
    from .ui.main_window import MainWindow
except ImportError:
    from maoyan_ticket_alert.ui.main_window import MainWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("猫眼演出票务余票提醒助手")
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
