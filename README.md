# 多平台票务提醒助手

本项目已升级为“手机 App + 云端后端”架构。最终用户只需要使用 Expo 手机 App，不需要在电脑上开终端常驻运行。

- `mobile_app`：Expo SDK 54 手机端，负责配置服务器地址、搜索创建任务、查看云端任务状态、打开官方链接和显示本地通知；
- `cloud_backend`：云端服务，负责公开网页搜索、详情解析、监测任务、定时低频检查和 API；
- `src/maoyan_ticket_alert`：旧版 PyQt6 桌面端保留，作为历史版本，不再是正式使用主路径。

## 合规边界

本项目只能做提醒工具，不能做抢票工具：

- 不自动登录；
- 不自动下单；
- 不绕过验证码；
- 不模拟用户点击购买；
- 不绕过登录、验证码、排队系统；
- 不保存账号、密码、Cookie；
- 不高频请求平台接口；
- 默认每个任务 3-5 分钟低频检查一次，后端强制最小间隔为 180 秒；
- 用户收到提醒后，需要自行打开浏览器并遵守平台规则手动操作。

## 功能

- 手机 App 配置云端服务器地址；
- App 通过 API 搜索演出、创建监测任务、查看任务状态、删除任务；
- 云端后端执行搜索、详情解析、定时任务和低频页面检查；
- 检测到关键词后，App 轮询到云端状态并发送本地通知；
- 支持部署到 Render、Railway、Vercel Serverless 和云服务器；
- 正式使用时，手机 App 只连接部署后的云端地址。

## 项目结构

```text
.
├── README.md
├── cloud_backend
│   ├── README.md
│   ├── api
│   ├── package.json
│   ├── src
│   └── vercel.json
├── mobile_app
│   ├── App.js
│   ├── README.md
│   ├── app.json
│   ├── babel.config.js
│   ├── package.json
│   └── src
├── requirements.txt
├── pyproject.toml
├── build_app.spec
└── src
    └── maoyan_ticket_alert
        ├── __init__.py
        ├── __main__.py
        ├── checker.py
        ├── main.py
        ├── models.py
        ├── storage.py
        ├── worker.py
        └── ui
            ├── __init__.py
            └── main_window.py
```

移动端安装、Expo Go 测试、安卓 APK 打包和 iOS TestFlight 上线说明见 `mobile_app/README.md`。云端部署说明见 `cloud_backend/README.md`。

## 推荐使用教程

1. 先部署 `cloud_backend`，获取 HTTPS 云端地址；
2. 运行或打包 `mobile_app`；
3. 在 App 的“服务器地址配置”中填写云端地址；
4. 用户在 App 中搜索演出或手动创建任务；
5. 云端按不低于 180 秒的间隔检查公开网页；
6. 命中关键词后，App 显示本地通知，用户手动打开官方页面或 App 操作。

## 本地开发

启动云端后端：

```bash
cd cloud_backend
npm install
npm run dev
```

启动 Expo 手机端：

```bash
cd mobile_app
npm install
npm start
```

真机调试时，App 服务器地址填写电脑局域网地址，例如 `http://192.168.1.23:8787`。正式使用时请改为部署后的 HTTPS 云端地址。

## 旧版桌面端运行教程

1. 创建虚拟环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. 安装依赖：

```bash
pip install -r requirements.txt
```

3. 启动程序：

```bash
python run.py
```

## 使用方法

1. 打开 App；
2. 填写猫眼演出页面链接、演出名称、场次、票档；
3. 设置检查间隔，建议 180-300 秒；
4. 点击“保存任务”；
5. 选中任务后点击“开始”；
6. 程序检测到疑似余票或按钮状态变化时，会弹窗并播放提示音；
7. 用户需要自行打开浏览器手动查看和操作。

## 本地数据

任务数据保存在：

```text
~/.maoyan_ticket_alert/tasks.json
```

只保存任务配置和上次检测摘要，不保存账号、密码、Cookie 或登录态。

## 打包教程

安装打包依赖：

```bash
pip install pyinstaller
```

在项目根目录执行：

```bash
pyinstaller build_app.spec
```

打包完成后，产物位于：

```text
dist/猫眼余票提醒助手
```

macOS 如果提示来自未知开发者，需要在系统设置中允许打开。正式分发时建议进行代码签名和公证。

## 说明

不同演出页面的页面结构可能变化，本工具采用可见文本关键词和摘要变化检测，不保证一定能识别所有票务状态。请合理设置检查间隔，遵守猫眼平台规则和相关法律法规。
