# CodeVault 技术架构 v0.1

## 当前实现（2026-09-26）

- React + TypeScript + Vite 工程已建立，使用 TailwindCSS Vite 插件构建 popup 和 options 样式。
- `scripts/build.mjs` 顺序构建插件页面、IIFE content script、ES module background service worker 和 IIFE editor 桥接，统一输出到 `dist/`。
- Manifest V3 仅声明 LeetCode 国际站与中文站的 content script；为支持站内导航，从两站全部页面注入基础面板。AI 配置按需申请用户指定 HTTPS 域名的可选站点权限。
- content script 使用 Shadow DOM 和独立 CSS，避免全局样式影响宿主页面；界面支持展开、关闭和 Escape 收起。
- popup 与 options 可通过 Vite 开发服务器预览。扩展调试使用生产构建后手动重新加载的流程。
- `platforms` 已实现题目适配器和编辑器读取客户端；`database` 已实现题目与解法持久化。`ai` 已实现配置和分析，`utils` 为预留目录，Markdown 已接入 react-markdown；Zustand 已在 v0.2 Round 1 接入导航；shadcn/ui 尚未接入。

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

## v0.2 Round 1 架构增量（2026-09-27）

- `navigation/store.ts` 使用 Zustand 5 管理 open、home/detail、query、scroll；当前题目仍由唯一 `useProblem` 实例按实际页面 URL 获取，主页和详情共用识别状态。
- `background/navigation.ts` 经可信 sender 校验处理导航、设置和恢复请求；导航只接受已收藏题目 ID，后台读取目标 URL。使用 tabs API 复用/创建标签页。
- 导航状态通过后台保存到 `chrome.storage.session`，按标签页隔离；popup 单独保存。串行写入后再跳转，避免新页面读取旧状态。标签页关闭清理状态；重启浏览器或重新加载扩展会清空会话状态，收藏数据不受影响。
- Manifest 新增 storage 权限及两站限定 host_permissions，用于会话状态和识别可复用标签页，不申请全站 tabs 权限。AI 可选域权限仍按原流程申请。
- IndexedDB codevault 升至 v4：原地遍历 problems 补齐 favoriteAt（回退 createdAt）与 lastOpenedAt（null）。不删除数据库、不改写已有 Solution/Note 内容；所有自动收藏写入路径补齐新字段。
- `database/library.ts` 在一致的只读事务中汇总三个表，只向 UI 返回题目元数据、解法名称/数量、笔记存在状态，不把代码或图片传入主页。
- 收藏记录的实际详情访问更新 lastOpenedAt；保存成功触发题库失效刷新。返回主页复用已挂载列表，不因返回动作重建列表或重置查询。
- useProblem 关闭时清空临时状态，避免重开面板后旧 ready 状态抢先消费 Hover 指令。

## v0.2 Round 2 架构增量（2026-09-27）

- `platforms/article.ts` 集中文章路径、代码块定位、语言别名和代码快照读取；React 只消费 CaptureIntent。点击时冻结快照，保存时仍检查当前题目；过期 Hover 目标不能跨页面使用。
- `solutions.save` 接受 own/reference 和空名称；使用已有 problemId 索引在 problems/solutions 同一读写事务内分配默认名称、写入解法与自动收藏。ID 重试比较对自动名称做兼容，其余字段仍须一致。
- 新保存和修改的 Solution 写入 updatedAt，旧记录缺少此字段仍可正常读取；本轮没有删除数据或改变对象仓库/索引，维持 IndexedDB v4。
- Monaco `prepare-load` 返回原始代码及一次性票据；适配器比较换行归一后的代码，遇到非空不同内容等待 UI 确认。票据有效期由三秒延长为两分钟，最多十六个；每次实际 load 消息仍有三秒截止时间。确认后复用原票据核对模型、版本、内容、语言、URL，不重新采样后悄悄覆盖新修改。
- 取消或卸载详情会结束确认等待，阻止继续写入；成功后保留原有可撤销 executeEdits 流程。
- 新回归覆盖文章捕获、中文/国际站来源、未知语言、并发默认名称和重试；加载回归增加取消确认、确认期间继续编辑保护，导航回归增加非题目页 SPA 切题。

## v0.2 Round 3 架构增量（2026-09-27）

- IndexedDB v5 在原升级事务中遍历 notes，写入 blocks 和 legacy 原文/附件备份；保留原 problemId、revision、updatedAt，不清库、不重写解法。新笔记直接使用块结构。
- `NoteBlock` 为稳定 UUID 标识的 text/content 或 image/assetId；images 仍为 UUID→PNG data URL。`noteBlocks.ts` 校验类型、ID、总文字量和附件引用；保存只保留当前块引用的附件，legacy 备份不参与清理。
- 迁移使用 `mdast-util-from-markdown` 的语法树，避免正则剥离 Markdown 丢失段落与代码。后台构建显式使用 worker 导出条件，避免实体解码库的 DOM 版本在 Service Worker 中引用 document。
- `notes.saveBlocks` 继续做 sender、来源、版本和大小检查，与自动收藏在一个 IDB 事务提交。旧 notes.save 消息保留兼容转换，新 UI 不再发送 Markdown。
- `noteDraft.ts` 按题目管理页面内草稿、750ms 防抖和保存状态；卸载主动 flush，未保存/失败草稿可在同一页面重新打开。成功且不再使用的草稿释放，避免长期持有图片。
- `noteSessions.ts` 按标签页与随机编辑会话串行提交快照，使用前一次成功提交的 revision；跨会话仍执行 CAS 冲突检查。读取等待已收到的保存请求。队列仅保留完成状态，避免会话缓存持有大图片。
- pagehide/visibilitychange 尽力提交最新快照；普通导航和刷新已覆盖，不能保证进程崩溃、强制终止或存储不可用时落盘。失败不自动读取并覆盖本地草稿。
- 图片粘贴、拖放与文件选择复用既有 PNG 转换器；图片解码期间暂时禁止文字编辑，切题/卸载丢弃未完成的插入。组件只渲染文本输入和本地 data 图片，不注入 HTML、不加载外链图片。

## v0.2 Round 4 架构增量（2026-09-28）

- `ai/types.ts` 集中声明 provider、固定端点和模型列表；后台严格验证预设与地址/模型匹配，防止预设名与实际请求目的地不一致。自定义接口继续要求无凭据、查询参数和片段的 HTTPS Chat Completions 地址。
- 配置库保持 codevault-settings v1，旧记录读取时补充 provider=custom，保存新配置时写入 provider。无需重建数据库，不触碰 codevault v5 的题目/解法/笔记。
- provider 共享有界响应读取与固定错误消息；OpenAI/DeepSeek 使用 Bearer + Chat Completions，Claude 使用 x-api-key、anthropic-version 与 Messages，读取 text 内容块。DeepSeek 预设关闭 thinking；Claude 分析上限4096 tokens。
- 连接测试仅允许 options.html 调用。新配置先校验并确认域名权限；已保存配置以 revision 引用，密钥不返回 UI。测试仅发送 Reply with OK.，输出上限32 tokens，25秒 AbortController 超时。保存/清除配置会取消在途请求；测试不写入配置。测试期间禁用配置控件以避免旧结果覆盖新输入。
- 测试成功要求 HTTP 成功、有效 JSON 与非空文本；网络/鉴权/额度/超时错误有固定反馈，不转发服务商原始错误体，响应不超过512KB并隐藏密钥。

预设与协议依据（2026-09-28 核对，模型可用性仍由服务商及账户权限决定）：

- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)：deepseek-flash、deepseek-v4-pro。
- [OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1)、[Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)：测试使用 max_completion_tokens。
- [Claude 模型](https://platform.claude.com/docs/en/models/overview)、[Messages](https://platform.claude.com/docs/en/api/messages/create)：claude-haiku-4-5-20251001、claude-sonnet-5；使用 max_tokens。

## v0.2 Round 5 架构增量（2026-09-28）

- 正式分析通过现有 runtime Port 请求 stream=true；连接测试仍为非流式最小请求。后台发送 progress 快照与最终成功/错误消息；UI 仅最终成功解锁保存。配置变更、Port 断开、切题与关闭面板沿用 AbortController，25秒总超时。
- `ai/stream.ts` 按 SSE 帧增量解码 UTF-8，兼容 LF/CRLF 和跨 chunk 边界，忽略注释和非文本事件。OpenAI/兼容接口读取 choices[0].delta.content 与 [DONE]；Claude 读取 text_delta/content_block_start，要求 message_stop，忽略 thinking。
- 流错误、无结束标记、空内容、截断结束原因均报错；总网络响应最多1MiB、分析最多12000字符。API Key 跨文本分片时暂缓显示可能匹配的尾部，完整匹配替换为隐藏标识，不转发服务商原始错误详情。
- Provider 输出预算统一为1200 tokens，连接测试仍为32 tokens。只有支持 text/event-stream 的接口可用于正式分析，不静默降级成等待完整 JSON。
- Solution 增加可选 analysis/analysisUpdatedAt，不改对象仓库和索引，数据库维持 v5。旧记录无此字段正常读取。保存分析复用 solutions 的单事务 revision 比较，递增 revision 并保留代码、备注、来源与原创建时间；删除解法同时删除附属分析。
- `solutions.analysis.save` 校验题目ID、解法UUID、版本及非空有界文本；生成前对传入的解法ID、版本、代码、语言与数据库核对。保存时再次校验版本，防止并发修改、删除、跨题挂载。界面数据事件刷新解法列表与分析对象列表。
- `AnalysisMarkdown` 复用 react-markdown，使用元素白名单和 skipHtml；图片及链接不生成可加载资源，原始 HTML 不渲染。实时结果与已保存分析共用渲染器。

协议参考：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[Claude streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)。本轮自动化使用模拟 SSE，不含真实服务商调用。

## v0.2 Round 6 架构增量（2026-09-28）

- components/theme.css 提供颜色变量与品牌样式；扩展页通过 CSS 引入，content 注入 Shadow Root，保持宿主样式隔离。Brand/Icon 为本地 SVG/文字，无远程资源或新增依赖。
- 整理 panel.css 的历史覆盖规则，统一表单、列表、Markdown 和图文笔记样式。panel-header 在滚动面板内 sticky，返回动作继续使用现有 Zustand 与会话持久化逻辑。
- 本轮不改变数据库、Manifest权限或包版本。分析覆盖保存新增显式 confirmed 参数，原按钮在确认期间禁用。
- 实站 smoke 脚本扩展图文笔记与题库返回闭环；测试图片由临时页面 canvas 生成，仅用于上传路径验证，不代表系统剪贴板验收。

## 笔记缩略图修正（2026-09-28）

- noteLayout 将旧文字块顺序合并为一个字符串，忽略空占位；实际编辑、插图、删除时统一为一个 text 块加 image 块，不改数据库版本，不修改 legacy 备份。
- 插图不再处理文字选区，不创建尾部段落；删除沿用附件清理、自动保存、CAS与十秒撤销。
- 预览使用 Shadow DOM 内原生 dialog.showModal 的浏览器顶层，避免受面板滚动区域裁剪；隔离 Esc 冒泡，关闭预览不关闭面板，浏览器提供模态焦点管理。
- 使用本地图标16/32/48/128px。Manifest注册 icons/default_icon；仅128px图标对两站暴露，供content图片显示，无新增站点访问权限。用户原图保存在 docs/assets，不进入安装包。
