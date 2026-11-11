// utils/duanzhan.js —— 断占判定（纯函数，无副作用）
// 依据《刘君祖易断全书·断占总论》：天地之数 55 − 卦之营数 S = r，
// 按 12 步循环数爻得「宜变之爻」；再看动爻是否相值，并按动爻数切换主断层级。
// 本模块同时产出成卦结果页所需的完整视图数据，小程序与 Android WebView 共用。

const hexagrams = require('./hexagrams.js');
const yaoci = require('./yaoci.js');

const LABELS = ['初', '二', '三', '四', '五', '上'];
const NUM = { 6: '六', 7: '七', 8: '八', 9: '九' };
// 初→二→三→四→五→上→上→五→四→三→二→初，折返端点各计两次
const SEQ = [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0];

function isChanging(v) { return v === 6 || v === 9; }
function isYang(v) { return v === 7 || v === 9; }

// 爻题：初九/初六、九二~九五/六二~六五、上九/上六
function yaoTitle(i, yang) {
  const n = yang ? '九' : '六';
  if (i === 0) return '初' + n;
  if (i === 5) return '上' + n;
  return n + LABELS[i];
}

function changeIndexes(values) {
  const out = [];
  values.forEach(function (v, i) { if (isChanging(v)) out.push(i); });
  return out;
}

// 老阳 9→少阴 8，老阴 6→少阳 7；只翻转指定爻位
function flipSome(values, idxs) {
  return values.map(function (v, i) {
    if (idxs.indexOf(i) < 0) return v;
    return v === 9 ? 8 : 7;
  });
}

function sum(values) {
  let s = 0;
  values.forEach(function (v) { s += v; });
  return s;
}

function conclusionLine(a) {
  const n = a.n;
  const m = a.mainTitle;
  if (n === 0) return '直接以本卦卦辞卦象占断';
  if (n === 6) {
    if (a.specialYong) {
      return a.yongKey + '「' + yaoci.yongText(a.hex.no) + '」为主断，不用之卦卦辞';
    }
    return '以六爻全变之卦的卦辞卦象为主断，并思本卦剧变成之卦的情由';
  }
  if (n === 1 && a.matched) return '以本卦' + m + '爻辞为主断，亦应参考变卦的卦辞';
  if (n === 1) return '以本卦卦辞卦象为主断，该动爻爻辞作变动意向参考';
  if (n === 2 && a.matched) return '以本卦' + m + '爻辞为主断，另一动爻供参考，并参单变之卦与两爻齐变之卦';
  if (n === 2) return '以本卦卦辞卦象为主断，两动爻爻辞与齐变之卦列入观察';
  if (n === 3 && a.matched) return '以本卦' + m + '爻辞为主断，并须考虑三爻齐变之卦的卦象卦辞';
  if (n === 3) return '本卦与之卦卦辞卦象合参（贞悔相争）';
  if (a.matched) {
    return '以' + n + '爻齐变之卦的卦辞卦象为主断，' +
      (n === 4 ? '加重考虑' : '稍加考虑') + '本卦' + m + '爻辞';
  }
  return '径以' + n + '爻齐变之卦的卦辞卦象为主断，并思本卦变至之卦的缘由';
}

// 12 类场景的核心判定：动爻数 × 宜变之爻是否相值
function analyze(values) {
  const changing = changeIndexes(values);
  const n = changing.length;
  const S = sum(values);
  const r = 55 - S;
  const yi = SEQ[(r - 1) % 12];
  const matched = changing.indexOf(yi) >= 0;
  const hex = hexagrams.buildHexagram(values);
  const labels = changing.map(function (i) { return yaoTitle(i, isYang(values[i])); });
  const yiTitle = yaoTitle(yi, isYang(values[yi]));
  const specialYong = (n === 6 && (hex.no === 1 || hex.no === 2));
  const yongKey = hex.no === 1 ? '用九' : '用六';

  // 0、6 爻变时宜变之爻不参与判断；4、5 爻相值时它只作加权，不另立主断
  const mainIndex = (n >= 1 && n <= 5 && matched) ? yi : -1;
  const mainTitle = mainIndex >= 0 ? yaoTitle(mainIndex, isYang(values[mainIndex])) : '';
  const refIndexes = (n === 6) ? [] : changing.filter(function (i) { return i !== mainIndex; });

  let mode;
  if (n === 0) mode = 'none';
  else if (n === 1 && matched) mode = 'merged';
  else if ((n === 2 || n === 3) && matched) mode = 'dual';
  else if (n <= 2) mode = 'reference';
  else if (n === 3) mode = 'contest';
  else mode = 'primary';

  const a = {
    values: values, changing: changing, n: n, S: S, r: r, yi: yi,
    yiTitle: yiTitle, matched: matched, hex: hex, labels: labels,
    mainIndex: mainIndex, mainTitle: mainTitle, refIndexes: refIndexes,
    specialYong: specialYong, yongKey: yongKey, mode: mode
  };

  const line1 = n === 0
    ? '动爻数量为0，六爻皆七、八而无变爻'
    : '动爻数量为' + n + '，' + (n === 1 ? '为' : '分别为') + labels.join('、');
  const line2 = n === 0
    ? '不必起天地之数，故无宜变之爻可算'
    : (n === 6
      ? '六爻全变，宜变之爻已无意义，不必算天地之数'
      : '卦之营数为' + S + '，算得宜变之爻为' + yiTitle +
        '，宜变之爻' + (matched ? '为动爻' : '非动爻（此位为静爻）'));
  a.lines = [line1, line2, conclusionLine(a)];
  return a;
}

// 本卦卡片：卦象（自上而下）＋ 卦辞 ＋ 六爻爻辞（自上而下：上→初，与卦象同序）
function benView(values, a) {
  const h = a.hex;
  const texts = yaoci.yaoTexts(h.no);
  const lines = [];
  for (let i = 5; i >= 0; i--) {
    lines.push({
      label: LABELS[i],
      yang: isYang(values[i]),
      changing: isChanging(values[i]),
      isYi: (a.n > 0 && a.n < 6 && a.yi === i),
      isMain: (a.mainIndex === i),
      valueText: NUM[values[i]] + (isYang(values[i]) ? ' ⚊' : ' ⚋')
    });
  }
  const yaoList = [];
  for (let i = 5; i >= 0; i--) {
    yaoList.push({
      title: yaoTitle(i, isYang(values[i])),
      text: texts[i] || '',
      prefix: a.mainIndex === i ? '（主断）' : (a.refIndexes.indexOf(i) >= 0 ? '（参考）' : ''),
      isMain: a.mainIndex === i,
      isRef: a.refIndexes.indexOf(i) >= 0
    });
  }
  // 乾、坤六爻全变时，用九／用六替代之卦卦辞，列于六爻之后
  if (a.specialYong) {
    yaoList.push({
      title: a.yongKey, text: yaoci.yongText(h.no), prefix: '（主断）',
      isMain: true, isRef: false
    });
  }
  return {
    name: h.name,
    shortName: h.shortName,
    judgment: h.judgment,
    upper: h.upperSymbol + ' ' + h.upper + '（上）',
    lower: h.lowerSymbol + ' ' + h.lower + '（下）',
    tag: h.name + ' · 贞',
    lines: lines,
    yaoList: yaoList
  };
}

// 之卦卡片：小卦象（自上而下）＋ 完整卦辞 ＋ 六爻爻辞（自上而下：上→初）
function bianCard(values, flipIdx, title, badge, style) {
  const flipped = flipSome(values, flipIdx);
  const h = hexagrams.buildHexagram(flipped);
  const texts = yaoci.yaoTexts(h.no);
  const miniLines = [];
  for (let i = 5; i >= 0; i--) {
    miniLines.push({ key: 'y' + i, yang: isYang(flipped[i]), changed: flipIdx.indexOf(i) >= 0 });
  }
  const yaoList = [];
  for (let i = 5; i >= 0; i--) {
    yaoList.push({
      title: yaoTitle(i, isYang(flipped[i])),
      text: texts[i] || '',
      changed: flipIdx.indexOf(i) >= 0
    });
  }
  return {
    title: title, badge: badge, name: h.name, shortName: h.shortName,
    judgment: h.judgment, miniLines: miniLines, yaoList: yaoList,
    primary: style === 'primary', mute: style === 'mute'
  };
}

// 页面视图数据：三行总结 / 本卦 / 变卦
function buildResult(values) {
  const a = analyze(values);
  const summaryLines = [
    { key: '动爻', text: a.lines[0], last: false },
    { key: '宜变', text: a.lines[1], last: false },
    { key: '结论', text: a.lines[2], last: true }
  ];

  const cards = [];
  if (a.mode === 'dual') {
    cards.push(bianCard(values, [a.mainIndex], '单爻变卦', '仅' + a.mainTitle + '变', ''));
    cards.push(bianCard(values, a.changing, '多爻齐变卦', a.labels.join('、') + '齐变', ''));
  } else if (a.mode !== 'none') {
    const badge = a.mode === 'primary'
      ? (a.specialYong ? a.yongKey + '为主断' : '主断依据')
      : a.mode === 'contest' ? '与本卦合参'
        : a.mode === 'reference' ? '仅作参考' : '单变＝齐变';
    const title = a.mode === 'merged' ? '变卦' : '多爻齐变卦';
    const style = a.mode === 'primary' ? (a.specialYong ? '' : 'primary')
      : a.mode === 'reference' ? 'mute' : '';
    cards.push(bianCard(values, a.changing, title, badge, style));
  }

  return {
    summaryLines: summaryLines,
    ben: benView(values, a),
    bian: {
      mode: a.mode,
      tag: a.mode === 'none' ? '无变爻' : (a.mode === 'dual' ? '须分看两卦' : '悔卦'),
      cards: cards
    },
    analysis: {
      n: a.n, S: a.S, r: a.r, yi: a.yi, yiTitle: a.yiTitle,
      matched: a.matched, mode: a.mode, mainIndex: a.mainIndex,
      specialYong: a.specialYong, labels: a.labels, lines: a.lines
    }
  };
}

module.exports = {
  analyze: analyze,
  buildResult: buildResult,
  yaoTitle: yaoTitle,
  changeIndexes: changeIndexes,
  flipSome: flipSome,
  SEQ: SEQ
};
