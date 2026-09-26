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

当前不提供数据保存功能。题目识别已实现，下一步在代码保存前接入扩展来源下的IndexedDB。

## Milestone 2 LeetCode支持

-   [x] 识别当前题目
-   [x] 获取标题
-   [x] 获取URL
-   [x] 获取难度和标签

验收补充：两站真实页面识别通过；受控测试覆盖站内导航、翻译回退、旧请求竞态、错误重试、非题目页清空。仅支持普通 `/problems/<slug>/` 路径，当前不收藏或保存数据。

## Milestone 3 解法捕获

-   [ ] 检测代码区域
-   [ ] Hover显示添加按钮
-   [ ] 保存当前代码
-   [ ] 自动关联题目
-   [ ] 支持解法名称

## Milestone 4 解法管理

-   [ ] 多版本解法
-   [ ] Solution列表
-   [ ] Solution来源管理
-   [ ] 在LeetCode页面加载自己的解法

## Milestone 5 本地知识库

-   [ ] IndexedDB
-   [ ] Problem存储
-   [ ] Solution存储
-   [ ] Note存储

## Milestone 6 笔记

-   [ ] Markdown笔记
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
