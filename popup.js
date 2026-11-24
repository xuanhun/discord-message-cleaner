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
    if (await chrome.runtime.sendMessage({ type: 'discord-message-cleaner:go-to-discord' })) {
      window.close();
      return;
    }
  } catch {
    // Display the same fallback if the service worker is unavailable.
  }
  statusText.textContent = message('openTabFailed');
});
retry.addEventListener('click', openPanel);

function openPanelIn(tabId) {
  return chrome.runtime.sendMessage({ type: 'discord-message-cleaner:open-tab', tabId });
}

async function openPanel() {
  retry.hidden = true;
  openDiscord.hidden = true;
  statusText.textContent = message('checkingTab');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      const reply = await openPanelIn(tab.id);
      if (reply?.opened) {
        window.close();
        return;
      }
      if (reply?.discord || reply?.failed) {
        statusText.textContent = message(reply.failed ? 'setupFailed' : 'chooseChat');
        retry.hidden = false;
        return;
      }
    }
  } catch {
    statusText.textContent = message('setupFailed');
    retry.hidden = false;
    return;
  }
  statusText.textContent = message('switchToDiscord');
  openDiscord.hidden = false;
  retry.hidden = false;
}

void openPanel();
