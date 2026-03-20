'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  N:          20,
  algorithm: 'dfs',
  seed:       0,
  maze:       null,
  solution:   null,
  solDist:    null,
  maxSolDist: 0,
  solColour:  '#da8028',
  fillColour: '#4a6fa5',
};

// ── DOM ───────────────────────────────────────────────────────────────────────

const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');
const sizeInput  = document.getElementById('size');
const algoSel    = document.getElementById('algorithm');
const solSwatch  = document.getElementById('swatch-sol');
const fillSwatch = document.getElementById('swatch-fill');
const solInput   = document.getElementById('colour-sol');
const fillInput  = document.getElementById('colour-fill');
const statsEl    = document.getElementById('stats');

// ── Layout ────────────────────────────────────────────────────────────────────

const MAX_PX = 600;
const MIN_CS = 4;
const MAX_CS = 24;
const DPR    = window.devicePixelRatio || 1;

function cellSize(N) {
  return Math.min(MAX_CS, Math.max(MIN_CS, Math.floor(MAX_PX / N)));
}

const BG_CSS = '#faf8f5';

// ── Colour helpers ────────────────────────────────────────────────────────────

function shadeColour(hexFill, t) {
  const [r, g, b] = hexToRgb(hexFill);
  return `rgb(${Math.round(r + (BG[0] - r) * t)},${Math.round(g + (BG[1] - g) * t)},${Math.round(b + (BG[2] - b) * t)})`;
}

// ── Canvas setup ──────────────────────────────────────────────────────────────

function setupCanvas(N) {
  const cs = cellSize(N);
  const W = N * cs, H = N * cs;
  canvas.width        = W * DPR;
  canvas.height       = H * DPR;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawWalls(g, N, cs) {
  ctx.strokeStyle = '#111111';
  ctx.lineWidth   = 1.5;
  ctx.lineCap     = 'square';
  ctx.beginPath();
  for (let r = 0; r <= N; r++)
    for (let c = 0; c < N; c++)
      if (r === 0 || r === N || !(g[r - 1][c] & DIR_S)) {
        ctx.moveTo(c * cs, r * cs);
        ctx.lineTo((c + 1) * cs, r * cs);
      }
  for (let c = 0; c <= N; c++)
    for (let r = 0; r < N; r++)
      if (c === 0 || c === N || !(g[r][c - 1] & DIR_E)) {
        ctx.moveTo(c * cs, r * cs);
        ctx.lineTo(c * cs, (r + 1) * cs);
      }
  ctx.stroke();
}

// Phase 1: render the partially-carved maze
// vis cells = explored, unvis = still walled off, current = accent
function renderCarve(g, vis, current) {
  const { N, solColour } = state;
  const cs = cellSize(N);
  const W = N * cs, H = N * cs;

  ctx.fillStyle = BG_CSS;
  ctx.fillRect(0, 0, W, H);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (current && r === current[0] && c === current[1]) {
        ctx.fillStyle = solColour;
      } else if (vis[r][c]) {
        ctx.fillStyle = '#f0ede8';
      } else {
        ctx.fillStyle = '#ccc8c2';
      }
      ctx.fillRect(c * cs, r * cs, cs, cs);
    }
  }

  drawWalls(g, N, cs);
}

// Phase 2: flood colour outward from solution path, up to distance `level`
function renderColour(level) {
  const { N, maze, solution, solDist, maxSolDist, solColour, fillColour } = state;
  const cs = cellSize(N);
  const W = N * cs, H = N * cs;

  ctx.fillStyle = BG_CSS;
  ctx.fillRect(0, 0, W, H);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const d = solDist[r][c];
      if (d > level) continue;
      if (solution[r][c]) {
        ctx.fillStyle = solColour;
      } else {
        const t = maxSolDist > 0 ? d / maxSolDist : 0;
        const bucket = Math.min(N_SHADES - 1, Math.floor(t * N_SHADES));
        ctx.fillStyle = shadeColour(fillColour, bucket / (N_SHADES - 1));
      }
      ctx.fillRect(c * cs, r * cs, cs, cs);
    }
  }

  drawWalls(maze, N, cs);
}

function render() {
  renderColour(Infinity);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats() {
  const pathLen = state.solution.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
  statsEl.textContent = `${state.N}×${state.N} · ${state.algorithm} · path: ${pathLen} · dead-end depth: ${state.maxSolDist}`;
}

// ── Instant generation (page load / URL restore) ──────────────────────────────

function generate() {
  const rng = mulberry32(state.seed);
  const gen = state.algorithm === 'wilson' ? generateWilson
            : state.algorithm === 'prim'   ? generatePrim
            : generateDFS;
  state.maze     = gen(state.N, rng);
  state.solution = findSolution(state.maze, state.N);
  const { dist, maxDist } = distanceFromSolution(state.maze, state.N, state.solution);
  state.solDist    = dist;
  state.maxSolDist = maxDist;
}

// ── Animation ─────────────────────────────────────────────────────────────────

let animRafId = null;
let animGen   = null;
let animG     = null;
let animVis   = null;
let animCur   = null;
let animPhase = null;   // 'carve' | 'colour' | null
let animLevel = 0;

function cancelAnimation() {
  if (animRafId !== null) cancelAnimationFrame(animRafId);
  animRafId = animGen = animG = animVis = animCur = null;
  animPhase = null;
}

function startAnimation() {
  cancelAnimation();
  const { N, algorithm, seed } = state;

  setupCanvas(N);

  animG   = emptyGrid(N);
  animVis = emptyGrid(N);
  animCur = null;
  renderCarve(animG, animVis, animCur);

  const rng   = mulberry32(seed);
  const genFn = algorithm === 'wilson' ? generateWilsonSteps
              : algorithm === 'prim'   ? generatePrimSteps
              : generateDFSSteps;
  animGen   = genFn(N, rng);
  animPhase = 'carve';

  const spf = Math.max(1, Math.ceil(N * N / 90));  // steps per frame → ~1.5s total

  function carve() {
    let done = false;
    for (let i = 0; i < spf; i++) {
      const s = animGen.next();
      if (s.done) { done = true; break; }
      ({ g: animG, vis: animVis, current: animCur } = s.value);
    }
    renderCarve(animG, animVis, animCur);

    if (done) {
      finishCarve();
    } else {
      animRafId = requestAnimationFrame(carve);
    }
  }

  function finishCarve() {
    state.maze     = animG;
    state.solution = findSolution(state.maze, N);
    const { dist, maxDist } = distanceFromSolution(state.maze, N, state.solution);
    state.solDist    = dist;
    state.maxSolDist = maxDist;

    animPhase = 'colour';
    animLevel = 0;
    const lpf = Math.max(1, Math.ceil(state.maxSolDist / 60));  // levels per frame → ~1s total

    function colour() {
      renderColour(animLevel);
      animLevel += lpf;
      if (animLevel <= state.maxSolDist) {
        animRafId = requestAnimationFrame(colour);
      } else {
        render();
        updateStats();
        animPhase = null;
      }
    }
    animRafId = requestAnimationFrame(colour);
  }

  animRafId = requestAnimationFrame(carve);
}

// ── Swatches ──────────────────────────────────────────────────────────────────

function syncSwatches() {
  solSwatch.style.background  = state.solColour;
  fillSwatch.style.background = state.fillColour;
  solInput.value  = state.solColour;
  fillInput.value = state.fillColour;
}

// ── Events ────────────────────────────────────────────────────────────────────

document.getElementById('btn-randomise').addEventListener('click', () => {
  state.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  pushURL();
  startAnimation();
});

sizeInput.addEventListener('change', () => {
  let N = parseInt(sizeInput.value, 10);
  if (isNaN(N) || N < 5) N = 5;
  if (N > 60) N = 60;
  sizeInput.value = N;
  state.N   = N;
  state.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  pushURL();
  startAnimation();
});

algoSel.addEventListener('change', () => {
  state.algorithm = algoSel.value;
  state.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  pushURL();
  startAnimation();
});

solSwatch.addEventListener('click', () => solInput.click());
fillSwatch.addEventListener('click', () => fillInput.click());

solInput.addEventListener('input', () => {
  state.solColour = solInput.value;
  solSwatch.style.background = state.solColour;
  if (!animPhase) render();
  pushURL();
});

fillInput.addEventListener('input', () => {
  state.fillColour = fillInput.value;
  fillSwatch.style.background = state.fillColour;
  if (!animPhase) render();
  pushURL();
});

document.getElementById('btn-download').addEventListener('click', () => {
  if (!state.maze) return;
  const oxs = toOXS(
    state.maze, state.N, state.solution, state.solDist, state.maxSolDist, {
      title:   `Maze ${state.N}×${state.N}`,
      solHex:  state.solColour.replace('#', ''),
      fillHex: state.fillColour.replace('#', ''),
    }
  );
  const params = new URLSearchParams(location.search);
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([oxs], { type: 'text/xml' })),
    download: `maze_${params.toString().replace(/&/g, '_')}.oxs`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('btn-png').addEventListener('click', () => {
  const params = new URLSearchParams(location.search);
  Object.assign(document.createElement('a'), {
    href:     canvas.toDataURL('image/png'),
    download: `maze_${params.toString().replace(/&/g, '_')}.png`,
  }).click();
});

// ── URL state ─────────────────────────────────────────────────────────────────

function pushURL() {
  const p = new URLSearchParams({
    n:  state.N,
    a:  state.algorithm,
    s:  state.seed.toString(16),
    sc: state.solColour.replace('#', ''),
    fc: state.fillColour.replace('#', ''),
  });
  history.replaceState(null, '', '?' + p.toString());
}

function stateFromURL() {
  const p  = new URLSearchParams(location.search);
  const n  = parseInt(p.get('n'), 10);
  const a  = p.get('a');
  const s  = p.get('s');
  const sc = p.get('sc');
  const fc = p.get('fc');
  if (n && s) {
    state.N         = Math.min(60, Math.max(5, n));
    state.algorithm = ['dfs', 'wilson', 'prim'].includes(a) ? a : 'dfs';
    state.seed      = parseInt(s, 16) >>> 0;
    if (sc && /^[0-9a-fA-F]{6}$/.test(sc)) state.solColour  = '#' + sc;
    if (fc && /^[0-9a-fA-F]{6}$/.test(fc)) state.fillColour = '#' + fc;
    sizeInput.value = state.N;
    algoSel.value   = state.algorithm;
    return true;
  }
  return false;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  if (!stateFromURL()) {
    state.N    = window.innerWidth < 600 ? 15 : 20;
    state.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    sizeInput.value = state.N;
  }
  syncSwatches();
  setupCanvas(state.N);
  generate();
  render();
  updateStats();
  pushURL();
});
