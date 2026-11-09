const dayan = require('../../utils/dayan.js');

Page({
  data: {
    balls: [],
    ballSize: 30
  },

  onLoad: function () {
    // 以 rpx 为单位生成散而不叠的白球堆
    const pts = dayan.layoutBalls(20, 686, 300, 30, 12);
    const balls = pts.map(function (p, i) {
      return { id: 'b' + i, x: Math.round(p.x), y: Math.round(p.y) };
    });
    this.setData({ balls: balls });
  },

  startDivine: function () {
    wx.navigateTo({ url: '/pages/divine/divine' });
  },

  goHistory: function () {
    wx.navigateTo({ url: '/pages/history/history' });
  }
});
