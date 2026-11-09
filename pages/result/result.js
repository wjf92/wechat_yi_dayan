const hexagrams = require('../../utils/hexagrams.js');
const store = require('../../utils/store.js');

const LABELS = ['初', '二', '三', '四', '五', '上'];

Page({
  data: {
    ready: false,
    fromHistory: false,
    saved: false,
    lines: [],
    hexName: '',
    shortName: '',
    upper: '',
    lower: '',
    judgment: '',
    hasChange: false,
    changeText: '',
    changedName: '',
    changedJudgment: '',
    timeText: ''
  },

  onLoad: function (options) {
    let session = null;
    if (options && options.id) {
      session = store.get(options.id);
      this.setData({ fromHistory: true, saved: true });
    } else {
      session = getApp().globalData.pendingSession;
    }

    if (!session) {
      wx.showToast({ title: '占例不存在', icon: 'none' });
      setTimeout(function () {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 800);
      return;
    }

    this.session = session;
    this.render(session);
  },

  render: function (session) {
    const values = session.values || [];
    const hex = session.hex || hexagrams.buildHexagram(values);
    const lines = [];
    for (let i = 5; i >= 0; i--) {
      const v = values[i];
      const info = v === 6 ? { yang: false, symbol: '⚋' }
        : v === 9 ? { yang: true, symbol: '⚊' }
          : v === 8 ? { yang: false, symbol: '⚋' }
            : { yang: true, symbol: '⚊' };
      lines.push({
        label: LABELS[i],
        yang: info.yang,
        changing: v === 6 || v === 9,
        valueText: v + ' ' + info.symbol
      });
    }

    const changed = session.changed;
    this.setData({
      ready: true,
      lines: lines,
      hexName: hex.name,
      shortName: hex.shortName,
      upper: hex.upperSymbol + ' ' + hex.upper + '（上）',
      lower: hex.lowerSymbol + ' ' + hex.lower + '（下）',
      judgment: hex.judgment,
      hasChange: !!changed,
      changeText: (session.changeLabels || []).join('、'),
      changedName: changed ? changed.name : '',
      changedJudgment: changed ? changed.judgment : '',
      timeText: store.formatTime(session.createdAt)
    });
  },

  onSave: function () {
    if (!this.session) return;
    const res = store.save(this.session);
    if (res.error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ saved: true });
    wx.showToast({ title: '已存入占例', icon: 'success' });
  },

  onRestart: function () {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onHistory: function () {
    wx.navigateTo({ url: '/pages/history/history' });
  }
});
