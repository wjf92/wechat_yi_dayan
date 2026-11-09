// utils/store.js —— 占例本地存储
const KEY = 'dayan_sessions_v1';
const MAX = 100;

function list() {
  try {
    const all = wx.getStorageSync(KEY);
    return Array.isArray(all) ? all : [];
  } catch (e) {
    return [];
  }
}

function save(session) {
  const all = list();
  const record = Object.assign({}, session, {
    id: session.id || ('s' + Date.now() + Math.floor(Math.random() * 10000)),
    createdAt: session.createdAt || Date.now()
  });
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
  formatTime: formatTime
};
