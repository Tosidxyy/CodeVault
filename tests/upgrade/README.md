# 原地升级数据保留测试

Windows专项测试；使用PowerShell解压ZIP、Playwright隔离浏览器配置，不访问个人浏览器数据。与默认28项测试独立，因为需要先提供真实旧版发布包。

```powershell
$env:CODEVAULT_BROWSER_CHANNEL = 'msedge'
$env:CODEVAULT_BASELINE_ZIP = 'C:\path\CodeVault-v0.2.0.zip'
npm run test:upgrade
```

省略ZIP变量时使用本地releases/CodeVault-v0.2.0.zip。发布包不在Git中；缺少时测试明确失败，不跳过或伪造旧版。包必须为v0.2.0且Manifest位于根目录；解压前检查路径和总大小。

测试用旧版真实存储接口写入收藏、长代码、多解法、备注、分析、图文笔记、迁移原文/图片备份及虚构AI配置。完整替换临时目录为当前dist，保持浏览器运行，通过chrome.runtime.reload更新；要求扩展ID不变，并记录reason=update、previousVersion=0.2.0。随后逐字段检查两个数据库，验证导出密钥排除，再离线重启再次核对。

仅临时测试包版本递增至0.2.1；源代码Manifest、正式ZIP、标签不变。权限检测只为保存虚构密钥而模拟，不调用实际AI。最终摘要位于test-results/upgrade-preservation.json，不保存密钥；临时目录清理前检查绝对路径范围。

覆盖本地未打包扩展更新，不替代Chrome Web Store签名包分发验证。默认npm test仍覆盖已有迁移、回滚和恢复测试；新版本有数据库结构变更时应更新本专项基线与断言。
