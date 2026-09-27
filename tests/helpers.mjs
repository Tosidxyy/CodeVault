export async function openCurrentProblem(page) {
  await page.locator('.launcher').waitFor();
  await page.waitForFunction(() => !document.querySelector('#codevault-root').shadowRoot.querySelector('.launcher').disabled);
  const launcher = page.getByRole('button', { name: '展开 CodeVault' });
  if (await launcher.isVisible()) await launcher.click();
  const current = page.getByRole('button', { name: '查看当前题目 →' });
  if (await current.isVisible()) await current.click();
}
