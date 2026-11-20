function openDiscordMessageCleanerPanel(onVisibilityChange) {
  const page = discordMessageCleanerPage;
  const history = discordMessageCleanerHistory;
  if (!page.chat()) return false;

  const panelId = 'discord-message-cleaner-picker';
  const existingPanel = document.getElementById(panelId);
  if (existingPanel) {
    existingPanel.removeAttribute('data-collapsed');
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
      <button type="button" data-close aria-label="收起清理面板" title="收起清理面板">−</button>
    </header>
    <div class="dmc-body">
      <form data-filters>
        <fieldset>
          <div class="dmc-grid">
            <label>聊天范围<select name="scope"><option value="current">当前聊天</option><option value="dm">私信和群聊</option></select></label>
            <label>发送者<select name="sender"><option value="">所有发送者</option><option value="manual">手动输入…</option></select></label>
          </div>
          <label class="dmc-manual-author" hidden>发送者显示名或用户 ID<input name="author" autocomplete="off" placeholder="输入完整显示名或用户 ID"></label>
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
            <button type="button" data-scan>刷新已加载</button>
            <button type="button" data-history>扫描聊天历史</button>
            <button type="button" data-dm hidden>扫描所有私信</button>
          </div>
          <button type="submit" class="dmc-visually-hidden" tabindex="-1">应用筛选</button>
        </fieldset>
      </form>
      <section class="dmc-preview" aria-label="候选消息">
        <div class="dmc-preview-heading"><div><h3 data-count></h3><p data-coverage></p></div><button type="button" data-select-all>全选匹配</button></div>
        <ul data-results></ul>
        <div class="dmc-pagination" hidden><button type="button" data-prev>上一页</button><span data-page></span><button type="button" data-next>下一页</button></div>
      </section>
    </div>
    <footer class="dmc-footer">
      <p class="dmc-status" data-status role="status"></p>
      <div class="dmc-actions" data-queue-actions>
        <button type="button" data-quick>快速点选</button>
        <button type="button" data-stop hidden>停止</button>
        <button type="button" data-skip disabled>跳过本条</button>
        <button type="button" data-process>处理下一条</button>
        <button type="button" data-batch class="dmc-primary">批量删除</button>
      </div>
      <section data-batch-review aria-labelledby="dmc-batch-title" hidden>
        <h3 id="dmc-batch-title">确认批量删除</h3>
        <p data-batch-scope></p>
        <p>只处理当前勾选的消息。删除后无法在 Discord 中恢复。</p>
        <div class="dmc-actions">
          <button type="button" data-batch-cancel>返回</button>
          <button type="button" data-batch-confirm class="dmc-destructive">确认删除</button>
        </div>
      </section>
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
  const historyButton = find('[data-history]');
  const dmButton = find('[data-dm]');
  const quickButton = find('[data-quick]');
  const stopButton = find('[data-stop]');
  const batchButton = find('[data-batch]');
  const batchConfirm = find('[data-batch-confirm]');
  const batchCancel = find('[data-batch-cancel]');
  const selectAll = find('[data-select-all]');
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
  const lifetime = new AbortController();
  const records = new Map();
  const coverage = new Map();
  const selected = new Set();
  const pageSize = 12;
  let matches = [];
  let pageIndex = 0;
  let busy = false;
  let operation;
  let activeChat = page.chat();
  let quickStatus;
  let filterTimer;
  let appliedFiltersKey;
  let appliedChannelId;
  let authorChoicesKey;
  let pendingBatch;
  let batchInProgress = false;

  find('[data-close]').addEventListener('click', () => {
    if (pendingBatch) closeBatchReview();
    panel.setAttribute('data-collapsed', '');
    onVisibilityChange?.({ collapsed: true });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  form.addEventListener('input', scheduleFilters);
  form.addEventListener('change', scheduleFilters);
  scanButton.addEventListener('click', () => {
    readCurrent();
    applyFilters();
  });
  historyButton.addEventListener('click', () => {
    const conversation = page.chat();
    if (conversation?.id) run((signal) => scanCurrentHistory(conversation, signal), true);
  });
  dmButton.addEventListener('click', () => run(scanDirectMessages, true));
  stopButton.addEventListener('click', () => operation?.abort());
  batchButton.addEventListener('click', reviewBatch);
  batchConfirm.addEventListener('click', beginBatch);
  batchCancel.addEventListener('click', () => {
    closeBatchReview();
    batchButton.focus();
  });
  processButton.addEventListener('click', (event) => {
    if (event.shiftKey || !queueReady()) return;
    const message = matches.find((candidate) => selected.has(candidate.id));
    if (message) run((signal) => processMessage(message, signal), true);
  });
  skipButton.addEventListener('click', () => {
    if (!queueReady()) return;
    const message = matches.find((candidate) => selected.has(candidate.id));
    if (!message) return;
    selected.delete(message.id);
    status.textContent = '已跳过一条消息。';
    render();
  });
  quickButton.addEventListener('click', startQuickSelect);
  selectAll.addEventListener('click', () => {
    if (!queueReady()) return;
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
      if (!busy) {
        if (fields.scope.value === 'current') selected.clear();
        readCurrent();
        applyFilters();
      }
    } else if (next.title !== activeChat.title) {
      activeChat = next;
      updateChatLabel();
    }
  }, 250);

  document.addEventListener('keydown', (event) => {
    if (batchInProgress && event.isTrusted && (event.key === 'Escape' || event.shiftKey)) operation?.abort();
    if (event.key !== 'Escape') return;
    if (quickStatus) stopQuickSelect();
    if (pendingBatch) closeBatchReview();
  }, { capture: true, signal: lifetime.signal });

  readCurrent();
  applyFilters();
  find('[data-close]').focus();
  return true;

  function close() {
    lifetime.abort();
    operation?.abort();
    clearInterval(navigation);
    clearTimeout(filterTimer);
    stopQuickSelect();
    panel.remove();
    onVisibilityChange?.();
  }

  function readCurrent() {
    const conversation = page.chat();
    if (!conversation?.id) return 0;
    const messages = page.readChat(conversation);
    saveMessages(messages);
    return messages.length;
  }

  function saveMessages(messages) {
    for (const message of messages) {
      const prior = records.get(message.id);
      records.set(message.id, {
        ...message,
        author: message.author || prior?.author || '',
        authorId: message.authorId || prior?.authorId || '',
      });
    }
  }

  function updateChatLabel() {
    find('[data-chat]').textContent = page.chat()?.title ?? 'Discord';
  }

  function readFilters() {
    const sender = fields.sender.value;
    return {
      scope: fields.scope.value,
      author: sender === 'manual' ? fields.author.value : sender.slice(sender.indexOf(':') + 1),
      authorMode: sender.split(':', 1)[0],
      query: fields.query.value,
      regex: fields.regex.checked,
      from: fields.from.value,
      to: fields.to.value,
      type: fields.type.value,
      order: fields.order.value,
    };
  }

  function scheduleFilters() {
    find('.dmc-manual-author').hidden = fields.sender.value !== 'manual';
    if (!filterTimer && JSON.stringify(readFilters()) === appliedFiltersKey) return;
    const firstChange = !filterTimer;
    selected.clear();
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => applyFilters(), 160);
    if (firstChange) {
      status.textContent = '正在更新筛选…';
      render();
    }
  }

  function queueReady() {
    return !busy && !filterTimer && JSON.stringify(readFilters()) === appliedFiltersKey &&
      (fields.scope.value === 'dm' || appliedChannelId === page.chat()?.id);
  }

  function applyFilters(note = '每条消息均由 Discord 确认删除权限。') {
    clearTimeout(filterTimer);
    filterTimer = undefined;
    const conversation = page.chat();
    const filters = readFilters();
    const { scope } = filters;
    const filterKey = JSON.stringify(filters);
    if (filterKey !== appliedFiltersKey || (scope === 'current' && conversation?.id !== appliedChannelId)) {
      selected.clear();
    }
    appliedFiltersKey = filterKey;
    appliedChannelId = conversation?.id;
    const pool = [...records.values()].filter((message) =>
      scope === 'dm' ? message.guild === '@me' : message.channelId === conversation?.id,
    );

    updateAuthorChoices(pool);

    try {
      matches = page.filterMessages(pool, filters);
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

  function updateAuthorChoices(pool) {
    const control = fields.sender;
    const selectedValue = control.value;
    const choices = page.senderChoices(pool);
    if (selectedValue && selectedValue !== 'manual' && !choices.some(({ value }) => value === selectedValue)) {
      const label = control.selectedOptions[0].textContent.replace(/（当前无匹配）$/, '');
      choices.push({ value: selectedValue, label: label + '（当前无匹配）' });
    }
    const key = JSON.stringify(choices);
    if (key === authorChoicesKey) return;
    authorChoicesKey = key;
    control.replaceChildren(
      new Option('所有发送者', ''),
      ...choices.map(({ value, label }) => new Option(label, value)),
      new Option('手动输入…', 'manual'),
    );
    control.value = selectedValue;
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    const conversation = page.chat();
    const dmScope = fields.scope.value === 'dm';
    const roomInScope = Boolean(conversation?.id && (!dmScope || conversation.guild === '@me'));
    dmButton.hidden = !dmScope;
    scanButton.disabled = busy || !roomInScope;
    scanButton.hidden = !roomInScope;
    historyButton.disabled = busy || !roomInScope;
    historyButton.hidden = !roomInScope;
    quickButton.disabled = busy || !conversation?.id;
    const complete = coverage.get(conversation?.id) === 'start';
    find('[data-coverage]').textContent = dmScope
      ? '仅包含已读取的私信和群聊'
      : complete ? '扫描已到达聊天开头' : '目前仅包含已读取的消息';
    renderQueue();
    find('.dmc-pagination').hidden = totalPages === 1;
    find('[data-page]').textContent = (pageIndex + 1) + ' / ' + totalPages;
    find('[data-prev]').disabled = busy || pageIndex === 0;
    find('[data-next]').disabled = busy || pageIndex === totalPages - 1;
    const start = pageIndex * pageSize;
    results.replaceChildren(...matches.slice(start, start + pageSize).map(previewRow));
    if (!matches.length) {
      const empty = document.createElement('li');
      empty.className = 'dmc-empty';
      empty.textContent = filterTimer ? '正在更新筛选…' : '没有匹配消息。可以调整筛选或继续扫描历史。';
      results.append(empty);
    }
  }

  function renderQueue() {
    const available = queueReady();
    processButton.disabled = !available || !selected.size;
    batchButton.disabled = processButton.disabled;
    skipButton.disabled = processButton.disabled;
    selectAll.disabled = !available || !matches.length;
    selectAll.textContent = matches.length && selected.size === matches.length ? '清空选择' : '全选匹配';
    find('[data-count]').textContent = selected.size
      ? '匹配 ' + matches.length + ' 条 · 待处理 ' + selected.size + ' 条'
      : '匹配 ' + matches.length + ' 条';
    if (pendingBatch && (!available || !sameSelection(pendingBatch))) closeBatchReview();
  }

  function sameSelection(batch) {
    return selected.size === batch.messages.length &&
      batch.messages.every((message) => selected.has(message.id));
  }

  function reviewBatch(event) {
    if (!event.isTrusted || !queueReady()) return;
    const messages = matches.filter((message) => selected.has(message.id));
    if (!messages.length) return;
    const rooms = new Set(messages.map((message) => message.channelId));
    pendingBatch = { messages, scope: fields.scope.value, chatId: page.chat()?.id };
    const description = rooms.size === 1 ? messages[0].channelTitle : rooms.size + ' 个会话';
    find('[data-batch-scope]').textContent = description + ' · ' + messages.length + ' 条消息';
    batchConfirm.textContent = '确认删除 ' + messages.length + ' 条';
    find('[data-queue-actions]').hidden = true;
    find('[data-batch-review]').hidden = false;
    batchCancel.focus();
  }

  function closeBatchReview() {
    pendingBatch = undefined;
    find('[data-batch-review]').hidden = true;
    find('[data-queue-actions]').hidden = false;
  }

  function beginBatch(event) {
    if (!event.isTrusted || event.shiftKey || !pendingBatch) return;
    const batch = pendingBatch;
    closeBatchReview();
    if (!queueReady() || !sameSelection(batch) || batch.chatId !== page.chat()?.id) {
      status.textContent = '待处理范围已变化，请重新核对后确认。';
      return;
    }
    run(async (signal) => {
      batchInProgress = true;
      try {
        await processBatch(batch, signal);
      } finally {
        batchInProgress = false;
      }
    }, true);
  }

  function previewRow(message) {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(message.id);
    checkbox.disabled = !queueReady();
    checkbox.addEventListener('change', () => {
      if (!queueReady()) return;
      if (checkbox.checked) selected.add(message.id);
      else selected.delete(message.id);
      renderQueue();
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
    if (message.text) preview.title = message.text;
    details.append(meta, preview);
    label.append(checkbox, details);
    item.append(label);
    return item;
  }

  async function run(task, stoppable = false) {
    if (busy) return;
    stopQuickSelect();
    if (filterTimer) applyFilters();
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
        if (fields.scope.value === 'current' && appliedChannelId !== page.chat()?.id) {
          readCurrent();
          applyFilters(status.textContent + ' 聊天已切换，队列已重置。');
        } else {
          render();
        }
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

  async function reopenChat(message, signal) {
    if (signal.aborted || page.chat()?.id !== message.channelId) return;
    const home = document.querySelector(page.dmHomeSelector);
    if (!home) return;
    home.click();
    const leftChat = await page.waitFor(() => page.chat()?.guild === '@me' && !page.chat()?.id, signal, 1500);
    if (!leftChat || signal.aborted) return;
    if (message.guild === '@me') {
      await visitDm(message.channelId, signal);
      return;
    }
    const channelLink = () => document.querySelector(`a[href="/channels/${message.guild}/${message.channelId}"]`);
    if (!channelLink()) document.querySelector(`[data-list-item-id="guildsnav___${message.guild}"]`)?.click();
    await page.waitFor(() => page.chat()?.id === message.channelId || channelLink(), signal, 1500);
    if (signal.aborted || page.chat()?.id === message.channelId) return;
    channelLink()?.click();
    await page.waitFor(() => page.chat()?.id === message.channelId, signal);
  }

  async function scanCurrentHistory(conversation, signal) {
    let read = 0;
    status.textContent = '正在扫描聊天历史…';
    const result = await history.scan(conversation, signal, (messages, count) => {
      saveMessages(messages);
      read = count;
      status.textContent = '正在扫描聊天历史，已读取 ' + read + ' 条…';
    });
    if (lifetime.signal.aborted) return;
    if (result === 'start') coverage.set(conversation.id, 'start');
    const total = '已读取 ' + read + ' 条。';
    const message = {
      start: '已到达聊天开头。',
      edge: 'Discord 暂未加载更早消息，可再次扫描。',
      unavailable: '无法识别聊天滚动区域，可手动滚动后刷新已加载消息。',
      interrupted: '扫描已停止。',
    };
    applyFilters(total + message[result]);
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
    let reachedStart = 0;
    for (const [index, channelId] of dmIds.entries()) {
      if (signal.aborted) break;
      status.textContent = '正在检查私信 ' + (index + 1) + ' / ' + dmIds.length + '…';
      if (!await visitDm(channelId, signal)) continue;
      const result = await history.scan(page.chat(), signal, (messages, count) => {
        saveMessages(messages);
        status.textContent = '正在扫描私信 ' + (index + 1) + ' / ' + dmIds.length + '，已读取 ' + count + ' 条…';
      });
      if (!signal.aborted && page.chat()?.id === channelId) scanned++;
      if (result === 'start') {
        coverage.set(channelId, 'start');
        reachedStart++;
      }
    }
    if (!signal.aborted && previous?.guild === '@me' && previous.id) {
      await visitDm(previous.id, signal);
    }
    if (!lifetime.signal.aborted) {
      const prefix = signal.aborted ? '扫描已停止。已检查 ' : '已检查 ';
      applyFilters(prefix + scanned + ' / ' + dmIds.length + ' 个会话，' + reachedStart + ' 个读到聊天开头。');
    }
  }

  async function prepareMessage(message, scope, signal, refill = false) {
    if (page.chat()?.id !== message.channelId && scope === 'dm' && message.guild === '@me') {
      status.textContent = '正在打开该消息所在的私信…';
      await visitDm(message.channelId, signal);
    }
    if (page.chat()?.id === message.channelId && !page.rowFor(message)) {
      status.textContent = '正在聊天历史中定位选中的消息…';
      if (refill && !page.hasChatRows(message.channelId)) {
        // Discord can leave an empty rendered window after a whole page was deleted.
        const loaded = await page.waitFor(() => page.hasChatRows(message.channelId), signal, 550);
        if (!loaded) await reopenChat(message, signal);
      }
      await history.locate(message, signal);
    }
  }

  function removeMessage(message) {
    records.delete(message.id);
    selected.delete(message.id);
    matches = matches.filter((candidate) => candidate.id !== message.id);
  }

  function describeDeleteOutcome(result) {
    return {
      'wrong-chat': '聊天已切换，请重新核对范围。',
      'busy': '请先关闭 Discord 当前打开的菜单或对话框。',
      'unloaded': '定位不到该消息，可滚动加载后重试。',
      'interrupted': '本次操作已中止。',
      'menu-missing': '无法打开原生消息菜单。',
      'unavailable': 'Discord 没有提供删除选项，已跳过。菜单如仍打开，可按 Esc 关闭。',
      'dialog-missing': 'Discord 没有显示删除确认框。',
      'unverified': '无法核对确认框里的消息，请关闭 Discord 对话框后重试。',
      'cancelled': '已取消，消息保留。可继续处理下一条。',
      'unchanged': '未观察到消息移除，当前条目仍留在队列中。',
    }[result];
  }

  async function processMessage(message, signal) {
    await prepareMessage(message, fields.scope.value, signal);
    // Reveal the original message and give Discord's confirmation the full screen.
    panel.hidden = true;
    const result = await page.openDelete(message, signal);
    if (lifetime.signal.aborted) return;

    if (result === 'removed') {
      removeMessage(message);
      status.textContent = '该消息已从聊天中移除。';
      return;
    }

    if (result === 'cancelled' || result === 'unavailable') selected.delete(message.id);
    status.textContent = describeDeleteOutcome(result);
  }

  async function processBatch(batch, signal) {
    let removed = 0;
    let skipped = 0;
    let interruption;
    let expectedChat = batch.chatId;
    const total = batch.messages.length;

    for (const [index, message] of batch.messages.entries()) {
      if (signal.aborted) break;
      if (expectedChat !== page.chat()?.id) {
        interruption = 'wrong-chat';
        break;
      }

      await prepareMessage(message, batch.scope, signal, true);
      status.textContent = '正在处理 ' + (index + 1) + ' / ' + total + ' 条 · 已删除 ' + removed + ' 条';
      const result = await page.openDelete(message, signal, { automatic: true });
      if (lifetime.signal.aborted) return;
      if (result === 'removed') {
        removeMessage(message);
        removed++;
      } else if (result === 'unavailable') {
        selected.delete(message.id);
        skipped++;
        if (!await page.dismissMessageMenu(signal)) {
          interruption = 'unavailable';
          break;
        }
      } else {
        interruption = result;
        break;
      }
      expectedChat = message.channelId;
      render();
    }

    if (lifetime.signal.aborted) return;
    const remaining = total - removed - skipped;
    const counts = '已删除 ' + removed + ' 条，已跳过 ' + skipped + ' 条，未完成 ' + remaining + ' 条。';
    status.textContent = signal.aborted ? '已停止批量删除。' + counts
      : interruption ? '批量删除已暂停。' + counts + describeDeleteOutcome(interruption)
      : '批量删除完成。' + counts;
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
}
