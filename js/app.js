/* ==========================================================================
 *  双11 减免计算器 · 界面逻辑
 * ========================================================================== */
(function () {
  'use strict';

  var DATA = window.S11;
  var E = window.S11Engine;
  var STORE_KEY = 's11.rules.2026';

  var state = {
    platform: DATA.PLATFORMS[0].id,
    overrides: loadOverrides()
  };

  /** 官方默认规则的一份快照：在应用用户覆盖之前捕获，用于「恢复官方默认」 */
  var ORIGINAL = JSON.parse(JSON.stringify({
    DEFAULTS: DATA.DEFAULTS,
    SUBSIDY: DATA.SUBSIDY,
    PLATFORMS: DATA.PLATFORMS,
    STAGE_META: DATA.STAGE_META,
    META: DATA.META
  }));

  /* ------------------------------------------------------------ 本地规则覆盖 */
  function loadOverrides() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }
  function saveOverrides(obj) {
    state.overrides = obj || {};
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state.overrides)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function applyOverrides() {
    var ov = state.overrides;
    if (!ov || !Object.keys(ov).length) return;
    if (ov.officialRate !== undefined) DATA.DEFAULTS.officialRate = E.num(ov.officialRate, 85);
    if (ov.subsidyRate !== undefined) DATA.DEFAULTS.subsidyRate = E.num(ov.subsidyRate, 15);
    if (ov.subsidyCapDigital !== undefined) DATA.DEFAULTS.subsidyCapDigital = E.num(ov.subsidyCapDigital, 500);
    if (ov.subsidyCapBig !== undefined) DATA.DEFAULTS.subsidyCapBig = E.num(ov.subsidyCapBig, 1500);
    DATA.PLATFORMS.forEach(function (p) {
      if (!p.official) return;
      if (p.official.enabled !== false && p.official.rate !== undefined) {
        p.official.rate = p.official.rateSource === 'cash' ? p.official.rate : DATA.DEFAULTS.officialRate;
      }
      if (p.subsidy) {
        p.subsidy.rate = DATA.DEFAULTS.subsidyRate;
        p.subsidy.caps.general = 0;
        p.subsidy.caps.digital = DATA.DEFAULTS.subsidyCapDigital;
        p.subsidy.caps.computer = DATA.DEFAULTS.subsidyCapBig;
        p.subsidy.caps.appliance = DATA.DEFAULTS.subsidyCapBig;
      }
    });
  }

  /* ------------------------------------------------------------ 元素引用 */
  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  [
    'platformTabs', 'rulesBadge', 'btnRules', 'price', 'category', 'qty', 'presets',
    'officialOn', 'officialRate', 'officialCut', 'officialHint', 'officialInputs',
    'storeOn', 'storeThreshold', 'storeCut', 'storeInputs',
    'categoryCouponOn', 'categoryThreshold', 'categoryCut', 'categoryCouponInputs',
    'voucherOn', 'voucherSelect', 'voucherLabel', 'voucherHint',
    'memberOn', 'memberRate', 'memberCouponCut', 'memberLabel', 'memberHint', 'memberInputs',
    'redPacketOn', 'redPacketAmount', 'redPacketCount', 'redPacketInputs',
    'subsidyOn', 'subsidyRate', 'subsidyCap', 'subsidyInputs',
    'tradeInOn', 'tradeInAmount',
    'finalPrice', 'resultSub', 'discountBadge', 'barFinal', 'totalSaved', 'savedPct', 'unitPrice',
    'steps', 'stepsEmpty', 'tips', 'ruleSummary', 'platformHint',
    'btnCompare', 'compareCard', 'compareList', 'compareNote',
    'drawer', 'drawerMask', 'btnCloseDrawer', 'ruleForm', 'btnSaveRules', 'btnResetRules', 'sourceList'
  ].forEach(function (id) { el[id] = $(id); });

  var current = DATA.PLATFORMS[0];

  /* ------------------------------------------------------------ 工具 */
  function checked(node) { return !!(node && node.checked); }
  function val(node) { return node ? node.value : ''; }
  function setDisabled(node, disabled) {
    if (!node) return;
    node.disabled = !!disabled;
    var box = node.closest ? node.closest('.field') : null;
    if (box) box.classList.toggle('is-off', !!disabled);
  }

  /* ------------------------------------------------------------ 平台切换 */
  function renderTabs() {
    el.platformTabs.innerHTML = '';
    DATA.PLATFORMS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.style.setProperty('--tab-accent', p.accent);
      b.setAttribute('aria-selected', String(p.id === state.platform));
      b.appendChild(document.createTextNode(p.name));
      // 简称已包含在平台名里就不重复显示（窄屏由 CSS 强制显示，避免平台名被截断）
      if (p.name.indexOf(p.short) < 0) {
        var tag = document.createElement('span');
        tag.className = 'tab-tag';
        tag.textContent = p.short;
        b.appendChild(tag);
      }
      b.addEventListener('click', function () { switchPlatform(p.id); });
      el.platformTabs.appendChild(b);
    });
  }

  function switchPlatform(id) {
    state.platform = id;
    current = E.platformOf(id);
    Array.prototype.forEach.call(el.platformTabs.children, function (node, i) {
      node.setAttribute('aria-selected', String(DATA.PLATFORMS[i].id === id));
    });
    resetInputsForPlatform();
    el.compareCard.hidden = true;
    renderRuleSummary();
    recalc();
  }

  /** 换平台时，把「平台差异项」重置为该平台默认玩法，用户手填的金额尽量保留 */
  function resetInputsForPlatform() {
    var p = current;

    // 官方立减 / 官方直降
    var off = p.official || { enabled: false, rate: 100 };
    var cashFirst = off.rateSource === 'cash' || !off.enabled;
    el.officialOn.checked = !!off.enabled;
    var effRate = (off.rate === undefined ? DATA.DEFAULTS.officialRate : off.rate);
    if (cashFirst) {
      // 京东这类「官方直降」平台：只填直降金额
      el.officialInputs.classList.add('is-cash');
      el.officialCut.value = off.cashCut !== undefined ? off.cashCut : (off.enabled ? 300 : '');
      el.officialRate.value = 85;
    } else {
      el.officialInputs.classList.remove('is-cash');
      el.officialCut.value = '';
      el.officialRate.value = effRate;
    }
    setDisabled(el.officialOn, !off.enabled);
    setDisabled(el.officialRate, !off.enabled);
    setDisabled(el.officialCut, !off.enabled);
    el.officialHint.textContent = off.note || '';
    syncOfficialInputs();

    // 会员
    var mem = p.member || { enabled: false, rate: 100 };
    el.memberOn.checked = !!mem.enabled;
    el.memberRate.value = mem.rate || 100;
    el.memberLabel.textContent = mem.label || '会员折扣';
    el.memberHint.textContent = mem.hint || '';
    setDisabled(el.memberOn, !mem.enabled);
    setDisabled(el.memberRate, !mem.enabled);
    setDisabled(el.memberCouponCut, !mem.enabled);
    if (mem.couponLabel && el.memberCouponCut.parentNode.firstChild) {
      el.memberCouponCut.parentNode.firstChild.nodeValue = mem.couponLabel;
    }

    // 会员专享券
    var v = p.voucher;
    el.voucherSelect.innerHTML = '';
    (v && v.options ? v.options : []).forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.text;
      el.voucherSelect.appendChild(opt);
    });
    if (v && v.options && v.options.length) el.voucherSelect.value = v.options[0].id;
    el.voucherOn.checked = false;
    el.voucherLabel.textContent = (p.labels && p.labels.voucher) || '会员专享券';
    el.voucherHint.textContent = v ? v.hint : '该平台没有对应的会员专享券体系，本层不参与计算。';
    setDisabled(el.voucherOn, !v);
    setDisabled(el.voucherSelect, !v);

    // 各层名称与提示随平台变化
    var L = p.labels || {};
    var ccLabel = el.categoryCouponInputs.parentNode.querySelector('.switch-label');
    if (ccLabel) ccLabel.textContent = L.categoryCoupon || '品类券 / 加补券';
    var rpLabel = el.redPacketInputs.parentNode.querySelector('.switch-label');
    if (rpLabel) rpLabel.textContent = L.redPacket || '平台红包';
    setHint('categoryCouponOn', (p.hints && p.hints.categoryCoupon) || '平台品类券 / 加补券，同级通常互斥，只算一张。');
    setHint('redPacketOn', (p.hints && p.hints.redPacket) || '无门槛红包，可多张叠加。');

    // 平台副标题与规则版本
    el.platformHint.textContent = p.tagline + ' —— ' + (p.orderNote || '');
    el.rulesBadge.textContent = '规则版本 · ' + DATA.META.year + '（' + DATA.META.updatedAt + '）';
  }

  /** 「折扣率」与「直接减」二选一：填了直降金额就按直降算 */
  function syncOfficialInputs() {
    var on = checked(el.officialOn);
    var hasCut = E.num(val(el.officialCut), 0) > 0;
    el.officialRate.disabled = !on || hasCut;
    el.officialCut.disabled = !on;
  }

  /** 给某个开关下面的 .hint 换文案 */
  function setHint(switchId, text) {
    var input = el[switchId];
    if (!input) return;
    var field = input.closest('.field');
    if (!field) return;
    var hint = field.querySelector('.hint');
    if (hint) hint.textContent = text;
  }

  /* ------------------------------------------------------------ 读取表单 */
  function readInput() {
    var vOpt = null;
    if (current.voucher && current.voucher.options) {
      var id = val(el.voucherSelect);
      current.voucher.options.forEach(function (o) { if (o.id === id) vOpt = o; });
    }
    return {
      platform: current.id,
      price: E.num(val(el.price), 0),
      category: val(el.category) || 'general',
      qty: Math.max(1, Math.floor(E.num(val(el.qty), 1))),
      officialEnabled: checked(el.officialOn),
      officialRate: E.num(val(el.officialRate), DATA.DEFAULTS.officialRate),
      officialCut: E.num(val(el.officialCut), 0),
      storeEnabled: checked(el.storeOn),
      storeThreshold: E.num(val(el.storeThreshold), 0),
      storeCut: E.num(val(el.storeCut), 0),
      categoryCouponEnabled: checked(el.categoryCouponOn),
      categoryThreshold: E.num(val(el.categoryThreshold), 0),
      categoryCut: E.num(val(el.categoryCut), 0),
      voucherEnabled: checked(el.voucherOn),
      voucherOption: vOpt,
      memberEnabled: checked(el.memberOn),
      memberRate: E.num(val(el.memberRate), 100),
      memberCouponCut: E.num(val(el.memberCouponCut), 0),
      redPacketEnabled: checked(el.redPacketOn),
      redPacketAmount: E.num(val(el.redPacketAmount), 0),
      redPacketCount: Math.max(1, Math.floor(E.num(val(el.redPacketCount), 1))),
      subsidyEnabled: checked(el.subsidyOn),
      subsidyRate: val(el.subsidyRate) === '' ? undefined : E.num(val(el.subsidyRate), undefined),
      subsidyCap: val(el.subsidyCap) === '' ? undefined : E.num(val(el.subsidyCap), undefined),
      tradeInEnabled: checked(el.tradeInOn),
      tradeInAmount: E.num(val(el.tradeInAmount), 0)
    };
  }

  /** 一键套用常见叠加场景（可以点多次来回切换） */
  function applyPreset(name) {
    var p = current;
    var hasOfficial = !!(p.official && p.official.enabled);
    var hasMember = !!(p.member && p.member.enabled);
    var hasVoucher = !!p.voucher;

    var cfg = {
      base:  { official: true, store: false, categoryCoupon: false, voucher: false, member: false, redPacket: false, subsidy: false, tradeIn: false },
      coupon: { official: true, store: true, categoryCoupon: true, voucher: true, member: hasMember, redPacket: true, subsidy: false, tradeIn: false },
      full:  { official: true, store: true, categoryCoupon: true, voucher: true, member: hasMember, redPacket: true, subsidy: true, tradeIn: true }
    }[name];
    if (!cfg) return;

    function set(node, on) {
      if (!node) return;
      node.checked = !!on && !node.disabled;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }
    set(el.officialOn, cfg.official && hasOfficial);
    set(el.storeOn, cfg.store);
    set(el.categoryCouponOn, cfg.categoryCoupon);
    set(el.voucherOn, cfg.voucher && hasVoucher);
    set(el.memberOn, cfg.member && hasMember);
    set(el.redPacketOn, cfg.redPacket);
    set(el.subsidyOn, cfg.subsidy);
    set(el.tradeInOn, cfg.tradeIn && E.num(val(el.tradeInAmount), 0) > 0);

    syncOfficialInputs();
    recalc();
  }

  /** 窄屏：把价格卡复制一份放到输入区最前面，边调参数边看到手价 */
  function setupMobileResult() {
    var src = document.querySelector('#resultCard');
    var box = document.querySelector('#colInput');
    if (!src || !box) return;
    var wrap = document.querySelector('#resultCardMobile');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'result-mobile';
      wrap.id = 'resultCardMobile';
      wrap.appendChild(src.cloneNode(true));
      box.insertBefore(wrap, box.firstChild);
    }
    var cl = wrap.firstElementChild;
    cl.removeAttribute('id');
    el.mobileMirror = {
      price: cl.querySelector('.result-price').lastElementChild,
      sub: cl.querySelector('.result-sub'),
      badge: cl.querySelector('.result-badge'),
      saved: cl.querySelector('.stat-v'),
      pct: cl.querySelectorAll('.stat-v')[1],
      unit: cl.querySelectorAll('.stat-v')[2],
      bar: cl.querySelector('.bar-seg')
    };
  }

  function updateMobileResult(o) {
    var m = el.mobileMirror;
    if (!m) return;
    m.price.textContent = o.finalPrice;
    m.sub.textContent = o.resultSub;
    m.badge.textContent = o.badge;
    m.badge.className = 'result-badge' + (o.badgeLow ? ' is-low' : '');
    m.saved.textContent = o.totalSaved;
    m.pct.textContent = o.savedPct;
    m.unit.textContent = o.unitPrice;
    m.bar.style.width = o.finalPct + '%';
  }

  /* ------------------------------------------------------------ 计算 + 渲染 */
  function recalc() {
    var input = readInput();
    var r = E.calculate(input);
    renderResult(r);
    renderSteps(r);
    renderTips(r);
  }

  function renderResult(r) {
    var payPct = Math.max(0, Math.min(100, r.payPct));
    var badgeHtml = (r.payPct > 0 ? (r.payPct / 10).toFixed(1) : '0') + ' 折<small>到手折扣</small>';
    var badText = (r.payPct > 0 ? (r.payPct / 10).toFixed(1) : '0') + ' 折到手折扣';

    el.finalPrice.textContent = E.fmt(r.finalTotal);
    el.totalSaved.textContent = '¥' + E.fmt(r.totalSaved);
    el.savedPct.textContent = (r.savedPct ? r.savedPct.toFixed(1) : '0') + '%';
    el.unitPrice.textContent = '¥' + E.fmt(r.unitFinal);
    el.barFinal.style.width = payPct + '%';
    el.discountBadge.innerHTML = badgeHtml;

    var bits = [];
    bits.push(current.short + ' · 标价 ¥' + E.fmt(r.totalBase) + ' × ' + r.qty + ' 件');
    if (r.totalSaved > 0) bits.push('共减 ¥' + E.fmt(r.totalSaved));
    else bits.push('当前没有叠加任何优惠');
    el.resultSub.textContent = bits.join(' · ');

    updateMobileResult({
      finalPrice: E.fmt(r.finalTotal),
      resultSub: bits.join(' · '),
      badge: badText,
      badgeLow: r.payPct > 0 && r.payPct <= 60,
      totalSaved: '¥' + E.fmt(r.totalSaved),
      savedPct: el.savedPct.textContent,
      unitPrice: el.unitPrice.textContent,
      finalPct: payPct
    });
  }

  function renderSteps(r) {
    el.steps.innerHTML = '';
    var active = r.lines.filter(function (l) { return !l.skipped; });
    if (!active.length) {
      el.stepsEmpty.hidden = false;
      el.stepsEmpty.textContent = '当前没有生效的优惠层，勾选左侧任意优惠项试试。';
      return;
    }
    el.stepsEmpty.hidden = true;
    r.lines.forEach(function (l) {
      var li = document.createElement('li');
      li.className = l.skipped ? 'is-skip' : '';
      var amountText = l.skipped ? '未生效' : '-¥' + E.fmt(l.amount);
      li.innerHTML =
        '<div class="step-tag">' + l.tag + '</div>' +
        '<div class="step-body">' +
          '<div class="step-name">' + l.name + '</div>' +
          '<div class="step-desc">' + l.desc + '</div>' +
        '</div>' +
        '<div class="step-amt-box">' +
          '<div class="step-amount">' + amountText + '</div>' +
          (l.skipped ? '' : '<div class="step-after">余 ¥' + E.fmt(l.after) + '</div>') +
        '</div>';
      el.steps.appendChild(li);
    });
  }

  function renderTips(r) {
    el.tips.innerHTML = '';
    if (!r.metas.length) {
      var li = document.createElement('li');
      li.textContent = '勾选优惠项后，这里会给出凑单、门槛、国补方面的提醒。';
      el.tips.appendChild(li);
      return;
    }
    r.metas.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      el.tips.appendChild(li);
    });
  }

  function renderRuleSummary() {
    var p = current;
    var html = '';
    html += '<h3>' + p.name + ' · 活动节奏</h3><ul>';
    (p.timeline || []).forEach(function (t) { html += '<li>' + t + '</li>'; });
    html += '</ul>';
    html += '<h3>优惠叠加顺序</h3><div class="chain">' + (p.orderNote || '') + '</div>';
    if (p.official && p.official.note) {
      html += '<h3>官方立减 / 直降</h3><div>' + p.official.note + '</div>';
    }
    if (p.subsidy && p.subsidy.note) {
      html += '<h3>国家补贴</h3><div>' + p.subsidy.note + '</div>';
    }
    html += '<h3>2026 年大促整体变化</h3><div>' + DATA.META.notice + '</div>';
    el.ruleSummary.innerHTML = html;
  }

  /* ------------------------------------------------------------ 四平台比价 */
  function renderCompare() {
    var base = readInput();
    var results = E.compareAll(base);
    var best = results[0];
    el.compareCard.hidden = false;
    el.compareList.innerHTML = '';

    results.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'compare-item' + (i === 0 ? ' is-best' : '');
      var pct = r.totalBase > 0 ? Math.max(4, Math.min(100, 100 - r.savedPct)) : 100;
      row.innerHTML =
        '<div class="compare-name"><span class="chip" style="background:' + r.platform.accent + '">' +
          r.platform.short.charAt(0) + '</span>' + r.platform.short + '</div>' +
        '<div class="compare-mid">' +
          '<div class="compare-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<div class="compare-pct">标价 ¥' + E.fmt(r.totalBase) + ' · 省 ¥' + E.fmt(r.totalSaved) +
          '（' + r.savedPct.toFixed(1) + '%）' + (i === 0 ? ' <span class="best-pill">最低</span>' : '') + '</div>' +
        '</div>' +
        '<div class="compare-price">¥' + E.fmt(r.finalTotal) + '<small>单件 ¥' + E.fmt(r.unitFinal) + '</small></div>';
      el.compareList.appendChild(row);
    });

    var gap = results.length > 1 ? (results[results.length - 1].finalTotal - best.finalTotal) : 0;
    el.compareNote.textContent =
      '同一标价 ¥' + E.fmt(base.price) + ' 下，' + best.platform.name + '到手价最低（¥' + E.fmt(best.finalTotal) +
      '），与最贵的平台相差 ¥' + E.fmt(gap) + '。比价时已按各平台默认玩法自动套用：官方立减率 / 直降、会员折扣、国补封顶，' +
      '并把你的会员券按面额换算成该平台最接近的档位；各平台券面规则不同，结果仅供决策参考。';
  }

  /** 把（可能被用户覆盖过的）全局默认值写回输入框 */
  function syncGlobalDefaults() {
    var conf = E.subsidyConfig(current, val(el.category) || 'general', {});
    el.subsidyRate.value = conf.rate;
    el.subsidyCap.value = conf.cap;
  }

  /* ------------------------------------------------------------ 规则抽屉 */
  function renderRuleForm() {
    var fields = [
      { key: 'officialRate', label: '官方立减折扣率（%，如 85 表示 8.5 折）', value: DATA.DEFAULTS.officialRate, min: 50, max: 100, step: 0.5 },
      { key: 'subsidyRate', label: '国补默认比例（%）', value: DATA.DEFAULTS.subsidyRate, min: 0, max: 100, step: 0.5 },
      { key: 'subsidyCapDigital', label: '国补封顶 · 手机 / 数码（元）', value: DATA.DEFAULTS.subsidyCapDigital, min: 0, max: 5000, step: 50 },
      { key: 'subsidyCapBig', label: '国补封顶 · 家电 / 电脑（元）', value: DATA.DEFAULTS.subsidyCapBig, min: 0, max: 5000, step: 50 }
    ];
    el.ruleForm.innerHTML = '';
    fields.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = '<label for="rule-' + f.key + '">' + f.label + '</label>' +
        '<input type="number" id="rule-' + f.key + '" data-key="' + f.key +
        '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + f.value + '">';
      el.ruleForm.appendChild(row);
    });

    el.sourceList.innerHTML = '';
    var seen = {};
    DATA.PLATFORMS.forEach(function (p) {
      (p.sources || []).forEach(function (s) {
        if (seen[s.u]) return;
        seen[s.u] = 1;
        var li = document.createElement('li');
        li.innerHTML = '<a href="' + s.u + '" target="_blank" rel="noopener noreferrer">' + s.t + '</a>';
        el.sourceList.appendChild(li);
      });
    });
  }

  function openDrawer() { el.drawer.hidden = false; el.drawerMask.hidden = false; }
  function closeDrawer() { el.drawer.hidden = true; el.drawerMask.hidden = true; }

  function saveRuleForm() {
    var ov = {};
    Array.prototype.forEach.call(el.ruleForm.querySelectorAll('input[data-key]'), function (input) {
      ov[input.getAttribute('data-key')] = E.num(input.value, 0);
    });
    saveOverrides(ov);
    resetToDefaults();
    applyOverrides();
    resetInputsForPlatform();
    renderRuleSummary();
    recalc();
    closeDrawer();
  }

  function resetToDefaults() {
    // 重新载入一份干净的规则数据
    var fresh = JSON.parse(JSON.stringify(ORIGINAL));
    DATA.DEFAULTS = fresh.DEFAULTS;
    DATA.SUBSIDY = fresh.SUBSIDY;
    DATA.PLATFORMS = fresh.PLATFORMS;
    DATA.STAGE_META = fresh.STAGE_META;
    DATA.META = fresh.META;
    current = E.platformOf(state.platform);
  }


  /* ------------------------------------------------------------ 事件绑定 */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('input, select'), function (node) {
      node.addEventListener('input', recalc);
      node.addEventListener('change', recalc);
    });
    el.btnCompare.addEventListener('click', function () {
      renderCompare();
      el.compareCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el.btnRules.addEventListener('click', function () { renderRuleForm(); openDrawer(); });
    el.btnCloseDrawer.addEventListener('click', closeDrawer);
    el.drawerMask.addEventListener('click', closeDrawer);
    el.btnSaveRules.addEventListener('click', saveRuleForm);
    el.btnResetRules.addEventListener('click', function () {
      try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      state.overrides = {};
      resetToDefaults();
      syncGlobalDefaults();
      resetInputsForPlatform();
      renderRuleForm();
      renderRuleSummary();
      recalc();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeDrawer();
    });

    // 官方立减：填了「直接减 / 直降金额」就优先按直降计算
    el.officialCut.addEventListener('input', function () {
      syncOfficialInputs();
    });
    el.officialOn.addEventListener('change', function () {
      if (!checked(el.officialOn)) el.officialCut.value = '';
      syncOfficialInputs();
    });

    // 品类不同 → 国补封顶默认值跟着变
    el.category.addEventListener('change', function () {
      var conf = E.subsidyConfig(current, val(el.category), {});
      el.subsidyCap.value = conf.cap;
      recalc();
    });

    // 场景预设
    el.presets.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-preset]') : null;
      if (!btn) return;
      applyPreset(btn.getAttribute('data-preset'));
    });
  }

  /* ------------------------------------------------------------ 启动 */
  function init() {
    applyOverrides();
    renderTabs();
    bind();
    setupMobileResult();
    resetInputsForPlatform();
    renderRuleSummary();
    syncGlobalDefaults();
    recalc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
