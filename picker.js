(() => {
  if (location.origin !== 'https://discord.com') return;
  if (!/^\/channels\/(?:@me|\d+)\/\d+(?:\/\d+)?\/?$/.test(location.pathname)) return;

  const rowSelector = 'li[id^="chat-messages-"]';
  const overlayId = 'discord-message-cleaner-picker';
  const previousOverlay = document.getElementById(overlayId);
  if (previousOverlay) {
    previousOverlay.querySelector('button')?.click();
    return;
  }

  const channelPath = location.pathname;
  const overlay = document.createElement('aside');
  overlay.id = overlayId;
  const message = document.createElement('span');
  message.setAttribute('role', 'status');
  message.textContent = '点击要删除的消息，然后在 Discord 确认。';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '退出';
  overlay.append(message, cancel);
  document.body.append(overlay);
  document.documentElement.setAttribute('data-discord-message-cleaner', '');

  const selection = new AbortController();
  const listenerOptions = { capture: true, signal: selection.signal };
  let timeout = setTimeout(close, 60_000);
  const navigationCheck = setInterval(() => {
    if (location.pathname !== channelPath) close();
  }, 250);

  cancel.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  }, listenerOptions);
  document.addEventListener('click', selectMessage, listenerOptions);

  function close() {
    selection.abort();
    clearTimeout(timeout);
    clearInterval(navigationCheck);
    document.documentElement.removeAttribute('data-discord-message-cleaner');
    overlay.remove();
  }

  async function selectMessage(event) {
    if (location.pathname !== channelPath) {
      close();
      return;
    }

    if (!event.isTrusted || event.button !== 0 ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!(event.target instanceof Element) ||
        document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;

    const row = event.target.closest(rowSelector);
    const ids = row?.id.match(/^chat-messages-(\d+)-(\d+)$/);
    const article = row?.querySelector('[role="article"]');
    if (!article || !ids || ids[1] === ids[2]) return;
    if (event.target.closest('a, button, [role="button"], [contenteditable], input, textarea')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    document.removeEventListener('click', selectMessage, true);
    document.documentElement.removeAttribute('data-discord-message-cleaner');

    // Discord renders and authorizes this menu for the selected message.
    document.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.shiftKey) close();
    }, listenerOptions);
    const menuPromise = waitForMessageMenu(selection.signal);
    const contextTarget = article.contains(event.target) ? event.target : article;
    contextTarget.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: event.clientX,
      clientY: event.clientY,
      view: window,
    }));
    const menu = await menuPromise;
    if (selection.signal.aborted) return;
    if (location.pathname !== channelPath || !article.isConnected) {
      close();
      return;
    }

    const deleteItem = menu?.querySelector('#message-delete[role="menuitem"]:not([aria-disabled="true"])');
    if (deleteItem?.isConnected) {
      // Open Discord's dialog. Only the user clicks its confirmation button.
      close();
      deleteItem.click();
      return;
    }

    message.textContent = menu
      ? 'Discord 没有为这条消息提供删除选项。'
      : '无法打开消息菜单，请试试右键菜单。';
    cancel.textContent = '关闭';
    clearTimeout(timeout);
    timeout = setTimeout(close, 5000);
  }

  function waitForMessageMenu(signal) {
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const menu = document.querySelector('#message[role="menu"]');
        if (menu) finish(menu);
      });
      const timer = setTimeout(finish, 1000);
      const abort = () => finish();
      observer.observe(document.body, { childList: true, subtree: true });
      signal.addEventListener('abort', abort, { once: true });

      function finish(menu) {
        clearTimeout(timer);
        observer.disconnect();
        signal.removeEventListener('abort', abort);
        resolve(menu);
      }
    });
  }
})();
