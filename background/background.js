// Service worker: relay keyboard shortcut to active tab's content script

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PALETTE' });
  } catch {
    // Content script not present on this tab (non-D365 page) — silently ignore
  }
});
