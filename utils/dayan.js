// utils/dayan.js —— 大衍筮法内核（纯函数，无副作用）
// 依据：《易断全书·占卜玄机》大衍之术
// 一变：分二 → 挂一（右堆取一） → 右堆揲四归奇 r1 → 左堆揲四归奇 r2 → 剩余 N-1-r1-r2

const hexagrams = require('./hexagrams.js');

const YAO_INFO = {
  6: { name: '老阴', symbol: '⚋', yang: false, changing: true },
  7: { name: '少阳', symbol: '⚊', yang: true, changing: false },
  8: { name: '少阴', symbol: '⚋', yang: false, changing: false },
  9: { name: '老阳', symbol: '⚊', yang: true, changing: true }
};

// 揲四余数：整除时记 4（非 0）
function remainder4(n) {
  const r = n % 4;
  return r === 0 ? 4 : r;
}

// 单变演算
function change(total, leftCount) {
  const totalNum = Number(total) || 0;
  const left = Number(leftCount) || 0;
  const right = totalNum - left;
  if (left < 1 || right < 1) {
    return { error: 'INVALID_SPLIT' };
  }
  const hung = 1;
  const rightAfterHang = right - hung;
  const r1 = remainder4(rightAfterHang);
  const r2 = remainder4(left);
  const next = totalNum - hung - r1 - r2;
  return {
    total: totalNum,
    left: left,
    right: right,
    hung: hung,
    rightAfterHang: rightAfterHang,
    r1: r1,
    r2: r2,
    next: next
  };
}

// 三变后剩余 24/28/32/36 → 6/7/8/9
function yaoValue(remain) {
  const v = remain / 4;
  return (v === 6 || v === 7 || v === 8 || v === 9) ? v : 0;
}

function yaoInfo(v) {
  return YAO_INFO[v] || YAO_INFO[7];
}

// 揲四分组：返回 { groups: 组数, rem: 余数(1~4) }
function groupsOf(count) {
  const rem = remainder4(count);
  return { groups: (count - rem) / 4, rem: rem };
}

// 非重叠散布：最小中心距 = 直径 + 间隙，随机取点并做碰撞检测
function layoutBalls(count, width, height, size, gap) {
  const minD = size + gap;
  const pts = [];
  let tries = 0;
  const limit = count * 900;
  const maxX = Math.max(width - size, 0);
  const maxY = Math.max(height - size, 0);
  while (pts.length < count && tries < limit) {
    tries++;
    const x = Math.random() * maxX;
    const y = Math.random() * maxY;
    let ok = true;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x;
      const dy = pts[i].y - y;
      if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
    }
    if (ok) pts.push({ x: x, y: y });
  }
  return pts;
}

// 圆内非重叠散布：返回左上角坐标
// side: 0 = 全部 / 1 = 左半 / 2 = 右半
function layoutInCircle(count, diameter, size, gap, side) {
  const cx = diameter / 2;
  const cy = diameter / 2;
  const Rmax = Math.max(cx - 7 - size / 2, 4);
  const D = size + gap;
  const pts = [];
  let tries = 0;
  const limit = count * 2500;
  while (pts.length < count && tries < limit) {
    tries++;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * Rmax;
    const bx = cx + Math.cos(a) * rr;
    const by = cy + Math.sin(a) * rr;
    if (side === 1 && bx > cx - 11) continue;
    if (side === 2 && bx < cx + 11) continue;
    let ok = true;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - bx;
      const dy = pts[i].y - by;
      if (dx * dx + dy * dy < D * D) { ok = false; break; }
    }
    if (ok) pts.push({ x: bx, y: by });
  }
  return pts.map(function (p) {
    return { x: p.x - size / 2, y: p.y - size / 2 };
  });
}

// 圆内均匀铺球：向日葵螺旋（密度按面积均分）+ 松弛（互不重叠）+ 微抖动
// 与 layoutInCircle 的纯随机散布相比，不会出现「一坨一撮、旁边一个大空当」
function layoutEven(count, diameter, size, gap) {
  const cx = diameter / 2;
  const cy = diameter / 2;
  const Rmax = Math.max(cx - 8 - size / 2, 4);
  const D = size + gap;
  const N = Math.max(1, count | 0);
  const rot = Math.random() * Math.PI * 2;
  const golden = Math.PI * (3 - Math.sqrt(5));   // 黄金角 137.5°
  const pts = [];

  for (let i = 0; i < N; i++) {
    const r = Rmax * Math.sqrt((i + 0.42) / N);
    const a = rot + i * golden;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }

  /* 松弛：把过近的两颗推开，越出圆边的拉回；密度已由螺旋保证 */
  for (let it = 0; it < 120; it++) {
    let moved = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pts[j].x - pts[i].x;
        let dy = pts[j].y - pts[i].y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D * D) continue;
        let d = Math.sqrt(d2);
        if (d < 0.001) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.sqrt(dx * dx + dy * dy) || 1; }
        const push = (D - d) * 0.3;
        const ux = dx / d;
        const uy = dy / d;
        pts[i].x -= ux * push; pts[i].y -= uy * push;
        pts[j].x += ux * push; pts[j].y += uy * push;
        moved++;
      }
    }
    if (moved) {
      for (let i = 0; i < N; i++) {
        const dx = pts[i].x - cx;
        const dy = pts[i].y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > Rmax) { pts[i].x = cx + dx / d * Rmax; pts[i].y = cy + dy / d * Rmax; }
      }
    } else {
      break;
    }
  }

  /* 微抖动：别让人看出是阵列 */
  const jit = Math.min(D * 0.12, 3.2);
  for (let i = 0; i < N; i++) {
    pts[i].x += (Math.random() - 0.5) * jit;
    pts[i].y += (Math.random() - 0.5) * jit;
  }

  return pts.map(function (p) {
    return { x: p.x - size / 2, y: p.y - size / 2 };
  });
}

// 把用户画的那一笔两端沿切线延长到圆席之外
//
// 占者画的是「分界的示意」，一笔停下来没画到最下排球，并不代表分界不存在 ——
// 只要这一笔的方向明确，它的延长线照样把圆席切成两半。旧版要求「线的首尾必须
// 盖过最上一排与最下一排球心」，斜着画时线常常先从圆席侧边出界（截图即此），
// 于是被判成「最下面 N 策落在线外」而重画 —— 这正是要改的地方。
//
// 返回 { pts: 有序折线（含两端延长点）, segs: 两条延长段的端点，供画虚线提示 }
function extendSplit(samples, W, H) {
  const sorted = samples.slice().sort(function (a, b) { return a.y - b.y; });
  const n = sorted.length;
  if (n < 2) return { pts: sorted, segs: [] };

  const Wd = W || 1000, Hd = H || 1000;
  const loX = -0.02 * Wd, hiX = 1.02 * Wd, loY = -0.02 * Hd, hiY = 1.02 * Hd;

  /* 方向：由内指向外（用内侧第 4 个点定方向，比首两点稳，手抖不至于歪） */
  function outward(pOut, pIn) {
    const dx = pOut.x - pIn.x, dy = pOut.y - pIn.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-6) return null;
    return { x: dx / L, y: dy / L };
  }
  /* 从 p 沿 d 打到外接矩形边界 */
  function toEdge(p, d) {
    let t = Infinity;
    if (d.x > 1e-6) t = Math.min(t, (hiX - p.x) / d.x);
    if (d.x < -1e-6) t = Math.min(t, (loX - p.x) / d.x);
    if (d.y > 1e-6) t = Math.min(t, (hiY - p.y) / d.y);
    if (d.y < -1e-6) t = Math.min(t, (loY - p.y) / d.y);
    if (!isFinite(t) || t < 0) t = 0;
    const cap = 2 * Math.max(Wd, Hd);
    if (t > cap) t = cap;
    return { x: p.x + d.x * t, y: p.y + d.y * t };
  }

  const pts = sorted.slice();
  const segs = [];
  const minSeg = 0.05 * Math.max(Wd, Hd);      // 太短的延长段不画，省得线上多出小尾巴
  const dH = outward(sorted[0], sorted[Math.min(3, n - 1)]);
  const dT = outward(sorted[n - 1], sorted[Math.max(0, n - 4)]);

  if (dH) {
    const q = toEdge(sorted[0], dH);
    if (q.y < sorted[0].y - 1) {
      pts.unshift(q);
      if (sorted[0].y - q.y > minSeg) {
        segs.push({ x1: q.x, y1: q.y, x2: sorted[0].x, y2: sorted[0].y });
      }
    }
  }
  if (dT) {
    const q = toEdge(sorted[n - 1], dT);
    if (q.y > sorted[n - 1].y + 1) {
      pts.push(q);
      if (q.y - sorted[n - 1].y > minSeg) {
        segs.push({ x1: sorted[n - 1].x, y1: sorted[n - 1].y, x2: q.x, y2: q.y });
      }
    }
  }
  return { pts: pts, segs: segs };
}

// 按用户画的曲线把球分到左右两侧
// samples: [{x, y}]；W/H 为圆席尺寸，用于把线延长到界外（缺省时按点云包围盒兜底）
//
// 归属判据只看「球心」：球是圆的，线从球阵中间穿过时必然要从某些球身上压过去
// （实测每副平均 4~5 颗球的球心距线不足一个半径），所以不能用「整颗球在线的哪侧」判，
// 那样每副都有一堆球说不清。球心落在线上（|dx| ≤ 0.30R）的这几颗记进 edge，
// 由页面用朱红虚环标出来，让占者看得见「它是按球心算的」。
// dx === 0 归右：判据是严格小于归左，浮点下几乎不会真的取等，仅作书面约定。
function splitByCurve(balls, samples, size, W, H) {
  if (!samples || samples.length < 2) {
    return null;
  }
  const half = (size || 0) / 2;
  const ext = extendSplit(samples, W, H);
  const sorted = ext.pts;                 // 两端已延长，故所有球的 y 都落在范围内
  const xs = sorted.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
  const midX = xs[Math.floor(xs.length / 2)];

  function boundaryAt(y) {
    if (y <= sorted[0].y) return sorted[0].x;
    const last = sorted[sorted.length - 1];
    if (y >= last.y) return last.x;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
        return a.x + (b.x - a.x) * t;
      }
    }
    return last.x;
  }

  let left = 0;
  const edge = [];                        // 球心压在线上（0.30R 以内）的球
  const edgeTol = half * 0.30;
  const sides = balls.map(function (b, i) {
    const bx = boundaryAt(b.y + half);
    const dx = (b.x + half) - bx;         // <0 在左，>0 在右，=0 压在线上
    if (Math.abs(dx) <= edgeTol) edge.push(i);
    if (dx < 0) { left++; return 1; }
    return 2;
  });

  // 极端情况兜底：一侧为空则按中位线分
  if (left === 0 || left === balls.length) {
    let l = 0;
    const fallback = balls.map(function (b) {
      if (b.x + half < midX) { l++; return 1; }
      return 2;
    });
    return { sides: fallback, left: l, right: balls.length - l, fallback: true, edge: [], ext: ext.segs };
  }
  return { sides: sides, left: left, right: balls.length - left, fallback: false, edge: edge, ext: ext.segs };
}

// 点到折线的最短距离
function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const d = Math.sqrt((p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy));
    if (d < best) best = d;
  }
  return best;
}

// 划线是否「有话可讲」：笔势要成一个方向、不能回折，且不能横着画
// 返回 { ok, code }：
//   short —— 线太短（不足两个球径），画不出分界
//   flat  —— 近乎水平，判据是按高度取分界点，横线没有高度可言
//   back  —— 中途往回折，同一高度出现两个分界点，左右说不清
//   ok    —— 可以分堆
// 注意：不再判「线必须盖过上下两排球心」——两端会延长（extendSplit）。
function checkSplit(balls, samples, size) {
  if (!samples || samples.length < 2) return { ok: false, code: 'short' };
  const half = (size || 0) / 2;

  let top = Infinity, bot = -Infinity;
  for (let i = 0; i < balls.length; i++) {
    const cy = balls[i].y + half;
    if (cy < top) top = cy;
    if (cy > bot) bot = cy;
  }

  /* 一、短：这一笔还没画出一个方向，延长也没意义 */
  let len = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  if (len < (size || 0) * 2.2) return { ok: false, code: 'short' };

  /* 二、横：判定是「按高度取分界点的 x」，近乎水平的一笔没有高度可言。
     只要这一笔有明显的上下走向（y 跨度 ≥ 球阵高度三成），斜着画也行。 */
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].y < minY) minY = samples[i].y;
    if (samples[i].y > maxY) maxY = samples[i].y;
  }
  if (maxY - minY < (bot - top) * 0.30) return { ok: false, code: 'flat' };

  /* 三、回折：逆着运笔方向倒退超过 1.5 个球径，说明画回来了（同一 y 会有两个分界点）
     注意：不再要求「线的首尾必须盖过最上一排与最下一排球心」——
     两端会沿切线延长到圆席之外（extendSplit），延长线照样把圆席切开。
     旧版的 span 判据会把「斜着画、先从侧边出界」的正常一笔判成废话，
     截图里那句「最下面 6 策落在线外」就是这么来的。 */
  const dir = samples[samples.length - 1].y >= samples[0].y ? 1 : -1;   // 自下而上画也算数
  let run = 0, worst = 0;
  for (let i = 1; i < samples.length; i++) {
    const dy = (samples[i].y - samples[i - 1].y) * dir;
    if (dy < 0) {
      run += -dy;
      if (run > worst) worst = run;
    } else {
      run = 0;
    }
  }
  if (worst > (size || 0) * 1.5) return { ok: false, code: 'back' };

  return { ok: true };
}

// 组装一次完整占例
function buildSession(values) {
  const hex = hexagrams.buildHexagram(values);
  const change = hexagrams.hasChange(values);
  const changed = change ? hexagrams.buildHexagram(hexagrams.changedValues(values)) : null;
  return {
    values: values.slice(),
    hex: hex,
    changed: changed,
    changeLabels: hexagrams.changeLabels(values),
    hasChange: change
  };
}

module.exports = {
  YAO_INFO: YAO_INFO,
  remainder4: remainder4,
  change: change,
  yaoValue: yaoValue,
  yaoInfo: yaoInfo,
  groupsOf: groupsOf,
  layoutBalls: layoutBalls,
  layoutInCircle: layoutInCircle,
  layoutEven: layoutEven,
  splitByCurve: splitByCurve,
  extendSplit: extendSplit,
  distToPolyline: distToPolyline,
  checkSplit: checkSplit,
  buildSession: buildSession
};
