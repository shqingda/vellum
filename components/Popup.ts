import { browser } from 'wxt/browser';
import { mapLightness } from '@/lib/curve';
import { type LangSetting, resolveLang, type Strings, strings } from '@/lib/i18n';
import {
  DEFAULTS,
  PAGE_PROTOCOL,
  type PageState,
  type Settings,
  type SiteMode,
  loadSettings,
  saveSettings,
  siteMode,
  watchSettings,
  withSiteMode,
  withSiteWhite,
} from '@/lib/settings';

const MODES: { value: SiteMode; label: keyof Strings }[] = [
  { value: 'auto', label: 'modeAuto' },
  { value: 'on', label: 'modeOn' },
  { value: 'off', label: 'modeOff' },
];

const LANGS: { value: LangSetting; label: (t: Strings) => string }[] = [
  { value: 'auto', label: (t) => t.langAuto },
  { value: 'zh', label: () => '中文' },
  { value: 'en', label: () => 'EN' },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

interface ActivePage {
  tabId?: number;
  web: boolean;
  state: PageState | null;
  stale: boolean;
}

interface SliderControl {
  root: HTMLLabelElement;
  label: HTMLSpanElement;
  value: HTMLSpanElement;
  input: HTMLInputElement;
  hint?: HTMLSpanElement;
}

function makeSlider(opts: {
  min: number;
  max: number;
  withHint?: boolean;
  onInput: (val: number) => void;
  extraMeta?: HTMLElement;
}): SliderControl {
  const root = document.createElement('label');
  root.className = 'slider';

  const row = document.createElement('div');
  row.className = 'slider-row';

  const label = document.createElement('span');
  label.className = 'slider-label';

  const meta = document.createElement('span');
  meta.className = 'slider-meta';
  if (opts.extraMeta) meta.append(opts.extraMeta);

  const value = document.createElement('span');
  value.className = 'slider-value';
  meta.append(value);

  row.append(label, meta);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = '0.01';
  input.addEventListener('input', () => opts.onInput(Number(input.value)));

  root.append(row, input);

  let hint: HTMLSpanElement | undefined;
  if (opts.withHint) {
    hint = document.createElement('span');
    hint.className = 'slider-hint';
    root.append(hint);
  }

  return { root, label, value, input, hint };
}

function updateSlider(ctrl: SliderControl, labelText: string, val: number, min: number, max: number, shown = val, hintText?: string) {
  ctrl.label.textContent = labelText;
  ctrl.input.setAttribute('aria-label', labelText);
  ctrl.input.value = String(val);
  ctrl.value.textContent = pct(shown);
  const fill = ((val - min) / (max - min)) * 100;
  ctrl.input.style.setProperty('--fill', `${fill}%`);
  if (ctrl.hint && hintText !== undefined) ctrl.hint.textContent = hintText;
}

/** Mounts the Vellum popup UI into container and returns a cleanup function. */
export function mountPopup(container: HTMLElement): () => void {
  let settings: Settings | null = null;
  let page: ActivePage | null = null;
  let writing: number | null = null;
  let latest: Settings | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const isMac = navigator.platform.includes('Mac');

  const main = document.createElement('main');
  main.hidden = true;

  // Header
  const header = document.createElement('header');
  const wordmark = document.createElement('h1');
  wordmark.className = 'wordmark';
  const icon = document.createElement('img');
  icon.src = '/icon/96.png';
  icon.width = 22;
  icon.height = 22;
  icon.alt = '';
  const brand = document.createElement('span');
  brand.textContent = 'Vellum';
  wordmark.append(icon, brand);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('switch', '');
  toggle.setAttribute('role', 'switch');
  toggle.className = 'switch';

  header.append(wordmark, toggle);

  // Site card
  const siteSection = document.createElement('section');
  siteSection.className = 'card site';

  const siteHead = document.createElement('div');
  siteHead.className = 'site-head';
  const hostEl = document.createElement('strong');
  hostEl.className = 'host';
  const badgeEl = document.createElement('span');
  badgeEl.className = 'badge';
  siteHead.append(hostEl, badgeEl);

  const staleRow = document.createElement('div');
  staleRow.className = 'stale-row';
  const staleText = document.createElement('span');
  staleText.className = 'stale-text';
  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'btn-secondary';
  staleRow.append(staleText, reloadBtn);

  const segmented = document.createElement('div');
  segmented.className = 'segmented';
  segmented.setAttribute('role', 'radiogroup');
  const segThumb = document.createElement('span');
  segThumb.className = 'seg-thumb';
  segThumb.setAttribute('aria-hidden', 'true');
  segmented.append(segThumb);

  const modeButtons = MODES.map((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.addEventListener('click', () => {
      if (!settings || !page?.state?.host) return;
      change(withSiteMode(settings, page.state.host, m.value));
    });
    segmented.append(btn);
    return { mode: m, btn };
  });

  siteSection.append(siteHead, staleRow, segmented);

  // Primary brightness card
  const controlsSection = document.createElement('section');
  controlsSection.className = 'card primary-control';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'reset-btn';
  resetBtn.addEventListener('click', () => {
    if (!settings) return;
    const host = page?.state?.host;
    change({
      ...(host ? withSiteWhite(settings, host, null) : settings),
      knee: DEFAULTS.knee,
      color: DEFAULTS.color,
    });
  });

  const whiteSlider = makeSlider({
    min: 0.6,
    max: 1,
    extraMeta: resetBtn,
    onInput: (white) => {
      if (!settings) return;
      const host = page?.state?.host;
      change(host ? withSiteWhite(settings, host, white) : { ...settings, white });
    },
  });
  controlsSection.append(whiteSlider.root);

  // Fine-tune progressive disclosure
  const fineTune = document.createElement('details');
  fineTune.className = 'card fine-tune';
  const fineSummary = document.createElement('summary');
  const fineBody = document.createElement('div');
  fineBody.className = 'fine-body';

  const kneeSlider = makeSlider({
    min: 0.45,
    max: 0.8,
    withHint: true,
    onInput: (v) => {
      if (!settings) return;
      const host = page?.state?.host;
      const white = (host ? settings.whites[host] : undefined) ?? page?.state?.white ?? settings.white;
      change({ ...settings, knee: Math.min(v, white - 0.02) });
    },
  });

  const colorSlider = makeSlider({
    min: 0,
    max: 1,
    withHint: true,
    onInput: (v) => {
      if (!settings) return;
      change({ ...settings, color: v });
    },
  });

  fineBody.append(kneeSlider.root, colorSlider.root);
  fineTune.append(fineSummary, fineBody);

  // Footer
  const footer = document.createElement('footer');
  const prefsLabel = document.createElement('label');
  prefsLabel.className = 'prefs';
  const langLabelText = document.createElement('span');
  langLabelText.className = 'sr-only';
  const langSelect = document.createElement('select');
  const langOptions = LANGS.map((l) => {
    const opt = document.createElement('option');
    opt.value = l.value;
    langSelect.append(opt);
    return { lang: l, opt };
  });
  langSelect.addEventListener('change', () => {
    if (!settings) return;
    change({ ...settings, lang: langSelect.value as LangSetting });
  });
  prefsLabel.append(langLabelText, langSelect);

  const shortcutEl = document.createElement('span');
  shortcutEl.className = 'shortcut';
  if (isMac) {
    shortcutEl.textContent = '⌥⇧V';
  } else {
    shortcutEl.textContent = 'Alt+Shift+V';
  }

  footer.append(prefsLabel, shortcutEl);

  main.append(header, siteSection, controlsSection, fineTune, footer);
  container.replaceChildren(main);

  // Event listeners
  toggle.addEventListener('change', () => {
    if (!settings) return;
    change({ ...settings, enabled: toggle.checked });
  });

  reloadBtn.addEventListener('click', async () => {
    if (page?.tabId === undefined) return;
    await browser.tabs.reload(page.tabId);
    refreshTimer = setTimeout(refreshPage, 800);
  });

  function render() {
    if (disposed || !settings) return;
    main.hidden = false;

    const lang = resolveLang(settings.lang);
    const t = strings(lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

    // Header
    toggle.checked = settings.enabled;
    toggle.setAttribute('aria-checked', String(settings.enabled));
    toggle.setAttribute('aria-label', t.enable);

    // Site & controls dimming
    siteSection.classList.toggle('dim', !settings.enabled);
    controlsSection.classList.toggle('dim', !settings.enabled);
    fineTune.classList.toggle('dim', !settings.enabled);

    const state = page?.state;
    const host = state?.host ?? '';
    const params = {
      knee: settings.knee,
      color: settings.color,
      white: (host ? settings.whites[host] : undefined) ?? state?.white ?? settings.white,
    };
    const isDefault =
      !(host && host in settings.whites) && settings.knee === DEFAULTS.knee && settings.color === DEFAULTS.color;
    const mode = host ? siteMode(settings, host) : 'auto';

    let status = t.unavailable;
    if (page?.stale) {
      status = t.reloadToApply;
    } else if (state) {
      status = state.dark === null ? t.detecting : state.dark ? t.darkPage : t.lightPage;
      if (state.dark && !state.active) status += t.off;
    }

    hostEl.textContent = host || t.thisPage;
    if (host) hostEl.title = host;
    else hostEl.removeAttribute('title');

    badgeEl.textContent = status;
    badgeEl.classList.toggle('on', Boolean(state?.active));

    const showStale = Boolean(page?.stale);
    staleRow.hidden = !showStale;
    staleText.textContent = t.openedBefore;
    reloadBtn.textContent = t.reload;

    segmented.hidden = !host;
    segmented.setAttribute('aria-label', host || t.thisPage);
    if (host) {
      const idx = MODES.findIndex((m) => m.value === mode);
      segmented.style.setProperty('--seg-idx', String(idx < 0 ? 0 : idx));
      for (const { mode: m, btn } of modeButtons) {
        const selected = mode === m.value;
        btn.textContent = t[m.label];
        btn.setAttribute('aria-checked', String(selected));
        btn.classList.toggle('selected', selected);
      }
    }

    // Primary white slider + conditional reset
    resetBtn.hidden = isDefault;
    resetBtn.disabled = isDefault;
    resetBtn.textContent = t.reset;

    const found = state?.active ? state.text : null;
    const shown = found ? mapLightness(found.l, found.c, params) : params.white;
    updateSlider(whiteSlider, t.white, params.white, 0.6, 1, shown);

    // Fine-tune disclosure
    fineSummary.textContent = t.fineTune;
    updateSlider(kneeSlider, t.knee, settings.knee, 0.45, 0.8, settings.knee, t.kneeHint);
    updateSlider(colorSlider, t.color, settings.color, 0, 1, settings.color, t.colorHint);

    // Footer
    langLabelText.textContent = t.language;
    langSelect.setAttribute('aria-label', t.language);
    for (const { lang: l, opt } of langOptions) {
      opt.textContent = l.label(t);
    }
    langSelect.value = settings.lang;
    shortcutEl.title = t.shortcut;
    shortcutEl.setAttribute('aria-label', t.shortcut);
  }

  function change(next: Settings) {
    settings = next;
    latest = next;
    render();
    if (writing !== null) return;
    writing = requestAnimationFrame(() => {
      writing = null;
      if (!disposed && latest) saveSettings(latest);
    });
  }

  async function refreshPage() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (disposed) return;
    const web = /^(https?|file):/.test(tab?.url ?? '');
    let state: PageState | null = null;
    if (tab?.id) {
      try {
        state = await browser.tabs.sendMessage(tab.id, { type: 'mlw:state' }, { frameId: 0 });
      } catch {
        // Browser internal pages and the web store run no content scripts.
      }
    }
    if (disposed) return;
    const stale = web && state?.protocol !== PAGE_PROTOCOL;
    page = { tabId: tab?.id, web, state: stale ? null : state, stale };
    render();
  }

  loadSettings().then((s) => {
    if (disposed) return;
    settings = s;
    render();
  });
  refreshPage();

  const unwatch = watchSettings(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshPage, 50);
  });

  return () => {
    disposed = true;
    clearTimeout(refreshTimer);
    if (writing !== null) cancelAnimationFrame(writing);
    unwatch();
    main.remove();
  };
}
