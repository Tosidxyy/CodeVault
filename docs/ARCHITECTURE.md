# CodeVault 技术架构 v0.1

## 当前实现（2026-09-26）

- React + TypeScript + Vite 工程已建立，使用 TailwindCSS Vite 插件构建 popup 和 options 样式。
- `scripts/build.mjs` 顺序构建插件页面、独立 IIFE content script 和 ES module background service worker，统一输出到 `dist/`。
- Manifest V3 仅声明 LeetCode 国际站与中文站的 content script；为支持站内导航，从两站全部页面注入基础面板。目前未申请额外 API 权限。
- content script 使用 Shadow DOM 和独立 CSS，避免全局样式影响宿主页面；界面支持展开、关闭和 Escape 收起。
- popup 与 options 可通过 Vite 开发服务器预览。扩展调试使用生产构建后手动重新加载的流程。
- `platforms` 已实现适配器接口、Problem 类型与 LeetCode 元数据获取；`database`、`ai`、`utils` 为预留目录。Zustand、shadcn/ui、Markdown 和持久化尚未接入。

## 题目识别

- `src/platforms/leetcode.ts` 匹配两站 `/problems/<slug>/` 路径，将题解、提交记录、查询参数和锚点归一为题目 URL；通过当前站点同源 `/graphql/` 获取元数据，无新增扩展权限。
- 校验响应中的 slug、题目ID、标题、难度和标签，拒绝缺失或错题数据。Problem ID 使用 `leetcode:<questionId>`，中文站优先使用翻译名称，缺失翻译时回退原文。
- `useProblem` 在面板展开时启动，使用 popstate/pageshow 和每500ms的 URL 比较识别站内导航，不扫描页面 DOM、不修改网页 history。相同题目的页面切换不重复请求；关闭面板时清理计时器和请求。
- 切题时清空旧数据并中止旧请求，响应返回前再次核对当前 URL；10秒请求超时和手动重试避免无限加载。数据仅保存在内存中。
- 接口基于两站现有公开网页服务，并非承诺稳定的第三方 API；字段或端点改变时需更新适配器。

## 后续存储约束

IndexedDB 应由扩展来源下的 background 等扩展上下文统一管理，通过消息接口提供给 content script；不要在宿主网页来源下存放知识库。消息协议、数据迁移与保存测试将在存储里程碑实现。

## 验证方式

`npm test` 包含 TypeScript 检查、生产构建、manifest 入口完整性、元数据解析和 Chromium 实际加载扩展后的交互测试。受控页面覆盖站内导航、慢请求竞态、失败重试与样式隔离。

`npm run test:live` 为可选联网测试。本轮在本机 Edge 中验证了两站真实“两数之和”页面，接口均返回200，正确展示标题、规范化 URL、难度和标签；一次网络超时重试后通过。尚未验证编辑器适配或数据保存。

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
