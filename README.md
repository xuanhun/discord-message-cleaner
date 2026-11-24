# Discord 消息清理 · Discord Message Cleaner

[简体中文](#简体中文) · [English](#english) · [Chrome 网上应用店 / Chrome Web Store](https://chromewebstore.google.com/detail/ehcpmbdfbhnajhmfdfhfefcjikcnjlph)

## 简体中文

用于 Discord 网页版的 Chrome 扩展。打开文字频道、私信或群聊后，网页右侧会自动显示悬浮按钮，点击即可展开或收起清理面板。你可以扫描聊天历史、按条件筛选消息，再预览并选择要删除的消息。

### 安装

#### 从 Chrome 网上应用店安装

1. 在桌面版 Chrome 中打开 [Discord 消息清理的商店页面](https://chromewebstore.google.com/detail/ehcpmbdfbhnajhmfdfhfefcjikcnjlph?hl=zh-CN)。
2. 点击 **添加至 Chrome**，在浏览器提示中选择 **添加扩展程序**。
3. 打开或刷新 [Discord 网页版](https://discord.com/channels/@me)，进入一个文字频道、私信或群聊，然后点击右侧的悬浮按钮。也可从 Chrome 工具栏打开清理面板。

商店版已公开发布。如果无法从商店安装，也可加载 [商店版源码](https://github.com/xuanhun/discord-message-cleaner/tree/chrome-web-store)。[Chrome 官方扩展安装帮助](https://support.google.com/chrome/answer/2664769?hl=zh-Hans)

#### 从 GitHub 源码安装或更新

1. 打开 [本地批量版源码](https://github.com/xuanhun/discord-message-cleaner/tree/main)，在 GitHub 上选择 **Code → Download ZIP** 并解压。加载本地版前，在 Chrome 的扩展程序页暂停已安装的商店版，避免重复加载面板。
2. 在 Chrome 地址栏输入 `chrome://extensions/`，开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择包含 `manifest.json` 的目录。
4. 打开或刷新 Discord 网页版，点击右侧悬浮按钮。更新时，下载最新源码并替换原目录文件，然后在扩展程序管理页点击 **重新加载**，再刷新 Discord。

### 筛选和删除

1. 在 **聊天范围** 选择 **当前聊天** 或 **私信和群聊**。点 **扫描聊天历史** 读取当前聊天，或点 **扫描所有私信** 依次扫描 Discord 当前列出的私信和群聊。扫描过程中可以停止。
2. 从 **发送者** 下拉框选择发送者，或手动输入完整显示名或用户 ID。同名时，列表会显示可识别的 ID。**高级筛选** 支持关键词、正则表达式、日期、消息类型和处理顺序。日期按浏览器本地时间计算，包含起止两日。
3. 预览结果，勾选消息，或点击 **全选匹配** 将当前匹配结果加入队列。更改筛选条件会清空已有选择。也可以用 **快速点选** 直接选中一条消息。
4. 按安装方式操作：

   | 版本 | 删除方式 |
   | --- | --- |
   | Chrome 网上应用店版（v0.5.1） | 单选后点击 **打开删除确认**。多选后点击 **逐条确认剩余 N 条**。每次在 Discord 原生对话框确认后，扩展会打开下一条的确认框。 |
   | GitHub 本地批量版（v0.5.2） | 单选时点击 **打开删除确认**。多选时点击 **批量删除 N 条**，核对会话和数量后确认一次。扩展会依次点击 Discord 的删除按钮。点击 **停止** 或按 `Esc` 可中止后续操作，已发出的删除仍可能完成。 |

服务器中删除他人消息需要 Discord 的 **管理消息** 权限。本地批量版遇到没有删除选项、无法核对对话框或无法检测到删除结果时会暂停，保留尚未处理的选择。Discord 禁止自动化普通账号，违规可能导致账号停用。[Discord 账号自动化规则](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)

面板会提示扫描是否到达聊天开头。如果 Discord 暂停加载，可重新扫描，或手动滚动后点击 **刷新已加载**。扩展通过 Discord 网页读取历史，并尝试为移出视口的队列消息定位原来的位置。

### 隐私和商店资料

消息、筛选条件和队列在当前 Discord 标签页的内存中处理。收起面板后可以继续使用，刷新页面或关闭标签页会清空这些数据。商店版面板目前为简体中文。

- [中英文隐私政策](https://discord-message-cleaner-privacy-xuanhun.xuanhun9.chatgpt.site)
- [简体中文商店说明](store/zh-CN.txt) · [英文商店说明](store/en.txt) · [仓库内隐私政策](store/privacy.html)

## English

A Chrome extension for Discord on the web. Open a text channel, direct message, or group chat and use the floating button on the right to show or hide the cleaner. Scan chat history, filter messages, and preview your selection before deleting anything.

### Installation

#### Install from the Chrome Web Store

1. In desktop Chrome, open the [Discord Message Cleaner store listing](https://chromewebstore.google.com/detail/ehcpmbdfbhnajhmfdfhfefcjikcnjlph?hl=en).
2. Select **Add to Chrome**, then choose **Add extension** in the Chrome prompt.
3. Open or refresh [Discord on the web](https://discord.com/channels/@me), enter a text channel, direct message, or group chat, and select the floating button on the right. You can also open the cleaner from the Chrome toolbar.

The store edition is publicly available. If **Add to Chrome** is unavailable, you can load the [store edition from source](https://github.com/xuanhun/discord-message-cleaner/tree/chrome-web-store). [Chrome's extension installation help](https://support.google.com/chrome/answer/2664769?hl=en)

#### Install or update from GitHub source

1. Open the [local batch edition source](https://github.com/xuanhun/discord-message-cleaner/tree/main), choose **Code → Download ZIP**, and extract the archive. If the store edition is installed, disable it on Chrome’s Extensions page before loading the local edition so that only one panel runs.
2. Open `chrome://extensions/` in Chrome and turn on **Developer mode**.
3. Select **Load unpacked**, then select the directory containing `manifest.json`.
4. Open or refresh Discord on the web and select the floating button on the right. To update, replace the files in the original directory with the latest source, select **Reload** on the Extensions page, then refresh Discord.

### Filter and delete messages

1. Choose **Current chat** (当前聊天) or **DMs and group chats** (私信和群聊). Select **Scan chat history** (扫描聊天历史) for the open chat, or **Scan all DMs** (扫描所有私信) to scan the private conversations currently listed by Discord. You can stop an active scan.
2. Choose a sender from the dropdown or enter the full display name or user ID. Where available, IDs distinguish senders with the same name. Advanced filters include keywords, regular expressions, date range, message type, and processing order. The date range is inclusive and uses your browser's local time.
3. Preview the matches and select messages individually, or choose **Select all matches** (全选匹配) to queue the current matching results. Changing filters clears the selection. **Quick select** (快速点选) lets you pick a message directly.
4. Follow the steps for your edition:

   | Edition | How to delete |
   | --- | --- |
   | Chrome Web Store (v0.5.1) | Select one message and choose **Open delete confirmation** (打开删除确认), or select several and choose **Confirm remaining messages one by one** (逐条确认剩余 N 条). After each confirmation in Discord's dialog, the extension opens the next one. |
   | GitHub local batch edition (v0.5.2) | For one message, choose **Open delete confirmation** (打开删除确认). For multiple messages, choose **Batch delete N messages** (批量删除 N 条), review the chat scope and count, and confirm once. The extension clicks Discord's delete buttons in sequence. Select **Stop** (停止) or press `Esc` to stop subsequent actions. A deletion already sent may still complete. |

Deleting someone else's message in a server requires Discord's **Manage Messages** permission. The local batch edition pauses if the delete option is unavailable, it cannot verify the dialog, or it cannot observe the deletion result. Unprocessed messages remain selected. Discord prohibits automating ordinary user accounts and may terminate accounts for violations. [Discord's account automation rules](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)

The panel indicates whether a scan reached the start of the conversation. If Discord pauses loading, try scanning again or scroll manually and choose **Refresh loaded messages** (刷新已加载). The extension reads history from the Discord web page and tries to locate queued messages that have scrolled out of view.

### Privacy and store materials

Message data, filters, and the queue are processed in memory in the current Discord tab. They remain available when you collapse the panel and are cleared when you refresh or close the tab. The store edition's in-page panel currently uses Simplified Chinese.

- [Privacy policy in English and Simplified Chinese](https://discord-message-cleaner-privacy-xuanhun.xuanhun9.chatgpt.site)
- [English store listing copy](store/en.txt) · [Simplified Chinese store listing copy](store/zh-CN.txt) · [Privacy policy in this repository](store/privacy.html)
