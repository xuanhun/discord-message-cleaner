(() => {
  const page = discordMessageCleanerPage;
  if (!page.chat()) return false;

  const panelId = 'discord-message-cleaner-picker';
  const existingPanel = document.getElementById(panelId);
  if (existingPanel) {
    if (!existingPanel.hidden) existingPanel.querySelector('[data-close]').focus();
    else document.getElementById('discord-message-cleaner-quick')?.click();
    return true;
  }

  const panel = document.createElement('aside');
  panel.id = panelId;
  panel.setAttribute('aria-label', 'Discord 消息清理');
  panel.innerHTML = `
    <header class="dmc-heading">
      <div><h2>消息清理</h2><p data-chat></p></div>
      <button type="button" data-close aria-label="关闭清理面板">关闭</button>
    </header>
    <form data-filters>
      <fieldset>
        <div class="dmc-grid">
          <label>聊天范围<select name="scope"><option value="current">当前聊天</option><option value="dm">私信和群聊</option></select></label>
          <label>发送者<input name="author" list="dmc-authors" placeholder="全部，或填入显示名 / ID"></label>
        </div>
        <datalist id="dmc-authors"></datalist>
        <details>
          <summary>高级筛选</summary>
          <label>消息内容<input name="query" maxlength="200" placeholder="输入关键词或正则表达式"></label>
          <label class="dmc-check"><input name="regex" type="checkbox">使用正则表达式</label>
          <div class="dmc-grid">
            <label>开始日期<input name="from" type="date"></label>
            <label>结束日期<input name="to" type="date"></label>
            <label>消息类型<select name="type"><option value="any">全部类型</option><option value="media">含媒体或附件</option><option value="text">纯文本</option></select></label>
            <label>处理顺序<select name="order"><option value="newest">最新优先</option><option value="oldest">最早优先</option></select></label>
          </div>
        </details>
        <div class="dmc-actions">
          <button type="button" data-scan>读取当前聊天</button>
          <button type="button" data-dm hidden>扫描私信列表</button>
          <button type="submit" data-apply>应用筛选</button>
        </div>
      </fieldset>
    </form>
    <section class="dmc-preview" aria-label="候选消息">
      <div class="dmc-preview-heading"><strong data-count></strong><button type="button" data-select-all>全选匹配</button></div>
      <ul data-results></ul>
      <div class="dmc-pagination" hidden><button type="button" data-prev>上一页</button><span data-page></span><button type="button" data-next>下一页</button></div>
    </section>
    <p class="dmc-status" data-status role="status"></p>
    <footer class="dmc-actions">
      <button type="button" data-quick>快速点选</button>
      <button type="button" data-stop hidden>停止扫描</button>
      <button type="button" data-skip disabled>跳过本条</button>
      <button type="button" data-process class="dmc-primary">处理下一条</button>
    </footer>
  `;
  document.body.append(panel);

  const find = (selector) => panel.querySelector(selector);
  const form = find('[data-filters]');
  const fields = form.elements;
  const status = find('[data-status]');
  const results = find('[data-results]');
  const processButton = find('[data-process]');
  const skipButton = find('[data-skip]');
  const scanButton = find('[data-scan]');
  const dmButton = find('[data-dm]');
  const quickButton = find('[data-quick]');
  const stopButton = find('[data-stop]');
  const selectAll = find('[data-select-all]');
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
  const lifetime = new AbortController();
  const records = new Map();
  const selected = new Set();
  const pageSize = 16;
  let matches = [];
  let pageIndex = 0;
  let busy = false;
  let operation;
  let activeChat = page.chat();
  let quickStatus;

  find('[data-close]').addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  fields.scope.addEventListener('change', () => applyFilters());
  scanButton.addEventListener('click', () => {
    readCurrent();
    applyFilters();
  });
  dmButton.addEventListener('click', () => run(scanDirectMessages, true));
  stopButton.addEventListener('click', () => operation?.abort());
  processButton.addEventListener('click', (event) => {
    if (event.shiftKey) return;
    const message = matches.find((candidate) => selected.has(candidate.id));
    if (message) run((signal) => processMessage(message, signal));
  });
  skipButton.addEventListener('click', () => {
    const message = matches.find((candidate) => selected.has(candidate.id));
    if (!message) return;
    selected.delete(message.id);
    status.textContent = '已跳过一条消息。';
    render();
  });
  quickButton.addEventListener('click', startQuickSelect);
  selectAll.addEventListener('click', () => {
    const clear = matches.length > 0 && matches.every((message) => selected.has(message.id));
    for (const message of matches) {
      if (clear) selected.delete(message.id);
      else selected.add(message.id);
    }
    render();
  });
  find('[data-prev]').addEventListener('click', () => {
    pageIndex--;
    render();
  });
  find('[data-next]').addEventListener('click', () => {
    pageIndex++;
    render();
  });

  const navigation = setInterval(() => {
    const next = page.chat();
    if (!next) {
      close();
      return;
    }
    if (next.id !== activeChat.id || next.guild !== activeChat.guild) {
      activeChat = next;
      stopQuickSelect();
      if (!busy) applyFilters('已切换聊天。点击读取可加入这段对话当前加载的消息。');
    } else if (next.title !== activeChat.title) {
      activeChat = next;
      updateChatLabel();
    }
  }, 250);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && quickStatus) stopQuickSelect();
  }, { capture: true, signal: lifetime.signal });

  readCurrent();
  applyFilters();
  find('[data-close]').focus();
  return true;

  function close() {
    lifetime.abort();
    operation?.abort();
    clearInterval(navigation);
    stopQuickSelect();
    panel.remove();
  }

  function readCurrent() {
    const conversation = page.chat();
    if (!conversation?.id) return 0;
    const messages = page.readChat(conversation);
    for (const message of messages) records.set(message.id, message);
    return messages.length;
  }

  function updateChatLabel() {
    find('[data-chat]').textContent = page.chat()?.title ?? 'Discord';
  }

  function applyFilters(note = '目前仅预览已加载的消息。Discord 会在处理时检查删除权限。') {
    const conversation = page.chat();
    const scope = fields.scope.value;
    const pool = [...records.values()].filter((message) =>
      scope === 'dm' ? message.guild === '@me' : message.channelId === conversation?.id,
    );

    const authors = new Map();
    for (const message of pool) {
      if (message.author) authors.set(message.author, message.author);
      if (message.authorId) authors.set(message.authorId, message.author || message.authorId);
    }
    find('#dmc-authors').replaceChildren(...Array.from(authors, ([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      if (value !== label) option.label = label;
      return option;
    }));

    try {
      matches = page.filterMessages(pool, {
        author: fields.author.value,
        query: fields.query.value,
        regex: fields.regex.checked,
        from: fields.from.value,
        to: fields.to.value,
        type: fields.type.value,
        order: fields.order.value,
      });
      status.textContent = note;
    } catch (error) {
      matches = [];
      status.textContent = error instanceof SyntaxError ? '正则表达式格式有误，请修改后再试。' : error.message;
    }
    const matchingIds = new Set(matches.map((message) => message.id));
    for (const id of selected) {
      if (!matchingIds.has(id)) selected.delete(id);
    }
    pageIndex = 0;
    updateChatLabel();
    render();
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    dmButton.hidden = fields.scope.value !== 'dm';
    scanButton.disabled = busy || !page.chat()?.id;
    scanButton.textContent = fields.scope.value === 'dm' ? '加入当前私信' : '读取当前聊天';
    scanButton.hidden = fields.scope.value === 'dm' && page.chat()?.guild !== '@me';
    processButton.disabled = busy || !selected.size;
    skipButton.disabled = processButton.disabled;
    selectAll.disabled = busy || !matches.length;
    selectAll.textContent = matches.length && selected.size === matches.length ? '清空选择' : '全选匹配';
    quickButton.disabled = busy || !page.chat()?.id;
    find('[data-count]').textContent = selected.size
      ? '匹配 ' + matches.length + ' 条 · 已选 ' + selected.size + ' 条'
      : '匹配 ' + matches.length + ' 条';
    find('.dmc-pagination').hidden = totalPages === 1;
    find('[data-page]').textContent = (pageIndex + 1) + ' / ' + totalPages;
    find('[data-prev]').disabled = busy || pageIndex === 0;
    find('[data-next]').disabled = busy || pageIndex === totalPages - 1;
    const start = pageIndex * pageSize;
    results.replaceChildren(...matches.slice(start, start + pageSize).map(previewRow));
    if (!matches.length) {
      const empty = document.createElement('li');
      empty.className = 'dmc-empty';
      empty.textContent = '暂无匹配。可以调整筛选，或在 Discord 加载更多消息后再读取。';
      results.append(empty);
    }
  }

  function previewRow(message) {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(message.id);
    checkbox.disabled = busy;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(message.id);
      else selected.delete(message.id);
      processButton.disabled = !selected.size;
      skipButton.disabled = processButton.disabled;
      selectAll.textContent = selected.size === matches.length ? '清空选择' : '全选匹配';
      find('[data-count]').textContent = '匹配 ' + matches.length + ' 条 · 已选 ' + selected.size + ' 条';
    });
    const details = document.createElement('span');
    const meta = document.createElement('span');
    meta.className = 'dmc-meta';
    const date = Number.isFinite(message.timestamp) ? dateFormat.format(message.timestamp) : '';
    const room = fields.scope.value === 'dm' ? message.channelTitle : '';
    meta.textContent = [message.author || '未知发送者', room, date].filter(Boolean).join(' · ');
    const preview = document.createElement('span');
    preview.className = 'dmc-text';
    preview.textContent = message.text || (message.media ? '媒体或附件' : '无文本正文');
    details.append(meta, preview);
    label.append(checkbox, details);
    item.append(label);
    return item;
  }

  async function run(task, stoppable = false) {
    if (busy) return;
    stopQuickSelect();
    busy = true;
    operation = new AbortController();
    const { signal } = operation;
    find('fieldset').disabled = true;
    stopButton.hidden = !stoppable;
    render();
    try {
      await task(signal);
    } catch (error) {
      if (!signal.aborted) {
        console.warn('Discord 消息清理操作失败。', error);
        status.textContent = '操作未完成。请检查当前聊天并重试。';
      }
    } finally {
      busy = false;
      operation = undefined;
      if (!lifetime.signal.aborted) {
        panel.hidden = false;
        stopButton.hidden = true;
        find('fieldset').disabled = false;
        updateChatLabel();
        render();
      }
    }
  }

  async function openDmList(signal) {
    if (page.chat()?.guild === '@me') return true;
    document.querySelector(page.dmHomeSelector)?.click();
    return await page.waitFor(() => page.chat()?.guild === '@me', signal);
  }

  async function visitDm(channelId, signal) {
    if (page.chat()?.id === channelId) return true;
    if (!await openDmList(signal) || signal.aborted) return false;
    const entry = page.dmEntries().get(channelId);
    if (!entry) return false;
    entry.click();
    return await page.waitFor(() => page.chat()?.id === channelId, signal);
  }

  async function scanDirectMessages(signal) {
    status.textContent = '正在读取 Discord 的私信列表…';
    const previous = page.chat();
    if (!await openDmList(signal)) {
      if (!lifetime.signal.aborted) applyFilters(signal.aborted ? '扫描已停止。' : '请打开 Discord 私信页后重试。');
      return;
    }
    const entries = await page.waitFor(() => {
      const visibleEntries = page.dmEntries();
      return visibleEntries.size ? visibleEntries : null;
    }, signal, 1200);
    const dmIds = [...(entries?.keys() ?? [])];
    const current = page.chat()?.id;
    if (current && !dmIds.includes(current)) dmIds.unshift(current);
    if (!dmIds.length) {
      if (!lifetime.signal.aborted) {
        applyFilters(signal.aborted
          ? '扫描已停止。'
          : '私信列表里没有可读取的会话。你也可以打开某个私信后单独加入。');
      }
      return;
    }

    let scanned = 0;
    for (const [index, channelId] of dmIds.entries()) {
      if (signal.aborted) break;
      status.textContent = '正在检查私信 ' + (index + 1) + ' / ' + dmIds.length + '…';
      if (!await visitDm(channelId, signal)) continue;
      await page.waitFor(() => page.readChat(page.chat()).length, signal, 1800);
      if (!signal.aborted && page.chat()?.id === channelId) {
        readCurrent();
        scanned++;
      }
    }
    if (!signal.aborted && previous?.guild === '@me' && previous.id) {
      await visitDm(previous.id, signal);
    }
    if (!lifetime.signal.aborted) {
      const prefix = signal.aborted ? '扫描已停止。已检查 ' : '已检查 ';
      applyFilters(prefix + scanned + ' / ' + dmIds.length + ' 个列出的私信或群聊。仅包含各聊天已加载的消息。');
    }
  }

  async function processMessage(message, signal) {
    if (page.chat()?.id !== message.channelId && message.guild === '@me') {
      status.textContent = '正在打开该消息所在的私信…';
      if (await visitDm(message.channelId, signal)) {
        await page.waitFor(() => document.getElementById('chat-messages-' + message.channelId + '-' + message.id), signal);
      }
    }
    // Reveal the original message and give Discord's confirmation the full screen.
    panel.hidden = true;
    const result = await page.openDelete(message, signal);
    if (lifetime.signal.aborted) return;

    if (result === 'removed') {
      records.delete(message.id);
      selected.delete(message.id);
      matches = matches.filter((candidate) => candidate.id !== message.id);
      status.textContent = '该消息已从聊天中移除。';
      return;
    }

    if (result === 'unchanged' || result === 'unavailable') selected.delete(message.id);
    const outcome = {
      'wrong-chat': '请打开该消息所在的聊天后重试。',
      'busy': '请先关闭 Discord 当前打开的菜单或对话框。',
      'unloaded': '该消息当前未加载。请在 Discord 中滚动到消息后重试。',
      'interrupted': '本次操作已中止。',
      'menu-missing': '无法打开原生消息菜单，可尝试用 Discord 的右键菜单。',
      'unavailable': 'Discord 没有提供这条消息的删除选项，已跳过。可按 Esc 关闭原生菜单。',
      'dialog-missing': 'Discord 没有显示删除确认框，请检查原生消息菜单。',
      'unchanged': '该消息仍在聊天中，已从本次队列移出。',
    };
    status.textContent = outcome[result];
  }

  function startQuickSelect() {
    if (busy) return;
    stopQuickSelect();
    const chat = page.chat();
    if (!chat?.id) return;
    quickStatus = document.createElement('button');
    quickStatus.type = 'button';
    quickStatus.id = 'discord-message-cleaner-quick';
    quickStatus.textContent = '点击一条消息正文 · 按 Esc 或点此退出';
    quickStatus.addEventListener('click', stopQuickSelect);
    document.body.append(quickStatus);
    document.documentElement.setAttribute('data-discord-message-cleaner', '');
    panel.hidden = true;
    document.addEventListener('click', pickMessage, true);
  }

  function stopQuickSelect() {
    if (!quickStatus) return;
    document.removeEventListener('click', pickMessage, true);
    document.documentElement.removeAttribute('data-discord-message-cleaner');
    quickStatus.remove();
    quickStatus = null;
    panel.hidden = false;
  }

  function pickMessage(event) {
    if (!event.isTrusted || event.button !== 0 || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    if (!(event.target instanceof Element) || event.target.closest('a, button, [role="button"], [contenteditable], input')) return;
    const row = event.target.closest(page.rowSelector);
    const message = row && page.getMessage(row, page.chat());
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run((signal) => processMessage(message, signal));
  }
})();
