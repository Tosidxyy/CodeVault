# CodeVault

本地优先的算法知识管理 Chrome 插件。当前支持 LeetCode 题目识别、本地收藏、编辑器代码捕获与多版本解法保存，以及 popup 收藏列表和页面悬浮面板；笔记、AI 和将解法加载回编辑器尚未实现。

打开 `/problems/<slug>/` 下的题目、题解或提交记录页面，展开面板即可查看标题、URL、难度和标签。中文站优先显示翻译名称。站内切题会更新信息，离开题目页会清空；请求失败可点击“重新识别”。关闭面板会取消题目识别请求。竞赛专用 URL 尚未适配。

点击“收藏题目”将当前元数据保存到本机；保存成功后显示“已收藏”，可通过“更新收藏”刷新元数据。两站同一题共用一条记录，标题与链接以最近一次主动保存为准。扩展弹窗展示按最近更新排序的收藏，支持刷新和打开题目；不联网也能读取已有收藏，但访问网站和识别题目需要网络。

数据保存在当前浏览器配置文件的扩展来源中，不使用 LeetCode 网页的 IndexedDB。重新加载扩展会保留收藏；当前尚无导出、云同步或删除入口。

## 保存解法

1. 等待题目编辑器加载，将鼠标移入代码区，点击“添加至 CodeVault”；也可在面板中点击“读取当前代码”。
2. 检查代码预览，填写解法名称及可选备注，点击“保存解法”。语言从编辑器读取。
3. 在“我的解法”中展开条目查看代码、语言、备注及来源。每次重新读取并保存会创建一个独立版本；首次保存解法也会自动收藏题目。

保存的是读取时的代码快照。之后若修改网页编辑器，需要再次读取。切换题目或关闭面板会丢弃未保存的表单；已经提交的保存操作仍会完成。当前仅支持可编辑的 Monaco 代码区域，不采集只读题解文章、测试用例或整页文本，也不判断代码是否 AC。代码上限50万字符，名称100字符，备注5000字符。

数据库自动从版本1升级到版本2，保留已有收藏。中文站真实编辑器捕获与保存已验证；国际站受控测试通过，本轮真实编辑器验证因 Cloudflare 人机验证页未完成。

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

存储测试使用真实浏览器 IndexedDB，验证来源隔离、首次保存、并发去重、更新时间、读写失败重试、事务回滚，以及浏览器重启后离线读取。测试仅在独立测试配置文件中运行。

解法测试覆盖150行完整代码（含中文、缩进、CRLF）、语言切换、多编辑器定向捕获、多版本、跨题清理、重试去重、题目与解法原子保存，以及版本1数据库迁移后原有收藏不丢失。

题目识别测试另覆盖 URL 规范化、翻译回退、元数据校验、站内导航、慢请求返回时的竞态、失败重试及非题目页面。需要联网验证真实页面时运行 `npm run test:live`；这会在临时浏览器配置文件中访问两站公开的“两数之和”题目，检查识别、收藏、默认代码捕获与多版本保存，不需要登录。网络、编辑器加载或站点人机验证可能使该测试失败，因此未纳入默认测试。

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
- `src/editor`：MAIN world 的 Monaco 只读桥接，不接触扩展存储。
- `src/components`：共享 React 组件。
- `src/platforms`：平台适配器接口、题目数据类型及 LeetCode 元数据获取。
- `src/database`：IndexedDB题目与解法存储、消息类型、客户端和输入校验。
- `src/ai`、`src/utils`：后续模块预留目录。
- `public/manifest.json`：插件权限与入口声明。
- `scripts/build.mjs`：依次构建页面、content script、background 与 editor 桥接。
- `docs`：产品需求、架构、设计和界面参考。

Zustand、shadcn/ui 和 Markdown 将在对应功能需要时接入。
