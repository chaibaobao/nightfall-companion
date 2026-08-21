# Nightfall Companion

《猎巫镇》线下桌游的手机端数字主持辅助工具。它通过中文语音引导黎明与夜晚流程，记录女巫和警长的隐藏选择，并在行动结束后统一公布结果。

## 特性

- React + TypeScript + Vite
- 可安装 PWA，支持离线使用
- 基于浏览器 Web Speech API 的中文普通话主持
- 一次黎明阶段与可循环进行的多个夜晚阶段
- 每夜可独立选择是否启用警长主持流程
- 可为每句主持词上传替代音频，并配置循环 BGM
- 严格分离 `blackCatTarget`、`witchKillTarget`、`sheriffProtectTarget`
- 游戏进度、玩家和偏好仅保存在本机 LocalStorage
- 无账号、无服务器、无数据库
- 手机竖屏优先，适配 Android 与 iOS 浏览器

> 浏览器提供的中文语音音色因设备而异。iOS Safari 和部分 Android 浏览器要求用户先点击“开始游戏”，应用已将此操作作为语音激活手势。

自定义主持音频与 BGM 保存在浏览器的 Cache Storage 中，以支持离线播放并避免 LocalStorage 的容量限制；游戏状态、目标与偏好仍保存在 LocalStorage。清除站点数据会同时移除这些本地音频。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

终端会显示本地地址。让手机与电脑处于同一局域网时，可以使用 `npm run dev -- --host` 后通过电脑局域网地址在手机上测试。

## 生产构建

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。

## 部署到 GitHub Pages

项目已包含 `.github/workflows/deploy.yml`。

1. 在 GitHub 新建一个空仓库，例如 `nightfall-companion`。
2. 将本项目提交并推送到仓库的 `main` 分支。
3. 打开仓库的 **Settings → Pages**。
4. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
5. 打开 **Actions** 页等待 `Deploy to GitHub Pages` 完成。
6. 访问 `https://<你的用户名>.github.io/nightfall-companion/`。

`vite.config.ts` 会在 GitHub Actions 中自动读取仓库名并配置正确的子路径，无需手动修改 `base`。

首次部署后，可在手机浏览器菜单中选择“添加到主屏幕”。为确保离线资源已缓存，建议先完整打开一次应用。

## 数据模型与扩展

核心状态定义在 `src/types.ts`，流程编排位于 `src/App.tsx`，语音能力位于 `src/speech.ts`，持久化位于 `src/storage.ts`。未来增加其他桌游助手时，可以将角色行动抽象为独立流程定义，并复用玩家、语音和存储模块。

## 隐私

应用不会上传任何玩家信息。清除浏览器站点数据或点击设置中的“结束并清除本局”会删除当前游戏记录。

