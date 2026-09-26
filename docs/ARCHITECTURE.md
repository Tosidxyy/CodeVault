# CodeVault 技术架构 v0.1

## 当前实现（2026-09-26）

- React + TypeScript + Vite 工程已建立，使用 TailwindCSS Vite 插件构建 popup 和 options 样式。
- `scripts/build.mjs` 顺序构建插件页面、独立 IIFE content script 和 ES module background service worker，统一输出到 `dist/`。
- Manifest V3 仅声明 LeetCode 国际站与中文站的 content script；为支持站内导航，从两站全部页面注入基础面板。目前未申请额外 API 权限。
- content script 使用 Shadow DOM 和独立 CSS，避免全局样式影响宿主页面；界面支持展开、关闭和 Escape 收起。
- popup 与 options 可通过 Vite 开发服务器预览。扩展调试使用生产构建后手动重新加载的流程。
- `database`、`platforms`、`ai`、`utils` 为预留目录；Zustand、shadcn/ui、Markdown 和持久化尚未接入。

## 后续存储约束

IndexedDB 应由扩展来源下的 background 等扩展上下文统一管理，通过消息接口提供给 content script；不要在宿主网页来源下存放知识库。消息协议、数据迁移与保存测试将在存储里程碑实现。

## 验证方式

`npm test` 包含 TypeScript 检查、生产构建、manifest 入口完整性检查，以及 Chromium 实际加载扩展后的交互测试。LeetCode 测试使用固定页面，不代表已经验证真实题目识别或编辑器适配。

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
