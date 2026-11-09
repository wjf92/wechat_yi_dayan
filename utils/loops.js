// utils/loops.js —— 揲四「手绘圈」几何（纯函数，无副作用，可在 Node 里单测）
//
// 目标：在 49 颗球的密排里，把「四策一撮」就地圈出来，且
//   1) 圈贴着这四颗的外沿走（不至于把四颗画成一根香肠）；
//   2) 遇别组的球就收口（圈不把别组的球圈进来）；
//   3) 遇你画的那条线就收口（圈不越线）；
//   4) 圈与圈之间不穿插。
//
// 坐标约定：pts 一律是「球心」坐标；W、H ＝ 圆席宽高（px）；sz ＝ 球径（px）。

/* 取一撮：从种子开始，每次挑离这一撮最近的补齐（圈得才紧凑） */
function takeNearest(pool, seed, need, pts) {
  const got = [seed];
  const rest = [];
  for (let i = 0; i < pool.length; i++) if (pool[i] !== seed) rest.push(pool[i]);

  while (got.length < need && rest.length) {
    let bi = 0, bd = 1e18;
    for (let k = 0; k < rest.length; k++) {
      let s = 0;
      for (let q = 0; q < got.length; q++) {
        const dx = pts[rest[k]].x - pts[got[q]].x;
        const dy = pts[rest[k]].y - pts[got[q]].y;
        s += dx * dx + dy * dy;
      }
      s /= got.length;
      if (s < bd) { bd = s; bi = k; }
    }
    got.push(rest[bi]);
    rest.splice(bi, 1);
  }
  return got;
}

/* 最紧凑的一撮：枚举种子，取离它最近的 k-1 颗，选「最远两颗距离」最小的那一组。
   余数那一撮（3~4 颗）常被摊在球阵边缘，东一颗西一颗，圈出来就是靴子形；
   先在剩下的球里挑一组挨得最紧的，圈自然就圆。O(n² log n)，n≤49，约 1ms。 */
function tightest(pool, k, pts) {
  if (k >= pool.length) return pool.slice();
  if (k <= 0) return [];
  let best = null, bestD = 1e18;
  for (let s = 0; s < pool.length; s++) {
    const si = pool[s];
    const rest = [];
    for (let t = 0; t < pool.length; t++) {
      if (t === s) continue;
      const q = pool[t];
      const dx = pts[q].x - pts[si].x, dy = pts[q].y - pts[si].y;
      rest.push({ i: q, d: dx * dx + dy * dy });
    }
    rest.sort(function (a, b) { return a.d - b.d; });
    const cand = [si];
    for (let u = 0; u < rest.length && cand.length < k; u++) cand.push(rest[u].i);
    let far = 0;
    for (let a = 0; a < cand.length; a++) {
      for (let b = a + 1; b < cand.length; b++) {
        const dx = pts[cand[a]].x - pts[cand[b]].x, dy = pts[cand[a]].y - pts[cand[b]].y;
        const d = dx * dx + dy * dy;
        if (d > far) far = d;
      }
    }
    if (far < bestD - 1e-9) { bestD = far; best = cand; }
  }
  return best || pool.slice(0, k);
}

/* 四颗一撮：种子取「离本片重心最远」的那颗，再逐个挑最近的补齐 */
function cluster4(idxs, pts) {
  let left = idxs.slice();
  const out = [];
  while (left.length >= 4) {
    let cx = 0, cy = 0;
    for (let i = 0; i < left.length; i++) { cx += pts[left[i]].x; cy += pts[left[i]].y; }
    cx /= left.length; cy /= left.length;

    let si = 0, far = -1;
    for (let j = 0; j < left.length; j++) {
      const dx = pts[left[j]].x - cx, dy = pts[left[j]].y - cy;
      const dd = dx * dx + dy * dy;
      if (dd > far) { far = dd; si = j; }
    }
    const g = takeNearest(left, left[si], 4, pts);
    out.push(g);
    left = left.filter(function (x) { return g.indexOf(x) < 0; });
  }
  return out;
}

/* 一撮的「最远半径平方」——越小越紧凑 */
function clusterCost(g, pts) {
  let cx = 0, cy = 0;
  for (let i = 0; i < g.length; i++) { cx += pts[g[i]].x; cy += pts[g[i]].y; }
  cx /= g.length; cy /= g.length;
  let m = 0;
  for (let j = 0; j < g.length; j++) {
    const dx = pts[g[j]].x - cx, dy = pts[g[j]].y - cy;
    const d = dx * dx + dy * dy;
    if (d > m) m = d;
  }
  return m;
}

/* 两撮之间互换成员，把每一撮收得更紧（圈更小更圆） */
function refineClusters(gs, pts) {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let a = 0; a < gs.length; a++) {
      for (let b = a + 1; b < gs.length; b++) {
        const A = gs[a], B = gs[b];
        let base = clusterCost(A, pts) + clusterCost(B, pts);
        for (let u = 0; u < A.length; u++) {
          for (let v = 0; v < B.length; v++) {
            let t = A[u]; A[u] = B[v]; B[v] = t;
            const now = clusterCost(A, pts) + clusterCost(B, pts);
            if (now < base - 0.01) { base = now; changed = true; }
            else { t = A[u]; A[u] = B[v]; B[v] = t; }
          }
        }
      }
    }
    if (!changed) break;
  }
  return gs;
}

/* 你画的线在某个 y 上的 x（折线插值） */
function boundaryX(stroke, y) {
  let best = 1e9, bx = stroke[0].x;
  for (let i = 0; i < stroke.length - 1; i++) {
    const a = stroke[i], c = stroke[i + 1];
    const y0 = Math.min(a.y, c.y), y1 = Math.max(a.y, c.y);
    const yy = Math.max(y0, Math.min(y1, y));
    const t = (y1 === y0) ? 0 : (yy - y0) / (y1 - y0);
    const x = a.x + (c.x - a.x) * t;
    const d = Math.abs(y - yy);
    if (d < best) { best = d; bx = x; }
  }
  return bx;
}

/* 分组：跳过挂起的那一枚；左右各按 4 颗一格切分，余数单独归一撮
   返回 [{idx:[球序号], rem:bool, side:'L'|'R'}]
   注意：整除不是余零，而是余四（《占卜玄机》），故 rem = m % 4 || 4，
   这一撮整四颗与余 1/2/3 一样要取出离席。 */
function groupBalls(sides, pts, skip, sz) {
  const out = [];
  ['L', 'R'].forEach(function (side) {
    const idxs = [];
    for (let i = 0; i < sides.length; i++) {
      if (sides[i] === side && i !== skip) idxs.push(i);
    }
    const m = idxs.length;
    if (!m) return;

    const rem = m % 4 || 4;

    /* 余数那一撮：以离本侧重心最远的一颗作种子，就近凑够 */
    let cx = 0, cy = 0;
    for (let a = 0; a < m; a++) { cx += pts[idxs[a]].x; cy += pts[idxs[a]].y; }
    cx /= m; cy /= m;

    let seed = idxs[0], far = -1;
    for (let b = 0; b < m; b++) {
      const dx = pts[idxs[b]].x - cx, dy = pts[idxs[b]].y - cy;
      const dd = dx * dx + dy * dy;
      if (dd > far) { far = dd; seed = idxs[b]; }
    }
    const remIdx = takeNearest(idxs, seed, rem, pts);
    const rest = [];
    for (let c = 0; c < m; c++) if (remIdx.indexOf(idxs[c]) < 0) rest.push(idxs[c]);

    if (rest.length >= 4) {
      const gs = refineClusters(cluster4(rest, pts), pts);
      for (let t = 0; t < gs.length; t++) out.push({ idx: gs[t], rem: false, side: side });
    }
    out.push({ idx: remIdx, rem: true, side: side });
  });
  return out;
}

/* 组内最小生成树：四颗以内直接 Prim，用来把「串在一起的四颗」连成骨架 */
function mstPairs(idxs, pts) {
  const m = idxs.length;
  if (m < 2) return [];
  const inTree = [0], out = [];
  const d = function (a, b) {
    const p = pts[idxs[a]], q = pts[idxs[b]];
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  while (inTree.length < m) {
    let ba = -1, bb = -1, bd = 1e18;
    for (let i = 0; i < inTree.length; i++) {
      for (let b = 0; b < m; b++) {
        if (inTree.indexOf(b) >= 0) continue;
        const dd = d(inTree[i], b);
        if (dd < bd) { bd = dd; ba = inTree[i]; bb = b; }
      }
    }
    if (bb < 0) break;
    out.push([idxs[ba], idxs[bb]]);
    inTree.push(bb);
  }
  return out;
}

/* 单圈的半径序列：144 个方向（画的时候再按弧长重采成 56 点），
   取「本组球盘 ∪ 骨骼胶囊」的外沿，再被别组球、被划线挡住的地方收口，最后加一点极轻的手抖。

   ⚠️ 骨架＝球心最小生成树 + 等距外扩。
   只按各球圆盘取径向最外沿会漏：四颗一散开，球缝那条射线谁也碰不到，
   半径直接塌到 0，圈就甩出尖刺斜穿自家球（实测 17% 的球被切在圈外）。 */
/* 环形序列的闭运算：先滚动取最大、再滚动取最小。
   窄于窗口的深谷被抬平，宽缓的起伏不动——用来去掉球缝处的尖刺。 */
const CLOSE_W = 12, CLOSE_W_REM = 20;
function closeSeq(arr, w) {
  const m = arr.length, up = [], out = [];
  for (let i = 0; i < m; i++) {
    let v = -1e9;
    for (let j = -w; j <= w; j++) { const q = arr[(i + j + m * 2) % m]; if (q > v) v = q; }
    up.push(v);
  }
  for (let i = 0; i < m; i++) {
    let v = 1e9;
    for (let j = -w; j <= w; j++) { const q = up[(i + j + m * 2) % m]; if (q < v) v = q; }
    out.push(v);
  }
  return out;
}

function loopGeom(g, pts, sz, stroke, W, H, seed) {
  const n = g.idx.length, R = sz / 2, u = sz / 13;
  const Rneed = R + 1.6 * u;     // 硬下限：球边再外 1.6u（多留一点，抵掉折线/贝塞尔的弦切误差）
  const Rwant = R + 2.35 * u;    // 常态留白，笔尖舒展开的样子
  const Rf = R + 1.0 * u;        // 别组的球：贴到它的边就收口
  const lim = 1.2 * u;           // 划线这道墙的余量
  const N = 144, th = [], rad = [], floor = [];

  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += pts[g.idx[i]].x; cy += pts[g.idx[i]].y; }
  cx /= n; cy /= n;

  const bones = mstPairs(g.idx, pts);

  function foreignCap(ux, uy) {
    let cap = 1e9;
    for (let o = 0; o < pts.length; o++) {
      if (g.idx.indexOf(o) >= 0) continue;
      const ex = pts[o].x - cx, ey = pts[o].y - cy;
      const ej = ex * ux + ey * uy;
      const ep = ex * ex + ey * ey - ej * ej;
      if (ep >= Rf * Rf || ej <= 0) continue;
      const near = ej - Math.sqrt(Rf * Rf - ep);
      if (near > 0 && near < cap) cap = near;
    }
    return cap;
  }

  function wallFor(ux, uy, r) {
    if (!stroke || stroke.length < 2) return 1e9;
    if (ux > 0.02 || ux < -0.02) {
      const py = Math.max(1, Math.min(H - 1, cy + r * uy));
      const bx = boundaryX(stroke, py);
      return (g.side === 'L') ? (bx - lim - cx) / ux : (bx + lim - cx) / ux;
    }
    return 1e9;
  }

  /* 本组沿某方向的「外沿半径」：球盘 ∪ 骨骼胶囊（等距外扩）取径向最外点。
     球盘保证四颗各自被整颗包住；胶囊把相邻两颗之间的缺口填成腰身，
     圈于是在球缝里「收一下」而不是塌成尖刺。 */
  function env(ux, uy, Rn) {
    let best = 0;
    for (let a = 0; a < n + bones.length * 6; a++) {
      let px, py;
      if (a < n) { const q = pts[g.idx[a]]; px = q.x; py = q.y; }
      else {
        const s = a - n, e = bones[(s / 6) | 0], tt = (s % 6) / 6;
        const p1 = pts[e[0]], p2 = pts[e[1]];
        px = p1.x + (p2.x - p1.x) * tt;
        py = p1.y + (p2.y - p1.y) * tt;
      }
      const dx = px - cx, dy = py - cy;
      const pj = dx * ux + dy * uy;
      const pp = dx * dx + dy * dy - pj * pj;
      if (pp > Rn * Rn) continue;
      const f = pj + Math.sqrt(Rn * Rn - pp);
      if (f > best) best = f;
    }
    return best;
  }

  /* 先把「必需半径」与「舒适半径」逐方向算成序列 */
  const M0 = [], W0 = [];
  /* 凸包外扩（支撑函数）：与胶囊加权，把「两球之间的公切线」这段直边拉成弧，
     圈于是介于「紧贴四球」与「整团凸起」之间，既不至于包进邻球，也不显出生硬的多边形 */
  function convexR(ux, uy, d) {
    let proj = -1e9;
    for (let a = 0; a < n; a++) {
      const q = pts[g.idx[a]];
      const pj = (q.x - cx) * ux + (q.y - cy) * uy;
      if (pj > proj) proj = pj;
    }
    return Math.max(2 * u, proj + d);
  }
  const MIX = 0.84;      // 胶囊占比：1=纯胶囊（最贴合），0=纯凸包（最圆但最大）

  for (let k = 0; k < N; k++) {
    const t = k / N * Math.PI * 2;
    const ux = Math.cos(t), uy = Math.sin(t);
    let m0 = MIX * env(ux, uy, Rneed) + (1 - MIX) * convexR(ux, uy, Rneed);
    let w0 = MIX * env(ux, uy, Rwant) + (1 - MIX) * convexR(ux, uy, Rwant);
    if (m0 < 2 * u) m0 = 2 * u;
    if (w0 < m0) w0 = m0;
    M0.push(m0); W0.push(w0);
  }

  /* 闭运算（滚动最大 → 滚动最小）：只填平「窄而深」的谷，宽缓的腰身原样保留。
     球缝里那条射线谁也碰不到，径向半径会塌成个位数，圈就在那里甩出尖刺与直角；
     把窄谷抬平之后，圈既仍贴着四颗球（不去包邻球），又不会啃出手套形。 */
  const cw = g.rem ? CLOSE_W_REM : CLOSE_W;
  const M1 = closeSeq(M0, cw), W1 = closeSeq(W0, cw);

  for (let k = 0; k < N; k++) {
    const t = k / N * Math.PI * 2;
    const ux = Math.cos(t), uy = Math.sin(t);

    const must = M1[k];
    let want = W1[k];
    if (want < must) want = must;

    const wob = (0.42 + 0.3 * Math.sin(3 * t + seed * 1.7) + 0.18 * Math.sin(7 * t + seed * 4.3)) * u;
    let r = want + wob;

    /* 收口：邻球 / 划线，但不得压进 must 以内 */
    const capF = foreignCap(ux, uy);
    if (capF < r) r = capF;
    const wall = wallFor(ux, uy, r);
    if (wall > 0 && wall < r) r = wall;
    if (r < must) r = must;

    floor.push(must);
    rad.push(r);
    th.push(t);
  }

  /* 半径序列轻微平滑，抹掉台阶，像笔尖带出来的圆润 */
  const sm = rad.slice();
  for (let k2 = 0; k2 < N; k2++) {
    sm[k2] = (rad[(k2 - 1 + N) % N] + rad[k2] * 2 + rad[(k2 + 1) % N]) / 4;
  }

  /* 平滑会往里收，先把手绘的鼓胀补回、再按 must 保底；
     收口只能发生在 must 之外，否则自家球又被切了 */
  for (let k5 = 0; k5 < N; k5++) {
    const ux5 = Math.cos(th[k5]), uy5 = Math.sin(th[k5]);
    if (sm[k5] < floor[k5]) sm[k5] = floor[k5];
    const cap5 = foreignCap(ux5, uy5);
    if (cap5 >= floor[k5] && cap5 < sm[k5]) sm[k5] = cap5;
    const wall5 = wallFor(ux5, uy5, sm[k5]);
    if (wall5 >= floor[k5] && wall5 < sm[k5]) sm[k5] = wall5;
  }

  /* 144 个方向只是「算」的密度；画的时候按弧长重采成 56 点：
     形状不变，贝塞尔段数省三分之二（淡入时每 33ms 全量重绘）。
     必须重采而不是直接稀疏采样——把 144 点隔一个取一个，弦又会把球切掉。 */
  const dense = [];
  for (let k3 = 0; k3 < N; k3++) {
    dense.push({ x: cx + sm[k3] * Math.cos(th[k3]), y: cy + sm[k3] * Math.sin(th[k3]) });
  }
  const segLen = [], acc = [];
  let total = 0;
  for (let i2 = 0; i2 < N; i2++) {
    const a = dense[i2], b = dense[(i2 + 1) % N];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    segLen.push(d); total += d; acc.push(total);
  }
  const M = 56, outPts = [], outTh = [], outNeed = [];
  let cur = 0;
  for (let i3 = 0; i3 < M; i3++) {
    const target = total * i3 / M;
    while (cur < N - 1 && acc[cur] < target) cur++;
    const prev = cur === 0 ? 0 : acc[cur - 1];
    const t = Math.max(0, Math.min(1, (target - prev) / segLen[cur]));
    const a = dense[cur], b = dense[(cur + 1) % N];
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
    outPts.push({ x: px, y: py });
    outTh.push(Math.atan2(py - cy, px - cx));
    outNeed.push(Math.max(floor[cur], floor[(cur + 1) % N]));
  }

  /* 折角抻圆：反复取邻点均值（凹陷处被拉平），一旦收进球边以内就顶回下限。
     这样球缝里的尖角被抹成圆弧，球外侧的鼓胀又不会被削掉。 */
  for (let pass = 0; pass < 7; pass++) {
    const tmp = [];
    for (let i4 = 0; i4 < M; i4++) {
      const a = outPts[(i4 - 1 + M) % M], b = outPts[i4], c2 = outPts[(i4 + 1) % M];
      tmp.push({ x: (a.x + 2 * b.x + c2.x) / 4, y: (a.y + 2 * b.y + c2.y) / 4 });
    }
    for (let i5 = 0; i5 < M; i5++) {
      const q = tmp[i5];
      const dx = q.x - cx, dy = q.y - cy;
      const d = Math.hypot(dx, dy) || 1e-6;
      /* 按「新方向」重新算所需半径——点被拉偏了角度，旧的下限就不作数了 */
      const need = Math.max(outNeed[i5], env(dx / d, dy / d, Rneed));
      if (d < need) {
        const k = need / d;
        q.x = cx + dx * k; q.y = cy + dy * k;
      }
      outPts[i5] = q;
    }
  }
  for (let i6 = 0; i6 < M; i6++) outTh[i6] = Math.atan2(outPts[i6].y - cy, outPts[i6].x - cx);

  return {
    cx: cx, cy: cy, th: outTh, rad: outPts.map(function (p) { return Math.hypot(p.x - cx, p.y - cy); }),
    need: outNeed,          // 硬下限（球边 + 1.6u），圈圈互让时也不许越过去
    pts: outPts, side: g.side, rem: g.rem
  };
}

function insidePoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (((poly[i].y > p.y) !== (poly[j].y > p.y)) &&
      (p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) c = !c;
  }
  return c;
}

/* 圈与圈互不穿插：谁的点落进别人的圈里，就把那一点往自家中心收，
   但收不过自家球的硬下限——宁可两圈稍稍蹭上，也不能把球漏在圈外。
   先用包围盒筛掉大半不相干的圈对，整页 13 个圈也能压到几毫秒。 */
function avoidCross(loops) {
  const boxes = loops.map(function (l) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < l.pts.length; i++) {
      const p = l.pts[i];
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  });

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let a = 0; a < loops.length; a++) {
      for (let b = a + 1; b < loops.length; b++) {
        const ba = boxes[a], bb = boxes[b];
        if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.y1 < bb.y0 || bb.y1 < ba.y0) continue;
        const A = loops[a], B = loops[b];
        for (let side = 0; side < 2; side++) {
          const me = side ? B : A, other = side ? A : B;
          const ob = side ? ba : bb;
          for (let i = 0; i < me.pts.length; i++) {
            const p = me.pts[i];
            if (p.x < ob.x0 || p.x > ob.x1 || p.y < ob.y0 || p.y > ob.y1) continue;
            if (!insidePoly(p, other.pts)) continue;
            let nr = me.rad[i] - 1.1;
            if (nr < me.need[i]) nr = me.need[i];
            if (nr < me.rad[i] - 1e-6) {
              me.rad[i] = nr;
              me.pts[i] = { x: me.cx + nr * Math.cos(me.th[i]), y: me.cy + nr * Math.sin(me.th[i]) };
              changed = true;
            }
          }
        }
      }
    }
    if (!changed) break;
  }
}

/* 一组 group → 一圈闭合曲线（弧长重采 56 点 → 三次贝塞尔段） */
function buildLoops(groups, pts, sz, stroke, W, H) {
  const loops = [];
  for (let i = 0; i < groups.length; i++) {
    const seed = i * 1.37 + (groups[i].side === 'L' ? 0.4 : 2.1);
    loops.push(loopGeom(groups[i], pts, sz, stroke, W, H, seed));
  }
  avoidCross(loops);
  return loops.map(function (lp) {
    return { rem: lp.rem, side: lp.side, poly: lp.pts, segs: curveSegs(lp.pts) };
  });
}

/* 闭合折线（弧长重采 56 点）→ Catmull-Rom 三次贝塞尔段，供 canvas 逐段画 */
function curveSegs(p) {
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    out.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p: p2
    });
  }
  return out;
}

module.exports = {
  takeNearest: takeNearest,
  cluster4: cluster4,
  groupBalls: groupBalls,
  buildLoops: buildLoops,
  curveSegs: curveSegs,
  boundaryX: boundaryX
};
