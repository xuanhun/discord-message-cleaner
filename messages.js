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

  function normalizeSender(value) {
    return value.trim().replace(/^@/, '').toLocaleLowerCase();
  }

  function senderChoices(messages) {
    const choices = new Map();
    for (const { author, authorId } of messages) {
      if (!author && !authorId) continue;
      const value = authorId ? 'id:' + authorId : 'name:' + author;
      const previous = choices.get(value);
      choices.set(value, { value, label: author || previous?.label || authorId, authorId });
    }

    const countByName = new Map();
    for (const { label } of choices.values()) {
      const name = normalizeSender(label);
      countByName.set(name, (countByName.get(name) ?? 0) + 1);
    }
    return [...choices.values()].map(({ value, label, authorId }) => {
      if (countByName.get(normalizeSender(label)) === 1) return { value, label };
      const suffix = authorId ? 'ID ' + authorId : '按显示名';
      return { value, label: label + ' · ' + suffix };
    }).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }

  function filterMessages(messages, { author, authorMode, query, regex, from, to, type, order }) {
    const sender = normalizeSender(author);
    const literal = query.toLocaleLowerCase();
    const pattern = regex && query ? new RegExp(query, 'iu') : null;
    const lower = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = to ? new Date(`${to}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1);
    const upper = end?.getTime() ?? Infinity;
    if (lower >= upper) throw new Error('开始日期必须早于或等于结束日期。');

    return messages.filter((message) => {
      if (sender) {
        const byId = authorMode !== 'name' && message.authorId === sender;
        const byName = authorMode !== 'id' && normalizeSender(message.author) === sender;
        if (!byId && !byName) return false;
      }
      if (pattern ? !pattern.test(message.text) : !message.text.toLocaleLowerCase().includes(literal)) return false;
      if ((from || to) && !(message.timestamp >= lower && message.timestamp < upper)) return false;
      if (type === 'media') return message.media;
      if (type === 'text') return Boolean(message.text) && !message.media;
      return true;
    }).sort((a, b) => {
      // Discord message IDs are decimal snowflakes of up to 20 digits.
      const byId = compareIds(a.id, b.id);
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

  function hasChatRows(channelId) {
    return Boolean(document.querySelector(`li[id^="chat-messages-${channelId}-"] [role="article"]`));
  }

  function compareIds(a, b) {
    return a.length - b.length || a.localeCompare(b);
  }

  function isDeleteButton(button) {
    return /^(删除|刪除|Delete)$/i.test(button.textContent.trim()) ||
      [...button.classList].some((name) => name.startsWith('critical-primary_'));
  }

  async function waitForDismissal(dialog, message, signal) {
    let intent;
    const trackButton = (event) => {
      const button = event.target.closest?.('button');
      if (!button) return;
      const classes = [...button.classList];
      const label = button.textContent.trim();
      if (isDeleteButton(button)) {
        intent = 'confirm';
      } else if (/^(取消|Cancel)$/i.test(label) || classes.some((name) => /^(secondary|icon-only)_/.test(name))) {
        intent = 'cancel';
      }
    };
    const trackEscape = (event) => {
      if (event.key === 'Escape' && intent !== 'confirm') intent = 'cancel';
    };
    dialog.addEventListener('click', trackButton, true);
    document.addEventListener('keydown', trackEscape, true);
    try {
      await waitFor(() => !dialog.isConnected || chat()?.id !== message.channelId, signal, Infinity);
    } finally {
      dialog.removeEventListener('click', trackButton, true);
      document.removeEventListener('keydown', trackEscape, true);
    }
    if (signal.aborted || chat()?.id !== message.channelId) return 'interrupted';
    if (intent === 'cancel') return 'cancelled';
    const removed = await waitFor(() => !rowFor(message), signal, 2000);
    if (signal.aborted || chat()?.id !== message.channelId) return 'interrupted';
    return removed ? 'removed' : 'unchanged';
  }

  async function confirmNativeDelete(dialog, message, signal) {
    if (signal.aborted || chat()?.id !== message.channelId) return 'interrupted';
    // Discord's preview uses the same ID as the original message. Text can be duplicated.
    const target = dialog.querySelector(`[id="message-content-${message.id}"], [id="message-accessories-${message.id}"]`);
    const buttons = [...dialog.querySelectorAll('button')].filter((button) =>
      !button.disabled && button.getAttribute('aria-disabled') !== 'true' &&
      button.getClientRects().length && isDeleteButton(button),
    );
    if (!target || buttons.length !== 1) return 'unverified';

    buttons[0].click();
    // A stop request prevents new deletions. Observe this already-dispatched action for the summary.
    const observed = await waitFor(() => {
      if (chat()?.id !== message.channelId) return 'wrong-chat';
      if (!dialog.isConnected && !rowFor(message)) return 'removed';
    }, new AbortController().signal, 3500);
    return observed || 'unchanged';
  }

  async function dismissMessageMenu(signal) {
    const find = () => document.querySelector('#message[role="menu"]');
    const menu = find();
    if (!menu) return true;
    menu.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    }));
    return Boolean(await waitFor(() => !find(), signal, 700));
  }

  async function openDelete(message, signal, { automatic = false } = {}) {
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

    action.click();
    const dialog = await waitFor(() => document.querySelector(dialogSelector), signal, 1500);
    if (signal.aborted) return 'interrupted';
    if (!dialog) return automatic || rowFor(message) ? 'dialog-missing' : 'removed';
    if (automatic) return confirmNativeDelete(dialog, message, signal);
    return waitForDismissal(dialog, message, signal);
  }

  return {
    rowSelector, dmHomeSelector, chat, getMessage, readChat, senderChoices, filterMessages, dmEntries,
    waitFor, rowFor, hasChatRows, compareIds, openDelete, dismissMessageMenu,
  };
})();
