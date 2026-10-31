# CodeVault 隐私政策 / Privacy Policy

适用版本：v0.4.0云同步公测及旧版本（另注明差异）。更新日期：2026-10-31。开发者：Tosidxyy。

CodeVault 是帮助用户整理 LeetCode 题目、代码解法、笔记及可选 AI 分析的浏览器扩展。基础功能无需注册 CodeVault 账号；v0.4.0默认云同步服务开放邮箱验证码登录公测，登录和上传均为用户选择，也没有在扩展中接入广告、行为分析或遥测 SDK。

## 处理哪些数据及用途

- **网站内容与用户内容**：在 LeetCode 中文站和国际站读取当前题目的标题、链接、难度、标签；用户主动捕获编辑器或标准题解代码块时读取代码与语言。用户保存的解法名称、备注、来源链接、笔记文字、上传/粘贴/拖放的图片和已保存分析用于建立本地知识库。
- **有限的网站访问信息**：使用当前 LeetCode 页面地址识别题目和导航；保存收藏时间与收藏题目的最近打开时间，用于题库排序和“最近访问”。不读取浏览器全站历史记录，不追踪其他网站的浏览行为。
- **认证信息与设置**：可选 AI 服务的 API Key、接口地址、模型与服务商配置用于用户主动发起的 AI 请求。API Key 保存在本机扩展 IndexedDB 中，当前没有额外的静态加密；设置页不回显已保存密钥。
- **临时界面状态**：搜索词、列表位置、面板状态等用于恢复导航，部分保存在浏览器会话存储，重启浏览器或重新加载扩展后会清空。
- **窗口布局偏好**：浮窗的相对屏幕边距与紧凑/展开模式保存在本机扩展存储，用于下次打开界面时恢复布局，支持重置。该设置不进行云同步，不附带在AI请求或知识库备份中。
- **界面语言偏好**：默认依据浏览器首选语言选择中文或英文，用户可手动切换并在本机保存；该偏好用于界面展示和新AI分析的输出语言指令，不改写已有知识库内容。

## 本地保存与网络请求

题目、解法、笔记、图片及用户主动保存的分析保存在当前浏览器配置文件的扩展 IndexedDB 中，默认不自动上传或云同步；v0.4.0中，明确绑定云账号并授权后才按下节执行同步。只有用户保存、收藏或编辑笔记等明确操作才持久化对应内容；展开面板时可能向当前 LeetCode 站点的 GraphQL 接口请求题目元数据。LeetCode 请求可能使用浏览器已有的站点会话，扩展不读取或保存 LeetCode 密码或认证 Cookie。

AI 是可选功能。用户选定服务、输入自己的密钥并授权对应 HTTPS 域名后：

- 点击“测试连接”会向该接口发送短测试消息、模型参数和认证密钥，不发送题目或代码。
- 点击发送分析会将所选代码快照、语言、题目标题、题目链接、难度、模型参数和分析指令发送至所选接口；API Key 作为请求认证信息发送至该接口。
- 不在分析请求中附带笔记、图片、整个收藏库或 LeetCode 账号凭据。

所有 AI 请求使用 HTTPS，直接由浏览器连接所选服务商，不经过 CodeVault 服务器。不使用 AI 时不会发起 AI 请求。取消分析会尝试终止请求，但不能撤回服务商已收到的数据。服务商能够看到请求及网络连接信息（如 IP 地址），可能收费，其数据留存和后续处理由该服务商的政策及用户账户设置决定，CodeVault 不能代替服务商删除数据。

预设服务商政策：[DeepSeek](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)、[OpenAI](https://openai.com/policies/privacy-policy/)、[Anthropic](https://www.anthropic.com/legal/privacy)。自定义接口的运营者、政策和可信程度由用户自行选择和核实。

## 可选云同步（v0.4.0公测）

v0.4.0允许选择HTTPS后端，默认服务为开放邮箱登录的云同步公测，使用Cloudflare Workers、D1及私有R2存储，验证码由Resend发送。请求邮箱验证码会将邮箱发送给所选服务及其邮件供应商；验证成功会在该服务建立独立账号。登录本身不会上传知识库。用户须明确确认账号绑定及上传授权，才会同步已保存题目、代码、笔记、图片、分析、回收站及迁移备份；不发送AI配置、API Key或未保存草稿。云同步不是端到端加密，所选服务运营者能够处理同步内容，邮件/存储供应商也按其职责处理相关数据；请选择可信服务。

服务保存邮箱、验证码的加密校验值、会话令牌哈希及按密钥哈希处理的限流标识，CodeVault数据库不持久保存明文验证码或登录令牌。邮件供应商可能按其政策保留发信记录与邮件内容。扩展在本机保存登录令牌、同步基线、待发送队列和冲突归档，没有额外的静态加密；这些内容不包含在手动知识库备份中。冲突导出文件另含双方完整内容与图片，未加密，请妥善保管。

用户可暂停自动同步或退出账号，本机内容继续保留。离线退出不保证服务端令牌已撤销，界面会说明；会话最长30天有效。切换账号不会自动清空本机知识库，重新绑定前会提示旧账号留存内容可能上传到新账号。云端删除使用版本标记防止旧设备静默恢复。清除云端账号需近期登录和再次明确确认；设置页已提供入口。清除结果待确认时暂停同步，可重试或验证账号仍存在后取消。退出或清号后仍可导出本机冲突归档。

云端账号清除会立即撤销访问并排队删除私有图片；实际图片清理依赖定时任务和存储成功响应，不承诺请求结束时已物理删除。回收站保留图片引用，未引用图片有24小时宽限期，未完成上传约15分钟后进入清理。过期会话、验证码校验值和到期限流标识由定时任务清理，限流标识窗口最长一天。扩展内退出、删除或卸载不会自动删除已经导出的备份文件。

新增alarms权限用于后台同步检查和失败重试，不用于读取网页或发送通知。界面会按需申请所选HTTPS服务的站点访问权限；撤销该权限会停止相关请求。

## 分享和限制使用

未启用可选云同步时，开发者不通过扩展接收本地知识库；API Key 不参与云同步，不出售用户数据，不将其用于广告、信用评估或无关用途。用户主动启用 AI 时，向其选择的服务商传输上述必要数据，仅为完成连接测试或解法分析。

CodeVault 对用户数据的使用遵守 Chrome Web Store User Data Policy，包括 Limited Use 要求：仅为公开说明的用户功能使用数据，不为广告出售或转移数据，不允许开发者人员通过扩展查看用户的本地内容。用户主动在支持渠道公开提交的信息由该渠道的平台处理；请勿在公开反馈中提交密钥或私人代码。

## 保留、控制与删除

已保存内容会保留在本机，直到用户修改、删除相关记录或清除扩展存储。可编辑笔记、删除单个解法、删除笔记图片，并在设置页清除 AI 配置；清除配置不会删除服务商账户或撤销其已收到的数据。旧版笔记迁移保留只读原文和附件备份，因此删除当前文字或图片不保证同时清除迁移备份。

v0.3.0提供题目回收站：移入回收站仅隐藏收藏入口，全部关联内容继续保留在本机，且不自动清空。恢复保留原内容；确认永久删除会移除题目标题、来源信息、解法、分析、笔记、图片及迁移备份。为阻止旧页面的延迟保存，继续保留最小题目ID/删除标记及不含文字图片的笔记版本标记，直到清除扩展存储；这些标记不出现在知识库备份中。

v0.2.0 尚不提供完整题库清空、单题删除或数据导出界面。v0.3.0提供用户主动的本地JSON备份导出/合并导入：包含已保存的题目（含回收站）、解法、分析、笔记、图片及迁移备份，不包含AI配置或API Key，文件不经服务器传输。备份文件未加密，保存位置由用户选择，用户可通过文件管理器删除；导入保留现有内容，之前永久删除的内容可通过用户确认导入已有备份恢复。扩展内删除不会自动删除已导出的文件。

若要彻底清除本机扩展数据，可卸载扩展或通过浏览器扩展开发工具清除该扩展来源的存储；这会丢失本地知识库。支持备份的版本可用此前保存的文件恢复。仅禁用扩展不等于删除数据；卸载不会同时删除用户导出的备份文件。操作系统或浏览器外部备份不由 CodeVault 管理。

## 联系与政策更新

问题、隐私请求与反馈：[CodeVault GitHub Issues](https://github.com/Tosidxyy/CodeVault/issues)。如果请求涉及敏感内容，请先提交不含敏感数据的说明以协商后续处理方式。

行为变化时会同步更新本政策及生效日期。基础功能不要求提供姓名、电子邮箱、支付信息或精确位置；请避免在代码、笔记及图片中包含不希望被保存或发送的信息。

## English summary

Version 0.4.0 optionally connects to a user-configured HTTPS backend. Email-code login sends your address to that service and its mail provider; login alone does not upload the library. Explicit account-binding consent enables synchronization of saved library content, images, trash and legacy backups, excluding API keys and AI settings. Cloud sync is not end-to-end encrypted; the chosen operator can process the content. Tokens, baselines, pending work and conflict archives stay in extension storage without extra at-rest encryption and are excluded from ordinary backups. Signing out keeps local data; offline server revocation may be unconfirmed. Switching accounts needs consent and may upload content retained from the prior account. Server sessions expire after 30 days. Cloud account deletion revokes access and queues private image cleanup; physical deletion is eventual. The settings page provides deletion with recent-login confirmation; unconfirmed deletion pauses sync until retried or verified as canceled. Local conflict archives can still be exported after logout/deletion. The default backend is a public beta accepting email-code sign-in using Cloudflare Workers, D1 and private R2, with Resend for verification mail; sign-in and library upload require user action and explicit upload consent.


The interface language preference is stored locally. It controls interface text and the requested language of new AI analyses; existing user content is unchanged.

Version 0.3.0 include a local problem recycle bin. Moving a problem there retains associated solutions, analyses, notes, images and legacy backups; the bin does not automatically empty. Confirmed permanent deletion removes those contents, retaining only minimal problem/deletion identifiers and empty note revision markers to prevent stale pages from saving deleted drafts. These markers are omitted from library backups. User-selected backup files may restore deleted content and are not removed by in-extension deletion. Exports include recycle-bin content and exclude AI settings and keys.

CodeVault stores your LeetCode bookmarks, solution snapshots, notes, images and saved analyses locally in the extension's IndexedDB. It also processes the current LeetCode URL and stores recent visits to saved problems for navigation; it does not read your general browser history. Local features require no CodeVault account. Version 0.4.0 offers optional public-beta cloud sync; no advertising or telemetry SDK is deployed.

Optional AI settings, including your API key, are stored locally without additional at-rest encryption. A user-triggered connection test sends a short message and authentication to the selected HTTPS endpoint. A user-triggered analysis sends the selected code, language, problem title, URL and difficulty, along with model parameters, instructions and API authentication. Notes, images, the full library and LeetCode credentials are not attached. Requests go directly to the chosen provider, which may charge and retain data under its own policies. Cancellation cannot recall data already received.

Data is used only for the stated user-facing features, consistent with the Chrome Web Store User Data Policy, including Limited Use requirements. Without optional cloud sync, the developer does not receive local library data. Data is not sold; an explicitly selected cloud operator processes synchronized content as described above. You can clear AI settings, edit notes or delete solutions/images; migrated legacy note backups may remain until extension storage is cleared. Removing the extension or clearing its origin storage removes the local library. Disabling it does not delete data. Version 0.2.0 has no export UI. Version 0.3.0 and later support user-triggered local JSON export/import of saved library data, including legacy notes, excluding API keys and AI settings. Files are unencrypted and never uploaded by CodeVault; imports preserve existing records. Uninstalling does not remove exported files. Contact: https://github.com/Tosidxyy/CodeVault/issues .


公测与第三方：默认服务为 https://codevault-api.guidy.fun ，由项目开发者运营，使用Cloudflare Workers/D1/私有R2与Resend处理上述同步和验证码数据。服务可能受容量、频率及供应商额度限制；不会因升级自动登录或上传。邮件供应商可能按自身政策保留邮件记录/内容。服务商政策：[Cloudflare](https://www.cloudflare.com/privacypolicy/)、[Resend](https://resend.com/legal/privacy-policy)。本机知识库备份与冲突归档均未加密；清除云账号不会自动删除本机或已导出文件。

The default public-beta endpoint is https://codevault-api.guidy.fun, operated by the project developer using Cloudflare Workers/D1/private R2 and Resend for the described data processing. Provider capacity/rate limits may affect availability. Updating never automatically signs in or uploads data. The mail provider may retain email records/content under its own policy. Local library backups and conflict exports are unencrypted; deleting the cloud account does not delete local copies or previously exported files.
