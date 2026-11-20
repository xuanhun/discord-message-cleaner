var discordMessageCleanerHistory = (() => {
  const page = discordMessageCleanerPage;

  function startMarker(channelId) {
    return document.getElementById(`chat-messages-${channelId}-${channelId}`);
  }

  function rowSelector(channelId) {
    return `li[id^="chat-messages-${channelId}-"]:has([role="article"])`;
  }

  function viewFor(channelId) {
    const anchor = document.querySelector(rowSelector(channelId)) || startMarker(channelId);
    const list = anchor?.closest('ol, [role="list"]');
    for (let scroller = list?.parentElement; scroller; scroller = scroller.parentElement) {
      if (scroller.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) {
        return { list, scroller };
      }
    }
    return null;
  }

  function bounds(list, channelId) {
    const rows = list.querySelectorAll(rowSelector(channelId));
    const idLength = `chat-messages-${channelId}-`.length;
    return {
      first: rows[0]?.id.slice(idLength),
      last: rows[rows.length - 1]?.id.slice(idLength),
      count: rows.length,
    };
  }

  async function walk(channelId, direction, signal, observe) {
    const stillInChat = () => !signal.aborted && page.chat()?.id === channelId;
    while (stillInChat()) {
      const view = viewFor(channelId);
      const state = view && bounds(view.list, channelId);
      const result = observe(view, state);
      if (result) return result;
      if (!view) return 'unavailable';

      const { list, scroller } = view;
      const previousTop = scroller.scrollTop;
      const jump = Math.max(1, scroller.clientHeight * 0.8);
      scroller.scrollTop += direction * jump;
      const moved = Math.abs(scroller.scrollTop - previousTop) > 1;
      const viewChanged = () => {
        if (!stillInChat() || !list.isConnected) return true;
        const next = bounds(list, channelId);
        if (next.first !== state.first || next.last !== state.last || next.count !== state.count) return true;
        return direction < 0 && Boolean(startMarker(channelId));
      };
      if (!moved && scroller.scrollHeight > scroller.clientHeight + 2) {
        // Re-enter a boundary to wake Discord's scroll handler when already at that edge.
        scroller.scrollTop = previousTop - direction * 2;
        if (!await page.waitFor(viewChanged, signal, 65) && stillInChat()) scroller.scrollTop = previousTop;
      }
      const changed = await page.waitFor(viewChanged, signal, moved ? 120 : 2800);
      if (!moved && !changed) return 'edge';
    }
    return 'interrupted';
  }

  async function scan(channel, signal, collect) {
    const { id } = channel;
    await page.waitFor(() => viewFor(id) || page.chat()?.id !== id, signal, 2500);
    const view = viewFor(id);
    const top = view?.scroller.getBoundingClientRect().top;
    const anchor = view && [...view.list.querySelectorAll(rowSelector(id))]
      .find((row) => row.getBoundingClientRect().bottom > top);
    const seen = new Set();
    function readBatch() {
      const current = page.readChat(channel);
      for (const message of current) seen.add(message.id);
      collect(current, seen.size);
    }

    try {
      // First include the newer messages when starting from a jump link or an older window.
      const forward = await walk(id, 1, signal, () => { readBatch(); });
      if (forward === 'interrupted') return forward;
      return await walk(id, -1, signal, () => {
        readBatch();
        if (startMarker(id)) return 'start';
      });
    } finally {
      if (anchor?.isConnected && page.chat()?.id === id) anchor.scrollIntoView({ block: 'nearest' });
    }
  }

  async function locate(message, signal) {
    const { channelId, id } = message;
    if (page.rowFor(message)) return true;
    const view = await page.waitFor(() => viewFor(channelId), signal, 1800);
    if (!view) return false;
    const initial = bounds(view.list, channelId);
    if (!initial.first || !initial.last) return false;
    const direction = page.compareIds(id, initial.first) < 0 ? -1 : 1;

    const result = await walk(channelId, direction, signal, (_view, state) => {
      if (page.rowFor(message)) return 'found';
      if (state?.first && state.last && page.compareIds(id, state.first) >= 0 &&
          page.compareIds(id, state.last) <= 0) return 'missing';
      if (direction < 0 && startMarker(channelId)) return 'missing';
    });
    return result === 'found';
  }

  return { scan, locate };
})();
