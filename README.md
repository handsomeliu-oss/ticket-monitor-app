# 多平台票务提醒助手移动端

这是手机端 App，使用 React Native + Expo SDK 54 开发。它只做合规提醒：用户配置云端服务器地址后，可以通过云端公开网页搜索创建任务，也可以自行选择平台并填写演出网页链接。搜索、监测和定时任务都在 `cloud_backend` 执行，App 只通过 API 调用云端并显示任务状态。检测到提醒关键词后，App 轮询到云端状态并发送手机本地通知。用户收到提醒后，需要一键打开对应网页或官方 App，并手动完成后续操作。

## 合规边界

- 不自动登录；
- 不保存账号、密码、Cookie 或登录态；
- 不自动下单；
- 不自动点击购买；
- 不绕过验证码、排队、风控或登录流程；
- 不模拟用户购票操作；
- 不批量刷票；
- 不高频请求平台接口；
- 默认检测间隔 240 秒，代码强制最小间隔 180 秒；
- 支持猫眼、大麦、B站会员购和其他自定义平台；
- 云端后端使用低频 `GET` 请求读取公开网页，设置 15 秒超时和错误提示；
- 不接入官方 App 内部接口，不抓包，不保存 Cookie，不模拟登录；
- 搜索创建只读取公开网页搜索结果，不调用平台内部私有接口；
- 通知默认使用手机本地通知；也可在后端扩展 Expo Push 或其他推送服务。

## 功能

- 服务器地址配置：开发可填本地局域网地址，正式使用请填写云端 HTTPS 地址；
- 搜索创建任务：输入演出名称、艺人或城市，由云端公开搜索猫眼/美团、大麦、B站会员购和其他网页结果；
- 搜索结果展示演出名称、平台、城市、场馆、场次时间、票档、开票时间和网页链接；
- 点击搜索候选后自动填充任务表单，用户可手动修正，再确认票档和提醒关键词；
- 搜索失败时提示“未找到可靠结果，请手动填写链接。”；
- 手动创建任务：平台、网页链接、可选 App 跳转链接、演出名称、城市、场馆、场次、票档、开票时间、提醒关键词；
- 云端保存任务，App 本地只保存服务器地址和本地通知配置；
- 开票倒计时本地通知：开票前 30 分钟、10 分钟、1 分钟；
- 云端低频页面状态检测，默认 240 秒，最低 180 秒；
- 平台默认关键词：
  - 猫眼：立即购买、立即预订、有票、可购买、选座购买；
  - 大麦：立即购买、立即预订、选座购买、提交订单、有票；
  - B站会员购：立即购买、去购买、有票、可购买、售票中；
- 检测到关键词时，App 轮询到云端状态后发送本地通知和震动；
- 网页无法读取时提示用户手动打开对应官方 App 检查；
- 一键打开网页链接或用户填写的 App 跳转链接，由用户手动完成购票；
- 任务列表、开始监测、暂停监测、手动检查、删除任务都通过云端 API 完成；
- iPhone 和安卓手机均可运行。

## 项目结构

```text
mobile_app
├── App.js
├── README.md
├── app.json
├── babel.config.js
├── package.json
└── src
    ├── components
    │   ├── TaskCard.js
    │   └── TaskForm.js
    ├── constants.js
    ├── services
    │   ├── api.js
    │   ├── checker.js
    │   ├── notifications.js
    │   ├── search.js
    │   └── storage.js
    └── utils
        ├── hash.js
        └── task.js
```

## 安装运行

进入移动端项目目录：

```bash
cd mobile_app
```

安装依赖：

```bash
npm install
```

启动 Expo：

```bash
npm start
```

当前依赖固定为 Expo SDK 54 兼容版本，可直接用支持 SDK 54 的 Expo Go 扫码运行。

也可以直接启动到模拟器：

```bash
npm run ios
npm run android
```

## Expo Go 真机测试

1. 手机安装 Expo Go；
2. 电脑和手机连接同一 Wi-Fi；
3. 在 `mobile_app` 目录运行：

```bash
npm start
```

4. 用 Expo Go 扫描终端或浏览器页面中的二维码；
5. 首次启动时允许通知权限；
6. 在“服务器地址配置”填写云端地址。开发阶段可填电脑局域网地址，例如 `http://192.168.1.23:8787`；正式使用请填云端 HTTPS 地址；
7. 在“搜索创建”输入类似 `黎明 ROBBABA 广州`，点击“搜索演出”；
7. 从候选列表选择结果，确认或修正城市、场馆、场次、票档、开票时间和提醒关键词；
8. 点击“开始监测”，任务会提交到云端，云端按最低 180 秒间隔进行低频检测；
9. 切换到“手动创建”可继续使用备用的手动填写链接模式；
10. 点击“打开链接/App”会跳转到网页链接或用户填写的 App 跳转链接，购票必须由用户手动完成。

公开网页搜索可能受搜索引擎、网络环境或页面结构变化影响。未找到可靠候选时，请切换到“手动创建”并填写官方网页链接。

说明：Expo 官方文档说明，`expo-notifications` 的本地通知可在 Expo Go 中测试；安卓上的远程推送在部分 SDK 版本需要 development build。本项目默认只使用本地通知。

## 安卓 APK 打包

推荐使用 EAS Build。

安装并登录 EAS CLI：

```bash
npm install -g eas-cli
eas login
```

初始化 EAS：

```bash
eas build:configure
```

生成预览 APK。初始化后可在 `eas.json` 中加入：

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

执行：

```bash
eas build -p android --profile preview
```

构建完成后，EAS 会给出 APK 下载链接。安装后请确认通知权限已开启。

生产版 AAB：

```bash
eas build -p android --profile production
```

然后按 Google Play Console 要求上传 AAB。

## iOS TestFlight 上线说明

准备条件：

- Apple Developer Program 账号；
- macOS 和 Xcode 用于本地证书管理，或使用 EAS 托管证书；
- `app.json` 中的 `ios.bundleIdentifier` 改成你自己的唯一 Bundle ID；
- App Store Connect 中创建对应 App。

构建 iOS 生产包：

```bash
eas build -p ios --profile production
```

提交到 App Store Connect：

```bash
eas submit -p ios
```

进入 App Store Connect 后：

1. 打开对应 App；
2. 进入 TestFlight；
3. 等待构建处理完成；
4. 填写测试信息和合规说明；
5. 添加内部或外部测试人员；
6. 外部测试需要提交 Apple Beta App Review。

建议在审核说明中明确：本 App 不提供登录、自动购买、自动点击、验证码绕过、订单提交或保存平台登录态功能，仅用于用户自定义关键词的低频本地提醒。

## 开发说明

- 云端 API 调用位于 `src/services/api.js`；
- 旧本地页面检测逻辑保留在 `src/services/checker.js`，正式手机端流程不再直接使用；
- 旧本地搜索创建逻辑保留在 `src/services/search.js`，正式手机端流程不再直接使用；
- 通知逻辑位于 `src/services/notifications.js`；
- 本地存储逻辑位于 `src/services/storage.js`；
- 任务模型和时间工具位于 `src/utils/task.js`；
- 最小检测间隔在 `src/constants.js` 中定义为 `180` 秒。

本项目没有后台常驻抢票逻辑。云端后端负责定时低频检查；App 在前台或回到前台时同步云端状态并触发本地通知。倒计时提醒由系统本地通知调度。移动操作系统可能限制后台执行，这是合规提醒工具的预期边界。

## 官方文档参考

- [Expo SDK Reference](https://docs.expo.dev/versions/v54.0.0/)
- [expo-notifications](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/)
- [AsyncStorage for Expo](https://docs.expo.dev/versions/v54.0.0/sdk/async-storage/)
