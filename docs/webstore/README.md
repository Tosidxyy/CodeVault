# CodeVault 0.2.0 上架材料

本目录提供可审阅的材料，不代表已经提交审核或上架。

## 控制台操作清单

1. 用发布者账号完成开发者注册、账号邮箱验证及控制台要求的账号资料。开发者联系邮箱由本人填写。
2. 上传 `releases/CodeVault-v0.2.0.zip`，不要上传源码仓库或 `.crx`。保持原 v0.2.0 标签及包内容不变。
3. 将 LISTING.md 的名称、简介、详细介绍、语言、分类及支持链接填入对应栏目。
4. 上传本目录的 128px 图标、440×280 宣传图和三张 1280×800 截图；可选上传1400×560顶部宣传图。截图和宣传图均为24位RGB PNG，无透明层。
5. 填写单一用途、权限用途、远程代码及用户数据声明；隐私政策 URL 使用 https://github.com/Tosidxyy/CodeVault/blob/main/docs/PRIVACY.md ，提交前确认退出登录后仍可打开。
6. 复制 REVIEW.md 的测试步骤到私有审核说明。AI 可选；需要测试凭据时另行通过私有字段提供临时受限密钥。
7. 在发布范围选择可见性和地区，检查全部必填项。提交前确认商店文案与实际行为一致。提交审核及发布状态以控制台为准。

GitHub 文件页是公开政策的直接入口，无需先启用 GitHub Pages。如需独立网页，可后续托管政策，但必须先验证 URL 可访问再替换控制台链接。

## 素材及来源

- `icon-128.png`：复制当前发布包图标，原设计由用户提供。
- `promo-440x280.png`：本地 HTML/CSS 渲染的品牌宣传图，使用现有图标，不生成新的产品标志。
- `promo-1400x560.png`：可选顶部宣传图。
- `description.txt`：可直接全选复制到“说明”字段的纯文本，无Markdown标题；详细介绍与LISTING.md一致。
- `screenshots/*.png`：加载实际 `dist` 扩展后拍摄，使用独立临时浏览器配置和可复现演示题目/笔记。不会读取个人浏览器数据或真实 API Key。
- `LISTING.md`：商店文案、权限及数据声明。
- `REVIEW.md`：英文审核步骤与已验证范围。
- `../PRIVACY.md`：中文政策及英文摘要。

## 重新生成素材

```powershell
npm run build
$env:CODEVAULT_BROWSER_CHANNEL = 'msedge'
node scripts/webstore-assets.mjs
```

脚本将覆写本目录的 PNG 素材；不修改发布包、真实浏览器配置或扩展产品代码。不调用真实 LeetCode 或 AI 服务。

## 官方规格（2026-09-28 核对）

- 图片：https://developer.chrome.com/docs/webstore/images （图标128×128、必需小宣传图440×280、截图1280×800或640×400，至少一张）。
- 隐私与权限字段：https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- 本地数据仍需披露：https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- 发布流程：https://developer.chrome.com/docs/webstore/publish

## 发布者仍需完成

- [ ] 控制台账号资料及联系邮箱确认。
- [ ] 接受最终文案、数据声明、截图及政策，核实公开链接。
- [ ] 上传素材及包、填入字段，完成审核所需的测试凭据（如要求）。
- [ ] 提交审核并在通过后发布。
