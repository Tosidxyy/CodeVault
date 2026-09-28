# Reviewer instructions — CodeVault 0.2.0

## Basic features (no CodeVault account or AI key required)

1. Install the extension and open https://leetcode.cn/problems/two-sum/ or https://leetcode.com/problems/two-sum/ . If the site requests login or human verification, complete it through the site's normal flow. CodeVault does not bypass those checks.
2. Click the CodeVault icon at the bottom right. The initial library may be empty. Select “查看当前题目 →” (View current problem), then “收藏题目” (Bookmark problem).
3. Select Python in the site's editor. Enter the sample below without running or submitting it. Hover over the editor, select “添加至 CodeVault”, then save a solution. A blank solution name is allowed and generates a default name.
4. Change the editor contents. Select “加载到编辑器” (Load into editor) on the saved solution and confirm replacement. Verify that the saved code is restored; Ctrl+Z should undo the replacement. The site's editor language must match the saved solution language.
5. In the note field, type a short sentence and wait for “已保存” (Saved). Upload a small PNG/JPEG/WebP image. Verify that it appears below the single text field, opens centered when clicked, closes with Escape, and offers a delete × on hover/focus. Delete it and use the short-lived undo action if desired.
6. Return to the library, search for the saved problem or solution name, and open it again. Reload the page and confirm that the solution and note remain available. The toolbar popup also displays the library.

```python
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, value in enumerate(nums):
            if target - value in seen:
                return [seen[target - value], i]
            seen[value] = i
```

Standard article capture can be checked on a normal solution article with a pre/code block under the same problem's /solution/ or /solutions/ path. Hover over that code block and save it as a reference solution. Nonstandard virtualized article widgets and contest-specific URLs are outside this release's scope.

## Optional AI features

1. Open settings from the panel or popup. Select DeepSeek, OpenAI or Anthropic Claude, or use Custom with a compatible HTTPS Chat Completions endpoint. The provider account and API key belong to the tester; no key is bundled. Basic features do not depend on AI setup.
2. Enter a valid API key and choose an available model. Select “测试连接” (Test connection) and approve access to the selected API origin if prompted. Testing sends only a short message and may incur provider fees. It does not save the configuration.
3. Select “授权并保存” (Authorize and save). Return to the problem, select a saved solution as the analysis target, read the snapshot summary, then explicitly send it. The chosen provider receives the code, language, title, URL and difficulty, plus model/instruction parameters and API authentication; notes and images are not attached.
4. Verify incremental Markdown output and “停止生成” (Stop generating). A stopped or incomplete response cannot be saved. A completed response for a saved solution can be stored using “保存分析” (Save analysis); review it by expanding that solution. Replacing a saved analysis requires confirmation.
5. Clear the AI configuration in settings. The saved key is not displayed back in the UI. Clearing configuration does not delete data already received by the provider.

If the review team requires a developer-provided test credential, the publisher must supply a temporary restricted credential through the dashboard's private test-instructions field; this repository contains none. Do not publish API keys in listing text, screenshots or GitHub issues.

## Implementation notes

- Manifest V3, packaged JavaScript only. No remotely hosted executable code.
- Required site access is limited to leetcode.cn and leetcode.com. Optional HTTPS access supports an existing custom API endpoint setting; runtime permission is requested for the specific chosen origin only.
- Persistent data uses extension-origin IndexedDB; navigation state uses chrome.storage.session. No backend, telemetry, ads or cloud synchronization.
- AI requests use HTTPS, omit browser credentials and reject redirects. Responses are treated as data, with no HTML execution or external-image loading.
- LeetCode metadata/editor availability depends on the host site. CodeVault does not run code, submit solutions or claim correctness.

## Publisher validation record

The v0.2.0 automated suite passed 26 tests using isolated Edge/Chromium extension profiles and mocked AI responses. Chinese-site metadata, bookmarking, code save/load/undo and uploaded note-image persistence were checked on the live site. International-site metadata and bookmarking were checked; live editor verification was blocked by the site's human-verification challenge. Real paid-provider AI and operating-system clipboard tests remain manual checks. This record is not a claim of completed Chrome Web Store review.
