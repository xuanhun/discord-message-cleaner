const discordHome = 'https://discord.com/channels/@me';
const discordChat = /^https:\/\/discord\.com\/channels\/(?:@me(?:\/\d+(?:\/\d+)?)?|\d+\/\d+(?:\/\d+)?)\/?(?:[?#]|$)/;
const status = document.getElementById('status');
const openDiscord = document.getElementById('open-discord');
const retry = document.getElementById('retry');

openDiscord.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: discordHome });
    window.close();
  } catch (error) {
    console.warn('无法打开 Discord。', error);
    status.textContent = '无法打开标签页。请在地址栏输入 discord.com，进入聊天后再点击扩展。';
  }
});
retry.addEventListener('click', openPanel);

async function openPanel() {
  retry.hidden = true;
  openDiscord.hidden = true;
  status.textContent = '正在检查当前标签页…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !discordChat.test(tab.url ?? '')) {
      status.textContent = '请切换到 Discord 的文字频道或私信标签页，然后再点一次扩展图标。';
      openDiscord.hidden = false;
      return;
    }

    status.textContent = '正在打开清理面板…';
    const target = { tabId: tab.id };
    await chrome.scripting.insertCSS({ target, files: ['picker.css'] });
    const [injection] = await chrome.scripting.executeScript({ target, files: ['messages.js', 'picker.js'] });
    if (injection?.result !== true) throw new Error('The cleanup panel did not initialize.');
    window.close();
  } catch (error) {
    console.warn('无法启动 Discord 消息清理。', error);
    status.textContent = '没能打开清理面板。请刷新 Discord 页面，检查扩展的站点访问权限后重试。';
    retry.hidden = false;
  }
}

void openPanel();
