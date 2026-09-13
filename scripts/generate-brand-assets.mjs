import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const iconSizes = [16, 32, 48, 128];
const iconNames = ['brand', 'off', 'on'];

async function renderSvg(svg, width, height, output) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<style>html,body{margin:0;width:${width}px;height:${height}px;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`);
  await page.screenshot({ path: output, omitBackground: true });
  await page.close();
}

try {
  await mkdir('public/icons', { recursive: true });
  for (const name of iconNames) {
    const svg = await readFile(path.join('brand/source', `${name}.svg`), 'utf8');
    for (const size of iconSizes) await renderSvg(svg, size, size, path.join('public/icons', `${name}-${size}.png`));
  }

  await mkdir('store-assets', { recursive: true });
  const brandSvg = await readFile('brand/source/brand.svg', 'utf8');
  const symbol = brandSvg.replace(/<\/?svg[^>]*>/g, '');
  const promo = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#20266F"/><stop offset="1" stop-color="#087963"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    <circle cx="${width * .18}" cy="${height * .16}" r="${height * .42}" fill="#8C94FF" opacity=".12"/>
    <circle cx="${width * .83}" cy="${height * .84}" r="${height * .52}" fill="#12D4AD" opacity=".13"/>
    <g transform="translate(${width / 2 - height * .3} ${height * .2}) scale(${height * .6 / 128})">${symbol}</g>
  </svg>`;
  await renderSvg(promo(440, 280), 440, 280, 'store-assets/promo-small-440x280.png');
  await renderSvg(promo(1400, 560), 1400, 560, 'store-assets/promo-marquee-1400x560.png');

  const screenshot = (locale) => {
    const ru = locale === 'ru';
    const copy = ru ? {
      eyebrow: 'ОДНО ВИДЕО · ОДНА ВКЛАДКА', title: 'Исправьте зеркальное видео', body: 'Отражайте только кадр видео — интерфейс плеера останется на месте.',
      status: 'Видео отражено', button: 'Выключить', shortcut: 'Сочетание клавиш: Ctrl+Shift+M', label: 'До', label2: 'После', lang: 'RU',
    } : {
      eyebrow: 'ONE VIDEO · ONE TAB', title: 'Fix mirrored video instantly', body: 'Flip only the video frame while the player controls stay exactly where they belong.',
      status: 'Video mirrored', button: 'Turn off', shortcut: 'Shortcut: Ctrl+Shift+M', label: 'Before', label2: 'After', lang: 'EN',
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F5F6FF"/><stop offset="1" stop-color="#E9FBF6"/></linearGradient><linearGradient id="video" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#343BA3"/><stop offset="1" stop-color="#111638"/></linearGradient></defs>
      <rect width="1280" height="800" fill="url(#bg)"/>
      <text x="80" y="102" fill="#596078" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="2">${copy.eyebrow}</text>
      <text x="80" y="174" fill="#20243F" font-family="Arial,sans-serif" font-size="54" font-weight="750">${copy.title}</text>
      <text x="80" y="222" fill="#596078" font-family="Arial,sans-serif" font-size="24">${copy.body}</text>
      <rect x="80" y="282" width="740" height="420" rx="28" fill="url(#video)"/>
      <path d="M262 405h126v174H262zM638 405H512v174h126z" fill="#8C94FF" opacity=".18"/>
      <path d="M306 434l66 58-66 58z" fill="#8C94FF"/><path d="M594 434l-66 58 66 58z" fill="#12D4AD"/>
      <rect x="445" y="395" width="8" height="194" rx="4" fill="#FF6557"/>
      <text x="276" y="624" fill="#CCD0FF" font-family="Arial,sans-serif" font-size="17" font-weight="700">${copy.label}</text><text x="558" y="624" fill="#B9F8E8" font-family="Arial,sans-serif" font-size="17" font-weight="700">${copy.label2}</text>
      <rect x="855" y="256" width="345" height="322" rx="24" fill="#FFFFFF"/><rect x="855" y="256" width="345" height="322" rx="24" fill="none" stroke="#DCE0F0"/>
      <g transform="translate(879 280) scale(.32)">${symbol}</g>
      <text x="928" y="313" fill="#20243F" font-family="Arial,sans-serif" font-size="20" font-weight="700">AntiMirror</text>
      <rect x="1114" y="278" width="60" height="34" rx="9" fill="#F1F3FA"/><text x="1133" y="300" fill="#343BA3" font-family="Arial,sans-serif" font-size="12" font-weight="700">${copy.lang}</text>
      <text x="879" y="380" fill="#555D78" font-family="Arial,sans-serif" font-size="17">${copy.status}</text>
      <rect x="879" y="410" width="297" height="48" rx="12" fill="#09866E"/><text x="1027" y="441" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="16" font-weight="700">${copy.button}</text>
      <text x="879" y="499" fill="#69718A" font-family="Arial,sans-serif" font-size="13">${copy.shortcut}</text>
      <circle cx="118" cy="743" r="5" fill="#343BA3"/><text x="136" y="749" fill="#596078" font-family="Arial,sans-serif" font-size="16">AntiMirror 1.0</text>
    </svg>`;
  };
  await renderSvg(screenshot('en'), 1280, 800, 'store-assets/screenshot-en-1280x800.png');
  await renderSvg(screenshot('ru'), 1280, 800, 'store-assets/screenshot-ru-1280x800.png');
} finally {
  await browser.close();
}

console.log('brand icons and store assets generated');
