# CodeVault 技术架构 v0.1

## 当前实现（2026-09-26）

- React + TypeScript + Vite 工程已建立，使用 TailwindCSS Vite 插件构建 popup 和 options 样式。
- `scripts/build.mjs` 顺序构建插件页面、IIFE content script、ES module background service worker 和 IIFE editor 桥接，统一输出到 `dist/`。
- Manifest V3 仅声明 LeetCode 国际站与中文站的 content script；为支持站内导航，从两站全部页面注入基础面板。AI 配置按需申请用户指定 HTTPS 域名的可选站点权限。
- content script 使用 Shadow DOM 和独立 CSS，避免全局样式影响宿主页面；界面支持展开、关闭和 Escape 收起。
- popup 与 options 可通过 Vite 开发服务器预览。扩展调试使用生产构建后手动重新加载的流程。
- `platforms` 已实现题目适配器和编辑器读取客户端；`database` 已实现题目与解法持久化。`ai` 已实现配置和分析，`utils` 为预留目录，Markdown 已接入 react-markdown；Zustand、shadcn/ui 尚未接入。

## 编辑器读取与加载

- manifest 在两站注入独立的 `editor.js`，运行于 MAIN world，访问 `window.monaco.editor.getEditors()`。通过可见且可编辑的实例读取 model 的 `getValue()` 与 `getLanguageId()`，排除 plaintext 测试用例，不拼接虚拟滚动的 DOM 行。
- content 与桥接使用 `window.postMessage` 通信，校验同一 window、origin、消息类型、请求ID、页面 URL 和返回数据大小。桥接无存储能力；只有用户在扩展表单点击保存后才调用后台写入。
- 多个候选编辑器时返回错误，用户可通过悬浮按钮在目标 DOM 节点标记随机 token 精确读取。一次悬浮指令消费后清除，不会在返回原题时重新触发。
- 表单持有不可编辑的代码快照及自动读取的语言，支持名称和备注；切题清理未保存表单，过期读取回调不更新新题。消息超时3秒，代码上限50万字符。
- `loadCode` 校验解法 problemId 与当前题目匹配，然后发送 `prepare-load` 和 `load` 两阶段消息。桥接保存一次性随机票据，绑定 editor/model 对象、模型版本、原代码、语言和 URL，3秒过期，最多保留16条。
- 写入前再次校验票据、请求截止时间、当前 URL、模型身份/版本/内容、语言和可编辑状态；失效时不调用写入接口。语言校验依据 Monaco 标识，不自动切换 LeetCode 语言选择器。
- 替换使用 `pushUndoStop → executeEdits(完整模型范围) → pushUndoStop`，保留撤销栈；写后核对实际内容，比较时归一换行符。相同代码不产生额外撤销操作，允许空编辑器加载。桥接没有任意脚本执行能力或扩展存储权限。
- Monaco API 属于宿主页面实现细节，无法读取时给出可重试错误；不假定其他平台或只读题解区使用同一接口。

## 题目识别

- `src/platforms/leetcode.ts` 匹配两站 `/problems/<slug>/` 路径，将题解、提交记录、查询参数和锚点归一为题目 URL；通过当前站点同源 `/graphql/` 获取元数据，无新增扩展权限。
- 校验响应中的 slug、题目ID、标题、难度和标签，拒绝缺失或错题数据。Problem ID 使用 `leetcode:<questionId>`，中文站优先使用翻译名称，缺失翻译时回退原文。
- `useProblem` 在面板展开时启动，使用 popstate/pageshow 和每500ms的 URL 比较识别站内导航，不扫描页面 DOM、不修改网页 history。相同题目的页面切换不重复请求；关闭面板时清理计时器和请求。
- 切题时清空旧数据并中止旧请求，响应返回前再次核对当前 URL；10秒请求超时和手动重试避免无限加载。未收藏的数据仅保存在内存中。
- 接口基于两站现有公开网页服务，并非承诺稳定的第三方 API；字段或端点改变时需更新适配器。

## 本地存储

- background service worker 统一管理扩展来源下的 IndexedDB `codevault`。版本1包含 `problems` store（主键 `id`）和 `updatedAt` 索引；版本2新增 `solutions` store（主键 `id`）及 `problemId` 索引。升级按 oldVersion 增量执行，保留现有数据；首次安装按需初始化。
- `StoredProblem` 在 Problem 基础上增加 `createdAt`、`updatedAt`。同题更新保留创建时间，最后一次主动保存决定标题、站点链接等元数据。列表按更新时间倒序返回。
- `chrome.runtime.sendMessage` 使用 `codevault` channel，支持 `problems.get/list/save` 与 `solutions.list/save/update/delete`。监听器同步注册并返回 `true` 保持异步响应；只有事务 `complete` 后才回复成功，写入失败则回滚。
- 后台校验发送方扩展ID、站点来源、数据字段与长度；只接受扩展页或 LeetCode 顶层 content script。保存时校验题目 URL 与发送方同源。`sender.url` 可能保留 SPA 初始路径，因此实时题目路径由 content UI 在点击时核对。
- 面板加载收藏状态，支持主动收藏、更新与错误重试；切题或卸载后忽略过期回调。popup 在打开、获得焦点或手动刷新时读取列表，不提供实时跨标签广播。
- Solution 使用读取快照时生成的 UUID；同一请求重试不创建副本，同UUID但不同内容被拒绝。新快照可创建新版本。记录名称、完整代码、语言、`source: own`、来源 URL、备注、problemId及创建时间。
- 解法保存使用 `problems` 和 `solutions` 两表事务；没有父题目时自动创建，已有收藏保持原元数据。任一写入失败时整体回滚，不覆盖其他版本。笔记已支持本地图片附件。本地存储不使用外部服务，AI 分析由用户主动发送至配置的接口。
- 解法元数据更新只允许名称、备注、来源（own/reference/template）和无凭据的 HTTP/HTTPS 链接；代码、语言、题目与创建时间保留。更新和删除在单个 readwrite 事务中读取并校验 problemId 与 revision，过期或不存在时拒绝写入。旧记录缺失 revision 视为0，每次更新递增，无需增加数据库版本。删除只操作目标解法，保留题目与其他版本。UI 支持刷新冲突列表，不进行后台自动覆盖。

## AI 接口

- `codevault-settings` 独立 IndexedDB 保存唯一 AI 配置，主数据仍为版本3。只有扩展 options.html 能修改或清除配置；公开状态仅含 endpoint/model/revision，不返回 Key。每次修改生成新 revision，拒绝旧配置下准备的请求。
- manifest 声明可选 `https://*/*`；设置页通过用户点击请求具体 origin 的权限，后台发送前再次检查。API 地址只允许无凭据、查询参数和锚点的 HTTPS `/chat/completions` 路径；拒绝重定向，credentials 为 omit。
- 后台 Port 接收分析，校验发送方、题目、代码和配置。AbortController 在取消、端口断开、配置修改/清除或25秒到期时终止请求。前端切题卸载断开 Port，忽略过期响应。不自动重试。
- Chat Completions 使用 model/messages/stream:false，读取 choices[0].message.content；响应上限512000字节、文本上限100000字符。只显示固定 HTTP 错误提示，不向 UI 回传服务商错误正文，结果按 React 文本展示并隐藏意外回显的 Key。
- 协议依据：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[DeepSeek 首次调用](https://api-docs.deepseek.com/)、[Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)。未使用 OpenAI SDK，兼容性以服务商支持此格式为限。
- 测试在独立浏览器中模拟权限响应和服务商 fetch，覆盖配置保存/刷新/清除、Key 不回显、非设置页写入拒绝、明确发送、取消、切题、权限撤销与配置版本失效。真实权限弹窗及付费 API 未实测。

## 存储与回归验证

图片附件以可选 `StoredNote.images` 映射（UUID → PNG data URL）与笔记同一记录保存，无需升级版本3数据库。`notes.save` 接收图片映射，校验数量、编码、PNG签名、单张和总大小后保留 Markdown 中仍出现的本地引用；笔记与附件随同一事务提交。旧纯文本记录缺少 images 时视为空映射。冲突重试比较文字与附件，避免同文字不同图片被误判为已保存。

粘贴仅处理编辑框 paste 事件中的文件，不申请剪贴板权限。前端通过 createImageBitmap 解码、Canvas 转换静态 PNG（动画保留一帧），图片处理期间禁止编辑与保存，切题或卸载丢弃过期结果。预览将 `codevault-image:<UUID>` 解析为当前笔记的本地数据；链接不接受该协议，附件不跨题查询。未引用图片在保存或下一次粘贴时清理。

新增图片测试覆盖附件校验、格式/大小/数量限制、选区插入、预览实际解码、保存故障回滚、刷新后恢复、损坏及不支持格式、删除引用后的附件清理；粘贴使用浏览器合成 ClipboardEvent，系统剪贴板快捷键未纳入自动化测试。

笔记存储：数据库版本3新增 `notes`（主键 problemId），记录 markdown、revision、updatedAt。`notes.get/save` 经后台字段、长度和来源校验；保存使用 notes/problems 两表事务，自动收藏且失败整体回滚。revision 防止并发覆盖，文字及附件都相同的过期重试返回已有记录。空文本作为新修订保存，不删除版本记录。

笔记界面按题目 URL 挂载，卸载后忽略过期回调，提交时再次检查当前题目。读取成功前禁止编辑，失败可重新读取。预览使用 [react-markdown](https://github.com/remarkjs/react-markdown) 10.1.0，无原始 HTML 插件，skipHtml 禁用 HTML；自定义链接只接受无凭据的 HTTP/HTTPS，图片只渲染当前笔记中的本地附件，外部图片链接显示说明，不产生远程图片请求。

新增笔记集成测试验证 v2→v3 升级、Markdown 标题和代码块、安全链接与 HTML/图片处理、父题目写入失败回滚、双站同题读取、并发冲突保留草稿、重新读取确认、SPA 切题隔离及浏览器重启后离线读取。原有 v1 迁移测试更新为直升版本3。

`npm test` 包含 TypeScript 检查、生产构建、manifest 入口完整性、元数据解析和 Chromium 实际加载扩展后的交互测试。受控页面覆盖站内导航、慢请求竞态、失败重试与样式隔离。

存储集成测试验证扩展与宿主来源隔离、并发保存去重、失败回滚与重试，以及同一独立浏览器配置文件重启后离线读取。故障注入只发生在测试浏览器后台。

解法测试覆盖两站受控页面的编辑器桥接、完整150行代码、语言、多版本、定向捕获、空代码、跨题隔离、事务回滚、重试去重及v1→v2迁移；重启测试确认代码原样保留。

加载测试覆盖成功替换、撤销边界、重复加载、空编辑器、语言不匹配、只读、多实例、内容/模型/语言变化和切题；原存储记录不受影响。管理测试覆盖来源校验、编辑取消/保存、刷新持久化、删除确认、跨题和并发冲突、更新/删除失败回滚、父题目与其他版本保留。默认测试共18项通过。

`npm run test:live` 为可选联网测试。本轮中文站真实编辑器读取98字符默认C++代码并保存成功，随后将保存版本加载到含临时草稿的编辑器，实际按 Ctrl+Z 恢复草稿。可用 CODEVAULT_LIVE_HOST 选择单站。国际站保留此前 Cloudflare 人机验证导致的真实编辑器验证限制；受控测试不能替代实站验证。

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

-   sourceUrl
-   createdAt

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
