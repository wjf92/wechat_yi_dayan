const dayan = require('../../utils/dayan.js');
const loops = require('../../utils/loops.js');

const YAO = ['初', '二', '三', '四', '五', '上'];
const CN = { 6: '六', 7: '七', 8: '八', 9: '九' };
const BIAN = ['一变', '二变', '三变'];

/* 一爻步骤：首爻八步（含 S1 五十取一），太极既立之后七步 */
function buildSteps(withHang) {
  const s = [];
  if (withHang) s.push({ k: 'hang', lab: '挂一', full: '挂一 · 虚一不用' });
  for (let b = 0; b < 3; b++) {
    s.push({ k: 'split', b: b, lab: '分二挂一', full: '分二挂一 · 第' + (b + 1) + '变' });
    s.push({ k: 'count', b: b, lab: '揲四归奇', full: '揲四归奇 · 第' + (b + 1) + '变' });
  }
  s.push({ k: 'yao', lab: '成爻', full: '成爻 · 三变既毕' });
  return s;
}

Page({
  data: {
    step: 0,
    stepKey: 'hang',
    metaText: '初爻 · 起筮',
    stepName: 'S1 挂一 · 虚一不用',
    rails: [],
    yaoDots: [],
    pillars: [],

    total: 50,
    pileCount: 50,
    taijiOn: false,
    balls: [],
    leftCount: 0,
    rightCount: 0,
    splitDone: false,
    chips: [],

    formulaText: '',
    formulaNote: '',

    yaoRemain: 0,
    yaoNum: '',
    yaoName: '',
    yaoYang: true,

    fly: [],
    hint: '',
    btnText: '下 一 步',
    btnWait: false,
    dia: 500,
    ballSize: 26
  },

  onLoad: function () {
    const sys = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    this.rpx = sys.windowWidth / 750;
    this.dpr = sys.pixelRatio || 2;

    /* 圆席直径：横向让出三变柱 112rpx + 页边距 18rpx×2 + 间隙 6rpx → 596；
       纵向按屏幕可用高度回收（头部/记录带/太极/步骤轨/提示/按钮约 680rpx），
       屏幕矮的机型自动缩，绝不把按钮顶出屏幕 */
    const wLimit = 596;
    const avail = Math.round((sys.windowHeight || 650) / this.rpx);
    const hLimit = avail - 640;
    this.diaRpx = Math.max(520, Math.min(wLimit, hLimit));
    this.dia = Math.round(this.diaRpx * this.rpx);

    this.sz = Math.round(this.dia * Math.sqrt(0.155 / 49));   // 球径（px）
    this.gap = Math.round(this.sz * 0.4);                     // 最小间隙（px）

    this.values = [];
    this.yaoIndex = 0;
    this.taiji = false;                           // 太极之策是否已取（十八变通用一枚）
    this.steps = buildSteps(true);

    this.balls = [];                              // { id, cx, cy, cls }
    this.pts = [];                                // 球心坐标
    this.sides = [];                              // 'L' / 'R'
    this.stroke = [];                             // 你画的线（圆席内坐标）
    this.extSeg = [];                             // 两端延长到席外的虚线段
    this.hang = -1;
    this.changes = [];                            // 每变 {r1,r2,next,...}
    this.totals = [49, 0, 0];
    this.nextTotal = 0;
    this.pillarInfo = [null, null, null];
    this.loopList = [];
    this.loopAl = [];
    this.loopSt = [];
    this.strokeAl = 1;                            // 你画的那条线的透明度（洗牌时一并淡出）
    this.strokeSt = null;
    this.seq = 0;

    this.enterHang();
  },

  onReady: function () {
    this.initInk();
  },

  onUnload: function () {
    if (this.inkTimer) { clearInterval(this.inkTimer); this.inkTimer = null; }
    (this.timers || []).forEach(function (t) { clearTimeout(t); });
    this.timers = [];
  },

  /* setTimeout 统一登记，卸载时一并清掉 */
  /* 所有延时回调都绑在「当前这一爻」上：一旦进入新的一爻，旧回调一律作废。
     否则上一爻归奇/洗牌/挂一动画遗留的 setTimeout 会在新爻铺好球之后才触发，
     把刚铺满的圆席又清空、或直接推进到分二（用户看到的「演下一爻是空白」）。 */
  later: function (fn, ms) {
    if (!this.timers) this.timers = [];
    const self = this;
    const epoch = this.epoch || 0;
    var id = setTimeout(function () {
      self.timers = (self.timers || []).filter(function (x) { return x !== id; });
      if ((self.epoch || 0) !== epoch) return;   // 已换爻，迟到回调不再改写界面
      fn();
    }, ms);
    this.timers.push(id);
    return id;
  },

  /* =========================================================
     画布：你画的线 + 手绘圈
     ========================================================= */
  initInk: function () {
    const self = this;
    wx.createSelectorQuery().in(this)
      .select('#ink')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        canvas.width = self.dia * self.dpr;
        canvas.height = self.dia * self.dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(self.dpr, self.dpr);
        self.ctx = ctx;
        self.paint();
      });
  },

  /* 笔宽等随球径等比缩放（原型 13px 球径下的标定值） */
  u: function () { return this.sz / 13; },

  paint: function () {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.dia, H = this.dia, u = this.u();
    ctx.clearRect(0, 0, W, H);

    /* 1. 各圈：手绘感的闭合曲线，余数那一撮实线加粗 + 淡底 */
    for (let i = 0; i < this.loopList.length; i++) {
      const a = this.loopAl[i];
      if (!a || a < 0.01) continue;
      const lp = this.loopList[i];
      ctx.beginPath();
      ctx.moveTo(lp.poly[0].x, lp.poly[0].y);
      for (let k = 0; k < lp.segs.length; k++) {
        const s = lp.segs[k];
        ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p.x, s.p.y);
      }
      ctx.closePath();
      if (lp.rem) {
        ctx.fillStyle = 'rgba(21,23,28,' + (0.055 * a).toFixed(3) + ')';
        ctx.fill();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.4 * u;
        ctx.strokeStyle = 'rgba(21,23,28,' + (0.66 * a).toFixed(3) + ')';
      } else {
        ctx.setLineDash([3.4 * u, 3.2 * u]);
        ctx.lineWidth = 1.05 * u;
        ctx.strokeStyle = 'rgba(21,23,28,' + (0.40 * a).toFixed(3) + ')';
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* 2. 你画的那条线：原样保留，压在最上层（洗牌时随圈一起淡出） */
    const sa = (this.strokeAl == null ? 1 : this.strokeAl);
    if (this.stroke && this.stroke.length > 1 && sa > 0.01) {
      ctx.beginPath();
      ctx.moveTo(this.stroke[0].x, this.stroke[0].y);
      for (let i = 1; i < this.stroke.length; i++) ctx.lineTo(this.stroke[i].x, this.stroke[i].y);
      ctx.lineWidth = 1.9 * u;
      ctx.strokeStyle = 'rgba(21,23,28,' + (0.92 * sa).toFixed(3) + ')';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      /* 3. 两端延长到席外的部分：细虚线，告诉占者「归属是按这条延长后的分界判的」 */
      if (this.extSeg && this.extSeg.length) {
        ctx.setLineDash([3.2 * u, 4.2 * u]);
        ctx.lineWidth = 1.0 * u;
        ctx.strokeStyle = 'rgba(21,23,28,' + (0.42 * sa).toFixed(3) + ')';
        for (let e = 0; e < this.extSeg.length; e++) {
          const g = this.extSeg[e];
          ctx.beginPath();
          ctx.moveTo(g.x1, g.y1);
          ctx.lineTo(g.x2, g.y2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  },

  inkTick: function () {
    const now = Date.now();
    let busy = false;
    for (let i = 0; i < this.loopList.length; i++) {
      const s = this.loopSt[i];
      if (!s) continue;
      if (now < s.t0) { busy = true; continue; }
      const k = s.dur <= 0 ? 1 : Math.min(1, (now - s.t0) / s.dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.loopAl[i] = s.from + (s.to - s.from) * e;
      if (k < 1) busy = true;
    }
    /* 划线也一起淡出：圈散、线消，与洗牌同时收尾 */
    if (this.strokeSt) {
      const s = this.strokeSt;
      if (now < s.t0) busy = true;
      else {
        const k = s.dur <= 0 ? 1 : Math.min(1, (now - s.t0) / s.dur);
        const e = 1 - Math.pow(1 - k, 3);
        this.strokeAl = s.from + (s.to - s.from) * e;
        if (k < 1) busy = true;
      }
    }
    this.paint();
    if (!busy) {
      clearInterval(this.inkTimer);
      this.inkTimer = null;
      if (!this.loopVisible) {
        this.loopList = []; this.loopAl = []; this.loopSt = [];
        this.strokeSt = null;
        this.strokeAl = 0;
        this.stroke = [];
        this.paint();
      }
    }
  },

  startInk: function () {
    if (this.inkTimer) return;
    const self = this;
    this.inkTimer = setInterval(function () { self.inkTick(); }, 33);
  },

  /* 画圈：每圈错峰淡入 */
  showLoops: function () {
    if (!this.ctx) this.initInk();          // 首帧画布还没就绪时补一次
    this.strokeAl = 1;
    this.strokeSt = null;
    const groups = loops.groupBalls(this.sides, this.pts, this.hang, this.sz);
    this.loopList = loops.buildLoops(groups, this.pts, this.sz, this.stroke, this.dia, this.dia);
    this.loopAl = this.loopList.map(function () { return 0; });
    const now = Date.now();
    this.loopSt = this.loopList.map(function (_, i) {
      return { from: 0, to: 1, t0: now + 120 + i * 55, dur: 260 };
    });
    this.loopVisible = true;
    this.startInk();
  },

  /* 淡出：圈与划线一起消，默认 280ms，洗牌时给足 520ms 与球同步 */
  fadeLoops: function (dur) {
    const now = Date.now();
    const d = dur || 280;
    this.loopSt = this.loopAl.map(function (a) {
      return { from: a, to: 0, t0: now, dur: d };
    });
    this.strokeSt = { from: (this.strokeAl == null ? 1 : this.strokeAl), to: 0, t0: now, dur: d };
    this.loopVisible = false;
    this.startInk();
  },

  /* 步骤号：按 k/b 反查，八步与七步自动对齐 */
  stepIndex: function (k, b) {
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (s.k === k && (b == null || s.b === b)) return i;
    }
    return 0;
  },

  clearInk: function () {
    this.loopList = [];
    this.loopAl = [];
    this.loopSt = [];
    this.loopVisible = false;
    this.strokeSt = null;
    this.strokeAl = 0;
    this.stroke = [];
    this.extSeg = [];
    this.paint();
  },

  /* =========================================================
     外壳：步骤轨 / 记录带 / 三变柱
     ========================================================= */
  chrome: function (n) {
    const steps = this.steps;
    const st = steps[n];

    const rails = steps.map(function (s, i) {
      return {
        i: i,
        n: i + 1,
        lab: s.lab,
        cls: i < n ? 'done' : (i === n ? 'cur' : ''),
        line: i < steps.length - 1,
        lineCls: i < n ? 'done' : ''
      };
    });

    const pillars = [];
    for (let b = 0; b < 3; b++) {
      const info = this.pillarInfo[b];
      const done = !!info;
      const cnt = done ? (1 + info.r1 + info.r2) : 0;
      /* 自上而下：挂 1 ｜ 右余 ｜ 左余 */
      const dots = [];
      for (let j = 0; j < cnt; j++) {
        dots.push({ i: j, gap: j === 1 || j === 1 + info.r1 });
      }
      pillars.push({
        lab: BIAN[b],
        val: done ? cnt : '—',
        c: done ? '#15171c' : '#c3c7cd',
        done: done,
        dots: dots
      });
    }

    let meta = YAO[this.yaoIndex] + '爻 · ';
    if (st.k === 'hang') meta += '起筮';
    else if (st.k === 'yao') meta += '三变已毕';
    else meta += '第 ' + (st.b + 1) + ' 变 · 第 ' + (n + 1) + '/' + steps.length + ' 步';

    this.setData({
      step: n,
      stepKey: st.k,
      rails: rails,
      yaoDots: this.buildRecord(this.yaoIndex),
      pillars: pillars,
      metaText: meta,
      stepName: 'S' + (n + 1) + ' ' + st.full
    });
  },

  buildRecord: function (hi) {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const v = this.values[i];
      const on = (i === hi);
      if (!v) {
        out.push({ k: YAO[i], v: '▢', cls: on ? 'cur' : '', bian: false });
      } else {
        const info = dayan.yaoInfo(v);
        out.push({
          k: YAO[i],
          v: CN[v] + ' ' + info.symbol,
          cls: on ? 'has cur' : 'has',
          bian: !!info.changing
        });
      }
    }
    return out;
  },

  /* =========================================================
     球池
     ========================================================= */
  /* 球径按「覆盖率恒定」换算：49 策与 28 策看着一样密，不会越洗越稀 */
  ballFor: function (n) {
    const target = this.dia * Math.sqrt(0.155 / Math.max(1, n));
    const lo = 24 * this.rpx;
    const hi = 44 * this.rpx;
    return Math.max(2, Math.round(Math.min(hi, Math.max(lo, target))));
  },

  makeSpots: function (n) {
    let raw = [];
    for (let t = 0; t < 3; t++) {
      raw = dayan.layoutEven(n, this.dia, this.sz, this.gap);
      if (raw.length >= n) break;
      raw = dayan.layoutInCircle(n, this.dia, this.sz, this.gap, 0);
      if (raw.length >= n) break;
    }
    return raw.slice(0, n).map(function (p) {
      return { x: p.x + this.sz / 2, y: p.y + this.sz / 2 };
    }, this);
  },

  renderBalls: function () {
    const sz = this.sz;
    const balls = this.balls.map(function (b) {
      return {
        id: b.id,
        x: Math.round(b.cx - sz / 2),
        y: Math.round(b.cy - sz / 2),
        cls: b.cls || '',
        d: b.d || 0,
        dl: b.dl || 0,
        ad: b.ad || 0
      };
    });
    /* 席上现存策数：ghost（原位虚线小圈）与 gone（已彻底离席）都不算球 */
    let pile = 0;
    this.balls.forEach(function (b) {
      const c = b.cls || '';
      if (c.indexOf('ghost') < 0 && c.indexOf('gone') < 0) pile++;
    });
    this.setData({ balls: balls, ballSize: sz, dia: this.dia, pileCount: pile });
  },

  /* 重新铺球：留到几颗就摆几颗，其余淡出 */
  relayout: function (count, animate) {
    this.sz = this.ballFor(count);
    this.gap = Math.round(this.sz * 0.4);
    const pts = this.makeSpots(count);
    /* 已归奇离席的球不再参与，免得下一变又「复活」 */
    const live = this.balls.filter(function (b) { return b.cls !== 'gone' && b.cls !== 'ghost'; });
    const keep = live.slice(0, Math.min(live.length, count));
    const next = [];
    for (let i = 0; i < count; i++) {
      const old = keep[i];
      if (old) {
        next.push({
          id: old.id, cx: pts[i].x, cy: pts[i].y, cls: '',
          d: animate ? 520 : 0, dl: animate ? i * 7 : 0
        });
      } else {
        next.push({
          /* 非动画重铺（开局）不带入场动画：否则后续任何列表重排都会让整席球
             把「从无到有」的淡入重播一遍，看起来就是闪无又闪现 */
          id: 'b' + (this.seq++), cx: pts[i].x, cy: pts[i].y,
          cls: animate ? 'pop' : '',
          d: 0, dl: 0, ad: animate ? 300 + i * 6 : 0
        });
      }
    }
    this.balls = next;
    this.pts = pts;
    this.renderBalls();
  },

  /* =========================================================
     S1 挂一（五十取一 · 太极）
     ========================================================= */
  enterHang: function () {
    /* 新的一爻开场：掐断上一爻尚未触发的延时回调（归奇飞柱、洗牌、标红褪回、
       太极飞球等），并递增爻代次，使任何已排队的旧回调自动失效。
       这是「演下一爻圆席空白」的结构性防线：迟到的回调会把刚铺好的 50 策
       再清空，或越过挂一直接推进到分二。 */
    (this.timers || []).forEach(function (id) { clearTimeout(id); });
    this.timers = [];
    if (this.inkTimer) { clearInterval(this.inkTimer); this.inkTimer = null; }
    this.epoch = (this.epoch || 0) + 1;

    this.steps = buildSteps(!this.taiji);
    this.stroke = [];
    this.sides = [];
    this.hang = -1;
    this.changes = [];
    this.totals = [49, 0, 0];
    this.nextTotal = 0;
    this.pillarInfo = [null, null, null];
    this.clearInk();
    this.balls = [];
    this.relayout(50, false);              // 大衍之数五十：太极那一策此刻还在席上

    this.setData({
      total: 50,
      taijiOn: false,                     // 太极位是虚位，点「下一步」才由席上飞入
      leftCount: 0,
      rightCount: 0,
      splitDone: false,
      chips: [],
      formulaText: '',
      formulaNote: '',
      fly: [],
      btnWait: false,
      hint: '大衍之数五十，其用四十有九 —— 五十策尽列于席\n点「下一步」：拈出一策，如日初升，缓缓升入上方太极位；本爻三变此策不动',
      btnText: '下 一 步 · 拈 出 太 极'
    });
    this.chrome(0);

    /* 幂等兜底：小程序原生渲染器把「成爻清空 → 新爻铺满」两次 setData
       安排在同一帧时，wx:for 的 key 复用可能停在空列表；下一帧再核一次，
       席上不是 50 策就补铺。正常流程下这里什么也不做，不会引起重绘或闪烁。 */
    const self = this;
    const gen = this.epoch;
    this.later(function () {
      if ((self.epoch || 0) !== gen) return;
      if (self.balls.length !== 50 || (self.data.balls || []).length !== 50) {
        self.relayout(50, false);
      }
    }, 30);
  },

  /* S1 的动作：拈起变黑（看得出是哪一策）→ 如日初升，缓缓升入太极位 → 余 49 策
     「日出」分四拍：变黑凝住 → 光晕初萌、微微浮起（露头）→ 缓升归位 → 落定光环。
     每一拍都是一次独立的 setData，彼此间隔 ≥300ms；不靠「两次 setData 的差值」
     来撑 transition 起点（真机上那两帧常被合并，看起来就是直接闪现）。
     位移之外的光感由 WXSS keyframes 独立承担，即使某段位移被合并，
     也仍有完整的由暗转明、光晕铺开的过程可见。
     落定之后绝不再重绘球堆，避免整席球「闪无又闪现」。 */
  takeTaiji: function () {
    if (this.hangAnimating) return;
    const self = this;
    /* 挂一总时长 2000ms：改这一组即可整体调速，四段相加须与 WXSS 里
       sunBody / sunGlow 的 animation 时长（1600ms）对得上。 */
    const BLACK_MS = 420;      // 拈起变黑、抬起，凝住让人看清取的是哪一策
    const LIFT_MS = 160;       // 飞球接手：先以 d:0 硬渲染起始帧，日晕开始萌动
    const HOVER_MS = 260;      // 如日之初升：先垂直浮起 16px，光晕铺开
    const FLY_MS = 1000;       // 缓缓升空，慢起缓停，飞入上方太极位
    const SETTLE_MS = 160;     // 落定，光环扩散，实球显形
    const HOVER_PX = 16;       // 「跃出地平线」的那一下上浮
    const PICK_SC = 1.26;      // 与 .ball.dark.pick 的放大一致，飞球接手时不缩一下
    if (!this.balls.length) {             // 极端兜底：没球就直接推进
      this.taiji = true;
      this.setData({ taijiOn: true, fly: [] });
      this.enterSplit(0);
      return;
    }

    /* 拈最上一枚：从球堆上沿起飞，飞向左上方太极位，路径最顺 */
    let pick = 0, bestY = 1e9;
    for (let i = 0; i < this.pts.length; i++) {
      if (this.pts[i].y < bestY) { bestY = this.pts[i].y; pick = i; }
    }
    const p = this.pts[pick];
    const sz = this.sz;
    this.hangAnimating = true;

    this.setData({
      btnWait: true,
      btnText: '如 日 初 升 …',
      hint: '自五十策中拈出一策，如日之初升，虚一不用 —— 此策为太极\n本爻三变不再动，余四十九策以备分二'
    });

    /* 1. 拈起：这一枚变黑、微微抬起放大，停一会儿，让人看清取的是哪一颗 */
    this.balls[pick].cls = 'dark pick';
    this.balls[pick].d = 260;
    this.renderBalls();

    /* 2. 离席起飞：起飞前重测一次位置（页面滚过也不跑偏） */
    this.later(function () {
      self.measure(function () {
        const r = self.circleRect, tr = self.taijiRect;
        self.balls.splice(pick, 1);
        self.pts.splice(pick, 1);
        self.renderBalls();                       // 在席之策 50 → 49，其余球一颗不动

        const done = function () {
          self.taiji = true;
          self.hangAnimating = false;
          self.setData({ taijiOn: true, fly: [] });
          self.enterSplit(0);                    // 此处不再碰球堆
        };
        if (!r || !tr) { done(); return; }       // 量不到位置就退化为直接落位

        const x0 = Math.round(r.left + p.x - sz / 2);
        const y0 = Math.round(r.top + p.y - sz / 2);
        const tx = Math.round(tr.left + tr.width / 2 - x0 - sz / 2);
        const ty = Math.round(tr.top + tr.height / 2 - y0 - sz / 2);
        const sc = Math.round((46 * self.rpx / sz) * 100) / 100;   // 落到 46rpx 的太极球

        /* 2. 飞球接手：先在原位以 d:0 硬渲染一帧（同位置、同大小、同色、同缩放），
           并挂上 .sun，由 keyframes 独立把日晕从暗养到明。
           这一帧不带任何位移过渡，即使后续 setData 被合并也不会「瞬移」。 */
        self.setData({
          fly: [{ id: 'taiji', sun: true, x: x0, y: y0, size: sz,
                  d: 0, dl: 0, land: false, tx: 0, ty: 0, sc: PICK_SC }]
        });
        /* 3. 露头：先垂直微微浮起，像日轮挣出地平线，光晕铺开 */
        self.later(function () {
          self.setData({
            fly: [{ id: 'taiji', sun: true, x: x0, y: y0, size: sz,
                    d: HOVER_MS, dl: 0, land: false, tx: 0, ty: -HOVER_PX,
                    sc: Math.round(PICK_SC * 1.04 * 100) / 100 }]
          });
        }, LIFT_MS);
        /* 4. 升空：慢起缓停，斜斜升入上方太极位 */
        self.later(function () {
          self.setData({
            fly: [{ id: 'taiji', sun: true, x: x0, y: y0, size: sz,
                    d: FLY_MS, dl: 0, land: false, tx: tx, ty: ty, sc: sc }]
          });
        }, LIFT_MS + HOVER_MS);
        /* 5. 落定：飞球隐去、太极位实球显形，同尺寸同位置，看不出接缝 */
        self.later(done, LIFT_MS + HOVER_MS + FLY_MS + SETTLE_MS);
      });
    }, BLACK_MS);
  },

  /* =========================================================
     S2/S4/S6 分二挂一
     ========================================================= */
  enterSplit: function (b) {
    const total = b === 0 ? 49 : this.changes[b - 1].next;
    this.totals[b] = total;

    this.sides = [];
    this.hang = -1;
    /* b>0：圈与划线正随洗牌一起淡出，别在这里一刀清掉；淡完由 inkTick 收尾 */
    if (b === 0) {
      this.stroke = [];
      this.clearInk();
    } else {
      this.strokeSt = this.strokeSt || { from: (this.strokeAl == null ? 1 : this.strokeAl), to: 0, t0: Date.now(), dur: 520 };
      this.startInk();
    }
    if (b > 0) {
      /* 揲四既毕，余策球「洗牌重分」：错峰散到新的落点 */
      this.relayout(total, true);
    } else if (this.balls.length !== total) {
      /* 首变只在席上策数不对时补铺（正常流程挂一动画已把 50 裁成 49，
         不会走到这里），既避免重铺导致整席「闪无又闪现」，也保证
         任何路径切到新的一变都不会留下空席 */
      this.relayout(total, false);
    }

    this.setData({
      total: total,
      leftCount: 0,
      rightCount: 0,
      splitDone: false,
      chips: [],
      formulaText: '',
      formulaNote: '',
      btnWait: true,
      hint: '在球间从上往下画一条线，分成左右两堆\n线须自最上一排的上方起、画到最下一排的下方（上下画反也行），中路不要回折\n画成什么线就留什么线，球一颗都不动；松手后程序自右堆取一挂起',
      btnText: '请 先 划 线 分 堆'
    });
    this.chrome(this.stepIndex('split', b));
  },

  /* 圆席在屏幕上的位置（飞球用） */
  measure: function (cb) {
    const self = this;
    const q = wx.createSelectorQuery().in(this);
    q.select('#ballField').boundingClientRect();
    q.selectAll('.pil-dots').boundingClientRect();
    q.select('.tj-ball').boundingClientRect();       // 太极位的落点（未拈出时也在，只是缩着）
    q.exec(function (res) {
      self.circleRect = res[0] || null;
      self.pillarRects = res[1] || [];
      self.taijiRect = res[2] || null;
      if (cb) cb();
    });
  },

  guard: function (e, type) {
    const t = (e && e.touches && e.touches[0]) || null;
    const px = t && t.clientX != null ? t.clientX : (t && t.pageX != null ? t.pageX : NaN);
    const py = t && t.clientY != null ? t.clientY : (t && t.pageY != null ? t.pageY : NaN);
    const key = type + '|' + ((e && e.timeStamp) || 0) + '|' + px + ',' + py;
    if (this._lastKey === key) return true;
    this._lastKey = key;
    return false;
  },

  onTouchStart: function (e) {
    if (this.data.stepKey !== 'split' || this.data.splitDone) return;
    if (this.guard(e, 'start')) return;
    const t = e.touches[0];
    this.rawStroke = [{ x: t.clientX, y: t.clientY }];
    /* 新的一笔：把上一变残留的圈、线、淡出动画一并清掉，免得抢画笔 */
    this.stroke = [];
    this.strokeAl = 1;
    this.strokeSt = null;
    this.loopList = [];
    this.loopAl = [];
    this.loopSt = [];
    this.loopVisible = false;
    if (this.inkTimer) { clearInterval(this.inkTimer); this.inkTimer = null; }
    this.paint();
    this.clearWarn();
    this.measure();
  },

  /* 标红「归左归右说不清」的那几颗球，1.4 秒后自行褪回 */
  warnBalls: function (idx) {
    if (!idx || !idx.length) return;
    const self = this;
    this.balls.forEach(function (b, i) {
      if (idx.indexOf(i) >= 0) { b.cls = 'warn'; b.d = 160; }
    });
    this.renderBalls();
    this.warnOn = true;
    this.later(function () {
      if (!self.warnOn) return;
      self.clearWarn();
    }, 1400);
  },

  clearWarn: function () {
    if (!this.warnOn) return;
    this.warnOn = false;
    this.balls.forEach(function (b) { if (b.cls === 'warn') b.cls = ''; });
    this.renderBalls();
  },

  onTouchMove: function (e) {
    if (this.data.stepKey !== 'split' || this.data.splitDone) return;
    if (this.guard(e, 'move')) return;
    const t = e.touches[0];
    const prev = this.rawStroke[this.rawStroke.length - 1];
    if (!prev) return;
    const dx = t.clientX - prev.x, dy = t.clientY - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) < 6) return;
    this.rawStroke.push({ x: t.clientX, y: t.clientY });

    const r = this.circleRect;
    if (!r) return;
    this.stroke = this.rawStroke.map(function (p) {
      return { x: p.x - r.left, y: p.y - r.top };
    });
    this.strokeAl = 1;      // 上一变的圈线可能刚淡过，这里必须重新点亮
    this.strokeSt = null;
    this.paint();
  },

  onTouchEnd: function (e) {
    if (this.data.stepKey !== 'split' || this.data.splitDone) return;
    if (this.guard(e, 'end')) return;
    if (!this.rawStroke || this.rawStroke.length < 2) return;

    if (!this.circleRect) {
      const self = this;
      this.measure(function () { self.finishSplit(); });
      return;
    }
    this.finishSplit();
  },

  finishSplit: function () {
    const self = this;
    const r = this.circleRect;
    let samples = this.rawStroke.map(function (p) {
      return { x: p.x - r.left, y: p.y - r.top };
    });

    const boxes = this.pts.map(function (p) {
      return { x: p.x - self.sz / 2, y: p.y - self.sz / 2 };
    });

    /* 先验笔势：方向明确、不回折、不横画。不再要求「线必须盖过上下两排球心」——
       两端会沿切线延长到席外，延长线照样把圆席切开（见 dayan.extendSplit） */
    const chk = dayan.checkSplit(boxes, samples, this.sz, this.dia, this.dia);
    if (!chk.ok) {
      if (chk.code === 'short') {
        this.setData({ hint: '这一笔太短了，看不出分界\n请从球阵一侧划到另一侧，笔势要成一个方向' });
      } else if (chk.code === 'flat') {
        this.setData({ hint: '这一笔太横了\n分堆是按「每个高度上的分界点」判的，横线没有高下之分\n请上下走向地划：从球阵上方划到下方（或反过来）都行，斜着也可以' });
      } else {
        this.setData({ hint: '这一笔画回来了\n回折处同一高度会出现左右两个分界，球归哪边说不清\n请一笔画到底，不要往回折' });
      }
      wx.showToast({ title: '请重新划线', icon: 'none' });
      return;
    }

    const res = dayan.splitByCurve(boxes, samples, this.sz, this.dia, this.dia);
    if (!res || res.fallback || res.left < 1 || res.right < 2) {
      wx.showToast({ title: '左右各留二策以上（挂一须从右堆取），请重画', icon: 'none' });
      return;
    }

    const total = this.data.total;
    const ch = dayan.change(total, res.left);
    if (ch.error || ch.next < 12) {
      wx.showToast({ title: '分堆无效，请重新划线', icon: 'none' });
      return;
    }

    /* 挂一：右堆最上一枚变黑挂起 */
    let pick = -1, bestY = 1e9;
    for (let i = 0; i < this.pts.length; i++) {
      if (res.sides[i] === 2 && this.pts[i].y < bestY) { bestY = this.pts[i].y; pick = i; }
    }
    if (pick < 0) {
      wx.showToast({ title: '右堆为空，请重新划线', icon: 'none' });
      return;
    }

    /* 球心正好压在线上的那几颗：判归属只看球心，但要标出来让占者看见 */
    const edgeList = res.edge || [];
    const edgeN = edgeList.length;
    const edgeSet = {};
    edgeList.forEach(function (i) { edgeSet[i] = 1; });

    this.sides = res.sides.map(function (s) { return s === 1 ? 'L' : 'R'; });
    this.hang = pick;
    this.stroke = samples;
    this.extSeg = res.ext || [];        // 两端延长到席外的那两段，画成细虚线
    this.strokeAl = 1;
    this.strokeSt = null;
    this.paint();

    this.balls.forEach(function (b, i) {
      b.cls = (i === pick) ? 'dark' : '';
      if (edgeSet[i]) b.cls += (b.cls ? ' ' : '') + 'edge';
      b.d = 0;
      b.dl = 0;
    });
    this.renderBalls();

    const b = this.steps[this.data.step].b;
    const divTip = (ch.r1 === 4 || ch.r2 === 4) ? ' · 整除者以四为余' : '';
    const edgeTip = edgeN
      ? '\n有 ' + edgeN + ' 颗球正压在这条线上（朱红虚环）· 归属只看球心：心在线左即左，在线右即右'
      : '';
    const extN = (res.ext || []).length;
    const extTip = extN
      ? '\n两端细虚线是把这一笔延长到席外的部分 —— 球按延长后的分界归边'
      : '';
    this.setData({
      leftCount: res.left,
      rightCount: res.right - 1,
      splitDone: true,
      btnWait: false,
      chips: [
        { t: '左 ' + res.left },
        { t: '右 ' + (res.right - 1) },
        { t: '挂 1', dark: true },
        { t: '合 ' + total, sum: true }
      ],
      hint: '此线由你亲手所画，原样保留；球一颗未动' + extTip
        + '\n右堆最上一枚已变黑挂起（第 ' + (b + 1) + ' 变，共 ' + total + ' 策）' + divTip + edgeTip,
      btnText: '下 一 步（揲四归奇）'
    });
  },

  onRedraw: function () {
    if (this.data.stepKey !== 'split') return;
    this.rawStroke = [];
    this.stroke = [];
    this.extSeg = [];
    this.sides = [];
    this.hang = -1;
    this.paint();
    this.balls.forEach(function (b) { b.cls = ''; b.d = 0; b.dl = 0; });
    this.renderBalls();
    this.setData({
      leftCount: 0,
      rightCount: 0,
      splitDone: false,
      chips: [],
      btnWait: true,
      hint: '在球间从上往下画一条线，分成左右两堆\n线须自最上一排的上方起、画到最下一排的下方（上下画反也行），中路不要回折\n画成什么线就留什么线，球一颗都不动；松手后程序自右堆取一挂起',
      btnText: '请 先 划 线 分 堆'
    });
  },

  /* =========================================================
     S3/S5/S7 揲四归奇：不换页、球不动，四策一圈，余策归柱
     ========================================================= */
  enterCount: function (b) {
    const ch = dayan.change(this.totals[b], this.data.leftCount);
    this.changes[b] = ch;
    this.nextTotal = ch.next;

    this.setData({
      btnWait: true,
      btnText: '揲 四 中 …',
      chips: [],
      hint: '球一颗不动：四策一圈（圈不相交、不越线），余策变黑归奇\n'
        + (ch.r1 === 4 || ch.r2 === 4 ? '此变有整除者，整四策以四为余、照常取出\n' : '')
        + '归奇 ' + (1 + ch.r1 + ch.r2) + ' 策扐入「' + BIAN[b] + '」柱（自上而下：挂 1 ｜ 右余 ｜ 左余）'
    });

    /* 1. 就地画圈 */
    this.showLoops();

    /* 2. 定出离席的余策（含整除记四那四策），与圈里那一撮完全一致。
       柱内自上而下是「挂 1 ｜ 右余 ｜ 左余」，自下而上码放即：左余 → 右余 → 挂 1 */
    const remL = [];
    const remR = [];
    const groups = loops.groupBalls(this.sides, this.pts, this.hang, this.sz);
    groups.forEach(function (g) {
      if (!g.rem) return;
      const box = (g.side === 'L') ? remL : remR;
      g.idx.forEach(function (i) { box.push(i); });
    });
    const went = remL.concat(remR).concat([this.hang]);

    const self = this;
    const n = went.length;

    /* 3. 余策变黑 */
    this.later(function () {
      self.balls.forEach(function (bl, i) {
        if (went.indexOf(i) >= 0) { bl.cls = 'dark'; bl.d = 180; }
      });
      self.renderBalls();
    }, 240);

    /* 4. 逐颗飞入对应柱段；起飞前重测一次位置，页面滚过也不会跑偏。
       黑球被「拎起」的那一瞬，原位立刻收成虚线小圈，画面上不留实球残影 */
    const takeoff = 600;
    const flight = 420;
    const stagger = 32;
    this.later(function () {
      self.measure(function () {
        self.balls.forEach(function (bl, i) {
          if (went.indexOf(i) >= 0) { bl.cls = 'ghost'; bl.d = 220; }
        });
        self.renderBalls();
        self.flyTo(b, went, self.pillarTarget(b, n, ch.r1, ch.r2));
      });
    }, takeoff);

    const landed = takeoff + flight + stagger * Math.max(0, n - 1);

    /* 5. 落定：黑球就地缩成柱内小黑点（自上而下第几格，就落在第几格） */
    this.later(function () { self.settleFly(); }, landed + 40);

    /* 6. 柱内计数亮起，按钮解禁。此时手绘圈与划线都还在，点「下一步」洗牌时才散 */
    const arrive = landed + 40 + 220;
    this.later(function () {
      self.pillarInfo[b] = { r1: ch.r1, r2: ch.r2 };
      self.chrome(self.stepIndex('count', b));
      self.setData({
        fly: [],
        btnWait: false,
        btnText: b < 2 ? '下 一 步（第 ' + (b + 2) + ' 变）' : '下 一 步（成爻）',
        hint: '归奇 ' + (1 + ch.r1 + ch.r2) + ' 策已入「' + BIAN[b] + '」柱 · 余 ' + ch.next + ' 策'
          + (b < 2 ? '，洗牌后作第 ' + (b + 2) + ' 变入策' : '以待成爻')
      });
    }, arrive);

    /* 7. 算式条 */
    const divTip = (ch.r1 === 4 || ch.r2 === 4) ? ' · 整除者以四为余' : '';
    this.setData({
      formulaText: ch.total + ' － 1(挂) － ' + ch.r1 + '(右余) － ' + ch.r2 + '(左余) ＝ ' + ch.next,
      formulaNote: '本变归奇 ' + (1 + ch.r1 + ch.r2) + ' 策（挂 1 ｜ 右余 ' + ch.r1 + ' ｜ 左余 ' + ch.r2 + '）' + divTip
    });
    this.chrome(this.stepIndex('count', b));
  },

  /* 柱落点（视口坐标）：柱内自上而下「挂 1 ｜ 右余 ｜ 左余」，
     第一格圆心即 .pil-dots 的 padding-top 10rpx + .bdot margin 4rpx + 半个球 6rpx = 20rpx */
  pillarTarget: function (b, count, r1, r2) {
    const rects = this.pillarRects || [];
    const r = rects[b];
    if (!r) return null;
    return {
      x: r.left + r.width / 2,
      y: r.top + Math.round(22 * this.rpx),         // 第 0 格（挂 1）圆心 = 边框 2 + 内边距 10 + 上间距 4 + 半颗 6
      pitch: Math.round(16 * this.rpx),             // 12rpx 球 + 4rpx 间距
      extra: Math.round(8 * this.rpx),              // .gap 多出来的 8rpx
      r1: r1 || 0,
      r2: r2 || 0
    };
  },

  /* 第 slot 格在柱内相对第 0 格下沉多少 */
  slotDrop: function (slot, target) {
    return slot * target.pitch
      + (slot >= 1 ? target.extra : 0)
      + (slot >= 1 + target.r1 ? target.extra : 0);
  },

  flyTo: function (b, went, target) {
    if (!target || !this.circleRect) return;
    const cr = this.circleRect;
    const sz = this.sz;
    const r1 = target.r1, r2 = target.r2;
    const fly = [];
    let n = 0;
    for (let k = 0; k < went.length; k++) {
      const i = went[k];
      const p = this.pts[i];
      if (!p) continue;
      /* went 自下而上码：前 r2 颗是左余，接着 r1 颗是右余，最后一颗是挂 1 */
      let slot;
      if (k >= r1 + r2) slot = 0;
      else if (k >= r2) slot = 1 + (k - r2);
      else slot = 1 + r1 + k;
      fly.push({
        id: 'f' + b + '_' + i,
        x: Math.round(cr.left + p.x - sz / 2),
        y: Math.round(cr.top + p.y - sz / 2),
        size: sz,
        tx: 0,
        ty: 0,
        sc: 1,
        d: 420,
        dl: n * 32,
        ty2: Math.round(target.y - (cr.top + p.y) + this.slotDrop(slot, target))
      });
      n++;
    }
    this.setData({ fly: fly });
    const self = this;
    this.later(function () {
      self.setData({
        fly: fly.map(function (f) {
          return {
            id: f.id, x: f.x, y: f.y, size: f.size, d: f.d, dl: f.dl, sc: 1,
            tx: Math.round(target.x - f.x - f.size / 2),
            ty: f.ty2
          };
        })
      });
    }, 30);
  },

  /* 落定：黑球就地缩成柱内那颗实心小黑点，无缝衔接 */
  settleFly: function () {
    const fly = this.data.fly || [];
    if (!fly.length) return;
    const dot = 12 * this.rpx;
    const sc = Math.max(0.28, Math.min(1, dot / this.sz));
    this.setData({
      fly: fly.map(function (f) {
        return {
          id: f.id, x: f.x, y: f.y, size: f.size, tx: f.tx, ty: f.ty,
          sc: Math.round(sc * 100) / 100, d: 200, dl: 0, land: true
        };
      })
    });
  },

  /* =========================================================
     S8 成爻
     ========================================================= */
  enterYao: function () {
    const remain = this.changes[2].next;
    const value = dayan.yaoValue(remain);
    if (!value) {
      wx.showToast({ title: '演算异常，请重新起卦', icon: 'none' });
      return;
    }
    if (this.values.length === this.yaoIndex) this.values.push(value);
    const info = dayan.yaoInfo(value);

    this.clearInk();
    this.balls = [];
    this.renderBalls();

    this.setData({
      yaoRemain: remain,
      yaoNum: CN[value],
      yaoName: info.name,
      yaoYang: info.yang,
      fly: [],
      btnWait: false,
      hint: info.name + ' · ' + (info.changing ? '可变之爻，爻旁记「变」' : '不变之爻')
        + '\n' + remain + ' ÷ 4 ＝ ' + value + '，已记入六爻带的「' + YAO[this.yaoIndex] + '」位',
      btnText: this.yaoIndex === 5 ? '查 看 卦 象' : '演 下 一 爻'
    });
    this.chrome(this.steps.length - 1);
  },

  /* =========================================================
     推进
     ========================================================= */
  onNext: function () {
    const st = this.steps[this.data.step];

    if (st.k === 'hang') {
      this.takeTaiji();                    // 太极既立在动画收尾处置 true
      return;
    }

    if (st.k === 'split') {
      if (!this.data.splitDone) {
        wx.showToast({ title: '请先在球堆上画线分堆', icon: 'none' });
        return;
      }
      if (this.data.btnWait) return;
      this.enterCount(st.b);
      return;
    }

    if (st.k === 'count') {
      if (this.data.btnWait) return;
      if (this.changes[st.b].next < 12) {
        wx.showToast({ title: '演算异常，请重新起卦', icon: 'none' });
        return;
      }
      /* 圈与划线留着不动，等下一变洗牌时才散（520ms 与球的位移同步） */
      this.fadeLoops(520);
      if (st.b < 2) this.enterSplit(st.b + 1);
      else this.enterYao();
      return;
    }

    /* 成爻之后 */
    if (this.yaoIndex >= 5) {
      const session = dayan.buildSession(this.values);
      session.id = 's' + Date.now() + Math.floor(Math.random() * 1000);
      session.createdAt = Date.now();
      getApp().globalData.pendingSession = session;
      wx.redirectTo({ url: '/pages/result/result' });
      return;
    }
    /* 每一爻都从「挂一」重新起筮：成爻时清空的球堆要重新铺满 50 策，
       太极位先回到虚位，由点「下一步」播放拈出飞入动画，而不是一进来就已落位。
       enterHang() 内部会重置 steps / changes / 三变柱 / 墨迹，这里不必重复。 */
    this.yaoIndex += 1;
    this.taiji = false;
    this.hangAnimating = false;
    this.enterHang();
  }
});
