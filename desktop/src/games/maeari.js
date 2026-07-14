'use strict';
window.Games = window.Games || {};
window.Games.maeari = {
  id: 'maeari', name: 'maeari', genre: '스텁', accentColor: '#39C5E8',
  init(hubAPI) { this.hub = hubAPI; },
  onEnter() {},
  onExit() {},
  resize(W, H) {},
  update(dt) {},
  render(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.font = '700 20px sans-serif';
    g.fillText('STUB: maeari', this.hub.CX, this.hub.CY);
  },
  onPointer(x, y, down) {},
  onKey(e) {},
  summary() { return ''; },
};
