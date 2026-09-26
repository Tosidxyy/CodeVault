# CodeVault 开发任务 v0.1

## Milestone 0 初始化

-   [x] 创建GitHub仓库（用户提供仓库，已配置 origin）
-   [x] 初始化React + TypeScript + Vite
-   [x] 配置Chrome Manifest V3
-   [x] 配置TailwindCSS
-   [x] 建立项目目录

## Milestone 1 插件基础

-   [x] 创建popup页面
-   [x] 创建content script
-   [x] 创建background
-   [x] 实现基础悬浮按钮

### 本轮验收（2026-09-26）

-   [x] TypeScript检查与生产构建
-   [x] Manifest入口完整性检查
-   [x] Chromium加载、页面交互与样式隔离测试（本机Edge，固定测试页面）
-   [x] 同步README、架构与设计文档
-   提交与推送状态以Git记录为准，远程：`https://github.com/Tosidxyy/CodeVault`。

题目识别、收藏、代码捕获、多版本保存、加载到编辑器和解法管理已实现。Markdown 题目笔记与本地保存已实现。下一步实现笔记图片粘贴。

## Milestone 2 LeetCode支持

-   [x] 识别当前题目
-   [x] 获取标题
-   [x] 获取URL
-   [x] 获取难度和标签

验收补充：两站真实页面识别通过；受控测试覆盖站内导航、翻译回退、旧请求竞态、错误重试、非题目页清空。仅支持普通 `/problems/<slug>/` 路径。

## Milestone 3 解法捕获

-   [x] 检测代码区域
-   [x] Hover显示添加按钮
-   [x] 保存当前代码
-   [x] 自动关联题目
-   [x] 支持解法名称

当前范围为可编辑Monaco区域；只读题解文章和其他编辑器仍待适配。中文站真实代码捕获与保存通过；国际站实站编辑器验证被Cloudflare人机验证阻挡，两站受控测试通过。

## Milestone 4 解法管理

-   [x] 多版本解法
-   [x] Solution列表
-   [x] Solution来源管理
-   [x] 解法名称、备注和来源编辑
-   [x] 单个解法删除确认与并发冲突保护
-   [x] 在LeetCode页面加载自己的解法

加载验收：同题同语言替换、单次撤销、空编辑器、相同代码重复加载、语言/模型/内容变化保护、只读、多编辑器和切题拦截均通过。中文站真实加载及Ctrl+Z恢复未保存草稿通过；国际站真实编辑器仍有此前人机验证限制。

## Milestone 5 本地知识库

-   [x] IndexedDB
-   [x] Problem存储
-   [x] Solution存储
-   [x] Note存储

已交付题目与解法存储、v1→v2增量迁移、popup收藏列表。14项默认测试通过，覆盖完整代码、多版本、加载及撤销边界、并发去重、错误恢复、跨表原子回滚、来源隔离、原有收藏迁移保留及浏览器重启后的离线读取；新增解法编辑、来源链接校验、删除确认、并发冲突与写入失败回滚验证。笔记测试覆盖版本2→3迁移、安全预览、跨题隔离、并发保护、失败回滚与重启离线读取。

## Milestone 6 笔记

-   [x] Markdown笔记
-   [ ] 图片粘贴
-   [ ] 算法示意图

## Milestone 7 AI

-   [ ] API配置
-   [ ] DeepSeek/OpenAI兼容接口
-   [ ] AI分析代码

## MVP完成标准

用户可以：

-   安装插件
-   打开LeetCode
-   自动识别题目
-   保存代码
-   保存多个解法
-   在页面中加载自己的解法
-   本地保存数据
