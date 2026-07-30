/* ==========================================================================
   Black Cat Box
   Drag a box around cats whose numbers sum to exactly 10 to send them home.
   Everything is drawn on a canvas — no image assets, no network calls.
   ========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config

  var PASSWORD   = 'mickey';
  var ROUND_TIME = 120;      // seconds
  var TARGET     = 10;       // the sum we are hunting for
  var STORE_BEST = 'bcb.best';
  var STORE_OPEN = 'bcb.unlocked';
  var STORE_MUTE = 'bcb.muted';

  // Collar colour per digit — gives each number a second, non-numeric cue.
  var COLLARS = [
    null,
    '#ff8fb1', '#ffd166', '#6ee7b7', '#7dd3fc', '#c4b5fd',
    '#fca5a5', '#fbbf24', '#86efac', '#f0abfc'
  ];

  // ---------------------------------------------------------------- helpers

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* private mode — scores just won't stick */ }
    return null;
  }

  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('is-active', screens[i].id === id);
    }
  }

  // ---------------------------------------------------------------- sound

  var Sound = {
    ctx: null,
    muted: store(STORE_MUTE) === '1',

    ensure: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    tone: function (freq, dur, type, gain, delay) {
      if (this.muted) return;
      var ctx = this.ensure();
      if (!ctx) return;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var amp = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(gain || 0.16, t0 + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },

    pick:    function () { this.tone(520, 0.05, 'square', 0.05); },
    clear:   function (n) {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var count = Math.min(4, Math.max(2, Math.round(n / 2)));
      for (var i = 0; i < count; i++) this.tone(notes[i], 0.22, 'triangle', 0.13, i * 0.055);
    },
    reject:  function () { this.tone(150, 0.14, 'sawtooth', 0.06); },
    unlock:  function () { this.tone(660, 0.16, 'triangle', 0.12); this.tone(990, 0.24, 'triangle', 0.1, 0.1); },
    denied:  function () { this.tone(180, 0.18, 'square', 0.07); },
    tick:    function () { this.tone(880, 0.06, 'sine', 0.07); },
    over:    function () {
      this.tone(392, 0.3, 'triangle', 0.12);
      this.tone(311, 0.4, 'triangle', 0.1, 0.16);
      this.tone(261, 0.6, 'triangle', 0.1, 0.32);
    }
  };

  // ---------------------------------------------------------------- cat art

  /**
   * Draw one cat, filling an S x S box. All coordinates are authored on a
   * 100-unit grid and scaled, so the same code works at any cell size.
   */
  function drawCat(ctx, S, digit, selected) {
    var u = S / 100;
    var detail = S >= 40;                 // whiskers/pupils vanish on tiny cells
    var fur    = selected ? '#2b2440' : '#191426';
    var furTop = selected ? '#3a3157' : '#241e36';
    var tint   = COLLARS[digit];

    ctx.save();
    ctx.scale(u, u);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // --- soft ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(50, 90, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- ears (behind the head)
    var ears = [[20, 33, 25, 5, 46, 22], [80, 33, 75, 5, 54, 22]];
    for (var i = 0; i < 2; i++) {
      var e = ears[i];
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); ctx.lineTo(e[4], e[5]);
      ctx.closePath();
      ctx.fill();
      // inner ear, tinted with the digit's colour — a second cue beyond the number
      ctx.fillStyle = tint;
      ctx.globalAlpha = selected ? 0.85 : 0.6;
      ctx.beginPath();
      ctx.moveTo(e[0] + (i ? -3.5 : 3.5), e[1] - 2);
      ctx.lineTo(e[2] + (i ? -1.5 : 1.5), e[3] + 6.5);
      ctx.lineTo(e[4] + (i ? 2.5 : -2.5), e[5] - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- head
    var grad = ctx.createLinearGradient(0, 20, 0, 88);
    grad.addColorStop(0, furTop);
    grad.addColorStop(1, fur);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(50, 56, 33, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    // rim light along the top of the skull
    ctx.strokeStyle = selected ? 'rgba(255,209,102,.95)' : 'rgba(255,255,255,.12)';
    ctx.lineWidth = selected ? 2.6 : 1.5;
    ctx.beginPath();
    ctx.ellipse(50, 56, 33, 32, 0, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();

    // --- whiskers, kept short so neighbouring cats don't tangle
    if (detail) {
      ctx.strokeStyle = selected ? 'rgba(255,255,255,.34)' : 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(24, 62); ctx.lineTo(9, 57);
      ctx.moveTo(24, 69); ctx.lineTo(8, 71);
      ctx.moveTo(76, 62); ctx.lineTo(91, 57);
      ctx.moveTo(76, 69); ctx.lineTo(92, 71);
      ctx.stroke();
    }

    // --- eyes
    var eyeColor = selected ? '#a7f3d0' : '#ffd166';
    for (var s = -1; s <= 1; s += 2) {
      var ex = 50 + s * 13.5;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(ex, 40, 6.2, 7.2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (detail) {
        ctx.fillStyle = 'rgba(12,10,20,.92)';         // slit pupil
        ctx.beginPath();
        ctx.ellipse(ex, 40, 1.8, 5.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';      // catchlight
        ctx.beginPath();
        ctx.arc(ex + 2.3, 37, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- nose
    if (detail) {
      ctx.fillStyle = selected ? '#ffc9dc' : '#ff8fb1';
      ctx.beginPath();
      ctx.moveTo(46.8, 50); ctx.lineTo(53.2, 50); ctx.lineTo(50, 54);
      ctx.closePath();
      ctx.fill();
    }

    // --- the number, worn like a muzzle patch: the thing you actually read
    ctx.font = '800 33px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,4,12,.85)';
    ctx.lineWidth = 5;
    ctx.strokeText(String(digit), 50, 71);
    ctx.fillStyle = selected ? '#ffffff' : tint;
    ctx.fillText(String(digit), 50, 71);

    ctx.restore();
  }

  // ---------------------------------------------------------------- game

  var canvas = $('board');
  var ctx    = canvas.getContext('2d');
  var wrap   = $('board-wrap');

  var G = {
    cols: 17, rows: 10,
    grid: [],          // 0 = already cleared
    tilt: [],          // tiny per-cat rotation, purely cosmetic
    cell: 0, ox: 0, oy: 0,
    w: 0, h: 0, dpr: 1,
    sprites: null, spritesSel: null, spriteSize: 0,
    score: 0,
    endsAt: 0, timeLeft: ROUND_TIME,
    running: false,
    drag: null,        // {x0,y0,x1,y1,cells:[],sum:0}
    poofs: [],
    raf: 0,
    lastTick: -1
  };

  // ---- board model -------------------------------------------------------

  function buildBoard() {
    var n = G.cols * G.rows, i;
    G.grid = new Array(n);
    G.tilt = new Array(n);
    for (i = 0; i < n; i++) {
      G.grid[i] = 1 + Math.floor(Math.random() * 9);
      G.tilt[i] = (Math.random() - 0.5) * 0.1;
    }
    // Nudge the total onto a multiple of 10 so a full clear stays possible.
    var sum = 0;
    for (i = 0; i < n; i++) sum += G.grid[i];
    var over = sum % TARGET;
    var guard = 0;
    while (over !== 0 && guard++ < 500) {
      var k = Math.floor(Math.random() * n);
      var want = G.grid[k] - over;
      if (want >= 1 && want <= 9) { G.grid[k] = want; over = 0; }
      else {
        var alt = G.grid[k] + (TARGET - over);
        if (alt >= 1 && alt <= 9) { G.grid[k] = alt; over = 0; }
      }
    }
  }

  function remaining() {
    var n = 0;
    for (var i = 0; i < G.grid.length; i++) if (G.grid[i]) n++;
    return n;
  }

  // ---- geometry ----------------------------------------------------------

  /**
   * Turn the board on its side so it always fills the screen the long way.
   * Every cat keeps its number — only the seating plan changes.
   */
  function transposeBoard() {
    var oldCols = G.cols, oldRows = G.rows;
    var grid = new Array(G.grid.length), tilt = new Array(G.tilt.length);
    for (var r = 0; r < oldRows; r++) {
      for (var c = 0; c < oldCols; c++) {
        var from = r * oldCols + c;
        var to = c * oldRows + r;
        grid[to] = G.grid[from];
        tilt[to] = G.tilt[from];
      }
    }
    G.grid = grid;
    G.tilt = tilt;
    G.cols = oldRows;
    G.rows = oldCols;
    G.drag = null;
    G.poofs = [];      // their coordinates belonged to the old layout
  }

  function layout() {
    var r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;

    // Keep the long side of the grid on the long side of the screen.
    if (G.grid.length) {
      var wantCols = r.height > r.width ? Math.min(G.cols, G.rows) : Math.max(G.cols, G.rows);
      if (G.cols !== wantCols) transposeBoard();
    }

    G.dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    G.w = r.width;
    G.h = r.height;
    canvas.width  = Math.round(G.w * G.dpr);
    canvas.height = Math.round(G.h * G.dpr);
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);

    var pad = 6;
    G.cell = Math.min((G.w - pad * 2) / G.cols, (G.h - pad * 2) / G.rows);
    G.ox = (G.w - G.cell * G.cols) / 2;
    G.oy = (G.h - G.cell * G.rows) / 2;

    buildSprites();
    draw();
  }

  function buildSprites() {
    var S = Math.max(16, Math.round(G.cell * G.dpr));
    if (G.sprites && G.spriteSize === S) return;
    G.spriteSize = S;
    G.sprites = [];
    G.spritesSel = [];
    for (var d = 1; d <= 9; d++) {
      G.sprites[d]    = renderSprite(S, d, false);
      G.spritesSel[d] = renderSprite(S, d, true);
    }
  }

  function renderSprite(S, digit, selected) {
    var c = document.createElement('canvas');
    c.width = c.height = S;
    drawCat(c.getContext('2d'), S, digit, selected);
    return c;
  }

  function cellCenter(idx) {
    var c = idx % G.cols, r = (idx / G.cols) | 0;
    return { x: G.ox + (c + 0.5) * G.cell, y: G.oy + (r + 0.5) * G.cell };
  }

  // ---- selection ---------------------------------------------------------

  function normRect(d) {
    return {
      x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0)
    };
  }

  function updateSelection() {
    var d = G.drag;
    if (!d) return;
    var r = normRect(d);
    var cells = [], sum = 0;

    // A cat joins the box when its centre is inside — predictable to aim at.
    var c0 = clamp(Math.floor((r.x - G.ox) / G.cell) - 1, 0, G.cols - 1);
    var c1 = clamp(Math.ceil((r.x + r.w - G.ox) / G.cell) + 1, 0, G.cols - 1);
    var r0 = clamp(Math.floor((r.y - G.oy) / G.cell) - 1, 0, G.rows - 1);
    var r1 = clamp(Math.ceil((r.y + r.h - G.oy) / G.cell) + 1, 0, G.rows - 1);

    for (var rr = r0; rr <= r1; rr++) {
      for (var cc = c0; cc <= c1; cc++) {
        var idx = rr * G.cols + cc;
        if (!G.grid[idx]) continue;
        var p = cellCenter(idx);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          cells.push(idx);
          sum += G.grid[idx];
        }
      }
    }

    if (cells.length !== d.cells.length) Sound.pick();
    d.cells = cells;
    d.sum = sum;
  }

  function commitSelection() {
    var d = G.drag;
    G.drag = null;
    if (!d || !d.cells.length) return;

    if (d.sum === TARGET) {
      for (var i = 0; i < d.cells.length; i++) {
        var idx = d.cells[i];
        var p = cellCenter(idx);
        G.poofs.push({ x: p.x, y: p.y, digit: G.grid[idx], t: 0, tilt: G.tilt[idx] });
        G.grid[idx] = 0;
      }
      G.score += d.cells.length;
      Sound.clear(d.cells.length);
      bumpScore();
      hideTip();
      if (remaining() === 0) endGame(true);
    } else {
      Sound.reject();
    }
  }

  function bumpScore() {
    var el = $('hud-score');
    el.textContent = G.score;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // ---- drawing -----------------------------------------------------------

  function draw() {
    if (!G.cell) return;
    ctx.clearRect(0, 0, G.w, G.h);

    var cell = G.cell;
    var sel = {};
    if (G.drag) for (var i = 0; i < G.drag.cells.length; i++) sel[G.drag.cells[i]] = 1;

    // cats
    for (var idx = 0; idx < G.grid.length; idx++) {
      var d = G.grid[idx];
      if (!d) continue;
      var p = cellCenter(idx);
      var img = (sel[idx] ? G.spritesSel : G.sprites)[d];
      var scale = sel[idx] ? 1.06 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(G.tilt[idx]);
      ctx.drawImage(img, -cell * scale / 2, -cell * scale / 2, cell * scale, cell * scale);
      ctx.restore();
    }

    // departing cats
    for (var k = 0; k < G.poofs.length; k++) {
      var f = G.poofs[k];
      var e = f.t;                                   // 0 → 1
      ctx.save();
      ctx.globalAlpha = 1 - e;
      ctx.translate(f.x, f.y - e * cell * 0.7);
      ctx.rotate(f.tilt + e * 0.5);
      var s = cell * (1 + e * 0.5);
      ctx.drawImage(G.spritesSel[f.digit], -s / 2, -s / 2, s, s);
      ctx.restore();

      // sparkles trailing behind
      ctx.save();
      ctx.globalAlpha = (1 - e) * 0.9;
      ctx.fillStyle = '#ffd166';
      for (var q = 0; q < 4; q++) {
        var a = f.tilt * 9 + q * Math.PI / 2;
        var rad = e * cell * 0.85;
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad, Math.max(1, cell * 0.05 * (1 - e)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // selection box
    if (G.drag) drawSelection();
  }

  function drawSelection() {
    var d = G.drag;
    var r = normRect(d);
    var good = d.sum === TARGET && d.cells.length > 0;
    var accent = good ? '#6ee7b7' : (d.sum > TARGET ? '#ff6b81' : '#ffd166');

    ctx.save();
    ctx.fillStyle = good ? 'rgba(110,231,183,.13)' : 'rgba(255,209,102,.08)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = good ? 2.6 : 1.8;
    if (!good) ctx.setLineDash([6, 5]);
    ctx.shadowColor = accent;
    ctx.shadowBlur = good ? 16 : 0;
    roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(12, Math.min(r.w, r.h) / 2));
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // running total, parked just above the box
    if (d.cells.length) {
      var label = String(d.sum);
      var bx = r.x + r.w / 2;
      var by = r.y - 16;
      if (by < 18) by = r.y + r.h + 18;
      ctx.save();
      ctx.font = '800 15px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif';
      var pw = ctx.measureText(label).width + 20;
      ctx.fillStyle = good ? '#6ee7b7' : 'rgba(20,16,32,.92)';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      roundRect(ctx, bx - pw / 2, by - 12, pw, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = good ? '#0d2c22' : accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx, by + 1);
      ctx.restore();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---- loop --------------------------------------------------------------

  function frame() {
    if (!G.running) return;
    G.raf = requestAnimationFrame(frame);

    // animations
    if (G.poofs.length) {
      for (var i = G.poofs.length - 1; i >= 0; i--) {
        G.poofs[i].t += 0.055;
        if (G.poofs[i].t >= 1) G.poofs.splice(i, 1);
      }
    }

    // clock
    var left = Math.max(0, (G.endsAt - performance.now()) / 1000);
    G.timeLeft = left;
    paintClock(left);
    if (left <= 0) { endGame(false); return; }

    draw();
  }

  function paintClock(left) {
    var whole = Math.ceil(left);
    if (whole !== G.lastTick) {
      G.lastTick = whole;
      var m = Math.floor(whole / 60), s = whole % 60;
      $('hud-time').textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (whole <= 5 && whole > 0) Sound.tick();
    }
    $('timer-fill').style.transform = 'scaleX(' + (left / ROUND_TIME) + ')';
    document.querySelector('.timer').classList.toggle('is-low', left <= 15);
  }

  // ---- lifecycle ---------------------------------------------------------

  function startGame() {
    showScreen('screen-game');

    // Let the layout settle, then pick a grid that suits the screen shape:
    // 17x10 on a wide screen, 10x17 on a phone held upright. Same 170 cats.
    requestAnimationFrame(function () {
      var r = wrap.getBoundingClientRect();
      var portrait = r.height > r.width;
      G.cols = portrait ? 10 : 17;
      G.rows = portrait ? 17 : 10;

      buildBoard();
      G.score = 0;
      G.poofs = [];
      G.drag = null;
      G.lastTick = -1;
      G.sprites = null;
      $('hud-score').textContent = '0';
      $('tip').classList.remove('fade');
      showCredit();

      layout();

      G.endsAt = performance.now() + ROUND_TIME * 1000;
      G.running = true;
      cancelAnimationFrame(G.raf);
      G.raf = requestAnimationFrame(frame);
    });
  }

  function endGame(cleared) {
    if (!G.running) return;
    G.running = false;
    cancelAnimationFrame(G.raf);
    G.drag = null;
    hideCredit();
    Sound.over();

    var best = parseInt(store(STORE_BEST) || '0', 10);
    if (G.score > best) { best = G.score; store(STORE_BEST, String(best)); }

    $('over-score').textContent = G.score;
    $('over-best').textContent = best;
    $('menu-best').textContent = best;
    document.querySelector('#screen-over .title').textContent = cleared ? 'Purrfect!' : 'Time’s up';
    $('over-line').textContent = cleared
      ? 'every last cat is home'
      : (G.score === 1 ? 'cat set free' : 'cats set free');
    showScreen('screen-over');
  }

  function quitToMenu() {
    G.running = false;
    cancelAnimationFrame(G.raf);
    hideCredit();
    $('menu-best').textContent = store(STORE_BEST) || '0';
    showScreen('screen-menu');
  }

  function hideTip() { $('tip').classList.add('fade'); }

  // ---- opening credit ----------------------------------------------------

  var creditTimers = [];

  function showCredit() {
    var el = $('credit');
    hideCredit();
    el.hidden = false;
    el.classList.remove('is-gone');
    el.style.animation = 'none';       // replay the entrance on every round
    void el.offsetWidth;
    el.style.animation = '';
    creditTimers.push(setTimeout(function () { el.classList.add('is-gone'); }, 2000));
    creditTimers.push(setTimeout(function () { el.hidden = true; }, 2650));
  }

  function hideCredit() {
    for (var i = 0; i < creditTimers.length; i++) clearTimeout(creditTimers[i]);
    creditTimers = [];
    var el = $('credit');
    el.hidden = true;
    el.classList.remove('is-gone');
  }

  // ---- input -------------------------------------------------------------

  function pointAt(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: clamp(ev.clientX - r.left, 0, r.width),
      y: clamp(ev.clientY - r.top, 0, r.height)
    };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (!G.running) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    var p = pointAt(ev);
    G.drag = { id: ev.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y, cells: [], sum: 0 };
    updateSelection();
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!G.drag || ev.pointerId !== G.drag.id) return;
    ev.preventDefault();
    var p = pointAt(ev);
    G.drag.x1 = p.x;
    G.drag.y1 = p.y;
    updateSelection();
  });

  function release(ev) {
    if (!G.drag || ev.pointerId !== G.drag.id) return;
    commitSelection();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Belt and braces against pull-to-refresh / rubber-banding on the board.
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  window.addEventListener('resize', function () { if (G.cell) layout(); });
  window.addEventListener('orientationchange', function () { setTimeout(layout, 250); });

  // ---- password gate -----------------------------------------------------

  var gateInput = $('gate-input');
  var gateMsg   = $('gate-msg');

  function unlock(silent) {
    store(STORE_OPEN, '1');
    $('menu-best').textContent = store(STORE_BEST) || '0';
    if (!silent) Sound.unlock();
    showScreen('screen-menu');
  }

  $('gate-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var given = (gateInput.value || '').trim().toLowerCase();
    if (given === PASSWORD) {
      gateMsg.textContent = 'Welcome in.';
      gateMsg.className = 'hint is-ok';
      setTimeout(function () { unlock(false); }, 260);
    } else {
      gateMsg.textContent = given ? 'That is not the password.' : 'The cats need a password.';
      gateMsg.className = 'hint is-error';
      var field = gateInput.parentNode;
      field.classList.remove('shake');
      void field.offsetWidth;
      field.classList.add('shake');
      gateInput.select();
      Sound.denied();
    }
  });

  $('gate-peek').addEventListener('click', function () {
    var show = gateInput.type === 'password';
    gateInput.type = show ? 'text' : 'password';
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    gateInput.focus();
  });

  // ---- buttons -----------------------------------------------------------

  var ICON_SPEAKER =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 9.5h3.4L12 5.5v13L7.4 14.5H4z" fill="currentColor" stroke="none"/>' +
    '<path d="M15.5 9.4a3.6 3.6 0 0 1 0 5.2M18.2 6.9a7.2 7.2 0 0 1 0 10.2"/></svg>';

  var ICON_MUTED =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 9.5h3.4L12 5.5v13L7.4 14.5H4z" fill="currentColor" stroke="none"/>' +
    '<path d="M16 10l5 4M21 10l-5 4"/></svg>';

  function paintSoundButtons() {
    $('btn-sound').innerHTML = Sound.muted ? ICON_MUTED : ICON_SPEAKER;
    $('btn-sound').setAttribute('aria-pressed', String(!Sound.muted));
    $('btn-sound-menu').textContent = 'Sound: ' + (Sound.muted ? 'off' : 'on');
    $('btn-sound-menu').setAttribute('aria-pressed', String(!Sound.muted));
  }

  function toggleSound() {
    Sound.muted = !Sound.muted;
    store(STORE_MUTE, Sound.muted ? '1' : '0');
    paintSoundButtons();
    if (!Sound.muted) Sound.pick();
  }

  $('btn-start').addEventListener('click', function () { Sound.ensure(); startGame(); });
  $('btn-again').addEventListener('click', startGame);
  $('btn-menu').addEventListener('click', quitToMenu);
  $('btn-quit').addEventListener('click', quitToMenu);
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-sound-menu').addEventListener('click', toggleSound);

  // Pausing when the tab is hidden keeps the clock honest.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.running) {
      G.hiddenAt = performance.now();
    } else if (!document.hidden && G.running && G.hiddenAt) {
      G.endsAt += performance.now() - G.hiddenAt;
      G.hiddenAt = 0;
    }
  });

  // ---- boot --------------------------------------------------------------

  paintSoundButtons();
  if (store(STORE_OPEN) === '1') {
    unlock(true);
  } else {
    showScreen('screen-gate');
    setTimeout(function () { gateInput.focus(); }, 300);
  }
})();
