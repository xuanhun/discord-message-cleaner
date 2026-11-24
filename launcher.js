(() => {
  if (globalThis.discordMessageCleanerLauncherInstalled) return;
  globalThis.discordMessageCleanerLauncherInstalled = true;

  const runtimeId = chrome.runtime.id;
  const launcherId = 'discord-message-cleaner-launcher';
  const panelId = 'discord-message-cleaner-picker';
  const quickId = 'discord-message-cleaner-quick';
  const legacyLauncher = `[id="${launcherId}"]:not([data-dmc-current])`;
  document.getElementById(panelId)?.remove();
  document.getElementById(quickId)?.remove();
  document.documentElement.removeAttribute('data-discord-message-cleaner');

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = launcherId;
  launcher.dataset.dmcCurrent = '';
  launcher.setAttribute('aria-controls', panelId);

  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('icons/icon-48.png');
  icon.alt = '';
  launcher.append(icon);

  const labels = {
    open: chrome.i18n.getMessage('openPanel'),
    collapse: chrome.i18n.getMessage('collapsePanel'),
  };
  const getPanel = () => document.getElementById(panelId);

  function syncLauncher({ focusLauncher = false } = {}) {
    document.querySelector(legacyLauncher)?.remove();
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
    if (focusLauncher) launcher.focus();
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
    if (sender.id !== runtimeId) return;
    if (request?.type === 'discord-message-cleaner:ping') {
      reply({ ready: true });
      return;
    }
    if (request?.type !== 'discord-message-cleaner:open') return;
    const opened = openDiscordMessageCleanerPanel(syncLauncher);
    syncLauncher();
    reply({ opened });
  });

  syncLauncher();
  // Discord changes conversations through same-document navigation.
  const navigation = setInterval(() => {
    if (chrome.runtime?.id === runtimeId) {
      syncLauncher();
    } else {
      clearInterval(navigation);
      launcher.remove();
    }
  }, 350);
})();
