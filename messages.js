var discordMessageCleanerPage = (() => {
  const rowSelector = 'li[id^="chat-messages-"]';
  const dialogSelector = '[role="dialog"], [role="alertdialog"]';
  const dmHomeSelector = '[data-list-item-id="guildsnav___home"]';

  function chat() {
    const parts = location.pathname.match(/^\/channels\/(@me|\d+)(?:\/(\d+)(?:\/\d+)?)?\/?$/);
    if (location.origin !== 'https://discord.com' || !parts || (parts[1] !== '@me' && !parts[2])) return null;
    const [, guild, id] = parts;
    const title = id && document.querySelector('h1')?.textContent.trim();
    return { guild, id, title: title || (id ? '当前聊天' : '私信 · 群聊') };
  }

  function getMessage(row, channel) {
    const parts = row.id.match(/^chat-messages-(\d+)-(\d+)$/);
    const article = row.querySelector('[role="article"]');
    if (!article || !channel?.id || !parts) return null;
    const [, channelId, id] = parts;
    if (channelId !== channel.id || channelId === id) return null;

    const authorLabel = article.getAttribute('aria-labelledby')?.split(/\s+/)
      .find((label) => /^message-username-\d+$/.test(label));
    const authorNode = document.getElementById(authorLabel ?? `message-username-${id}`);
    const author = authorNode?.querySelector('[role="button"], button')?.textContent.trim() ||
      authorNode?.textContent.trim() || '';
    // Grouped messages refer back to the header and avatar of the first row.
    const authorArticle = authorNode?.closest('[role="article"]');
    const avatar = authorArticle?.querySelector('img[src*="/avatars/"]');
    const authorId = avatar?.getAttribute('src')?.match(/\/avatars\/(\d+)\//)?.[1] || '';
    const text = article.querySelector(`#message-content-${id}`)?.textContent.trim() || '';
    const media = Boolean(article.querySelector(
      `#message-accessories-${id} :is(img, video, audio, iframe, a[href*="/attachments/"])`,
    ));
    const timestamp = Date.parse(article.querySelector(`time#message-timestamp-${id}`)?.dateTime);
    return { id, channelId, guild: channel.guild, channelTitle: channel.title, author, authorId, text, media, timestamp };
  }

  function readChat(channel) {
    if (!channel?.id) return [];
    return Array.from(document.querySelectorAll(rowSelector), (row) => getMessage(row, channel)).filter(Boolean);
  }

  function filterMessages(messages, { author, query, regex, from, to, type, order }) {
    const normalize = (value) => value.trim().replace(/^@/, '').toLocaleLowerCase();
    const sender = normalize(author);
    const literal = query.toLocaleLowerCase();
    const pattern = regex && query ? new RegExp(query, 'iu') : null;
    const lower = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = to ? new Date(`${to}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1);
    const upper = end?.getTime() ?? Infinity;
    if (lower >= upper) throw new Error('开始日期必须早于或等于结束日期。');

    return messages.filter((message) => {
      if (sender && normalize(message.author) !== sender && message.authorId !== sender) return false;
      if (pattern ? !pattern.test(message.text) : !message.text.toLocaleLowerCase().includes(literal)) return false;
      if ((from || to) && !(message.timestamp >= lower && message.timestamp < upper)) return false;
      if (type === 'media') return message.media;
      if (type === 'text') return Boolean(message.text) && !message.media;
      return true;
    }).sort((a, b) => {
      // Discord message IDs are decimal snowflakes of up to 20 digits.
      const byId = a.id.length - b.id.length || a.id.localeCompare(b.id);
      return order === 'oldest' ? byId : -byId;
    });
  }

  function dmEntries() {
    const entries = new Map();
    for (const link of document.querySelectorAll('a[href^="/channels/@me/"], [data-list-item-id^="private-channels-"]')) {
      const id = link.getAttribute('href')?.match(/^\/channels\/@me\/(\d+)\/?$/)?.[1] ||
        link.getAttribute('data-list-item-id')?.match(/___(\d+)$/)?.[1];
      if (id && !entries.has(id)) entries.set(id, link);
    }
    return entries;
  }

  async function waitFor(find, signal, timeout = 2000) {
    const deadline = Date.now() + timeout;
    while (!signal.aborted) {
      const result = find();
      if (result || Date.now() >= deadline) return result;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return null;
  }

  function rowFor(message) {
    return document.getElementById(`chat-messages-${message.channelId}-${message.id}`);
  }

  async function openDelete(message, signal) {
    if (signal.aborted) return 'interrupted';
    if (chat()?.id !== message.channelId) return 'wrong-chat';
    if (document.querySelector(`#message[role="menu"], ${dialogSelector}`)) return 'busy';
    const row = rowFor(message);
    const article = row?.querySelector('[role="article"]');
    if (!article) return 'unloaded';

    row.scrollIntoView({ block: 'nearest' });
    const content = article.querySelector(`#message-content-${message.id}`) || article;
    const rect = content.getBoundingClientRect();
    let shiftPressed = false;
    const detectShift = (event) => { if (event.shiftKey) shiftPressed = true; };
    document.addEventListener('keydown', detectShift, true);
    let menu;
    try {
      content.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, button: 2, view: window,
        clientX: Math.max(0, rect.x + Math.min(20, rect.width / 2)),
        clientY: Math.max(0, rect.y + Math.min(20, rect.height / 2)),
      }));
      menu = await waitFor(() => document.querySelector('#message[role="menu"]'), signal, 1000);
    } finally {
      document.removeEventListener('keydown', detectShift, true);
    }
    if (signal.aborted || shiftPressed || chat()?.id !== message.channelId || !article.isConnected) return 'interrupted';
    if (!menu) return 'menu-missing';

    const action = menu.querySelector('#message-delete[role="menuitem"]:not([aria-disabled="true"])');
    if (!action) {
      return 'unavailable';
    }

    // This opens Discord's confirmation. The extension does not click its final button.
    action.click();
    const dialog = await waitFor(() => document.querySelector(dialogSelector), signal, 1500);
    if (!dialog) return rowFor(message) ? 'dialog-missing' : 'removed';
    await waitFor(() => !dialog.isConnected || chat()?.id !== message.channelId, signal, Infinity);
    if (signal.aborted || chat()?.id !== message.channelId) return 'interrupted';
    const removed = await waitFor(() => !rowFor(message), signal, 2000);
    return removed ? 'removed' : 'unchanged';
  }

  return {
    rowSelector, dmHomeSelector, chat, getMessage, readChat, filterMessages, dmEntries, waitFor, openDelete,
  };
})();
