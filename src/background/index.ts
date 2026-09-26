// Register listeners synchronously so the MV3 worker can resume on events.
chrome.runtime.onInstalled.addListener(() => {
  console.info('CodeVault extension initialized');
});
