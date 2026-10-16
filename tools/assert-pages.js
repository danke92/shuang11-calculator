// 在页面里跑的断言脚本：验证部署后的站点能算出正确到手价。
// 用法：node tools/render.js <URL> --js-file tools/assert-pages.js --width 390 --shot out.png
(function () {
  function q(sel) { return document.querySelector(sel); }
  function txt(sel) {
    var el = q(sel);
    if (!el) return null;
    var v = ('value' in el && el.value !== '') ? el.value : el.textContent;
    return String(v).replace(/\s+/g, ' ').trim();
  }
  var out = {};

  out.tabs = [].map.call(document.querySelectorAll('#platformTabs .tab'), function (t) {
    return t.textContent.replace(/\s+/g, ' ').trim();
  });
  out.priceInput = txt('#price');
  out.initialFinal = txt('#finalPrice');

  // 点「极限叠加」预设（含国补、以旧换新）
  var preset = q('[data-preset="full"]');
  if (preset) preset.click();

  out.afterFullPreset = txt('#finalPrice');
  out.savedTotal = txt('#totalSaved');
  out.steps = [].map.call(document.querySelectorAll('#steps > li'), function (li) {
    var name = li.querySelector('.step-name');
    var amt = li.querySelector('.step-amount');
    return (name ? name.textContent.trim() : '?') + ' = ' + (amt ? amt.textContent.trim() : '?');
  });
  out.topbarGradient = getComputedStyle(q('.topbar')).backgroundImage.slice(0, 28);
  out.externalRefs = [].filter.call(
    document.querySelectorAll('link[href], script[src], img[src]'),
    function (n) {
      var u = n.getAttribute('href') || n.getAttribute('src') || '';
      return /^(https?:)?\/\//.test(u);
    }
  ).length;

  // 布局体检：可见的价格卡应恰好 1 张；表单与分析卡片的先后顺序
  // 用 getClientRects 而不是 computed display —— 后者看不出被 display:none 的祖先藏起来
  function visible(el) { return !!el && el.getClientRects().length > 0; }
  out.visiblePriceCards = [].filter.call(
    document.querySelectorAll('.result-card'), visible
  ).length;
  out.stepRows = document.querySelectorAll('#steps > li').length;
  out.layoutOrder = [
    ['镜像价格卡', q('#resultCardMobile')],
    ['表单', q('#colInput')],
    ['分析栏', q('#colResult')],
  ].filter(function (p) { return visible(p[1]); })
   .map(function (p) { return p[0] + '@' + Math.round(p[1].getBoundingClientRect().top); });

  return JSON.stringify(out, null, 1);
})();
