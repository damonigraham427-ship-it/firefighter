const params = new URLSearchParams(location.search);
const file = params.get('exam');
const wantMode = params.get('mode');
const topicParam = params.get('topic');
const tierParam = params.get('tier');
// This exam's own Notepad / Quality pads
document.querySelectorAll('a[href="notepad.html"]').forEach(function (a) { a.href = 'notepad.html?exam=' + encodeURIComponent(file); });
document.querySelectorAll('a[href="quality.html"]').forEach(function (a) { a.href = 'quality.html?exam=' + encodeURIComponent(file); });
let storageKey = file;
let isRedund = false;
let isCoverage = false;
let isMeta = false;
let isMeta10 = false;
let exam, examTitle = file, idx = 0, score = 0;
const answers = [];
let lastMissed = [];
let lastFlagged = [];
let lastQuality = [];
let lastResearch = [];
const flagged = new Set();
const quality = new Set();
const research = new Set();
let entry = null;
let runOrder = null;
// Time tracker: ACTIVE time only (changed Nov 24, 2026). 'secs' banks
// active seconds: the clock runs only while the page is in front AND the
// user has interacted within the last 2 minutes. Switching away pauses it
// at once; 2 idle minutes pause it until the next tap or key. Every
// progress save carries the accumulated 'secs' so far; a finished attempt
// records the total.
let bankedSecs = 0;
let activeSecs = 0;
let lastTick = Date.now();
let lastInteract = Date.now();
let inFront = true;
function activeTick() {
  const now = Date.now();
  if (inFront && !document.hidden && now - lastInteract < 120000) {
    activeSecs += (now - lastTick) / 1000;
  }
  lastTick = now;
}
function resetSegment() {
  activeSecs = 0;
  lastTick = Date.now();
  lastInteract = Date.now();
}
setInterval(activeTick, 1000);
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
  document.addEventListener(ev, function () { lastInteract = Date.now(); }, { passive: true });
});
document.addEventListener('visibilitychange', function () { if (!document.hidden) lastInteract = Date.now(); activeTick(); });
window.addEventListener('blur', function () { activeTick(); inFront = false; });
window.addEventListener('focus', function () { inFront = true; lastInteract = Date.now(); lastTick = Date.now(); });
function elapsedSecs() { activeTick(); return Math.round(bankedSecs + activeSecs); }

function buildMetaQuestions(pool) {
  const N = pool.length;
  const bands = [];
  for (let b = 0; b < 20; b++) bands.push([Math.floor(b * N / 20), Math.floor((b + 1) * N / 20)]);
  const tier = b => (b * 5 + 1) + '\u2013' + ((b + 1) * 5) + '%';
  const ans = i => pool[i].choices[pool[i].answer];
  const isFrac = /as a (percentage|decimal)/.test(pool[0].question);
  function neighbors(b) {
    const out = [];
    [b - 1, b + 1, b - 2, b + 2, b - 3, b + 3, b - 4, b + 4].forEach(x => { if (x >= 0 && x < 20 && !out.includes(x)) out.push(x); });
    return out.slice(0, 3);
  }
  function place(list, seed) {
    const pos = ((seed * 7 + 3) % 4 + 4) % 4;
    const arr = list.slice(1);
    arr.splice(pos, 0, list[0]);
    return { choices: arr, answer: pos };
  }
  function fracOf(i) { const m = pool[i].question.match(/(\d+)\/(\d+)/); return m ? [m[1], m[2]] : null; }
  function pctAnswerOf(k, den) {
    for (let i = 0; i < N; i++) {
      if (pool[i].question === 'What is ' + k + '/' + den + ' as a percentage?') return ans(i);
    }
    return '';
  }
  function rangeStr(b) {
    const lo = bands[b][0], hi = bands[b][1];
    if (isFrac) {
      const f1 = fracOf(lo), f2 = fracOf(hi - 1);
      return f1[0] === f2[0] ? f1[0] + '/' + f1[1] : f1[0] + '/' + f1[1] + ' \u2013 ' + f2[0] + '/' + f2[1];
    }
    const a = ans(lo), c = ans(hi - 1);
    return a === c ? a : a + ' \u2013 ' + c;
  }
  const out = [];
  for (let b = 0; b < 20; b++) {
    const lo = bands[b][0], hi = bands[b][1];
    const nb = neighbors(b);
    if (b % 2 === 0) {
      const p = place([rangeStr(b)].concat(nb.map(rangeStr)), b);
      let expl;
      if (isFrac) {
        const f1 = fracOf(lo), f2 = fracOf(hi - 1);
        expl = 'The ' + tier(b) + ' tier runs from ' + f1[0] + '/' + f1[1] + ' (' + pctAnswerOf(f1[0], f1[1]) + ') to ' + f2[0] + '/' + f2[1] + ' (' + pctAnswerOf(f2[0], f2[1]) + ').';
      } else {
        expl = 'The ' + tier(b) + ' tier runs from "' + pool[lo].question + '" (' + ans(lo) + ') to "' + pool[hi - 1].question + '" (' + ans(hi - 1) + ').';
      }
      out.push({ question: (isFrac ? 'Which fractions sit in the ' : 'Which answer range falls in the ') + tier(b) + ' tier?',
                 choices: p.choices, answer: p.answer, explanation: expl, source: 'Meta \u2014 tiers' });
    } else {
      const m = lo + Math.floor((hi - lo) / 2);
      const p = place([tier(b)].concat(nb.map(tier)), b);
      let qtext, expl;
      if (isFrac) {
        const f = fracOf(m);
        qtext = f[0] + '/' + f[1] + ' (' + pctAnswerOf(f[0], f[1]) + ') falls in which tier?';
        expl = f[0] + '/' + f[1] + ' is entry ' + (m + 1) + ' of ' + N + ', inside the ' + tier(b) + ' tier.';
      } else {
        qtext = ans(m) + ' is an answer in which tier?';
        expl = ans(m) + ' answers "' + pool[m].question + '" \u2014 entry ' + (m + 1) + ' of ' + N + ', inside the ' + tier(b) + ' tier.';
      }
      out.push({ question: qtext, choices: p.choices, answer: p.answer, explanation: expl, source: 'Meta \u2014 tiers' });
    }
  }
  return out;
}

function buildBlockQuestions(pool) {
  const N = pool.length;
  const blocks = [];
  for (let k = 0; k < 10; k++) blocks.push([Math.floor(k * N / 10), Math.floor((k + 1) * N / 10)]);
  const label = k => (k * 10 + 1) + '\u2013' + ((k + 1) * 10) + '%';
  const ans = i => pool[i].choices[pool[i].answer];
  const isFrac = /as a (percentage|decimal)/.test(pool[0].question);
  function neighbors(k) {
    const out = [];
    [k - 1, k + 1, k - 2, k + 2, k - 3, k + 3].forEach(x => { if (x >= 0 && x < 10 && !out.includes(x)) out.push(x); });
    return out.slice(0, 3);
  }
  function place(list, seed) {
    const pos = ((seed * 7 + 3) % 4 + 4) % 4;
    const arr = list.slice(1);
    arr.splice(pos, 0, list[0]);
    return { choices: arr, answer: pos };
  }
  function fracOf(i) { const m = pool[i].question.match(/(\d+)\/(\d+)/); return m ? [m[1], m[2]] : null; }
  function pctAnswerOf(k, den) {
    for (let i = 0; i < N; i++) {
      if (pool[i].question === 'What is ' + k + '/' + den + ' as a percentage?') return ans(i);
    }
    return '';
  }
  function rangeStr(k) {
    const lo = blocks[k][0], hi = blocks[k][1];
    if (isFrac) {
      const f1 = fracOf(lo), f2 = fracOf(hi - 1);
      return f1[0] === f2[0] ? f1[0] + '/' + f1[1] : f1[0] + '/' + f1[1] + ' \u2013 ' + f2[0] + '/' + f2[1];
    }
    const a = ans(lo), c = ans(hi - 1);
    return a === c ? a : a + ' \u2013 ' + c;
  }
  const out = [];
  for (let k = 0; k < 10; k++) {
    const lo = blocks[k][0], hi = blocks[k][1];
    const nb = neighbors(k);
    if (k % 2 === 0) {
      const p = place([rangeStr(k)].concat(nb.map(rangeStr)), k);
      let expl;
      if (isFrac) {
        const f1 = fracOf(lo), f2 = fracOf(hi - 1);
        expl = 'The ' + label(k) + ' block runs from ' + f1[0] + '/' + f1[1] + ' (' + pctAnswerOf(f1[0], f1[1]) + ') to ' + f2[0] + '/' + f2[1] + ' (' + pctAnswerOf(f2[0], f2[1]) + ').';
      } else {
        expl = 'The ' + label(k) + ' block runs from "' + pool[lo].question + '" (' + ans(lo) + ') to "' + pool[hi - 1].question + '" (' + ans(hi - 1) + ').';
      }
      out.push({ question: (isFrac ? 'Which fractions sit in the ' : 'Which answer range falls in the ') + label(k) + ' block?',
                 choices: p.choices, answer: p.answer, explanation: expl, source: 'Meta 10 \u2014 blocks' });
    } else {
      const m = lo + Math.floor((hi - lo) / 2);
      const p = place([label(k)].concat(nb.map(label)), k);
      let qtext, expl;
      if (isFrac) {
        const f = fracOf(m);
        qtext = f[0] + '/' + f[1] + ' (' + pctAnswerOf(f[0], f[1]) + ') falls in which 10% block?';
        expl = f[0] + '/' + f[1] + ' is entry ' + (m + 1) + ' of ' + N + ', inside the ' + label(k) + ' block.';
      } else {
        qtext = ans(m) + ' is an answer in which 10% block?';
        expl = ans(m) + ' answers "' + pool[m].question + '" \u2014 entry ' + (m + 1) + ' of ' + N + ', inside the ' + label(k) + ' block.';
      }
      out.push({ question: qtext, choices: p.choices, answer: p.answer, explanation: expl, source: 'Meta 10 \u2014 blocks' });
    }
  }
  return out;
}

function shuffleIdx(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}


// ================= FIREFIGHTER FORK =================
// This exam.js is a deliberate fork of the shared runner for the
// Firefighter portal only. It adds support for the firefighter data
// fields — passage, fig (svg / 3d), choiceFigs, choiceScenes,
// multi-answer questions (answer is an array: select exactly that many,
// correct only when the picked set equals the keyed set) and variable
// choice counts (2-6). Single-answer questions keep the original
// behavior and the original examProgress storage shapes exactly:
// answers[i] stays a number for them, an array only for multi-answer.
function isMulti(q) { return Array.isArray(q.answer); }
function answerList(q) { return isMulti(q) ? q.answer.slice() : [q.answer]; }
function correctText(q) { return answerList(q).map(function (i) { return q.choices[i]; }).join(' and '); }
function pickedText(q, picked) {
  if (picked === undefined) return '(no answer)';
  if (Array.isArray(picked)) return picked.slice().sort(function (a, b) { return a - b; }).map(function (i) { return q.choices[i]; }).join(' and ');
  return q.choices[picked];
}
function isCorrect(q, picked) {
  if (picked === undefined) return false;
  if (isMulti(q)) {
    if (!Array.isArray(picked) || picked.length !== q.answer.length) return false;
    const a = picked.slice().sort(function (x, y) { return x - y; });
    const b = q.answer.slice().sort(function (x, y) { return x - y; });
    return a.every(function (v, i) { return v === b[i]; });
  }
  return picked === q.answer;
}
function multiDone(q, picked) { return isMulti(q) && Array.isArray(picked) && picked.length === q.answer.length; }

// ---- 3D figures: declarative scene specs rendered with Three.js ----
// A scene is { objects: [{shape, pos, size, rot, color, teeth}], camera,
// note }. describeScene() turns a spec into plain mesh descriptors (no
// THREE needed) so the parsing path can be tested on its own; the actual
// rendering lazy-loads three@0.158.0 as an ES module from unpkg and
// draws into a ~320px canvas the user can drag to rotate.
const FF3D = (function () {
  function describeScene(scene) {
    const objs = (scene && scene.objects) || [];
    return objs.map(function (o) {
      const size = (o.size && o.size.length) ? o.size.slice() : [1, 1, 1];
      while (size.length < 3) size.push(size[size.length - 1]);
      const d = {
        shape: o.shape || 'box',
        pos: (o.pos || [0, 0, 0]).slice(),
        rot: (o.rot || [0, 0, 0]).slice(),
        color: o.color || null,
        teeth: o.teeth || 0,
        size: size,
        kind: 'box',
        radius: 0, height: 0, depth: 0
      };
      const h = size.length > 2 ? size[2] : size[1];
      switch (d.shape) {
        case 'cylinder': d.kind = 'cylinder'; d.radius = size[0] / 2; d.height = h; break;
        case 'pulley': d.kind = 'cylinder'; d.radius = size[0] / 2; d.height = h; break;
        case 'prism': d.kind = 'prism'; d.radius = size[0] / 2; d.height = h; break;
        case 'pyramid': d.kind = 'pyramid'; d.radius = size[0] / 2; d.height = size[1]; break;
        case 'cone': d.kind = 'cone'; d.radius = size[0] / 2; d.height = size[1]; break;
        case 'sphere': d.kind = 'sphere'; d.radius = size[0] / 2; break;
        case 'gear': d.kind = 'gear'; d.radius = size[0] / 2; d.depth = h; d.teeth = o.teeth || 8; break;
        case 'lever': d.kind = 'box'; break; // a lever is a thin box; size already says so
        default: d.kind = 'box';
      }
      return d;
    });
  }
  let threePromise = null;
  function loadThree() {
    // Fix #3 (Nov 27, 2026): the old window.__THREE__ shortcut (a test
    // hook from the scaffold) is REMOVED. Live diagnostics proved that
    // by the second question window.__THREE__ held a 3-character string,
    // so loadThree returned that string and every THREE.* constructor
    // failed ("THREE.Scene is not a constructor"). The import promise
    // is now the only path, and the resolved module is validated.
    if (!threePromise) {
      try {
        threePromise = import('https://unpkg.com/three@0.158.0/build/three.module.js')
          .then(function (m) { return (m && typeof m.Scene === 'function') ? m : null; })
          .catch(function () { return null; });
      } catch (e) { threePromise = Promise.resolve(null); }
    }
    return threePromise;
  }
  // ONE shared WebGL renderer for the whole page (fixed Nov 27, 2026).
  // The first design gave every figure its own WebGLRenderer; browsers
  // cap live WebGL contexts, so from the second 3D question on, new
  // contexts failed and only the scene note showed — even with disposal
  // between questions. Now each figure owns a plain 2D canvas; the one
  // shared renderer draws the figure's scene and the pixels are copied
  // across. Dragging re-draws that figure through the shared renderer.
  let sharedRenderer = null;
  function getSharedRenderer(THREE) {
    if (!sharedRenderer) {
      sharedRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      sharedRenderer.setSize(320, 240);
      if (sharedRenderer.setClearColor) sharedRenderer.setClearColor(0xf8fafc);
    }
    return sharedRenderer;
  }
  const active = [];
  function disposeAll() {
    // The shared context is never disposed — it serves every question.
    // Just retire the per-figure records so stale drags/draws stop.
    active.forEach(function (r) { r.dead = true; });
    active.length = 0;
  }
  const DEFAULT_COLORS = { box: '#5b8def', cylinder: '#64748b', pulley: '#475569', prism: '#0ea5e9', pyramid: '#f59e0b', cone: '#f97316', sphere: '#a855f7', gear: '#78716c' };
  function geometryFor(THREE, d) {
    let g;
    switch (d.kind) {
      case 'cylinder': g = new THREE.CylinderGeometry(d.radius, d.radius, d.height, 40); g.rotateX(Math.PI / 2); return g;
      case 'prism': g = new THREE.CylinderGeometry(d.radius, d.radius, d.height, 3); g.rotateX(Math.PI / 2); return g;
      case 'pyramid': return new THREE.ConeGeometry(d.radius, d.height, 4);
      case 'cone': return new THREE.ConeGeometry(d.radius, d.height, 40);
      case 'sphere': return new THREE.SphereGeometry(d.radius, 24, 18);
      case 'gear': {
        const teeth = Math.max(3, d.teeth || 8);
        const R = d.radius, rIn = R * 0.78;
        const shape = new THREE.Shape();
        const seg = (Math.PI * 2) / (teeth * 4);
        for (let i = 0; i <= teeth * 4; i++) {
          const phase = i % 4;
          const rad = (phase === 1 || phase === 2) ? R : rIn;
          const a = i * seg;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
        if (THREE.Path) {
          const hole = new THREE.Path();
          hole.absarc(0, 0, R * 0.25, 0, Math.PI * 2, true);
          shape.holes.push(hole);
        }
        g = new THREE.ExtrudeGeometry(shape, { depth: d.depth, bevelEnabled: false });
        g.translate(0, 0, -d.depth / 2);
        return g;
      }
      default: return new THREE.BoxGeometry(d.size[0], d.size[1], d.size[2]);
    }
  }
  function renderInto(container, scene) {
    const holder = document.createElement('div');
    holder.className = 'fig-3d';
    container.appendChild(holder);
    const note = (scene && scene.note) || '';
    const label = document.createElement('p');
    label.className = 'fig-3d-note';
    label.textContent = 'Loading 3D figure\u2026';
    holder.appendChild(label);
    loadThree().then(function (THREE) {
      if (!THREE) {
        label.textContent = note ? '3D figure: ' + note : '3D figure could not be loaded.';
        return;
      }
      label.textContent = note;
      const renderer = getSharedRenderer(THREE);
      const descriptors = describeScene(scene);
      const sc = new THREE.Scene();
      const group = new THREE.Group();
      sc.add(group);
      const center = [0, 0, 0];
      descriptors.forEach(function (d) { center[0] += d.pos[0]; center[1] += d.pos[1]; center[2] += d.pos[2]; });
      if (descriptors.length) { center[0] /= descriptors.length; center[1] /= descriptors.length; center[2] /= descriptors.length; }
      descriptors.forEach(function (d) {
        const mat = new THREE.MeshStandardMaterial({ color: d.color || DEFAULT_COLORS[d.shape] || '#5b8def', roughness: 0.6, metalness: 0.1 });
        const mesh = new THREE.Mesh(geometryFor(THREE, d), mat);
        mesh.position.set(d.pos[0] - center[0], d.pos[1] - center[1], d.pos[2] - center[2]);
        const rad = function (v) { return (v || 0) * Math.PI / 180; };
        mesh.rotation.set(rad(d.rot[0]), rad(d.rot[1]), rad(d.rot[2]));
        group.add(mesh);
      });
      const amb = new THREE.AmbientLight(0xffffff, 0.75); sc.add(amb);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(5, 8, 6); sc.add(dir);
      const cam = new THREE.PerspectiveCamera(45, 320 / 240, 0.1, 200);
      if (scene && Array.isArray(scene.camera) && scene.camera.length === 3) cam.position.set(scene.camera[0], scene.camera[1], scene.camera[2]);
      else cam.position.set(center[0] + 6, center[1] + 4, center[2] + 9);
      if (cam.lookAt) cam.lookAt(center[0], center[1], center[2]);
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      canvas.style.touchAction = 'none';
      holder.appendChild(canvas);
      const ctx2d = canvas.getContext('2d');
      const rec = { dead: false };
      active.push(rec);
      const draw = function () {
        if (rec.dead) return;
        renderer.render(sc, cam);
        if (ctx2d && renderer.domElement) ctx2d.drawImage(renderer.domElement, 0, 0);
      };
      draw();
      let dragging = false, px = 0, py = 0;
      if (canvas.addEventListener) {
        canvas.addEventListener('pointerdown', function (ev) { dragging = true; px = ev.clientX; py = ev.clientY; });
        canvas.addEventListener('pointermove', function (ev) {
          if (!dragging) return;
          group.rotation.y += (ev.clientX - px) * 0.01;
          group.rotation.x += (ev.clientY - py) * 0.01;
          px = ev.clientX; py = ev.clientY;
          draw();
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { canvas.addEventListener(t, function () { dragging = false; }); });
      }
    }).catch(function () {
      label.textContent = note ? '3D figure: ' + note : '3D figure could not be loaded.';
    });
  }
  return { describeScene: describeScene, renderInto: renderInto, disposeAll: disposeAll };
})();
if (typeof window !== 'undefined') window.FF3D = FF3D;

function renderFigInto(el, fig) {
  if (!el || !fig) return;
  if (fig.type === 'svg' && fig.svg) {
    const d = document.createElement('div');
    d.className = 'fig-svg';
    d.innerHTML = fig.svg;
    el.appendChild(d);
  } else if (fig.type === '3d' && fig.scene) {
    FF3D.renderInto(el, fig.scene);
  }
}

// Population run (NREMT hub, Damoni, Nov 26, 2026): a virtual exam whose
// questions were collected by population.js from many sets — new questions
// and his ★ / ⚑ marks. Each question carries srcFile/srcIdx so finish()
// can write the answers back into the source sets.
const isPopulation = file === '__population__';
const populationManifest = isPopulation ? (() => { try { return JSON.parse(localStorage.getItem('populationRun') || 'null'); } catch (e) { return null; } })() : null;

Promise.all([
  fetch('index.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
  isPopulation ? Promise.resolve(populationManifest) : fetch(file, { cache: 'no-store' }).then(r => r.json())
]).then(([idxData, data]) => {
  entry = ((idxData && idxData.exams) || []).find(e => e.file === file) || null;
  if (entry) examTitle = entry.title;
  if (isPopulation) examTitle = (data && data.title) || 'Population \u2014 new & marked';
  // Back links return to this exam's own subject page, not the top-level
  // list (Damoni, Nov 23, 2026): NREMT -> its chapter circle, the number
  // series -> their circle pages, anything else -> its subject exam list.
  if (entry) {
    let back = 'exams.html';
    if (entry.category === 'NREMT') back = 'topics.html?ch=' + encodeURIComponent(entry.chapter);
    else if (entry.category === 'Firefighter') back = 'topics.html?ch=' + encodeURIComponent(entry.chapter);
    else if (entry.category === '60 Minutes') back = 'hour-topics.html';
    else if (entry.category === 'Fraction Bases') back = 'fraction-topics.html';
    else back = 'exams.html?cat=' + encodeURIComponent(entry.category || 'General') +
      (entry.chapter !== undefined ? '&ch=' + encodeURIComponent(entry.chapter) : '');
    document.querySelectorAll('a[href="exams.html"]').forEach(a => { a.href = back; });
  }
  document.getElementById('exam-title').textContent = examTitle;
  exam = data;
  if (data.title) { examTitle = data.title; document.getElementById('exam-title').textContent = examTitle; }
  const pool = data.questions;
  const isTopic = !!(topicParam && pool.some(q => q.topic === topicParam));
  if (isTopic) {
    storageKey = file + '#topic:' + topicParam;
    examTitle = examTitle + ' \u2014 Topic: ' + topicParam;
    document.getElementById('exam-title').textContent = examTitle;
  }
  // Hour series tier run: &tier=<0-19> runs every question in that 5% tier
  // of the pool (same bands as Meta/Coverage), keyed file#tier:<b> like
  // topic runs are keyed file#topic:<name>.
  const tierB = (tierParam !== null && /^\d+$/.test(tierParam) && +tierParam < 20 && entry && entry.draw) ? +tierParam : -1;
  const isTier = tierB >= 0 && !isTopic;
  if (isTier) {
    storageKey = file + '#tier:' + tierB;
    examTitle = examTitle + ' \u2014 Tier ' + (tierB * 5 + 1) + '\u2013' + ((tierB + 1) * 5) + '%';
    document.getElementById('exam-title').textContent = examTitle;
  }
  isRedund = !!(wantMode === 'redundancy' && entry && Array.isArray(entry.redundancy) && entry.redundancy.length);
  isCoverage = !!(wantMode === 'coverage' && entry && entry.draw);
  isMeta = !!(wantMode === 'meta' && entry && entry.draw);
  isMeta10 = !!(wantMode === 'meta10' && entry && entry.draw);
  if (isMeta10) {
    storageKey = file + '#meta10';
    examTitle = examTitle + ' \u2014 Meta 10';
    document.getElementById('exam-title').textContent = examTitle;
  } else if (isMeta) {
    storageKey = file + '#meta';
    examTitle = examTitle + ' \u2014 Meta';
    document.getElementById('exam-title').textContent = examTitle;
  } else if (isRedund) {
    storageKey = file + '#redundancy';
    examTitle = examTitle + ' \u2014 Redundancy';
    document.getElementById('exam-title').textContent = examTitle;
  } else if (isCoverage) {
    storageKey = file + '#coverage';
    examTitle = examTitle + ' \u2014 Coverage';
    document.getElementById('exam-title').textContent = examTitle;
  }
  try {
    const all = JSON.parse(localStorage.getItem(PKEY) || '{}');
    const p = all[storageKey];
    if (isTopic) {
      const tqs = pool.filter(q => q.topic === topicParam);
      exam = Object.assign({}, data, { questions: tqs });
      if (p && p.total === tqs.length && p.idx < tqs.length) {
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
      }
    } else if (isTier) {
      const lo = Math.floor(tierB * pool.length / 20);
      const hi = Math.floor((tierB + 1) * pool.length / 20);
      const tqs = pool.slice(lo, hi);
      exam = Object.assign({}, data, { questions: tqs });
      if (p && p.total === tqs.length && p.idx < tqs.length) {
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
      }
    } else if (isMeta10) {
      const blockQs = buildBlockQuestions(pool);
      let restored = false;
      if (p && Array.isArray(p.order) && p.order.length === blockQs.length && p.total === blockQs.length &&
          p.order.every(i => i >= 0 && i < blockQs.length) && p.idx < blockQs.length) {
        runOrder = p.order;
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
        restored = true;
      }
      if (!restored) runOrder = shuffleIdx(blockQs.length);
      exam = Object.assign({}, data, { questions: runOrder.map(i => blockQs[i]) });
    } else if (isMeta) {
      const metaQs = buildMetaQuestions(pool);
      let restored = false;
      if (p && Array.isArray(p.order) && p.order.length === metaQs.length && p.total === metaQs.length &&
          p.order.every(i => i >= 0 && i < metaQs.length) && p.idx < metaQs.length) {
        runOrder = p.order;
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
        restored = true;
      }
      if (!restored) runOrder = shuffleIdx(metaQs.length);
      exam = Object.assign({}, data, { questions: runOrder.map(i => metaQs[i]) });
    } else if (isRedund) {
      const picks = entry.redundancy.filter(i => i >= 0 && i < pool.length);
      const drawN = picks.length;
      let restored = false;
      if (p && Array.isArray(p.order) && p.order.length === drawN && p.total === drawN &&
          p.order.every(i => picks.indexOf(i) !== -1) && p.idx < drawN) {
        runOrder = p.order;
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
        restored = true;
      }
      if (!restored) runOrder = shuffleIdx(drawN).map(i => picks[i]);
      exam = Object.assign({}, data, { questions: runOrder.map(i => pool[i]) });
    } else if (isCoverage) {
      const drawN = Math.min(20, pool.length);
      let restored = false;
      if (p && Array.isArray(p.order) && p.order.length === drawN && p.total === drawN &&
          p.order.every(i => i >= 0 && i < pool.length) && p.idx < drawN) {
        runOrder = p.order;
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
        restored = true;
      }
      if (!restored) {
        const picks = [];
        for (let b = 0; b < drawN; b++) {
          const lo = Math.floor(b * pool.length / drawN);
          const hi = Math.floor((b + 1) * pool.length / drawN);
          picks.push(lo + Math.floor(Math.random() * Math.max(1, hi - lo)));
        }
        runOrder = shuffleIdx(picks.length).map(i => picks[i]);
      }
      exam = Object.assign({}, data, { questions: runOrder.map(i => pool[i]) });
    } else if (entry && entry.draw) {
      const drawN = Math.min(entry.draw, pool.length);
      let restored = false;
      if (p && Array.isArray(p.order) && p.order.length === drawN && p.total === drawN &&
          p.order.every(i => i >= 0 && i < pool.length) && p.idx < drawN) {
        runOrder = p.order;
        idx = p.idx; score = p.score || 0;
        bankedSecs = p.secs || 0;
        (p.answers || []).forEach((a, i) => { answers[i] = a; });
        (p.flagged || []).forEach(i => flagged.add(i));
        (p.quality || []).forEach(i => quality.add(i));
        (p.research || []).forEach(i => research.add(i));
        restored = true;
      }
      if (!restored) runOrder = shuffleIdx(pool.length).slice(0, drawN);
      exam = Object.assign({}, data, { questions: runOrder.map(i => pool[i]) });
    } else if (p && p.total === pool.length && p.idx < pool.length) {
      idx = p.idx; score = p.score || 0;
      bankedSecs = p.secs || 0;
      (p.answers || []).forEach((a, i) => { answers[i] = a; });
      (p.flagged || []).forEach(i => flagged.add(i));
      (p.quality || []).forEach(i => quality.add(i));
      (p.research || []).forEach(i => research.add(i));
    }
  } catch (e) { /* no saved progress */ }
  resetSegment();
  show();
  renderAnswered();
});

function refreshFlagBtn() {
  const btn = document.getElementById('flag-btn');
  const on = flagged.has(idx);
  btn.textContent = on ? '\u2605 Flagged: needs more work' : '\u2606 Needs more work';
  btn.classList.toggle('flagged-on', on);
}

function refreshResearchBtn() {
  const btn = document.getElementById('research-btn');
  if (!btn) return;
  const on = research.has(idx);
  btn.textContent = on ? '\uD83D\uDD0E Marked for further research' : '\uD83D\uDD0E Further research';
  btn.classList.toggle('research-on', on);
}

function refreshQualityBtn() {
  const btn = document.getElementById('quality-btn');
  const on = quality.has(idx);
  btn.textContent = on ? '\u2691 In quality review' : '\u2691 Quality review';
  btn.classList.toggle('quality-on', on);
}

const PKEY = 'examProgress';
// Live marks: snapshots of flagged / quality / missed-so-far questions,
// saved on every progress save so the Notepad / Quality pads can show them
// mid-run — Damoni may stop a test early to comment, then come back.
// (Pads used to read only finished attempts from examHistory.)
function buildLive() {
  function snap(i, extra) {
    const q = exam.questions[i];
    const o = { n: i + 1, question: q.question, source: q.source || '', correct: correctText(q), explanation: q.explanation || '' };
    if (extra) Object.assign(o, extra);
    return o;
  }
  function marked(set) {
    return [...set].sort((a, b) => a - b).map(i => snap(i, { result: isCorrect(exam.questions[i], answers[i]) ? 'answered correctly' : 'answered incorrectly' }));
  }
  const missedQs = [];
  exam.questions.forEach((q, i) => {
    if (answers[i] !== undefined && !isCorrect(q, answers[i])) missedQs.push(snap(i, { your: pickedText(q, answers[i]) }));
  });
  return { title: examTitle, flaggedQs: marked(flagged), qualityQs: marked(quality), researchQs: [...research].sort((a, b) => a - b).map(i => snap(i, { topic: exam.questions[i].topic || '', result: isCorrect(exam.questions[i], answers[i]) ? 'answered correctly' : 'answered incorrectly' })), missedQs: missedQs };
}
function saveProgress() {
  try {
    const all = JSON.parse(localStorage.getItem(PKEY) || '{}');
    const rec = { idx: idx, answers: answers, flagged: [...flagged], quality: [...quality], research: [...research], score: score, total: exam.questions.length, ts: Date.now(), secs: elapsedSecs(), live: buildLive() };
    if (runOrder) rec.order = runOrder;
    all[storageKey] = rec;
    localStorage.setItem(PKEY, JSON.stringify(all));
  } catch (e) { /* storage unavailable */ }
}
function clearProgress() {
  try {
    const all = JSON.parse(localStorage.getItem(PKEY) || '{}');
    delete all[storageKey];
    localStorage.setItem(PKEY, JSON.stringify(all));
  } catch (e) { /* storage unavailable */ }
}
function renderAnswered() {
  const q = exam.questions[idx];
  const picked = answers[idx];
  if (picked === undefined) return;
  if (isMulti(q)) {
    // Partial multi selection: show() already lit the toggles; nothing is
    // scored or locked until the full set is picked.
    if (!multiDone(q, picked)) return;
    document.querySelectorAll('button.choice').forEach((b, i) => {
      b.disabled = true;
      if (picked.indexOf(i) !== -1) b.className += q.answer.indexOf(i) !== -1 ? ' correct' : ' wrong';
    });
    document.getElementById('feedback').textContent =
      (isCorrect(q, picked) ? 'Correct. ' : 'Wrong. Answers: ' + correctText(q) + '. ') + (q.explanation || '');
    document.getElementById('next-btn').hidden = false;
    return;
  }
  document.querySelectorAll('button.choice').forEach((b, i) => {
    b.disabled = true;
    if (i === picked) b.className += picked === q.answer ? ' correct' : ' wrong';
  });
  document.getElementById('feedback').textContent =
    (picked === q.answer ? 'Correct. ' : 'Wrong. Answer: ' + q.choices[q.answer] + '. ') + (q.explanation || '');
  document.getElementById('next-btn').hidden = false;
}

function show() {
  const q = exam.questions[idx];
  FF3D.disposeAll();
  document.getElementById('progress').textContent = 'Question ' + (idx + 1) + ' of ' + exam.questions.length;
  const pb = document.getElementById('passage-box');
  if (pb) {
    if (q.passage) { pb.hidden = false; pb.textContent = q.passage; }
    else { pb.hidden = true; pb.textContent = ''; }
  }
  document.getElementById('question-text').textContent = q.question;
  const fb = document.getElementById('fig-box');
  if (fb) { fb.innerHTML = ''; renderFigInto(fb, q.fig); }
  const mh = document.getElementById('multi-hint');
  if (mh) {
    if (isMulti(q)) { mh.hidden = false; mh.textContent = 'Select ' + q.answer.length + ' answers.'; }
    else { mh.hidden = true; mh.textContent = ''; }
  }
  document.getElementById('source-line').textContent = q.source ? 'Deck: ' + q.source : '';
  const tb = document.getElementById('topic-bar');
  if (tb) {
    if (q.topic) { tb.hidden = false; tb.textContent = 'Topic: ' + q.topic + (entry && entry.chapter ? ' \u00B7 Chapter ' + entry.chapter : ''); }
    else tb.hidden = true;
  }
  document.getElementById('feedback').textContent = '';
  document.getElementById('next-btn').hidden = true;
  document.getElementById('back-btn').hidden = idx === 0;
  refreshFlagBtn();
  refreshQualityBtn();
  refreshResearchBtn();
  const qp = document.getElementById('quality-panel');
  if (qp) qp.hidden = true;
  const rp = document.getElementById('research-panel');
  if (rp) rp.hidden = true;
  const box = document.getElementById('choices');
  box.innerHTML = '';
  q.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    const label = document.createElement('span');
    label.textContent = c;
    b.appendChild(label);
    const cf = q.choiceFigs && q.choiceFigs[i];
    if (cf) {
      const d = document.createElement('div');
      d.className = 'choice-fig';
      d.innerHTML = cf;
      b.appendChild(d);
    }
    const cs = q.choiceScenes && q.choiceScenes[i];
    if (cs) {
      const d = document.createElement('div');
      d.className = 'choice-fig';
      b.appendChild(d);
      renderFigInto(d, { type: '3d', scene: cs.scene ? cs.scene : cs });
    }
    if (isMulti(q) && Array.isArray(answers[idx]) && answers[idx].indexOf(i) !== -1) b.className += ' multi-on';
    b.onclick = () => isMulti(q) ? toggleMulti(i, b) : pick(i, b);
    box.appendChild(b);
  });
}

// Multi-answer (select exactly N): tapping toggles a choice on/off, capped
// at N selections. Nothing scores until the Nth pick lands; then the set
// is scored (correct only when it equals the keyed set) and locked. The
// in-progress selection lives in answers[idx] as a sorted array, so the
// normal examProgress save/resume carries it unchanged.
function toggleMulti(i, btn) {
  const q = exam.questions[idx];
  if (multiDone(q, answers[idx])) return;
  const arr = Array.isArray(answers[idx]) ? answers[idx].slice() : [];
  const at = arr.indexOf(i);
  if (at !== -1) arr.splice(at, 1);
  else {
    if (arr.length >= q.answer.length) return;
    arr.push(i);
  }
  arr.sort((a, b) => a - b);
  answers[idx] = arr;
  document.querySelectorAll('button.choice').forEach((b, bi) => {
    b.classList.toggle('multi-on', arr.indexOf(bi) !== -1);
  });
  saveProgress();
  if (arr.length === q.answer.length) finalizeMulti();
}

function finalizeMulti() {
  const q = exam.questions[idx];
  const right = isCorrect(q, answers[idx]);
  if (right) score++;
  document.querySelectorAll('button.choice').forEach((b, bi) => {
    b.disabled = true;
    if (answers[idx].indexOf(bi) !== -1) b.className += q.answer.indexOf(bi) !== -1 ? ' correct' : ' wrong';
  });
  document.getElementById('feedback').textContent =
    (right ? 'Correct. ' : 'Wrong. Answers: ' + correctText(q) + '. ') + (q.explanation || '');
  document.getElementById('next-btn').hidden = false;
  saveProgress();
}

function pick(i, btn) {
  const q = exam.questions[idx];
  answers[idx] = i;
  document.querySelectorAll('button.choice').forEach(b => b.disabled = true);
  const right = i === q.answer;
  if (right) score++;
  btn.className += right ? ' correct' : ' wrong';
  document.getElementById('feedback').textContent =
    (right ? 'Correct. ' : 'Wrong. Answer: ' + q.choices[q.answer] + '. ') + (q.explanation || '');
  document.getElementById('next-btn').hidden = false;
  saveProgress();
}

function finish() {
  clearProgress();
  document.getElementById('question-box').hidden = true;
  document.getElementById('progress').textContent = '';
  document.getElementById('result-box').hidden = false;
  document.getElementById('score').textContent = 'Score: ' + score + ' of ' + exam.questions.length;

  lastMissed = [];
  exam.questions.forEach((q, i) => {
    if (!isCorrect(q, answers[i])) {
      lastMissed.push({
        n: i + 1,
        question: q.question,
        source: q.source || '',
        your: answers[i] === undefined ? '(no answer)' : pickedText(q, answers[i]),
        correct: correctText(q),
        explanation: q.explanation || ''
      });
    }
  });

  const list = document.getElementById('missed-list');
  list.innerHTML = '';
  lastMissed.forEach(m => {
    const li = document.createElement('li');
    li.textContent = m.question + ' — Your answer: ' + m.your + ' · Correct: ' + m.correct + (m.source ? ' · Deck: ' + m.source : '') + (m.explanation ? ' · ' + m.explanation : '');
    list.appendChild(li);
  });
  document.getElementById('no-missed').hidden = lastMissed.length !== 0;

  lastFlagged = [...flagged].sort((a, b) => a - b).map(i => {
    const q = exam.questions[i];
    return {
      n: i + 1,
      question: q.question,
      source: q.source || '',
      correct: correctText(q),
      explanation: q.explanation || '',
      result: isCorrect(q, answers[i]) ? 'answered correctly' : 'answered incorrectly'
    };
  });
  // Damoni's rule (Nov 22, 2026): on a FINISHED test, only missed questions
  // need review \u2014 a flagged question answered correctly is not listed here.
  // The saved attempt record keeps the full flagged list; this is display only.
  const reviewFlagged = lastFlagged.filter(m => m.result === 'answered incorrectly');
  const flist = document.getElementById('flagged-list');
  flist.innerHTML = '';
  reviewFlagged.forEach(m => {
    const li = document.createElement('li');
    li.textContent = m.question + ' — Correct: ' + m.correct + ' · You ' + m.result + (m.source ? ' · Deck: ' + m.source : '') + (m.explanation ? ' · ' + m.explanation : '');
    flist.appendChild(li);
  });
  document.getElementById('no-flagged').hidden = reviewFlagged.length !== 0;

  lastQuality = [...quality].sort((a, b) => a - b).map(i => {
    const q = exam.questions[i];
    return {
      n: i + 1,
      question: q.question,
      source: q.source || '',
      correct: correctText(q),
      explanation: q.explanation || '',
      result: isCorrect(q, answers[i]) ? 'answered correctly' : 'answered incorrectly'
    };
  });
  const qlist = document.getElementById('quality-list');
  qlist.innerHTML = '';
  lastQuality.forEach(m => {
    const li = document.createElement('li');
    li.textContent = m.question + ' — Correct: ' + m.correct + ' · You ' + m.result + (m.source ? ' · Deck: ' + m.source : '') + (m.explanation ? ' · ' + m.explanation : '');
    qlist.appendChild(li);
  });
  document.getElementById('no-quality').hidden = lastQuality.length !== 0;

  // Further research (Damoni, Nov 26, 2026): the question was RESOURCEFUL —
  // he wants the depth in its context turned into NEW questions. The full
  // context (exam, set, topic, question, correct answer, explanation)
  // rides the attempt record and the outbox report below.
  lastResearch = [...research].sort((a, b) => a - b).map(i => {
    const q = exam.questions[i];
    return {
      n: i + 1,
      question: q.question,
      topic: q.topic || '',
      source: q.source || '',
      correct: correctText(q),
      explanation: q.explanation || '',
      comment: researchNotesAll()[storageKey + '||' + q.question] || '',
      result: isCorrect(q, answers[i]) ? 'answered correctly' : 'answered incorrectly'
    };
  });
  const rlist = document.getElementById('research-list');
  if (rlist) {
    rlist.innerHTML = '';
    lastResearch.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m.question + ' — Correct: ' + m.correct + (m.topic ? ' · Topic: ' + m.topic : '') + (m.explanation ? ' · ' + m.explanation : '');
      rlist.appendChild(li);
    });
    document.getElementById('no-research').hidden = lastResearch.length !== 0;
  }

  try {
    const all = JSON.parse(localStorage.getItem('examHistory') || '{}');
    if (!Array.isArray(all[storageKey])) all[storageKey] = [];
    // STAGED hour-fix: store the full asked set so draw-mode attempts
    // (Hour series: Start/Coverage draw 20 of up to 365) can be mapped back
    // to tiers/topics exactly. Without it, only missed/marked questions are
    // recoverable from history. Harmless for NREMT full-set runs.
    all[storageKey].unshift({ ts: new Date().toISOString(), title: examTitle, score: score, total: exam.questions.length, secs: elapsedSecs(), missed: lastMissed, flagged: lastFlagged, quality: lastQuality, research: lastResearch, asked: exam.questions.map(function (q) { return q.question; }) });
    all[storageKey] = all[storageKey].slice(0, 20);
    localStorage.setItem('examHistory', JSON.stringify(all));
  } catch (e) { /* storage unavailable; results still shown on screen */ }

  if (isPopulation) writeBackPopulation();
}

// Population write-back (NREMT hub, Damoni, Nov 26, 2026): answers given
// in the population run land in each source set's own progress, exactly
// as if answered in place. If a set ends up fully answered, a finished
// attempt is recorded for it (score, missed, marks) and its saved place
// clears — the chapter pie moves from there. Marks made in the
// population run merge into the source sets' mark sets too.
function writeBackPopulation() {
  const byFile = {};
  exam.questions.forEach((q, i) => {
    if (q.srcFile) (byFile[q.srcFile] = byFile[q.srcFile] || []).push(i);
  });
  const files = Object.keys(byFile);
  if (!files.length) return;
  let hist = {};
  let prog = {};
  try { hist = JSON.parse(localStorage.getItem('examHistory') || '{}'); } catch (e) { /* ignore */ }
  try { prog = JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch (e) { /* ignore */ }
  const notes = researchNotesAll();
  files.forEach(srcFile => {
    fetch(srcFile, { cache: 'no-store' }).then(r => r.json()).then(data => {
      const qs = data.questions || [];
      if (!qs.length) return;
      const rec = prog[srcFile] || {};
      const mergedAnswers = Array.isArray(rec.answers) ? rec.answers.slice() : [];
      const fSet = new Set(rec.flagged || []), qSet = new Set(rec.quality || []), rSet = new Set(rec.research || []);
      let srcTitle = srcFile;
      byFile[srcFile].forEach(i => {
        const q = exam.questions[i], si = q.srcIdx;
        if (q.srcTitle) srcTitle = q.srcTitle;
        if (answers[i] !== undefined) mergedAnswers[si] = answers[i];
        if (flagged.has(i)) fSet.add(si);
        if (quality.has(i)) qSet.add(si);
        if (research.has(i)) rSet.add(si);
      });
      const snap = (si, extra) => {
        const q = qs[si];
        const o = { n: si + 1, question: q.question, source: q.source || '', correct: correctText(q), explanation: q.explanation || '' };
        if (extra) Object.assign(o, extra);
        return o;
      };
      const resOf = si => isCorrect(qs[si], mergedAnswers[si]) ? 'answered correctly' : 'answered incorrectly';
      const markedFrom = set => [...set].sort((a, b) => a - b).map(si => snap(si, { result: resOf(si) }));
      const complete = qs.every((_, si) => mergedAnswers[si] !== undefined);
      if (complete) {
        let sc = 0;
        const missed = [];
        qs.forEach((q, si) => {
          if (isCorrect(q, mergedAnswers[si])) sc++;
          else missed.push(snap(si, { your: pickedText(q, mergedAnswers[si]) }));
        });
        const rl = [...rSet].sort((a, b) => a - b).map(si => snap(si, { topic: qs[si].topic || '', comment: notes[srcFile + '||' + qs[si].question] || '', result: resOf(si) }));
        if (!Array.isArray(hist[srcFile])) hist[srcFile] = [];
        hist[srcFile].unshift({ ts: new Date().toISOString(), title: srcTitle, score: sc, total: qs.length, secs: 0, missed: missed, flagged: markedFrom(fSet), quality: markedFrom(qSet), research: rl, asked: qs.map(q => q.question) });
        hist[srcFile] = hist[srcFile].slice(0, 20);
        delete prog[srcFile];
      } else {
        let sc = 0;
        const missedQs = [];
        qs.forEach((q, si) => {
          if (isCorrect(q, mergedAnswers[si])) sc++;
          else if (mergedAnswers[si] !== undefined) missedQs.push(snap(si, { your: pickedText(q, mergedAnswers[si]) }));
        });
        const firstOpen = qs.findIndex((_, si) => mergedAnswers[si] === undefined);
        prog[srcFile] = {
          idx: firstOpen < 0 ? 0 : firstOpen, answers: mergedAnswers,
          flagged: [...fSet], quality: [...qSet], research: [...rSet],
          score: sc, total: qs.length, ts: Date.now(), secs: rec.secs || 0,
          live: {
            title: srcTitle, flaggedQs: markedFrom(fSet), qualityQs: markedFrom(qSet),
            researchQs: [...rSet].sort((a, b) => a - b).map(si => snap(si, { topic: qs[si].topic || '', result: resOf(si) })),
            missedQs: missedQs
          }
        };
      }
      try { localStorage.setItem('examHistory', JSON.stringify(hist)); } catch (e) { /* ignore */ }
      try { localStorage.setItem(PKEY, JSON.stringify(prog)); } catch (e) { /* ignore */ }
    }).catch(() => { /* a source file that fails to load keeps its old state */ });
  });
}

document.getElementById('flag-btn').onclick = () => {
  if (flagged.has(idx)) flagged.delete(idx); else flagged.add(idx);
  refreshFlagBtn();
  refreshQualityBtn();
  refreshResearchBtn();
  saveProgress();
};
document.getElementById('quality-btn').onclick = () => { openQualityPanel(); };
document.getElementById('research-btn').onclick = () => { openResearchPanel(); };

// Inline further research (Damoni, Nov 26, 2026): the button opens a
// comment form right here in the exam — same in-page pattern as the
// quality review form, fillable mid-test without losing his place. The
// comment saves to the researchNotes key (synced), and Send reports
// through examSync.sendReport as its own type (page/type 'research')
// carrying the comment plus the full question context (exam, set, topic,
// question, correct answer, explanation) — straight to Edison, no
// separate page, no download.
function researchNotesAll() {
  try { return JSON.parse(localStorage.getItem('researchNotes') || '{}'); } catch (e) { return {}; }
}
function researchNoteKey() { return storageKey + '||' + exam.questions[idx].question; }
function saveResearchComment() {
  const ta = document.getElementById('research-comment');
  if (!ta) return;
  const notes = researchNotesAll();
  notes[researchNoteKey()] = ta.value;
  try { localStorage.setItem('researchNotes', JSON.stringify(notes)); } catch (e) { /* storage unavailable */ }
}
function openResearchPanel() {
  if (!research.has(idx)) { research.add(idx); refreshResearchBtn(); saveProgress(); }
  document.getElementById('research-q').textContent = exam.questions[idx].question;
  document.getElementById('research-comment').value = researchNotesAll()[researchNoteKey()] || '';
  document.getElementById('research-status').textContent = '';
  document.getElementById('research-panel').hidden = false;
}
document.getElementById('research-comment').addEventListener('change', saveResearchComment);
document.getElementById('research-close').onclick = () => { saveResearchComment(); document.getElementById('research-panel').hidden = true; };
document.getElementById('research-unmark').onclick = () => {
  saveResearchComment();
  research.delete(idx);
  refreshResearchBtn();
  saveProgress();
  document.getElementById('research-panel').hidden = true;
};
document.getElementById('research-send').onclick = () => {
  saveResearchComment();
  const status = document.getElementById('research-status');
  const btn = document.getElementById('research-send');
  const notes = researchNotesAll();
  const items = buildLive().researchQs.map(function (m) {
    return { n: m.n, question: m.question, topic: m.topic || '', correct: m.correct, explanation: m.explanation || '', comment: notes[storageKey + '||' + m.question] || '', result: m.result || '' };
  });
  if (!items.length) { status.textContent = 'Nothing to send yet.'; return; }
  const report = { id: 'fr' + Date.now(), ts: new Date().toISOString(), page: 'research', type: 'research', file: storageKey, groups: [{ title: examTitle + ' \u2014 in progress', items: items }] };
  btn.disabled = true;
  status.textContent = 'Sending\u2026';
  const wait = setInterval(function () {
    if (window.examSync) {
      clearInterval(wait);
      window.examSync.sendReport(report).then(function () {
        status.textContent = 'Sent \u2713 \u2014 Edison will message you to discuss.';
        btn.disabled = false;
      }).catch(function () {
        status.textContent = 'Could not send \u2014 sign in to sync first (blue bar at the top), then try again.';
        btn.disabled = false;
      });
    }
  }, 200);
  setTimeout(function () { clearInterval(wait); if (btn.disabled) { status.textContent = 'Could not send \u2014 sign in to sync first (blue bar at the top), then try again.'; btn.disabled = false; } }, 12000);
};

// Inline quality review (Damoni, Nov 25, 2026): the Quality review button
// opens the form right here in the exam \u2014 no trip to the Quality page,
// no losing his place in the run. The comment saves to the same
// qualityNotes key the Quality page uses, and Send reports through the
// same examSync.sendReport path, so the ping to Edison works exactly as
// before. The Quality page itself is unchanged and still shows everything
// marked, finished or in progress.
function qualityNotesAll() {
  try { return JSON.parse(localStorage.getItem('qualityNotes') || '{}'); } catch (e) { return {}; }
}
function qualityNoteKey() { return storageKey + '||' + exam.questions[idx].question; }
function saveQualityComment() {
  const ta = document.getElementById('quality-comment');
  if (!ta) return;
  const notes = qualityNotesAll();
  notes[qualityNoteKey()] = ta.value;
  try { localStorage.setItem('qualityNotes', JSON.stringify(notes)); } catch (e) { /* storage unavailable */ }
}
function openQualityPanel() {
  if (!quality.has(idx)) { quality.add(idx); refreshQualityBtn(); saveProgress(); }
  document.getElementById('quality-q').textContent = exam.questions[idx].question;
  document.getElementById('quality-comment').value = qualityNotesAll()[qualityNoteKey()] || '';
  document.getElementById('quality-status').textContent = '';
  document.getElementById('quality-panel').hidden = false;
}
document.getElementById('quality-comment').addEventListener('change', saveQualityComment);
document.getElementById('quality-close').onclick = () => { saveQualityComment(); document.getElementById('quality-panel').hidden = true; };
document.getElementById('quality-unmark').onclick = () => {
  saveQualityComment();
  quality.delete(idx);
  refreshQualityBtn();
  saveProgress();
  document.getElementById('quality-panel').hidden = true;
};
document.getElementById('quality-send').onclick = () => {
  saveQualityComment();
  const status = document.getElementById('quality-status');
  const btn = document.getElementById('quality-send');
  const notes = qualityNotesAll();
  const items = buildLive().qualityQs.map(function (m) {
    return { n: m.n, question: m.question, correct: m.correct, explanation: m.explanation || '', comment: notes[storageKey + '||' + m.question] || '', result: m.result || '' };
  });
  if (!items.length) { status.textContent = 'Nothing to send yet.'; return; }
  const report = { id: 'r' + Date.now(), ts: new Date().toISOString(), page: 'quality', groups: [{ title: examTitle + ' \u2014 in progress', items: items }] };
  btn.disabled = true;
  status.textContent = 'Sending\u2026';
  const wait = setInterval(function () {
    if (window.examSync) {
      clearInterval(wait);
      window.examSync.sendReport(report).then(function () {
        status.textContent = 'Sent \u2713 \u2014 Edison will message you to discuss.';
        btn.disabled = false;
      }).catch(function () {
        status.textContent = 'Could not send \u2014 sign in to sync first (blue bar at the top), then try again.';
        btn.disabled = false;
      });
    }
  }, 200);
  setTimeout(function () { clearInterval(wait); if (btn.disabled) { status.textContent = 'Could not send \u2014 sign in to sync first (blue bar at the top), then try again.'; btn.disabled = false; } }, 12000);
};
document.getElementById('next-btn').onclick = () => {
  idx++;
  if (idx < exam.questions.length) { show(); renderAnswered(); saveProgress(); return; }
  finish();
};
document.getElementById('back-btn').onclick = () => {
  if (idx === 0) return;
  idx--;
  show();
  renderAnswered();
  saveProgress();
};
document.getElementById('retry-btn').onclick = () => { clearProgress(); location.reload(); };
