# CodeVault

本地优先的算法知识管理 Chrome 插件。当前提供插件工程、popup、设置页入口和 LeetCode 页面悬浮面板；题目识别、代码保存、IndexedDB、笔记及 AI 尚未实现。

## 开发

需要 Node.js 22.12+（本项目使用 Node.js 24 验证）。

```powershell
npm ci
npm run dev
```

打开开发服务器的 `/popup.html` 或 `/options.html` 预览界面。Vite 开发服务器只用于页面预览，插件需要加载构建产物。

```powershell
npm run build
```

在 Chrome 的 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，指定本项目的 `dist` 目录。修改代码后重新构建、重新加载扩展，并刷新 LeetCode 页面。

## 验证

```powershell
npx playwright install chromium --no-shell
npm test
```

测试先执行 TypeScript 检查和生产构建，再检查 manifest 入口，以及在 Chromium 中实际加载扩展，验证 popup、设置页、悬浮面板开关、键盘关闭、窄屏布局和宿主样式隔离。页面测试使用 LeetCode URL 下的固定测试页面，不等同于真实 LeetCode 编辑器集成测试。截图输出到 `test-results/`。

当前没有数据写入功能，数据保存验证将在 IndexedDB 接入后补充。

Windows 若下载版 Chromium 出现“并行配置不正确”的系统启动错误，可使用已安装的 Edge 运行同一测试：

```powershell
$env:CODEVAULT_BROWSER_CHANNEL = 'msedge'
npm test
```

本轮在 Edge（Chromium）上通过验证；Playwright 固定为 1.56.1，依赖版本由 `package-lock.json` 锁定。

## 目录

- `src/popup`、`src/options`：插件页面。
- `src/content`：注入 LeetCode 的 React 悬浮面板，CSS 隔离于 Shadow DOM。
- `src/background`：Manifest V3 service worker。
- `src/components`：共享 React 组件。
- `src/database`、`src/platforms`、`src/ai`、`src/utils`：后续模块预留目录。
- `public/manifest.json`：插件权限与入口声明。
- `scripts/build.mjs`：依次构建页面、content script 与 background。
- `docs`：产品需求、架构、设计和界面参考。

Zustand、shadcn/ui、Markdown 和 IndexedDB 将在对应功能需要时接入。
