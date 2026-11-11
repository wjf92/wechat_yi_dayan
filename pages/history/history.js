const store = require('../../utils/store.js');

Page({
  data: {
    list: [],
    empty: true
  },

  onShow: function () {
    this.loadList();
  },

  loadList: function () {
    const all = store.list();
    const list = all.map(function (item) {
      const hex = item.hex || {};
      const changed = item.changed;
      return {
        id: item.id,
        name: hex.name || '未知卦',
        shortName: hex.shortName || '',
        changedName: changed ? changed.name : '',
        changeText: (item.changeLabels || []).join('、'),
        question: (item.question || '').trim(),
        timeText: store.formatTime(item.createdAt)
      };
    });
    this.setData({ list: list, empty: list.length === 0 });
  },

  onOpen: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/result/result?id=' + id });
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '删除占例',
      content: '删除后不可恢复，确定删除？',
      confirmColor: '#e0402f',
      success: function (res) {
        if (!res.confirm) return;
        store.remove(id);
        that.loadList();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  onBack: function () {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
