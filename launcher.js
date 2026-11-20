(() => {
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'discord-message-cleaner-launcher';
  launcher.setAttribute('aria-controls', 'discord-message-cleaner-picker');

  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('icons/icon-48.png');
  icon.alt = '';
  launcher.append(icon);

  const labels = {
    open: chrome.i18n.getMessage('openPanel'),
    collapse: chrome.i18n.getMessage('collapsePanel'),
  };
  const getPanel = () => document.getElementById('discord-message-cleaner-picker');

  function syncLauncher({ collapsed = false } = {}) {
    if (!discordMessageCleanerPage.route()) {
      launcher.remove();
      return;
    }
    if (!launcher.isConnected) document.body.append(launcher);
    const panel = getPanel();
    const expanded = Boolean(panel && !panel.hidden && !panel.hasAttribute('data-collapsed'));
    const label = expanded ? labels.collapse : labels.open;
    if (launcher.getAttribute('aria-expanded') !== String(expanded)) {
      launcher.setAttribute('aria-expanded', String(expanded));
      launcher.setAttribute('aria-label', label);
      launcher.title = label;
    }
    if (collapsed) launcher.focus();
  }

  launcher.addEventListener('click', () => {
    const panel = getPanel();
    if (panel && !panel.hidden && !panel.hasAttribute('data-collapsed')) {
      panel.querySelector('[data-close]').click();
    } else {
      openDiscordMessageCleanerPanel(syncLauncher);
      syncLauncher();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, reply) => {
    if (request?.type !== 'discord-message-cleaner:open' || sender.id !== chrome.runtime.id) return;
    const opened = openDiscordMessageCleanerPanel(syncLauncher);
    syncLauncher();
    reply({ opened });
  });

  syncLauncher();
  // Discord changes conversations through same-document navigation.
  setInterval(syncLauncher, 350);
})();
