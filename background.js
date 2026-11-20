const title = 'Discord 消息清理';
const discordChat = /^https:\/\/discord\.com\/channels\/(?:@me|\d+)\/\d+(?:\/\d+)?\/?(?:[?#]|$)/;

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;

  const target = { tabId: tab.id };
  let hint = '请先打开 Discord 网页版的文字频道或私信';

  if (discordChat.test(tab.url ?? '')) {
    try {
      await chrome.scripting.insertCSS({ target, files: ['picker.css'] });
      await chrome.scripting.executeScript({ target, files: ['picker.js'] });
      hint = '';
    } catch (error) {
      console.warn('无法在当前 Discord 标签页启动消息选择。', error);
      hint = '无法启动，请刷新 Discord 页面后重试';
    }
  }

  await Promise.all([
    chrome.action.setBadgeText({ ...target, text: hint ? '!' : '' }),
    chrome.action.setTitle({ ...target, title: hint || title }),
  ]).catch(() => {
    // The tab can close while the action is running.
  });
});
