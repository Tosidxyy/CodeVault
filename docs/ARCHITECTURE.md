# CodeVault 技术架构 v0.1

## 当前实现（2026-09-26）

- React + TypeScript + Vite 工程已建立，使用 TailwindCSS Vite 插件构建 popup 和 options 样式。
- `scripts/build.mjs` 顺序构建插件页面、独立 IIFE content script 和 ES module background service worker，统一输出到 `dist/`。
- Manifest V3 仅声明 LeetCode 国际站与中文站的 content script；为支持站内导航，从两站全部页面注入基础面板。目前未申请额外 API 权限。
- content script 使用 Shadow DOM 和独立 CSS，避免全局样式影响宿主页面；界面支持展开、关闭和 Escape 收起。
- popup 与 options 可通过 Vite 开发服务器预览。扩展调试使用生产构建后手动重新加载的流程。
- `platforms` 已实现适配器接口、Problem 类型与 LeetCode 元数据获取；`database` 已实现题目持久化。`ai`、`utils` 为预留目录，Zustand、shadcn/ui 和 Markdown 尚未接入。

## 题目识别

- `src/platforms/leetcode.ts` 匹配两站 `/problems/<slug>/` 路径，将题解、提交记录、查询参数和锚点归一为题目 URL；通过当前站点同源 `/graphql/` 获取元数据，无新增扩展权限。
- 校验响应中的 slug、题目ID、标题、难度和标签，拒绝缺失或错题数据。Problem ID 使用 `leetcode:<questionId>`，中文站优先使用翻译名称，缺失翻译时回退原文。
- `useProblem` 在面板展开时启动，使用 popstate/pageshow 和每500ms的 URL 比较识别站内导航，不扫描页面 DOM、不修改网页 history。相同题目的页面切换不重复请求；关闭面板时清理计时器和请求。
- 切题时清空旧数据并中止旧请求，响应返回前再次核对当前 URL；10秒请求超时和手动重试避免无限加载。未收藏的数据仅保存在内存中。
- 接口基于两站现有公开网页服务，并非承诺稳定的第三方 API；字段或端点改变时需更新适配器。

## 本地存储

- background service worker 统一管理扩展来源下的 IndexedDB `codevault`，版本1包含 `problems` store（主键 `id`）和 `updatedAt` 索引。首次安装按需初始化，重新加载或重启不清空数据；未来新增 store 需增加版本并迁移。
- `StoredProblem` 在 Problem 基础上增加 `createdAt`、`updatedAt`。同题更新保留创建时间，最后一次主动保存决定标题、站点链接等元数据。列表按更新时间倒序返回。
- `chrome.runtime.sendMessage` 使用 `codevault` channel 和 `problems.get/list/save` 操作。监听器同步注册并返回 `true` 保持异步响应；只有事务 `complete` 后才回复成功，写入失败则回滚。
- 后台校验发送方扩展ID、站点来源、数据字段与长度；只接受扩展页或 LeetCode 顶层 content script。保存时校验题目 URL 与发送方同源。`sender.url` 可能保留 SPA 初始路径，因此实时题目路径由 content UI 在点击时核对。
- 面板加载收藏状态，支持主动收藏、更新与错误重试；切题或卸载后忽略过期回调。popup 在打开、获得焦点或手动刷新时读取列表，不提供实时跨标签广播。
- 本阶段仅实现 Problem 存储，Solution、Note、图片和迁移到未来版本的逻辑尚未实现。未增加扩展权限或外部存储服务。

## 验证方式

`npm test` 包含 TypeScript 检查、生产构建、manifest 入口完整性、元数据解析和 Chromium 实际加载扩展后的交互测试。受控页面覆盖站内导航、慢请求竞态、失败重试与样式隔离。

存储集成测试验证扩展与宿主来源隔离、并发保存去重、失败回滚与重试，以及同一独立浏览器配置文件重启后离线读取。故障注入只发生在测试浏览器后台。

`npm run test:live` 为可选联网测试。本轮在本机 Edge 中验证两站真实“两数之和”页面，接口均返回200，识别与收藏成功；popup 中两站共享一条收藏。尚未实现编辑器适配。

## 架构原则

Local-first：

-   无账号
-   无服务器
-   数据保存在本地

## 技术栈

Chrome Extension:

-   Manifest V3

Frontend:

-   React
-   TypeScript
-   Vite

UI:

-   TailwindCSS
-   shadcn/ui

Storage:

-   IndexedDB

State:

-   Zustand

Markdown:

-   React Markdown

AI:

-   OpenAI兼容API
-   DeepSeek

## 架构

    Chrome

    ↓

    CodeVault Extension

    ↓

    Content Script + React UI

    ↓

    Runtime Messages → Background Service Worker

    ↓

    IndexedDB

    ↓

    AI API(可选)

## 目录

    src/

    background

    content

    popup

    options

    components

    database

    platforms

    ai

    utils

## 数据对象

Problem:

-   id
-   title
-   url
-   platform
-   difficulty
-   tags

Solution:

-   id
-   problemId
-   name
-   source
-   language
-   code
-   note

Note:

-   problemId
-   markdown
-   images

## 平台适配

通过adapter支持：

-   LeetCode
-   牛客
-   其他平台

## 编辑器适配

通过统一接口支持代码读取和覆盖：

    getCode()

    setCode()
