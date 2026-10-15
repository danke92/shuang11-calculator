/* 引擎冒烟测试：在 Node 里把 rules.js + engine.js 装进一个假 window 后跑算例 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const win = {};
global.window = win;
for (const f of ['js/rules.js', 'js/engine.js']) {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  new Function('window', code)(win);
}

const E = win.S11Engine;
const DATA = win.S11;
let fail = 0;

function check(name, actual, expected) {
  const ok = Math.abs(actual - expected) < 0.011;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ' (期望 ' + expected + ')'}`);
}

console.log('平台数：' + DATA.PLATFORMS.length + '，默认立减率 ' + DATA.DEFAULTS.officialRate + '%\n');

/* 场景 1：天猫，2999 元手机，官方 8.5 折 + 店铺满 1000 减 100 + 品类满 1500 减 180 + 88VIP 满 1500 减 150 */
const tmall = E.calculate({
  platform: 'tmall', price: 2999, qty: 1, category: 'digital',
  officialEnabled: true, officialRate: 85,
  storeEnabled: true, storeThreshold: 1000, storeCut: 100,
  categoryCouponEnabled: true, categoryThreshold: 1500, categoryCut: 180,
  voucherEnabled: true, voucherOption: { threshold: 1500, amount: 150 },
  memberEnabled: false, redPacketEnabled: true, redPacketAmount: 60, redPacketCount: 1,
  subsidyEnabled: false, tradeInEnabled: false
});
// 2999*0.85 = 2549.15 → 店 -100 = 2449.15 → 品类 -180 = 2269.15 → 券 -150 = 2119.15 → 红包 -60 = 2059.15
check('天猫 最终到手价', tmall.finalTotal, 2059.15);
check('天猫 优惠合计', tmall.totalSaved, 939.85);
console.log('   明细：' + tmall.lines.filter(l => !l.skipped).map(l => l.name + ' -' + l.amount).join(' → '));

/* 场景 2：百亿补贴场景，官方立减不适用，店铺券门槛未达 */
const pddOff = E.calculate({
  platform: 'pdd', price: 2999, qty: 1, category: 'general',
  officialEnabled: false, storeEnabled: true, storeThreshold: 5000, storeCut: 300,
  categoryCouponEnabled: false, voucherEnabled: false, memberEnabled: false,
  redPacketEnabled: false, subsidyEnabled: false, tradeInEnabled: false
});
check('多多 无券无补贴', pddOff.finalTotal, 2999);
const storeLine = pddOff.lines.find(l => l.stage === 'store');
console.log('   店铺券状态：' + (storeLine.skipped ? '未生效' : '生效') + ' — ' + storeLine.desc);

/* 场景 3：国补封顶 —— 家电 8000 元，15% 计算得 1200 未到 1500 封顶 */
const big = E.calculate({
  platform: 'jd', price: 8000, qty: 1, category: 'appliance',
  officialEnabled: true, officialCut: 0, officialRate: 100,
  memberEnabled: true, memberRate: 95,
  subsidyEnabled: true, subsidyRate: 15, subsidyCap: 1500,
  storeEnabled: false, categoryCouponEnabled: false, voucherEnabled: false, redPacketEnabled: false, tradeInEnabled: false
});
// 8000 → PLUS95折 7600 → 国补 15% = 1140 → 6460
check('京东家电 国补', big.finalTotal, 6460);
const subLine = big.lines.find(l => l.stage === 'subsidy');
console.log('   国补：' + subLine.desc);

/* 场景 4：国补顶到封顶 —— 数码 4000 元，15% = 600 > 500 封顶 */
const capped = E.calculate({
  platform: 'douyin', price: 4000, qty: 1, category: 'digital',
  officialEnabled: true, officialRate: 85,
  subsidyEnabled: true, subsidyRate: 15, subsidyCap: 500,
  storeEnabled: false, categoryCouponEnabled: false, voucherEnabled: false, memberEnabled: false, redPacketEnabled: false, tradeInEnabled: false
});
// 4000*0.85 = 3400 → 国补 510 → 封顶 500 → 2900
check('抖音 数码国补封顶', capped.finalTotal, 2900);
check('抖音 国补实付', capped.lines.find(l => l.stage === 'subsidy').amount, 500);
console.log('   提示：' + capped.metas.find(t => t.includes('封顶')));

/* 场景 5：多件 —— 京东 2 件 × 2999，官方直降 300/件 + 红包 60×2 */
const two = E.calculate({
  platform: 'jd', price: 2999, qty: 2, category: 'general',
  officialEnabled: true, officialCut: 300,
  redPacketEnabled: true, redPacketAmount: 60, redPacketCount: 2,
  storeEnabled: false, categoryCouponEnabled: false, voucherEnabled: false, memberEnabled: false, subsidyEnabled: false, tradeInEnabled: false
});
// 5998 → 直降 600 → 5398 → 红包 120 → 5278
check('京东 2 件直降+红包', two.finalTotal, 5278);
check('京东 2 件单件到手', two.unitFinal, 2639);

/* 场景 6：会员券门槛未达，给出凑单提示 */
const gap = E.calculate({
  platform: 'tmall', price: 400, qty: 1, category: 'general',
  officialEnabled: true, officialRate: 85,
  voucherEnabled: true, voucherOption: { threshold: 480, amount: 60 },
  storeEnabled: false, categoryCouponEnabled: false, memberEnabled: false, redPacketEnabled: false, subsidyEnabled: false, tradeInEnabled: false
});
// 400*0.85 = 340 < 480，券用不上
check('天猫 券门槛未达', gap.finalTotal, 340);
check('天猫 缺口', gap.lines.find(l => l.stage === 'voucher').gap, 140);
console.log('   提示：' + gap.metas.find(t => t.includes('门槛')));

/* 场景 7：四平台比价 */
const compare = E.compareAll({
  platform: 'tmall', price: 2999, qty: 1, category: 'general',
  officialEnabled: true, officialRate: 85,
  storeEnabled: false, categoryCouponEnabled: false,
  voucherEnabled: true, voucherOption: { threshold: 1500, amount: 150 },
  memberEnabled: true, memberRate: 95, memberCouponCut: 0,
  redPacketEnabled: false, subsidyEnabled: false, tradeInEnabled: false
});
console.log('\n四平台比价（标价 2999，开通会员券）：');
compare.forEach(r => console.log(`   ${r.platform.short}  ¥${E.fmt(r.finalTotal)}  省 ${r.savedPct}%`));
const sorted = compare.every((r, i) => i === 0 || compare[i - 1].finalTotal <= r.finalTotal);
if (!sorted) { fail++; console.log('FAIL  比价结果未按到手价升序'); } else { console.log('PASS  比价结果已按到手价升序'); }

console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项失败 ❌`);
process.exit(fail === 0 ? 0 : 1);
