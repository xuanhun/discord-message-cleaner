const discordHome = 'https://discord.com/channels/@me';
const statusText = document.getElementById('status');
const openDiscord = document.getElementById('open-discord');
const retry = document.getElementById('retry');
const message = (key) => chrome.i18n.getMessage(key);

document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = message('extensionName');
for (const element of document.querySelectorAll('[data-message]')) {
  element.textContent = message(element.dataset.message);
}

openDiscord.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: discordHome });
    window.close();
  } catch {
    statusText.textContent = message('openTabFailed');
  }
});
retry.addEventListener('click', openPanel);

async function openPanel() {
  retry.hidden = true;
  openDiscord.hidden = true;
  statusText.textContent = message('checkingTab');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: 'discord-message-cleaner:open' });
      if (reply?.opened) {
        window.close();
        return;
      }
    }
  } catch {
    // Tabs outside Discord, or tabs opened before installation, have no receiver.
  }
  statusText.textContent = message('switchToDiscord');
  openDiscord.hidden = false;
  retry.hidden = false;
}

void openPanel();
