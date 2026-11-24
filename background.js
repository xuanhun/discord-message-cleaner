const discordOrigin = 'https://discord.com/';
const discordPattern = discordOrigin + '*';
const discordHome = discordOrigin + 'channels/@me';
const content = chrome.runtime.getManifest().content_scripts[0];
const pending = new Map();

function tellTab(tabId, type) {
  return chrome.tabs.sendMessage(tabId, { type: 'discord-message-cleaner:' + type }, { frameId: 0 });
}

async function hasReceiver(tabId) {
  try {
    return (await tellTab(tabId, 'ping'))?.ready === true;
  } catch {
    return false;
  }
}

async function loadContent(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith(discordOrigin)) return false;
  if (await hasReceiver(tabId)) return true;
  const target = { tabId };
  await chrome.scripting.insertCSS({ target, files: content.css });
  await chrome.scripting.executeScript({ target, files: content.js });
  return true;
}

async function ensureContent(tabId) {
  let injection = pending.get(tabId);
  if (!injection) {
    injection = loadContent(tabId);
    pending.set(tabId, injection);
  }
  try {
    return await injection;
  } finally {
    if (pending.get(tabId) === injection) pending.delete(tabId);
  }
}

async function openPanel(tabId) {
  if (!await ensureContent(tabId)) return { opened: false, discord: false };
  return { opened: (await tellTab(tabId, 'open'))?.opened === true, discord: true };
}

async function openDiscord() {
  const tabs = await chrome.tabs.query({ url: discordPattern });
  const discordTab = tabs.find((tab) => /^https:\/\/discord\.com\/channels\/(@me|\d+)\/\d+/.test(tab.url)) ?? tabs[0];
  if (!discordTab) {
    await chrome.tabs.create({ url: discordHome });
    return true;
  }
  // Continue switching even when a tab's content script cannot be reached.
  await openPanel(discordTab.id).catch(() => {});
  await chrome.tabs.update(discordTab.id, { active: true });
  await chrome.windows.update(discordTab.windowId, { focused: true });
  return true;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  const tabs = await chrome.tabs.query({ url: discordPattern });
  await Promise.allSettled(tabs.map((tab) => ensureContent(tab.id)));
});

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.url !== chrome.runtime.getURL('popup.html')) return;

  if (request?.type === 'discord-message-cleaner:open-tab' && Number.isInteger(request.tabId)) {
    openPanel(request.tabId).then(respond, () => respond({ opened: false, failed: true }));
    return true;
  }
  if (request?.type === 'discord-message-cleaner:go-to-discord') {
    openDiscord().then(respond, () => respond(false));
    return true;
  }
});
