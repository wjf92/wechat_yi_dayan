// utils/store.js —— 占例本地存储
// KEY 一旦发布就不要改：小程序端为 wx storage，Android 端由 runtime 映射到
// app 私有文件 + WebView localStorage。改 KEY 会让旧版本占例读不出来。
const KEY = 'dayan_sessions_v1';
const MAX = 100;

// 向后兼容：旧版本记录没有 question 等字段时补默认值，且保留记录上的其它
// 字段原样（未来版本新增字段也不会被这里抹掉）。
function normalize(item) {
  if (!item || typeof item !== 'object') return null;
  const r = Object.assign({}, item);
  r.id = r.id || ('s' + (r.createdAt || Date.now()));
  r.createdAt = r.createdAt || Date.now();
  if (!Array.isArray(r.values)) r.values = [];
  if (!Array.isArray(r.changeLabels)) r.changeLabels = [];
  if (typeof r.question !== 'string') r.question = '';
  else r.question = r.question.trim();
  return r;
}

function list() {
  try {
    const all = wx.getStorageSync(KEY);
    if (!Array.isArray(all)) return [];
    return all.map(normalize).filter(function (x) { return !!x; });
  } catch (e) {
    return [];
  }
}

function save(session) {
  const all = list();
  const record = normalize(Object.assign({}, session, {
    id: session.id || ('s' + Date.now() + Math.floor(Math.random() * 10000)),
    createdAt: session.createdAt || Date.now()
  }));
  const rest = all.filter(function (item) { return item.id !== record.id; });
  rest.unshift(record);
  try {
    wx.setStorageSync(KEY, rest.slice(0, MAX));
  } catch (e) {
    return { data: null, error: 'CLIENT_EXCEPTION' };
  }
  return { data: record, error: null };
}

function get(id) {
  const all = list();
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i];
  }
  return null;
}

function remove(id) {
  const rest = list().filter(function (item) { return item.id !== id; });
  try {
    wx.setStorageSync(KEY, rest);
  } catch (e) {
    return { data: null, error: 'CLIENT_EXCEPTION' };
  }
  return { data: true, error: null };
}

// 只改所占事项，不动卦象数据（供后续版本扩展）
function setQuestion(id, question) {
  const all = list();
  let hit = false;
  const next = all.map(function (item) {
    if (item.id !== id) return item;
    hit = true;
    return Object.assign({}, item, { question: String(question || '').trim() });
  });
  if (!hit) return { data: null, error: 'NOT_FOUND' };
  try {
    wx.setStorageSync(KEY, next);
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: 'CLIENT_EXCEPTION' };
  }
}

function formatTime(ts) {
  const d = new Date(ts || Date.now());
  const pad = function (n) { return n < 10 ? ('0' + n) : ('' + n); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

module.exports = {
  list: list,
  save: save,
  get: get,
  remove: remove,
  setQuestion: setQuestion,
  formatTime: formatTime
};
