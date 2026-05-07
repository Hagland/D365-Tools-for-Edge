// Service worker: relay keyboard shortcut to active tab's content script

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PALETTE' });
});
