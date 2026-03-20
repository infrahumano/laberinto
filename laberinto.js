'use strict';

const DIR_N = 1, DIR_E = 2, DIR_S = 4, DIR_W = 8;
const DIRS = [
  { dr: -1, dc:  0, bit: DIR_N, opp: DIR_S },
  { dr:  0, dc:  1, bit: DIR_E, opp: DIR_W },
  { dr:  1, dc:  0, bit: DIR_S, opp: DIR_N },
  { dr:  0, dc: -1, bit: DIR_W, opp: DIR_E },
];

// ── PRNG ──────────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyGrid(N) {
  return Array.from({ length: N }, () => new Uint8Array(N));
}

// ── Instant generation (used on page load / URL restore) ──────────────────────

function generateDFS(N, rng) {
  const g   = emptyGrid(N);
  const vis = emptyGrid(N);
  const stack = [[0, 0]];
  vis[0][0] = 1;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = shuffle([...DIRS], rng).find(({ dr, dc }) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < N && nc >= 0 && nc < N && !vis[nr][nc];
    });
    if (next) {
      const { dr, dc, bit, opp } = next;
      const nr = r + dr, nc = c + dc;
      g[r][c] |= bit; g[nr][nc] |= opp;
      vis[nr][nc] = 1;
      stack.push([nr, nc]);
    } else {
      stack.pop();
    }
  }
  return g;
}

function generateWilson(N, rng) {
  const g       = emptyGrid(N);
  const inMaze  = emptyGrid(N);
  const pathDir = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
  inMaze[0][0] = 1;
  for (let sr = 0; sr < N; sr++) {
    for (let sc = 0; sc < N; sc++) {
      if (inMaze[sr][sc]) continue;
      let r = sr, c = sc;
      while (!inMaze[r][c]) {
        let d;
        do { d = (rng() * 4) | 0; }
        while (r + DIRS[d].dr < 0 || r + DIRS[d].dr >= N ||
               c + DIRS[d].dc < 0 || c + DIRS[d].dc >= N);
        pathDir[r][c] = d;
        r += DIRS[d].dr; c += DIRS[d].dc;
      }
      r = sr; c = sc;
      while (!inMaze[r][c]) {
        inMaze[r][c] = 1;
        const { dr, dc, bit, opp } = DIRS[pathDir[r][c]];
        g[r][c] |= bit; g[r + dr][c + dc] |= opp;
        r += dr; c += dc;
      }
    }
  }
  return g;
}

function generatePrim(N, rng) {
  const g        = emptyGrid(N);
  const inMaze   = emptyGrid(N);
  const frontier = [];
  const addFrontier = (r, c) => {
    for (const { dr, dc, bit, opp } of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && !inMaze[nr][nc])
        frontier.push([nr, nc, r, c, opp, bit]);
    }
  };
  const sr = (rng() * N) | 0, sc = (rng() * N) | 0;
  inMaze[sr][sc] = 1;
  addFrontier(sr, sc);
  while (frontier.length) {
    const i = (rng() * frontier.length) | 0;
    const [r, c, fr, fc, bit, nbit] = frontier[i];
    frontier.splice(i, 1);
    if (inMaze[r][c]) continue;
    inMaze[r][c] = 1;
    g[r][c] |= bit; g[fr][fc] |= nbit;
    addFrontier(r, c);
  }
  return g;
}

// ── Step generators (used for animation) ─────────────────────────────────────
// Each yields { g, vis, current } after every wall carving.
// g and vis are mutated in place — the same references are yielded each time.

function* generateDFSSteps(N, rng) {
  const g   = emptyGrid(N);
  const vis = emptyGrid(N);
  const stack = [[0, 0]];
  vis[0][0] = 1;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = shuffle([...DIRS], rng).find(({ dr, dc }) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < N && nc >= 0 && nc < N && !vis[nr][nc];
    });
    if (next) {
      const { dr, dc, bit, opp } = next;
      const nr = r + dr, nc = c + dc;
      g[r][c] |= bit; g[nr][nc] |= opp;
      vis[nr][nc] = 1;
      stack.push([nr, nc]);
      yield { g, vis, current: [nr, nc] };
    } else {
      stack.pop();
      yield { g, vis, current: stack.length ? stack[stack.length - 1] : null };
    }
  }
}

function* generatePrimSteps(N, rng) {
  const g        = emptyGrid(N);
  const vis      = emptyGrid(N);
  const frontier = [];
  const addFrontier = (r, c) => {
    for (const { dr, dc, bit, opp } of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && !vis[nr][nc])
        frontier.push([nr, nc, r, c, opp, bit]);
    }
  };
  const sr = (rng() * N) | 0, sc = (rng() * N) | 0;
  vis[sr][sc] = 1;
  addFrontier(sr, sc);
  while (frontier.length) {
    const i = (rng() * frontier.length) | 0;
    const [r, c, fr, fc, bit, nbit] = frontier[i];
    frontier.splice(i, 1);
    if (vis[r][c]) continue;
    vis[r][c] = 1;
    g[r][c] |= bit; g[fr][fc] |= nbit;
    addFrontier(r, c);
    yield { g, vis, current: [r, c] };
  }
}

function* generateWilsonSteps(N, rng) {
  const g       = emptyGrid(N);
  const vis     = emptyGrid(N);
  const pathDir = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
  vis[0][0] = 1;
  for (let sr = 0; sr < N; sr++) {
    for (let sc = 0; sc < N; sc++) {
      if (vis[sr][sc]) continue;
      // Walk (instant — no yield; loop erasure via pathDir overwrite)
      let r = sr, c = sc;
      while (!vis[r][c]) {
        let d;
        do { d = (rng() * 4) | 0; }
        while (r + DIRS[d].dr < 0 || r + DIRS[d].dr >= N ||
               c + DIRS[d].dc < 0 || c + DIRS[d].dc >= N);
        pathDir[r][c] = d;
        r += DIRS[d].dr; c += DIRS[d].dc;
      }
      // Carve (yield each absorbed cell)
      r = sr; c = sc;
      while (!vis[r][c]) {
        vis[r][c] = 1;
        const { dr, dc, bit, opp } = DIRS[pathDir[r][c]];
        g[r][c] |= bit; g[r + dr][c + dc] |= opp;
        r += dr; c += dc;
        yield { g, vis, current: [r, c] };
      }
    }
  }
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function bfsFrom(g, N, starts) {
  const dist = Array.from({ length: N }, () => new Int32Array(N).fill(-1));
  const q = [];
  for (const [r, c] of starts) { dist[r][c] = 0; q.push(r * N + c); }
  let head = 0, maxDist = 0;
  while (head < q.length) {
    const pos = q[head++];
    const r = (pos / N) | 0, c = pos % N;
    const d = dist[r][c];
    for (const { dr, dc, bit } of DIRS) {
      if (!(g[r][c] & bit)) continue;
      const nr = r + dr, nc = c + dc;
      if (dist[nr][nc] === -1) {
        dist[nr][nc] = d + 1;
        if (d + 1 > maxDist) maxDist = d + 1;
        q.push(nr * N + nc);
      }
    }
  }
  return { dist, maxDist };
}

function findSolution(g, N) {
  const { dist } = bfsFrom(g, N, [[0, 0]]);
  const onPath = emptyGrid(N);
  let r = N - 1, c = N - 1;
  onPath[r][c] = 1;
  while (r || c) {
    for (const { dr, dc, bit } of DIRS) {
      if (!(g[r][c] & bit)) continue;
      const nr = r + dr, nc = c + dc;
      if (dist[nr][nc] === dist[r][c] - 1) {
        onPath[nr][nc] = 1;
        r = nr; c = nc;
        break;
      }
    }
  }
  return onPath;
}

function distanceFromSolution(g, N, solution) {
  const starts = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (solution[r][c]) starts.push([r, c]);
  return bfsFrom(g, N, starts);
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const BG = [250, 248, 245];

function fadeRgb([r, g, b], t) {
  return [
    Math.round(r + (BG[0] - r) * t),
    Math.round(g + (BG[1] - g) * t),
    Math.round(b + (BG[2] - b) * t),
  ];
}

// ── OXS export ────────────────────────────────────────────────────────────────

const N_SHADES = 4;

function toOXS(g, N, solution, solDist, maxSolDist, opts = {}) {
  const { title = 'Maze', solHex = 'DA8028', fillHex = '4A6FA5', wallHex = '1A1A1A' } = opts;

  const fillRgb    = hexToRgb('#' + fillHex);
  const shadeHexes = Array.from({ length: N_SHADES }, (_, i) =>
    rgbToHex(...fadeRgb(fillRgb, i / (N_SHADES - 1)))
  );
  const wallIdx = 1 + N_SHADES + 1;

  const palette = [
    { index: 0, name: 'cloth', color: 'FFFFFF' },
    { index: 1, number: 'Solution', name: 'Solution', color: solHex.toUpperCase(), strands: 2 },
  ];
  for (let i = 0; i < N_SHADES; i++)
    palette.push({ index: 2 + i, number: `Shade ${i + 1}`, name: `Shade ${i + 1}`, color: shadeHexes[i], strands: 2 });
  palette.push({ index: wallIdx, number: 'Wall', name: 'Wall', color: wallHex.toUpperCase(), strands: 1 });

  const stitches = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const palindex = solution[r][c]
        ? 1
        : 2 + Math.min(N_SHADES - 1, Math.floor((maxSolDist > 0 ? solDist[r][c] / maxSolDist : 0) * N_SHADES));
      stitches.push({ x: c, y: r, palindex });
    }

  const backstitches = [];
  for (let r = 0; r <= N; r++)
    for (let c = 0; c < N; c++)
      if (r === 0 || r === N || !(g[r - 1][c] & DIR_S))
        backstitches.push({ x1: c, y1: r, x2: c + 1, y2: r, palindex: wallIdx });
  for (let c = 0; c <= N; c++)
    for (let r = 0; r < N; r++)
      if (c === 0 || c === N || !(g[r][c - 1] & DIR_E))
        backstitches.push({ x1: c, y1: r, x2: c, y2: r + 1, palindex: wallIdx });

  return buildOXS({ width: N, height: N, title, software: 'laberinto', palette, stitches, backstitches });
}
