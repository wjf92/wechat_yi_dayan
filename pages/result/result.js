const duanzhan = require('../../utils/duanzhan.js');
const store = require('../../utils/store.js');

// 成卦结果页：断占总结（三行） / 本卦 / 变卦
// 全部展示数据由 utils/duanzhan.js 从六爻营数重算，历史占例无需迁移
Page({
  data: {
    ready: false,
    fromHistory: false,
    saved: false,
    summaryLines: [],
    ben: null,
    bian: null,
    timeText: '',
    question: '',
    asking: false,
    questionInput: ''
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
    const result = duanzhan.buildResult(values);
    this.setData({
      ready: true,
      summaryLines: result.summaryLines,
      ben: result.ben,
      bian: result.bian,
      timeText: store.formatTime(session.createdAt),
      question: (session.question || '').trim()
    });
  },

  // 保存前先问所占事项；用页面内弹层而不是 wx.showModal(editable)，
  // 因为 Android WebView 默认不显示 prompt/confirm 类原生对话框。
  onSave: function () {
    if (!this.session || this.data.saved) return;
    this.setData({
      asking: true,
      questionInput: (this.session.question || '').trim()
    });
  },

  onQuestionInput: function (e) {
    this.setData({ questionInput: (e.detail && e.detail.value) || '' });
  },

  onCancelAsk: function () {
    this.setData({ asking: false });
  },

  noop: function () {},

  onConfirmAsk: function () {
    if (!this.session) return;
    const q = (this.data.questionInput || '').trim();
    this.session.question = q;
    const res = store.save(this.session);
    if (res.error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ asking: false, saved: true, question: q });
    wx.showToast({ title: '已存入占例', icon: 'success' });
  },

  onRestart: function () {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onHistory: function () {
    wx.navigateTo({ url: '/pages/history/history' });
  }
});
