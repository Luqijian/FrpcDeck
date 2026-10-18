/**
 * Browser smoke test against a running FrpcDeck instance.
 *
 *   E2E_BASE_URL=http://127.0.0.1:8080 \
 *   E2E_USERNAME=admin E2E_PASSWORD=your-password \
 *   node tests/e2e.mjs
 *
 * Set E2E_CHROME to a Chrome/Chromium executable if it is not on the default path.
 * This test changes the theme in the browser only; it does not modify server config.
 */
import { chromium } from 'playwright-core';

const base = process.env.E2E_BASE_URL;
const username = process.env.E2E_USERNAME || 'admin';
const password = process.env.E2E_PASSWORD;

if (!base || !password) {
  console.error('缺少 E2E_BASE_URL 或 E2E_PASSWORD。示例：');
  console.error('  E2E_BASE_URL=http://127.0.0.1:8080 E2E_PASSWORD=your-password pnpm test:e2e');
  process.exit(1);
}

const launchOptions = { headless: true };
if (process.env.E2E_CHROME) launchOptions.executablePath = process.env.E2E_CHROME;
else launchOptions.channel = 'chrome';

const browser = await chromium.launch(launchOptions);
const errors = [];
const checkErrors = () => {
  if (errors.length) {
    console.error('浏览器错误：');
    for (const error of errors) console.error(` - ${error}`);
    process.exitCode = 1;
  }
};

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${base}/`, { timeout: 10000 });
  await page.waitForTimeout(700);
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));

try {
  await login(page);
  const routes = ['/', '/proxies', '/visitors', '/connection', '/logs', '/settings'];
  for (const route of routes) {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    if (!(await page.locator('.topbar-title').isVisible())) {
      throw new Error(`页面未正确渲染：${route}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`页面出现横向滚动：${route}`);
  }

  await page.goto(`${base}/proxies`);
  await page.waitForTimeout(400);
  await page.click('.toolbar-add');
  await page.waitForSelector('.modal-panel');
  if ((await page.getByLabel('代理名称').count()) !== 1) throw new Error('代理表单未正确渲染');
  for (const type of ['HTTP', 'HTTPS', 'STCP', 'XTCP', 'TCP']) {
    await page.locator('.type-choice', { hasText: type }).first().click();
    await page.waitForTimeout(80);
  }
  await page.click('.modal-close');
  await page.waitForTimeout(300);

  await page.goto(`${base}/connection`);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '导入配置' }).click();
  await page.waitForSelector('.import-textarea');
  await page.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(300);

  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.theme-toggle');
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  if (themeBefore === themeAfter) throw new Error('主题切换未生效');

  const state = await context.storageState();
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: state,
  });
  const mobile = await mobileContext.newPage();
  mobile.on('console', (message) => {
    if (message.type() === 'error') errors.push(`mobile: ${message.text()}`);
  });
  mobile.on('pageerror', (error) => errors.push(`mobile: ${error.message}`));
  await mobile.goto(`${base}/`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(600);
  if (!(await mobile.locator('.mobile-nav').isVisible())) throw new Error('移动端导航未显示');
  const mobileOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (mobileOverflow > 1) throw new Error('移动端出现横向滚动');
  await mobile.goto(`${base}/proxies`);
  await mobile.waitForTimeout(400);
  if (process.env.E2E_SCREENSHOT) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(path.dirname(process.env.E2E_SCREENSHOT), { recursive: true });
    await mobile.screenshot({ path: process.env.E2E_SCREENSHOT });
  }
  await mobileContext.close();

  console.log('E2E 冒烟测试通过：页面渲染、表单、导入弹窗、主题与移动端布局均正常。');
} catch (error) {
  errors.push(error.message);
} finally {
  checkErrors();
  await context.close();
  await browser.close();
}
