// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { KEEP_ATTR } from './keep';
import { mainText } from './text';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('mainText', () => {
  it('picks the most frequent bright text color and prunes kept and script subtrees', () => {
    const kept = document.createElement('div');
    kept.setAttribute(KEEP_ATTR, '');
    kept.style.color = 'rgb(255, 255, 255)';
    kept.textContent = 'This kept block is very long and must be ignored completely by mainText.';

    const script = document.createElement('script');
    script.style.color = 'rgb(255, 255, 255)';
    script.textContent = 'const x = "very long script content that must never be counted as visible page text";';

    const main = document.createElement('p');
    main.style.color = 'rgb(230, 230, 230)';
    main.textContent = 'Primary readable body text.';

    document.body.append(kept, script, main);
    const res = mainText(0.6);
    expect(res).not.toBeNull();
    expect(res!.l).toBeGreaterThan(0.85);
    expect(res!.l).toBeLessThan(0.98);
  });
});
