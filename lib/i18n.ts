import { browser } from 'wxt/browser';

/** The interface's language: by the browser's, or chosen. */
export type LangSetting = 'auto' | 'zh' | 'en';
export type Lang = 'zh' | 'en';

const zh = {
  enable: '启用 Vellum',
  thisPage: '当前页面',
  unavailable: '此页面无法使用 Vellum',
  reloadToApply: '刷新后生效',
  detecting: '正在识别',
  darkPage: '深色页面',
  lightPage: '浅色页面',
  off: ' · 已关闭',
  openedBefore: '此页面在安装或更新插件前已打开。',
  reload: '刷新',
  modeAuto: '自动',
  modeOn: '始终开启',
  modeOff: '关闭',
  reset: '恢复默认',
  white: '白字亮度',
  fineTune: '精细调节',
  knee: '柔化起点',
  kneeHint: '越高，越只影响最白的字',
  color: '彩色文字',
  colorHint: '链接、代码高亮',
  shortcut: '在当前网站开启或关闭',
  language: '语言',
  langAuto: '自动',
};

export type Strings = typeof zh;

const en: Strings = {
  enable: 'Turn on Vellum',
  thisPage: 'This page',
  unavailable: 'Vellum can’t run on this page',
  reloadToApply: 'Reload to apply',
  detecting: 'Detecting',
  darkPage: 'Dark page',
  lightPage: 'Light page',
  off: ' · Off',
  openedBefore: 'Opened before Vellum was installed or updated.',
  reload: 'Reload',
  modeAuto: 'Auto',
  modeOn: 'Always on',
  modeOff: 'Off',
  reset: 'Reset',
  white: 'White text',
  fineTune: 'Fine-tune',
  knee: 'Softening starts',
  kneeHint: 'Higher touches only the whitest text',
  color: 'Colored text',
  colorHint: 'Links, code highlighting',
  shortcut: 'Toggle for this site',
  language: 'Language',
  langAuto: 'Auto',
};

/** The language to show: the chosen one, else the browser's own. */
export function resolveLang(setting: LangSetting): Lang {
  if (setting !== 'auto') return setting;
  return browser.i18n.getUILanguage().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function strings(lang: Lang): Strings {
  return lang === 'zh' ? zh : en;
}
