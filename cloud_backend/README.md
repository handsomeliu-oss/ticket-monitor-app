# 云端后端

这是手机 App 的云端服务。搜索、监测和定时检查都放在这里，手机端只通过 API 创建任务、查看状态、删除任务，并在检测到关键词后显示本地通知。

## 合规边界

- 不登录；
- 不保存 Cookie、账号、密码或登录态；
- 不抓包；
- 不绕过验证码、排队或风控；
- 不自动下单；
- 不自动点击购买；
- 最小检测间隔强制为 180 秒；
- 只读取公开网页文本，检测到关键词后提醒用户手动打开官方页面或 App。

## API

- `GET /api/health`：健康检查；
- `GET /api/search?q=关键词`：搜索演出候选；
- `POST /api/enrich`：解析候选详情，body 为 `{ "candidate": { ... } }`；
- `GET /api/tasks`：查看任务列表；
- `POST /api/tasks`：创建监测任务；
- `GET /api/tasks/:taskId`：查看单个任务状态；
- `PATCH /api/tasks/:taskId`：开始/暂停任务；
- `POST /api/tasks/:taskId/check`：手动触发一次检查；
- `DELETE /api/tasks/:taskId`：删除任务；
- `POST /api/tick`：外部 Cron 可调用，用于 Serverless 定时触发。

## 本地开发

```bash
cd cloud_backend
npm install
npm run dev
```

默认地址：

```text
http://localhost:8787
```

手机真机测试时，如果手机和电脑在同一 Wi-Fi，需要在 App 的“服务器地址配置”里填写电脑局域网地址，例如：

```text
http://192.168.1.23:8787
```

正式使用时请填写部署后的 HTTPS 云端地址。

## Render 部署

1. 将项目推送到 GitHub；
2. Render 新建 `Web Service`；
3. Root Directory 填 `cloud_backend`；
4. Build Command 填：

```bash
npm install
```

5. Start Command 填：

```bash
npm start
```

6. 部署完成后复制 Render 提供的 HTTPS 地址，填入手机 App。

Render Web Service 会常驻运行，内置调度器会每 10 秒扫描一次到期任务，但每个任务实际检测间隔仍不低于 180 秒。

## Railway 部署

1. Railway 新建项目并连接 GitHub；
2. Root Directory 选择 `cloud_backend`；
3. Railway 会识别 Node.js 项目；
4. Start Command 使用：

```bash
npm start
```

5. 生成公开域名后，在 App 中填写该 HTTPS 地址。

## Vercel Serverless 部署

Vercel Serverless 不适合长期常驻内存调度。本项目提供 `api/index.js` 和 `vercel.json`，可部署 API，并通过 Vercel Cron 调用 `/api/tick`。

部署步骤：

1. 在 Vercel 导入仓库；
2. Root Directory 选择 `cloud_backend`；
3. Framework Preset 选择 `Other`；
4. Build Command 可留空或填 `npm install`；
5. 部署后访问 `/api/health` 验证。

注意：Serverless 文件系统和内存不适合作为生产级持久存储。正式生产建议优先使用 Render/Railway/云服务器，或把 `TaskStore` 替换为 Redis/Postgres/KV，并继续用 `/api/tick` 做 Cron 触发。

## 云服务器部署

在 Ubuntu / Debian 示例：

```bash
sudo apt update
sudo apt install -y nodejs npm
cd /opt/ticket-alert/cloud_backend
npm install
PORT=8787 npm start
```

建议使用 `pm2` 常驻：

```bash
npm install -g pm2
pm2 start src/server.js --name ticket-alert-backend
pm2 save
```

再用 Nginx 反向代理到 HTTPS 域名。App 正式使用时只填写 HTTPS 云端地址。
