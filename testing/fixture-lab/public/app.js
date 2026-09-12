/* Test page only. The extension must never read this page's fixture globals. */
const cases = {
  basic: 'Обычный video и проверки потери/замены источника.',
  open: 'Video внутри открытого shadow root.',
  closed: 'Video внутри закрытого shadow root обычного div.',
  nested: 'Три вложенных shadow roots: open → closed → open.',
  'late-shadow': 'Уже подключённый div. Прикрепите shadow root во время поиска расширения.',
  slot: 'Video в light DOM, показанный через slot открытого root.',
  multiple: 'Два одинаково крупных видео: ожидается неоднозначность.',
  secondary: 'Основное видео и маленькое вторичное видео.',
  'no-video': 'На странице нет video. Автоматического ожидания после OFF быть не должно.',
  'canvas-only': 'Только canvas, не HTMLVideoElement: неподдерживаемый случай.',
  'frame-same': 'Видео в same-origin iframe; рядом посторонний рекламный iframe.',
  'frame-cross': 'Видео во втором origin (другой порт).',
  'frame-nested': 'Два уровня cross-origin iframe.',
  'shadow-frame': 'Cross-origin iframe внутри closed shadow root.',
  'frame-hidden': 'Видимое top video и невидимый крупный iframe.',
  'frame-srcdoc': 'Same-origin srcdoc iframe с video.',
  'frame-blank': 'Пустой about:blank iframe, заполненный после load.',
  transforms: 'У video есть translate, rotate, scale и backface-visibility:hidden.',
  'site-animation': 'Сайт сам анимирует transform. Его анимацию нельзя стирать.',
  important: 'Сайт применяет transform!important: нужен честный результат/conflict.',
  'origin-corner': 'transform-origin:0 0. Проверка сдвига при отражении.',
  'strict-csp': 'Строгий CSP, внешние локальные скрипт/стили; без inline script.',
  mutations: 'Включаемый поток посторонних DOM mutations; измерять отдельно от baseline.',
};
const params = new URLSearchParams(location.search);
const key = Object.hasOwn(cases, params.get('case')) ? params.get('case') : 'basic';
const app = document.getElementById('app');
const stage = document.getElementById('stage');
const controls = document.getElementById('controls');
const status = document.getElementById('status');
const mainOrigin = app.dataset.mainOrigin;
const frameOrigin = app.dataset.frameOrigin;
const videos = [];
const sources = new Map();
const frames = [];
const cleanups = new Set();
let lateHost = null;
let lateAttached = false;
let mutationTimer = null;
let lateTimer = null;
if (location.pathname === '/child') document.body.classList.add('compact');
document.getElementById('description').textContent = cases[key];
const selector = document.getElementById('case');
for (const name of Object.keys(cases)) {
  const option = document.createElement('option');
  option.value = name; option.textContent = name; option.selected = name === key; selector.append(option);
}
selector.addEventListener('change', () => {
  location.href = `${location.pathname}?case=${encodeURIComponent(selector.value)}`;
});
function say(text) { status.textContent = text; }
function button(text, fn) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  el.addEventListener('click', () => { Promise.resolve().then(fn).catch(error => say(String(error))); });
  controls.append(el); return el;
}
function syntheticSource(label, mountCanvas = null) {
  const canvas = mountCanvas ?? document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  let tick = 0; let content = 'A';
  function draw() {
    ctx.fillStyle = '#12253f'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#ec9858'; ctx.fillRect(0, 0, 120, 360);
    ctx.fillStyle = '#7dabef'; ctx.fillRect(520, 0, 120, 360);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif';
    ctx.fillText('LEFT', 12, 52); ctx.fillText('RIGHT', 528, 52);
    ctx.font = 'bold 29px sans-serif'; ctx.fillText(label, 145, 135);
    ctx.font = '22px sans-serif'; ctx.fillText(`CONTENT ${content} → 12345`, 145, 181);
    ctx.font = '17px sans-serif'; ctx.fillText(`frame ${tick++}`, 145, 218);
    ctx.fillStyle = '#b9e2cb'; ctx.beginPath(); ctx.moveTo(205, 270); ctx.lineTo(395, 270);
    ctx.lineTo(395, 249); ctx.lineTo(440, 281); ctx.lineTo(395, 313); ctx.lineTo(395, 291);
    ctx.lineTo(205, 291); ctx.closePath(); ctx.fill();
  }
  draw();
  const stream = mountCanvas ? null : canvas.captureStream(8);
  const timer = setInterval(draw, 125);
  let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true; clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop()); cleanups.delete(stop);
  };
  cleanups.add(stop);
  return { canvas, stream, stop, changeContent: () => { content = content === 'A' ? 'B' : 'A'; draw(); } };
}
function makeVideo(parent, label = 'MAIN VIDEO', sizing = '') {
  const figure = document.createElement('figure'); figure.className = `player ${sizing}`;
  const video = document.createElement('video'); video.muted = true; video.autoplay = true;
  video.controls = true; video.playsInline = true; video.dataset.fixtureVideo = label;
  const source = syntheticSource(label); video.srcObject = source.stream;
  const caption = document.createElement('figcaption'); caption.textContent = `${label} · synthetic MediaStream · 640×360`;
  figure.append(video, caption); parent.append(figure);
  videos.push(video); sources.set(video, source);
  video.play().catch(() => say('Autoplay отклонён браузером. Нажмите «Воспроизвести».'));
  return video;
}
function shadow(parent, mode) {
  const host = document.createElement('div'); host.className = 'shadow-host'; parent.append(host);
  const root = host.attachShadow({ mode });
  const style = document.createElement('style');
  style.textContent = `:host{display:block;width:100%;max-width:800px}figure{margin:0}video{display:block;width:100%;aspect-ratio:16/9;background:#000;border-radius:9px}figcaption{padding:10px 0;font:13px system-ui;color:#b4c0d6}.shadow-host{display:block;width:100%}iframe{width:100%;height:520px;border:1px solid #485775}`;
  root.append(style); return { host, root };
}
function iframe(parent, src, { hidden = false, ad = false } = {}) {
  const frame = document.createElement('iframe'); frame.title = ad ? 'Unrelated frame' : 'Target video frame';
  frame.allow = 'autoplay; fullscreen'; frame.allowFullscreen = true;
  frame.className = hidden ? 'hidden-frame' : ad ? 'ad' : '';
  frame.src = src; parent.append(frame); frames.push(frame); return frame;
}
function embeddedHTML(label) {
  // Fixture-owned source only, not an extension injection strategy.
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px;background:#121b2b;color:white}video{width:100%;max-width:760px}</style></head><body><p>${label}</p><video muted autoplay controls playsinline></video><script>
  const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');let n=0;
  function draw(){x.fillStyle='#16304f';x.fillRect(0,0,640,360);x.fillStyle='#ec9858';x.fillRect(0,0,140,360);x.fillStyle='white';x.font='32px sans-serif';x.fillText('LEFT → 12345',20,100);x.fillText('FRAME '+n++,170,220)}
  draw(); const v=document.querySelector('video');const stream=c.captureStream(8);v.srcObject=stream;v.play().catch(()=>{});const t=setInterval(draw,125);
  addEventListener('pagehide',()=>{clearInterval(t);stream.getTracks().forEach(t=>t.stop())});
  <\/script></body></html>`;
}
function first() { return videos.find(video => video.isConnected) ?? null; }
function attachLate() {
  if (!lateHost || lateAttached) return;
  lateAttached = true;
  const root = lateHost.attachShadow({ mode: 'closed' });
  const style = document.createElement('style'); style.textContent = 'video{width:100%;max-width:800px}figure{margin:0}'; root.append(style);
  makeVideo(root, 'LATE CLOSED ROOT'); say('Закрытый root прикреплён к существовавшему div.');
}
function removeVideo() {
  const video = first(); if (!video) return;
  video.remove(); say('Video отсоединён; расширение должно снять отражение и перейти OFF.');
}
function replaceVideo() {
  const old = first(); if (!old) return;
  const parent = old.parentElement?.parentNode;
  old.parentElement?.remove();
  if (parent) makeVideo(parent, 'REPLACEMENT');
  say('Создан новый HTMLVideoElement. Автоматический перенос ON запрещён.');
}
function reparentVideo() {
  const video = first(); if (!video) return;
  const current = video.parentNode;
  const holder = document.createElement('div'); current.append(holder);
  holder.append(video); // Detached/reconnected synchronously in one task.
  say('Тот же video перемещён синхронно. ON должен сохраниться.');
}
function swapStream() {
  const video = first(); if (!video) return;
  sources.get(video)?.stop(); const source = syntheticSource('NEW STREAM');
  sources.set(video, source); video.srcObject = source.stream; video.play().catch(() => {});
  say('srcObject заменён. Должен быть OFF.');
}
function sameStreamContent() {
  const video = first(); if (!video) return;
  sources.get(video)?.changeContent();
  say('Картинка поменялась внутри того же stream: это известный предел обнаружения.');
}
function mutationStorm() {
  if (mutationTimer) { clearInterval(mutationTimer); mutationTimer = null; say('Mutation storm остановлен.'); return; }
  const noise = document.createElement('div'); noise.className = 'noise'; stage.append(noise);
  mutationTimer = setInterval(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 40; i++) { const node = document.createElement('span'); node.textContent = String(i); fragment.append(node); }
    noise.replaceChildren(fragment);
  }, 100);
  say('Mutation storm включён: 400 новых элементов/s. Его нагрузку измерять как baseline.');
}

switch (key) {
  case 'open': makeVideo(shadow(stage, 'open').root, 'OPEN ROOT'); break;
  case 'closed': makeVideo(shadow(stage, 'closed').root, 'CLOSED ROOT'); break;
  case 'nested': {
    const a = shadow(stage, 'open'); const b = shadow(a.root, 'closed');
    makeVideo(shadow(b.root, 'open').root, 'NESTED ROOTS'); break;
  }
  case 'late-shadow': lateHost = document.createElement('div'); lateHost.className = 'shadow-host'; stage.append(lateHost); break;
  case 'slot': {
    const {host, root} = shadow(stage, 'open'); root.append(document.createElement('slot'));
    makeVideo(host, 'SLOTTED VIDEO'); break;
  }
  case 'multiple': makeVideo(stage, 'VIDEO ONE', 'equal'); makeVideo(stage, 'VIDEO TWO', 'equal'); break;
  case 'secondary': makeVideo(stage); makeVideo(stage, 'SECONDARY', 'small'); break;
  case 'no-video': stage.textContent = 'Video отсутствует. Добавьте его кнопкой после завершения поиска.'; break;
  case 'canvas-only': {
    const canvas = document.createElement('canvas'); stage.append(canvas); syntheticSource('CANVAS ONLY', canvas); break;
  }
  case 'frame-same': iframe(stage, `${location.origin}/child?case=basic`); iframe(stage, `${location.origin}/child?case=no-video`, {ad:true}); break;
  case 'frame-cross': iframe(stage, `${frameOrigin}/child?case=basic`); break;
  case 'frame-nested': {
    if (params.get('depth') === '1') iframe(stage, `${mainOrigin}/child?case=closed`);
    else iframe(stage, `${frameOrigin}/child?case=frame-nested&depth=1`);
    break;
  }
  case 'shadow-frame': iframe(shadow(stage, 'closed').root, `${frameOrigin}/child?case=basic`); break;
  case 'frame-hidden': makeVideo(stage, 'VISIBLE MAIN'); iframe(stage, `${frameOrigin}/child?case=basic`, {hidden:true}); break;
  case 'frame-srcdoc': { const frame = iframe(stage, 'about:blank'); frame.srcdoc = embeddedHTML('SRCDOC VIDEO'); break; }
  case 'frame-blank': {
    const frame = document.createElement('iframe'); frame.title = 'about:blank video';
    frame.allow = 'autoplay';
    frame.addEventListener('load', function fill() {
      frame.removeEventListener('load', fill);
      const doc = frame.contentDocument; doc.open(); doc.write(embeddedHTML('ABOUT:BLANK VIDEO')); doc.close();
    }, {once:true});
    stage.append(frame); frames.push(frame); break;
  }
  case 'transforms': makeVideo(stage).classList.add('transformed'); break;
  case 'site-animation': makeVideo(stage).classList.add('rotate-site'); break;
  case 'important': makeVideo(stage).classList.add('important-transform'); break;
  case 'origin-corner': makeVideo(stage).classList.add('origin-corner'); break;
  default: makeVideo(stage);
}
button('Воспроизвести', () => Promise.all(videos.filter(v => v.isConnected).map(v => v.play())));
button('Добавить video', () => makeVideo(stage, 'ADDED VIDEO'));
button('Удалить video', removeVideo);
button('Заменить video', replaceVideo);
button('Переместить тот же узел', reparentVideo);
button('Заменить srcObject', swapStream);
button('Картинка в том же stream', sameStreamContent);
button('Fullscreen', () => first()?.requestFullscreen());
button('pushState: новый URL', () => { const u=new URL(location.href);u.searchParams.set('route',String(Date.now()));history.pushState({},'',u);say('URL изменён через pushState.'); });
button('replaceState: тот же URL', () => { history.replaceState({n:Date.now()},'',location.href);say('URL не изменился. ON должен сохраниться.'); });
button('Новый hash', () => { location.hash = `anchor-${Date.now()}`; });
button('Удалить целевой iframe', () => { frames.find(f=>!f.classList.contains('ad'))?.remove();say('Целевой iframe удалён.'); });
button('Удалить посторонний iframe', () => { frames.find(f=>f.classList.contains('ad'))?.remove();say('Посторонний iframe удалён. ON должен сохраниться.'); });
if (key === 'late-shadow') {
  button('Прикрепить root сейчас', attachLate);
  button('Прикрепить root через 1 секунду', () => { clearTimeout(lateTimer); lateTimer=setTimeout(attachLate,1000);say('Теперь включите расширение: root появится во время поиска.'); });
}
if (key === 'mutations') button('Mutation storm ON/OFF', mutationStorm);
window.__antiMirrorFixture = {
  case: key, videos, frames, first, removeVideo, replaceVideo, reparentVideo,
  swapStream, sameStreamContent, attachLate, mutationStorm,
  summary: () => ({case:key, videoCount:videos.filter(v=>v.isConnected).length, frameCount:frames.filter(f=>f.isConnected).length, lateAttached}),
};
window.addEventListener('pagehide', () => {
  for (const stop of [...cleanups]) stop(); clearInterval(mutationTimer); clearTimeout(lateTimer);
}, {once:true});
say(`Готово: ${key}. Выберите video через расширение; эта страница не управляет его состоянием.`);
