# Chrome Web Store 商店字段

以下内容按 CodeVault 0.2.0 实际功能编写，可复制到控制台。账号联系邮箱由发布者在账号页面填写，不使用虚构邮箱。

## 名称

CodeVault

## 简介

在 LeetCode 保存多版本解法、图文笔记与可选 AI 分析，建立自己的本地算法知识库。

## 详细介绍

CodeVault 帮助你在 LeetCode 刷题过程中整理代码、记录思路并复习自己的解法。无需注册 CodeVault 账号，基础知识库保存在当前浏览器本地。

主要功能：

• 收藏题目：识别题目标题、难度和标签；按题名、标签或解法名称搜索，快速返回收藏题目。
• 多版本解法：保存当前编辑器代码，或捕获标准题解文章中的代码块；记录名称、语言、来源与备注。
• 加载历史代码：将同题、同语言的解法加载到当前编辑器，覆盖不同内容前确认，支持 Ctrl+Z 撤销。
• 图文笔记：每题一个思路输入框，支持图片上传、粘贴与拖入；缩略图排列、点击放大、删除及短时撤销，停止输入后自动保存。
• 可选 AI 分析：自行配置 DeepSeek、OpenAI、Anthropic Claude 或自定义兼容接口，主动发送选中的代码，流式查看思路、复杂度、关键点和易错点；完整结果可保存到对应解法。

开始使用：打开 LeetCode 普通题目页，点击右下角 CodeVault 图标，进入题库或“查看当前题目”。工具栏图标也可以打开收藏列表，设置入口用于配置可选 AI 服务。

支持 LeetCode 中文站和国际站。当前支持普通题目路径和标准题解代码块；竞赛专用路径及部分非标准编辑器/文章控件暂不支持。CodeVault 不运行代码、不自动提交，也不判断代码是否通过测试；本扩展为独立工具，与 LeetCode 无官方关联。

数据与 AI：题目、代码、笔记、图片和保存的分析保存在本机，无 CodeVault 云同步。只有用户主动测试或发送分析时，才直接连接用户选择的 AI 接口；分析会发送题目标题、链接、难度、代码和语言，不发送笔记或图片。API Key 本地保存，当前没有额外的静态加密。AI 需要用户自己的服务商密钥和额度，可能产生服务商费用。

请注意：卸载扩展或清除扩展存储会丢失本地知识库，v0.2.0 暂无数据导出。网页结构变化可能影响代码捕获与加载。AI 输出仅供学习参考。

## 分类与链接

- 分类建议：开发者工具（以控制台实际选项为准）。
- 默认语言：中文（简体）。
- 官方网站：https://github.com/Tosidxyy/CodeVault
- 支持网址：https://github.com/Tosidxyy/CodeVault/issues
- 隐私政策：https://github.com/Tosidxyy/CodeVault/blob/main/docs/PRIVACY.md
- 发布形式建议：免费扩展；AI 服务费用由用户与服务商结算。

## 单一用途 / Single purpose（可直接复制英文）

CodeVault helps users build and review a local LeetCode algorithm knowledge library by saving problem bookmarks, solution snapshots and illustrated notes, with optional user-triggered AI explanations of selected solutions.

## 权限用途 / Permission justifications

### storage

Used for temporary navigation state in chrome.storage.session, including panel state, search and scroll restoration. Persistent bookmarks, solutions, notes, images and optional AI settings are stored separately in the extension's local IndexedDB. No chrome.storage.sync or CodeVault cloud synchronization is used.

### https://leetcode.cn/* and https://leetcode.com/*

Required to show the CodeVault panel on the two supported LeetCode sites, identify the current problem, retrieve its metadata from the same site's GraphQL endpoint, capture code only when requested by the user, and load a saved solution into the matching editor after confirmation when needed. Site-wide matching supports navigation from the problem list into problem pages and reusing existing LeetCode tabs. The extension does not inspect unrelated sites or read general browser history.

### Optional https://*/*

Needed for the existing user-configurable HTTPS AI endpoint feature. The manifest allows arbitrary HTTPS origins because users can choose their own compatible API server. At runtime the extension requests only the specific origin selected by the user, through an explicit settings-page action. It does not request all-site access at installation or inject content scripts on these API sites. Requests go directly to that endpoint only for a user-triggered connection test or analysis. Denying AI permission leaves the local knowledge-library features available.

### Remote code

No remotely hosted code is executed. All JavaScript and rendering dependencies are packaged in the extension. AI responses are rendered as constrained Markdown data; HTML and external images are not executed or loaded.

## 数据类型声明

即使仅本地处理，也需披露。按当前控制台的类别名称对应勾选：

| 类别 | 当前行为 |
| --- | --- |
| 网站内容 / Website content | 题目信息、编辑器/题解代码、用户笔记和图片；选中的代码及题目信息可主动发送至 AI。 |
| 认证信息 / Authentication information | 用户自行提供的 AI API Key，本地保存，作为认证发送至所选服务商。 |
| 网络浏览记录 / Web history | 仅支持站点的当前题目 URL、保存的来源链接和已收藏题目的最近访问时间；不是全站浏览器历史。 |

没有主动收集姓名、邮箱、支付信息、健康信息、精确位置或私人通信的功能。用户自行输入的内容可能包含这些信息，不要把“没有专用采集功能”写成“绝不处理任何敏感内容”。

三项 Limited Use 声明可按实际情况确认：不出售或转移数据用于无关目的；仅用于明确的核心功能；不用于信用评估或借贷。AI 所需数据传输已在介绍与隐私政策中披露，不能勾选“不处理任何用户数据”。

## 图片上传顺序

1. screenshots/01-library.png：收藏题库与搜索。
2. screenshots/02-notes.png：图文笔记、缩略图与解法列表。
3. screenshots/03-ai-settings.png：可选服务配置。

小宣传图：promo-440x280.png。可选顶部宣传图：promo-1400x560.png。商店图标：icon-128.png。“说明”字段可直接复制description.txt。截图为真实扩展界面的演示数据，不代表真实用户记录或付费 AI 实测。
