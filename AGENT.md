# CodeVault Agent 开发规范 v0.1

## 开发流程

每轮任务必须遵循：

    分析任务
    ↓
    修改代码
    ↓
    测试验证
    ↓
    更新相关文档
    ↓
    更新 TODO.md
    ↓
    git commit
    ↓
    git push

## 开发前

必须阅读：

-   docs/PRD.md
-   docs/ARCHITECTURE.md
-   docs/DESIGN.md
-   TODO.md

## 测试要求

每轮代码修改后必须进行基础测试：

-   插件是否正常加载
-   功能是否符合预期
-   数据是否正常保存
-   是否影响目标网页

测试通过后才能提交。

## 文档同步

产品变化： - 更新 docs/PRD.md

架构变化： - 更新 docs/ARCHITECTURE.md

UI变化： - 更新 docs/DESIGN.md

开发进度： - 更新 TODO.md

## Git规范

使用清晰commit：

    feat(content): add leetcode detector
    fix(storage): fix indexeddb issue
    docs(design): update ui design

## 完成标准

任务完成必须满足：

代码完成 + 测试通过 + 文档更新 + TODO更新 + commit + push
