// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULTS, loadSettings, PAGE_PROTOCOL } from '@/lib/settings';
import { mountPopup } from './Popup';

let container: HTMLDivElement;
let dispose: (() => void) | null = null;

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.useFakeTimers();
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
  await browser.windows.create({ focused: true });
  await browser.tabs.create({ url: 'https://example.com', active: true });
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => ({
    protocol: PAGE_PROTOCOL,
    host: 'example.com',
    dark: true,
    active: true,
    mode: 'auto',
    white: 0.82,
    text: null,
  }));
  await browser.storage.local.set({ settings: { ...DEFAULTS, whites: { 'other.com': 0.75 } } });
  container = document.createElement('div');
  document.body.append(container);
  dispose = mountPopup(container);
  await flushMicrotasks();
});

afterEach(() => {
  dispose?.();
  dispose = null;
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function slide(index: number, value: number) {
  const input = container.querySelectorAll<HTMLInputElement>('input[type="range"]')[index];
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function click(selector: string) {
  container.querySelector<HTMLElement>(selector)!.click();
}

function nextFrame() {
  vi.advanceTimersToNextFrame();
}

it('updates sliders immediately and saves only the latest settings once per frame', async () => {
  const save = vi.spyOn(browser.storage.local, 'set');
  const frame = vi.spyOn(globalThis, 'requestAnimationFrame');
  expect(container.querySelector('.host')?.textContent).toBe('example.com');

  slide(0, 0.9);
  slide(1, 0.7);
  slide(2, 0.6);
  const ranges = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]'), (input) => input.value);
  expect(ranges).toEqual(['0.9', '0.7', '0.6']);
  expect(container.querySelectorAll('.slider-value')[2].textContent).toBe('60%');
  expect(parseFloat(container.querySelector<HTMLInputElement>('input[type="range"]')!.style.getPropertyValue('--fill'))).toBeCloseTo(75);
  expect(save).not.toHaveBeenCalled();
  expect(frame).toHaveBeenCalledTimes(1);

  nextFrame();
  await flushMicrotasks();
  expect(save).toHaveBeenCalledTimes(1);
  expect(await loadSettings()).toMatchObject({
    knee: 0.7,
    color: 0.6,
    whites: { 'example.com': 0.9, 'other.com': 0.75 },
  });

  slide(2, 0.8);
  nextFrame();
  await flushMicrotasks();
  expect(save).toHaveBeenCalledTimes(2);
  expect((await loadSettings()).color).toBe(0.8);
});

it('keeps switches, site modes, language, fine-tune disclosure and reset working', async () => {
  const switchEl = container.querySelector<HTMLInputElement>('[role="switch"]')!;
  switchEl.checked = false;
  switchEl.dispatchEvent(new Event('change', { bubbles: true }));
  expect(switchEl.getAttribute('aria-checked')).toBe('false');

  click('.site [role="radio"]:nth-of-type(2)');
  expect(container.querySelector<HTMLElement>('.segmented')?.style.getPropertyValue('--seg-idx')).toBe('1');

  const language = container.querySelector('select')!;
  language.value = 'zh';
  language.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.documentElement.lang).toBe('zh-CN');

  const resetBtn = container.querySelector<HTMLButtonElement>('.reset-btn')!;
  expect(resetBtn.hidden).toBe(true);

  slide(0, 0.9);
  slide(1, 0.7);
  slide(2, 0.8);
  expect(resetBtn.hidden).toBe(false);

  click('.reset-btn');
  expect(resetBtn.hidden).toBe(true);
  nextFrame();
  await flushMicrotasks();

  expect(await loadSettings()).toEqual({
    ...DEFAULTS,
    enabled: false,
    lang: 'zh',
    sites: { 'example.com': 'on' },
    whites: { 'other.com': 0.75 },
  });
  expect(container.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe('0.82');
  expect(container.querySelector('.wordmark img')?.getAttribute('src')).toBe('/icon/96.png');
  expect(container.querySelector('.wordmark span')?.textContent).toBe('Vellum');
  expect(container.querySelector('.shortcut')?.textContent).toContain('V');
  expect(container.querySelector<HTMLDetailsElement>('details.fine-tune')?.open).toBe(false);
});

it('waits for a pause in slider edits before scanning the page once', async () => {
  const query = vi.mocked(browser.tabs.sendMessage);
  query.mockClear();

  for (let i = 0; i < 6; i++) {
    slide(2, 0.6 + i / 100);
    nextFrame();
    await flushMicrotasks();
    expect(query).not.toHaveBeenCalled();
  }
  vi.advanceTimersByTime(49);
  await flushMicrotasks();
  expect(query).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  await flushMicrotasks();
  expect(query).toHaveBeenCalledTimes(1);
  expect((await loadSettings()).color).toBe(0.65);
});

it('cancels a pending page scan and removes the storage listener on dispose', async () => {
  const query = vi.mocked(browser.tabs.sendMessage);
  query.mockClear();
  slide(2, 0.6);
  nextFrame();
  await flushMicrotasks();
  dispose!();
  dispose = null;
  await browser.storage.local.set({ settings: DEFAULTS });
  vi.advanceTimersByTime(100);
  await flushMicrotasks();
  expect(query).not.toHaveBeenCalled();
});

it.each([
  ['https://example.com', 'Reload to apply', true],
  ['chrome://extensions', 'Vellum can’t run on this page', false],
] as const)('keeps controls available on %s when the content script is missing', async (url, status, reload) => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  await browser.tabs.update(tab.id!, { url });
  vi.mocked(browser.tabs.sendMessage).mockImplementation(async () => {
    throw new Error('No receiver');
  });
  await browser.storage.local.set({ settings: { ...DEFAULTS, color: 0.6 } });
  vi.advanceTimersByTime(50);
  await flushMicrotasks();
  expect(container.querySelector('.badge')?.textContent).toBe(status);
  expect(container.querySelector<HTMLElement>('.stale-row')?.hidden).toBe(!reload);
  expect(container.querySelector<HTMLElement>('.segmented')?.hidden).toBe(true);
  expect(container.querySelectorAll('input[type="range"]')).toHaveLength(3);
});
