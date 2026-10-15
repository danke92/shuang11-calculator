/* ==========================================================================
 *  双11 减免计算器 · 计算引擎
 *  核心：按平台给定顺序逐层扣减，每一层的门槛按「上一层扣完后的金额」判断。
 * ========================================================================== */
(function (global) {
  'use strict';

  var DATA = global.S11;

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return fallback || 0;
    return n;
  }

  /** 金额四舍五入到分，规避浮点误差 */
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function fmt(n) {
    var v = round2(num(n, 0));
    return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtInt(n) {
    return Math.round(num(n, 0)).toLocaleString('zh-CN');
  }

  function platformOf(id) {
    for (var i = 0; i < DATA.PLATFORMS.length; i++) {
      if (DATA.PLATFORMS[i].id === id) return DATA.PLATFORMS[i];
    }
    return DATA.PLATFORMS[0];
  }

  /** 国补：优先用平台自带封顶，其次用全局默认 */
  function subsidyConfig(platform, category, input) {
    var caps = (platform.subsidy && platform.subsidy.caps) || {};
    var fallback = DATA.SUBSIDY[category] || DATA.SUBSIDY.general;
    var defaultRate = num(platform.subsidy && platform.subsidy.rate, fallback.rate);
    var cap = caps[category];
    if (cap === undefined || cap === null) cap = fallback.cap;
    return {
      rate: input.subsidyRate === undefined || input.subsidyRate === null || input.subsidyRate === ''
        ? defaultRate : num(input.subsidyRate, defaultRate),
      cap: input.subsidyCap === undefined || input.subsidyCap === null || input.subsidyCap === ''
        ? cap : num(input.subsidyCap, cap)
    };
  }

  /**
   * 核心计算
   * @param {Object} input
   *   platform, price, category, qty,
   *   officialEnabled, officialRate, officialCut,
   *   storeEnabled, storeThreshold, storeCut,
   *   categoryCouponEnabled, categoryThreshold, categoryCut,
   *   voucherEnabled, voucherOption {threshold, amount},
   *   memberEnabled, memberRate, memberCouponCut,
   *   redPacketEnabled, redPacketAmount, redPacketCount,
   *   subsidyEnabled, subsidyRate, subsidyCap,
   *   tradeInEnabled, tradeInAmount
   * @returns {Object} 明细 + 汇总
   */
  function calculate(input) {
    input = input || {};
    var platform = platformOf(input.platform);
    var price = Math.max(0, num(input.price, 0));
    var qty = Math.max(1, Math.floor(num(input.qty, 1)));
    var category = input.category || 'general';
    var totalBase = round2(price * qty);

    var lines = [];
    var remaining = totalBase;
    var order = platform.order || ['official', 'store', 'subsidy'];

    function push(stage, name, amount, desc, extra) {
      amount = round2(Math.max(0, Math.min(amount, remaining)));
      var before = remaining;
      remaining = round2(remaining - amount);
      var line = {
        stage: stage,
        name: name,
        amount: amount,
        before: before,
        after: remaining,
        desc: desc,
        skipped: amount <= 0,
        tag: (DATA.STAGE_META[stage] && DATA.STAGE_META[stage].icon) || '·'
      };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) line[k] = extra[k];
      lines.push(line);
      return line;
    }

    function pushSkip(stage, name, desc) {
      lines.push({
        stage: stage,
        name: name,
        amount: 0,
        before: remaining,
        after: remaining,
        desc: desc,
        skipped: true,
        tag: (DATA.STAGE_META[stage] && DATA.STAGE_META[stage].icon) || '·'
      });
    }

    for (var i = 0; i < order.length; i++) {
      var stage = order[i];

      if (stage === 'official') {
        var oName = (platform.labels && platform.labels.official) || (DATA.STAGE_META.official.name);
        if (!input.officialEnabled) { pushSkip('official', oName, '未启用官方立减 / 官方直降'); continue; }
        var cut = num(input.officialCut, 0);
        if (cut > 0) {
          push('official', oName, round2(cut * qty),
            '官方直降：标价 ¥' + fmt(price) + ' × ' + qty + ' 件，直降 ¥' + fmt(cut) + ' / 件');
        } else {
          var rate = num(input.officialRate, 85);
          if (rate >= 100) { pushSkip('official', oName, '折扣率设为 ' + rate + '%，本层无优惠'); continue; }
          var amt = round2(totalBase * (100 - rate) / 100);
          push('official', oName, amt,
            '官方立减 ' + (rate / 10).toFixed(1) + ' 折：¥' + fmt(totalBase) + ' × ' + (100 - rate) + '% = ¥' + fmt(amt));
        }
        continue;
      }

      if (stage === 'store') {
        if (!input.storeEnabled) { pushSkip('store', '店铺券 / 店铺满减', '未使用店铺券'); continue; }
        var st = num(input.storeThreshold, 0), sc = num(input.storeCut, 0);
        if (sc <= 0) { pushSkip('store', '店铺券 / 店铺满减', '店铺券面额为 0'); continue; }
        if (remaining < st) {
          pushSkip('store', '店铺券 / 店铺满减',
            '满 ' + fmtInt(st) + ' 减 ' + fmtInt(sc) + ' 门槛未达：当前 ¥' + fmt(remaining) + '，不生效');
        } else {
          push('store', '店铺券 / 店铺满减', round2(sc * qty),
            '满 ' + fmtInt(st) + ' 减 ' + fmtInt(sc) + (qty > 1 ? '，按单件金额达标 × ' + qty + ' 件' : '') +
            '，按当前金额 ¥' + fmt(remaining) + ' 判断达标');
        }
        continue;
      }

      if (stage === 'categoryCoupon') {
        var cName = (platform.labels && platform.labels.categoryCoupon) || '品类券';
        if (!input.categoryCouponEnabled) { pushSkip('categoryCoupon', cName, '未使用平台品类券'); continue; }
        var ct = num(input.categoryThreshold, 0), cc = num(input.categoryCut, 0);
        if (cc <= 0) { pushSkip('categoryCoupon', cName, '券面额为 0'); continue; }
        if (remaining < ct) {
          pushSkip('categoryCoupon', cName,
            '满 ' + fmtInt(ct) + ' 减 ' + fmtInt(cc) + ' 门槛未达：当前 ¥' + fmt(remaining) + '，不生效');
        } else {
          push('categoryCoupon', cName, cc,
            '满 ' + fmtInt(ct) + ' 减 ' + fmtInt(cc) + '，按当前金额 ¥' + fmt(remaining) + ' 判断达标');
        }
        continue;
      }

      if (stage === 'voucher') {
        var vName = (platform.labels && platform.labels.voucher) || '会员专享券';
        var opt = input.voucherOption;
        if (!input.voucherEnabled || !opt || opt.off || num(opt.amount, 0) <= 0) {
          pushSkip('voucher', vName, '未使用会员专享券'); continue;
        }
        if (remaining < num(opt.threshold, 0)) {
          lines.push({
            stage: 'voucher', name: vName, amount: 0, before: remaining, after: remaining,
            desc: '券门槛满 ' + fmtInt(opt.threshold) + ' 未达：当前 ¥' + fmt(remaining) + '，券用不上',
            skipped: true, tag: DATA.STAGE_META.voucher.icon,
            gap: round2(num(opt.threshold, 0) - remaining), threshold: num(opt.threshold, 0)
          });
        } else {
          push('voucher', vName, num(opt.amount, 0),
            (opt.text || '') + '，按当前金额 ¥' + fmt(remaining) + ' 判断达标');
        }
        continue;
      }

      if (stage === 'member') {
        var mName = (platform.labels && platform.labels.member) || '会员折扣';
        if (!input.memberEnabled) { pushSkip('member', mName, '未启用会员权益'); continue; }
        var mc = num(input.memberCouponCut, 0);
        if (mc > 0) push('member', mName + '（会员券）', mc, '会员专属券减 ¥' + fmtInt(mc));
        var mr = num(input.memberRate, 100);
        if (mr < 100) {
          var memberBefore = remaining;
          var mAmt = round2(memberBefore * (100 - mr) / 100);
          push('member', mName, mAmt,
            '会员 ' + (mr / 10).toFixed(1) + ' 折：¥' + fmt(memberBefore) + ' × ' + (100 - mr) + '% = ¥' + fmt(mAmt));
        } else if (mc <= 0) {
          pushSkip('member', mName, '会员折扣率 100%，本层无优惠');
        }
        continue;
      }

      if (stage === 'redPacket') {
        var rName = (platform.labels && platform.labels.redPacket) || '平台红包';
        if (!input.redPacketEnabled) { pushSkip('redPacket', rName, '未使用红包'); continue; }
        var ra = num(input.redPacketAmount, 0), rc = Math.max(1, Math.floor(num(input.redPacketCount, 1)));
        if (ra <= 0) { pushSkip('redPacket', rName, '红包金额为 0'); continue; }
        push('redPacket', rName, round2(ra * rc),
          '无门槛红包 ¥' + fmtInt(ra) + ' × ' + rc + ' 张');
        continue;
      }

      if (stage === 'subsidy') {
        if (!input.subsidyEnabled) { pushSkip('subsidy', '国家以旧换新补贴', '未启用国补'); continue; }
        var conf = subsidyConfig(platform, category, input);
        if (conf.cap <= 0 || conf.rate <= 0) {
          pushSkip('subsidy', '国家以旧换新补贴', '该品类不在国补范围内；如需参与请在上方「封顶」中填写可用额度');
          continue;
        }
        var base = remaining;
        var raw = round2(base * conf.rate / 100);
        var amount = round2(Math.min(raw, conf.cap));
        push('subsidy', '国家以旧换新补贴', amount,
          '国补 ' + conf.rate + '%：以券后实付 ¥' + fmt(base) + ' 为基数 = ¥' + fmt(raw) +
          '，单件封顶 ¥' + fmtInt(conf.cap) + ' → 补贴 ¥' + fmt(amount),
          { subsidyBase: base, subsidyRaw: raw, subsidyCap: conf.cap });
        continue;
      }

      if (stage === 'tradeIn') {
        if (!input.tradeInEnabled) { pushSkip('tradeIn', '旧机折抵', '未使用旧机折抵'); continue; }
        var ta = num(input.tradeInAmount, 0);
        if (ta <= 0) { pushSkip('tradeIn', '旧机折抵', '折抵金额为 0'); continue; }
        push('tradeIn', '旧机折抵', ta, '旧机回收款直接抵扣 ¥' + fmtInt(ta) + '（不计入国补核算基数）');
        continue;
      }
    }

    var totalSaved = round2(totalBase - remaining);
    var result = {
      platform: platform,
      price: price,
      qty: qty,
      category: category,
      totalBase: totalBase,
      finalTotal: remaining,
      unitFinal: round2(remaining / qty),
      totalSaved: totalSaved,
      savedPct: totalBase > 0 ? round2(totalSaved / totalBase * 100) : 0,
      payPct: totalBase > 0 ? round2(remaining / totalBase * 100) : 0,
      lines: lines,
      metas: []
    };
    result.metas = buildMetas(result);
    return result;
  }

  /** 生成提示文案 */
  function buildMetas(r) {
    var tips = [];
    var p = r.platform;

    if (r.totalBase > 0 && r.payPct <= 72.5) {
      tips.push('到手价约为标价的 ' + r.payPct.toFixed(1) + '%，已经摸到今年天猫「品牌立减 + 平台消费券」宣传的最低档（约 7.2 折）附近。');
    }
    for (var i = 0; i < r.lines.length; i++) {
      var l = r.lines[i];
      if (l.skipped && l.stage === 'voucher' && l.gap > 0) {
        tips.push('会员券还差 ¥' + fmt(l.gap) + ' 才够门槛（当前 ¥' + fmt(l.after) + '）：别为用券硬凑，今年天猫单件立减，凑单收益常常低于多买的成本。');
      }
      if (l.skipped && l.stage === 'store' && l.desc && l.desc.indexOf('门槛未达') >= 0) {
        tips.push('店铺券门槛未达（当前 ¥' + fmt(l.after) + '），只差一点可考虑加一件低价商品凑单，但要先算清加购成本是否小于券面额。');
      }
      if (l.skipped && l.stage === 'subsidy') {
        tips.push('国补没算进去：一般商品不参与国补；家电按品类单件封顶 1500 元、数码封顶 500 元，且按收货地址判定资格。');
      }
      if (l.subsidyCap && l.subsidyRaw > l.subsidyCap) {
        tips.push('国补已触及单件封顶 ¥' + fmtInt(l.subsidyCap) + '（按比例本应补贴 ¥' + fmt(l.subsidyRaw) + '）。');
      }
    }
    if (p && p.tips) for (var j = 0; j < p.tips.length; j++) tips.push(p.tips[j]);
    var seen = {}, out = [];
    for (var k = 0; k < tips.length; k++) {
      if (!seen[tips[k]]) { seen[tips[k]] = 1; out.push(tips[k]); }
    }
    return out;
  }

  /**
   * 同一件商品 / 同一批参数，分别跑四个平台的规则做比价
   * 用 params 打底，再套用每个平台的默认玩法（是否官方立减、会员折扣等）
   */
  function compareAll(params) {
    var results = [];
    for (var i = 0; i < DATA.PLATFORMS.length; i++) {
      var p = DATA.PLATFORMS[i];
      var input = {};
      for (var k in params) if (params.hasOwnProperty(k)) input[k] = params[k];
      input.platform = p.id;
      // 官方立减：只跟随平台自身的玩法（立减率 or 直降金额），不跨模式套用
      input.officialEnabled = !!(params.officialEnabled && p.official && p.official.enabled !== false);
      var cashMode = !!(p.official && p.official.rateSource === 'cash');
      if (!input.officialEnabled) {
        input.officialCut = 0;
        input.officialRate = 100;
      } else if (cashMode) {
        var userCut = num(params.officialCut, 0);
        input.officialCut = userCut > 0 ? userCut : num(p.official.cashCut, 0);
        input.officialRate = 100;
      } else {
        var userRate = num(params.officialRate, 0);
        input.officialCut = 0;
        input.officialRate = userRate > 0 ? userRate : (p.official.rate || DATA.DEFAULTS.officialRate);
      }
      input.memberEnabled = !!(params.memberEnabled && p.member && p.member.enabled);
      input.voucherEnabled = !!params.voucherEnabled && !!p.voucher;
      if (input.voucherEnabled) {
        input.voucherOption = pickVoucher(p.voucher, params.voucherOption);
      }
      var conf = subsidyConfig(p, input.category || 'general', {});
      if (params.subsidyEnabled) {
        input.subsidyRate = conf.rate;
        input.subsidyCap = conf.cap;
      }
      results.push(calculate(input));
    }
    results.sort(function (a, b) { return a.finalTotal - b.finalTotal; });
    return results;
  }

  /** 跨平台时把用户选的券「换算」成目标平台最接近的档位 */
  function pickVoucher(voucher, chosen) {
    if (!voucher || !voucher.options || !voucher.options.length) return null;
    var target = chosen ? num(chosen.amount, 0) : 0;
    var best = null;
    for (var i = 0; i < voucher.options.length; i++) {
      var o = voucher.options[i];
      if (o.off) continue;
      if (best === null || Math.abs(o.amount - target) < Math.abs(best.amount - target)) best = o;
    }
    return best || voucher.options[0];
  }

  global.S11Engine = {
    calculate: calculate,
    compareAll: compareAll,
    platformOf: platformOf,
    subsidyConfig: subsidyConfig,
    pickVoucher: pickVoucher,
    fmt: fmt,
    fmtInt: fmtInt,
    round2: round2,
    num: num
  };
})(window);
