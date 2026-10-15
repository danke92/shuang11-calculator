/* ==========================================================================
 *  双11 减免计算器 · 规则数据（2026 年版）
 *  数据来源：各平台 2026 双11 招商规则与官方活动说明，逐条见 sources 字段。
 *  说明：平台规则在招商期会微调，页面「规则设置」里所有数字都可在本地覆盖。
 * ========================================================================== */
(function (global) {
  'use strict';

  var DEFAULTS = {
    officialRate: 85,      // 官方立减 8.5 折（即立减 15%）
    subsidyRate: 15,       // 国补默认比例 15%
    subsidyCapDigital: 500,   // 手机/数码单件封顶
    subsidyCapBig: 1500       // 家电/电脑单件封顶
  };

  /* 国补：按「券 / 红包 / 会员折扣后的实付」核算，再封顶 */
  var SUBSIDY = {
    general:   { rate: 0,  cap: 0,    label: '一般商品（不参与国补）' },
    digital:   { rate: 15, cap: 500,  label: '手机 / 平板 / 智能穿戴（单件封顶 500 元）' },
    computer:  { rate: 15, cap: 1500, label: '电脑 / 笔记本（单件封顶 1500 元）' },
    appliance: { rate: 15, cap: 1500, label: '家电（单件封顶 1500 元）' }
  };

  /* 88VIP 第一波消费券：7 张共 1555 元；前两档可「膨胀」，膨胀后不可退回 */
  var VOUCHERS_TMALL = {
    label: '88VIP 专享消费券',
    hint: '第一波 88VIP 券包共 7 张 1555 元，10/13 起领、10/20 20:00 起用；满 480 减 60 与满 1500 减 150 两档可「膨胀」加码，膨胀后不可退回。',
    disableable: true,
    options: [
      { id: 'v60',   text: '满 480 减 60',      threshold: 480,  amount: 60 },
      { id: 'v60e',  text: '满 480 减 60 → 膨胀 满 600 减 75',   threshold: 600,  amount: 75 },
      { id: 'v60e2', text: '满 480 减 60 → 膨胀 满 800 减 100',  threshold: 800,  amount: 100 },
      { id: 'v60e3', text: '满 480 减 60 → 膨胀 满 1000 减 125', threshold: 1000, amount: 125 },
      { id: 'v150',  text: '满 1500 减 150',    threshold: 1500, amount: 150 },
      { id: 'v150e', text: '满 1500 减 150 → 膨胀 满 1500 减 180', threshold: 1500, amount: 180 },
      { id: 'v400',  text: '满 3000 减 400',    threshold: 3000, amount: 400 },
      { id: 'v650',  text: '满 5000 减 650',    threshold: 5000, amount: 650 },
      { id: 'none',  text: '不使用 88VIP 券',   threshold: 0,    amount: 0, off: true }
    ]
  };

  /* 京东 PLUS 超级补贴：千元级券包 + 95 折 */
  var VOUCHERS_JD = {
    label: 'PLUS 超级补贴券',
    hint: 'PLUS 会员可领超千元超级补贴及全品类大额券，可与红包、国补叠加；95 折是否生效以商品是否带「PLUS 专享价」标识为准。',
    disableable: false,
    options: [
      { id: 'none', text: '不使用超级补贴券（只享受 95 折）', threshold: 0, amount: 0, off: true },
      { id: 'p50',  text: '满 500 减 50',   threshold: 500,  amount: 50 },
      { id: 'p100', text: '满 1000 减 100', threshold: 1000, amount: 100 },
      { id: 'p200', text: '满 2000 减 200', threshold: 2000, amount: 200 },
      { id: 'p400', text: '满 4000 减 400', threshold: 4000, amount: 400 }
    ]
  };

  var VOUCHERS_PDD = {
    label: '平台大额满减券',
    hint: '拼多多大促统一发放覆盖全品类的大额满减券，补贴成本由平台承担；报名的活动商品同时享受降价补差（价保）。',
    disableable: false,
    options: [
      { id: 'none', text: '不使用平台大额券', threshold: 0, amount: 0, off: true },
      { id: 'p30',  text: '满 300 减 30',   threshold: 300,  amount: 30 },
      { id: 'p80',  text: '满 800 减 80',   threshold: 800,  amount: 80 },
      { id: 'p150', text: '满 1500 减 150', threshold: 1500, amount: 150 },
      { id: 'p300', text: '满 3000 减 300', threshold: 3000, amount: 300 }
    ]
  };

  var VOUCHERS_DOUYIN = {
    label: '抖音平台消费券',
    hint: '平台消费券每日发放，抖音端与豆包、红果短剧、今日头条、番茄小说等多端均可领取，全周期可用；使用门槛以券面说明为准。',
    disableable: true,
    options: [
      { id: 'none', text: '不使用平台消费券', threshold: 0, amount: 0, off: true },
      { id: 'd20', text: '满 200 减 20',   threshold: 200,  amount: 20 },
      { id: 'd50', text: '满 500 减 50',   threshold: 500,  amount: 50 },
      { id: 'd100', text: '满 1000 减 100', threshold: 1000, amount: 100 }
    ]
  };

  var PLATFORMS = [
    /* ------------------------------------------------------------------ 淘宝天猫 */
    {
      id: 'tmall',
      name: '淘宝 / 天猫',
      short: '天猫',
      accent: '#ff5000',
      tagline: '取消跨店满减 · 单件立减 · 88VIP 券可膨胀',
      timeline: [
        '10/15 20:00 预售开启（美妆、服饰），家电手机直接开卖',
        '10/20 20:00 正式开卖，持续至 11/13',
        '10/13 起领 88VIP 消费券，使用期 10/20 20:00 — 10/24 23:59'
      ],
      official: {
        enabled: true,
        rate: 85,
        note: '2026 年天猫双11 取消跨店满减，改为单件立减，官方立减 8.5 折起；品牌立减叠加平台消费券后最低约 7.2 折。'
      },
      order: ['official', 'categoryCoupon', 'store', 'voucher', 'redPacket', 'tradeIn', 'subsidy'],
      orderNote: '标的玩法顺序：原价 → 店铺券 / 官方立减 → 88VIP 消费券 → 品类券，折上折。',
      labels: {
        categoryCoupon: '平台加补券 / 品类券',
        voucher: VOUCHERS_TMALL.label,
        member: '会员折扣',
        redPacket: '超级红包 / 淘金币抵扣'
      },
      hints: {
        categoryCoupon: '淘宝「领券中心」可领至高 5983 元加补券包，覆盖美妆、服饰、数码、家电等 15+ 品类；美妆至高 280 元、服饰至高 200 元、黄金至高 480 元。',
        redPacket: '超级红包无门槛、可叠加、可累计，越早领越划算。'
      },
      member: {
        enabled: false,
        rate: 100,
        label: '88VIP 额外 95 折',
        hint: '88VIP 的 95 折仅覆盖部分品牌旗舰店商品，以商品页「88VIP 专享价」标识为准；默认不勾选，可用时再打开。'
      },
      voucher: VOUCHERS_TMALL,
      subsidy: { rate: 15, caps: { general: 0, digital: 500, computer: 1500, appliance: 1500 },
        note: '家电、手机、电脑等品类叠加国家补贴可低至 6.5 折；国补额度与资格按收货地址判定。' },
      tips: [
        '天猫今年不用凑单：买一件减一件，别再为凑门槛硬塞不需要的东西。',
        '88VIP 券「膨胀」只能一次且不可退回，先算清购物车金额再决定膨胀到哪一档。',
        '消费券领取截止 10/24 23:55，使用窗口 10/20 20:00 — 10/24 23:59，过期作废。'
      ],
      sources: [
        { t: '天猫双11 于 10 月 20 日晚 8 点开卖（淘宝官方学习中心）', u: 'https://daxue.taobao.com/information/detail.jhtml?id=2111' },
        { t: '2026 年天猫双11 招商规则（淘宝官方学习中心）', u: 'https://daxue.taobao.com/information/detail.jhtml?id=2015' },
        { t: '双11「抢跑」背后：从抢流量到「养」用户（北京商报 / 东方财富）', u: 'https://finance.eastmoney.com/a/202610123892970885.html' },
        { t: '88VIP 可自选消费券面额、1555 元可膨胀券包', u: 'https://weibo.com/2/detail/5353620552025239' }
      ]
    },

    /* ------------------------------------------------------------------ 京东 */
    {
      id: 'jd',
      name: '京东',
      short: '京东',
      accent: '#e1251b',
      tagline: '现货开卖 · 官方直降 · PLUS 千元补贴',
      timeline: [
        '10/12 20:00 现货开卖，取消定金预售，至 11/13 24:00',
        '10/31 20:00 开门红爆发期（跨店满减 + 品类券 + 套购补贴）',
        '11/08 PLUS 会员专属日，11/10 20:00 终极狂欢'
      ],
      official: {
        enabled: true,
        rate: 100,
        rateSource: 'cash',
        cashCut: 300,
        note: '京东今年主打「官方直降」，不用算折扣率：直接填商品页上的直降金额（元 / 件）即可，留空则本层不计优惠。'
      },
      order: ['official', 'store', 'categoryCoupon', 'member', 'voucher', 'redPacket', 'tradeIn', 'subsidy'],
      orderNote: '京东官方叠加顺序：商品官方直降 → 店铺券 / 品类满减券 → PLUS 会员 95 折 → 双11 超级红包 → 以旧换新折价 → 国家换新补贴。',
      labels: {
        categoryCoupon: '品类满减券 / 神券',
        voucher: VOUCHERS_JD.label,
        member: 'PLUS 会员 95 折',
        redPacket: '惊喜红包'
      },
      hints: {
        categoryCoupon: '全品类大额券 + 品类券，同级互斥、跨级兼容；家电组合购还可折上再享 7 折。',
        redPacket: '全周期每天可领 60 元额外惊喜红包，晚 8 点加码，可与会员补贴、国补叠加。'
      },
      member: {
        enabled: true,
        rate: 95,
        label: 'PLUS 会员 95 折',
        hint: 'PLUS 标记为「官方直降 → 店铺券 → PLUS 95 折 → 超级补贴券 → 红包 → 以旧换新 → 国补」。'
      },
      voucher: VOUCHERS_JD,
      subsidy: { rate: 15, caps: { general: 0, digital: 500, computer: 1500, appliance: 1500 },
        note: '国补核算基数是「券 + 红包 + 会员折扣后的实付」；大家电封顶 1500 元，手机数码（单价 ≤ 6000 元）封顶 500 元。' },
      tips: [
        '10.12 首发与 10.31 开门红是两个低价窗口，11.11 当天的国补额度与热门型号往往已被消耗。',
        '自营手机、数码、大家电支持签收后 30 天价保，买贵了可申请退差价。',
        '国补慎退：全额退款会消耗当年品类名额，大件先确认型号再付款。',
        '学生认证后可叠加学生券，与国补、红包、PLUS 折扣四重叠加。'
      ],
      sources: [
        { t: '京东 11.11：官方直降 + 每日 60 元惊喜红包 + PLUS 超千元补贴（齐鲁网 / 山东经济广播）', u: 'https://news.iqilu.com/shandong/shandonggedi/20261015/5952711.shtml' },
        { t: '双11 现货开卖：京东取消预售，平台转向会员运营与规则简化（网经社）', u: 'http://www.100ec.cn/detail--6664731.html' },
        { t: '2026 双十一省钱攻略：口令、满减规则、国补入口与叠加顺序', u: 'http://www.redhongan.com/p/279736.html' },
        { t: '双11「抢跑」背后（北京商报 / 东方财富）', u: 'https://finance.eastmoney.com/a/202610123892970885.html' }
      ]
    },

    /* ------------------------------------------------------------------ 拼多多 */
    {
      id: 'pdd',
      name: '拼多多',
      short: '百亿补贴',
      accent: '#e02e24',
      tagline: '平台出钱满减 · 百亿补贴 · 降价补差',
      timeline: [
        '10/13 招商报名开启，10/15 大促正式上线',
        '大促周期内全品类大额满减券持续发放',
        '所有带双11 标识商品启用降价补差（价保）'
      ],
      official: {
        enabled: false,
        rate: 100,
        rateSource: 'cash',
        cashCut: 0,
        note: '拼多多不设官方立减：优惠主要来自平台补贴的大额满减券、百亿补贴价与店铺让利。如果商品页显示「百亿补贴直降」金额，可勾选本层并填入直降金额。'
      },
      order: ['official', 'subsidy', 'store', 'voucher', 'categoryCoupon', 'redPacket', 'tradeIn'],
      orderNote: '拼多多的百亿补贴价通常已是平台补贴后的价格，因此把「百亿补贴 / 平台直降」放在最前面扣减，再叠加店铺券与平台大额券。',
      labels: {
        categoryCoupon: '品类券 / 限时券',
        voucher: VOUCHERS_PDD.label,
        member: '省钱月卡 / 权益',
        redPacket: '无门槛红包'
      },
      hints: {
        categoryCoupon: '大促期间各会场还有品类券与限时券，能否叠加以券面说明为准。',
        redPacket: '多多红包多为无门槛小额券，可多张叠加，但通常不与店铺券同门槛互斥。'
      },
      member: {
        enabled: false,
        rate: 100,
        label: '省钱月卡折扣',
        hint: '省钱月卡以「无门槛券包」形式发放，建议直接在下面「无门槛券」里按面额填写。'
      },
      voucher: VOUCHERS_PDD,
      subsidy: { rate: 15, caps: { general: 0, digital: 500, computer: 1500, appliance: 1500 },
        note: '国补资格与额度按收货地址判定，平台补贴与国补可同时享受。' },
      tips: [
        '带双11 标识的商品都有降价补差：下单后若降价，可直接申请差价赔付。',
        '商家在大促周期内不得随意调低售价，价格承诺比日常更稳。',
        '比价时注意「百亿补贴价」已经是补贴后价格，别把平台补贴重复计算两次。'
      ],
      sources: [
        { t: '拼多多开启 2026 年双11 大促招商（壹览商业）', u: 'https://www.yilantop.com/news/108528' },
        { t: '拼多多 2026 双11 招商开启：低门槛 + 价保政策（甩手网）', u: 'http://shuaishou.com/news/85628.html' },
        { t: '拼多多双11 招商开启：品牌旗舰店可同款同价报名大促（网经社）', u: 'https://www.100ec.cn/detail--6664708.html' }
      ]
    },

    /* ------------------------------------------------------------------ 抖音 */
    {
      id: 'douyin',
      name: '抖音商城',
      short: '抖音',
      accent: '#fe2c55',
      tagline: '不设预售 · 一件直降 · 立减 15%',
      timeline: [
        '10/15 启动，持续至 11/11，共 28 天，全程现货不设预售',
        '10/15—10/18 与 11/07—11/11 两阶段集中投放平台消费券',
        '10/19—11/06 穿插「现货日」「品类日」',
        '价格校验周期自 08/31 起持续至 11/11'
      ],
      official: {
        enabled: true,
        rate: 85,
        note: '同一商品由商家在「立减折扣」与「一件直降」中二选一：立减折扣为报名价基础上立减 15%，一件直降的让利幅度由商家自定（直接在「官方直降金额」填写）。'
      },
      order: ['official', 'store', 'categoryCoupon', 'voucher', 'redPacket', 'tradeIn', 'subsidy'],
      orderNote: '抖音玩法简单：报名价先吃「立减折扣 / 一件直降」，再叠店铺券、平台消费券与国补，购买单件即可享受，无需凑单。',
      labels: {
        categoryCoupon: '店铺品类券 / 达播专属券',
        voucher: VOUCHERS_DOUYIN.label,
        member: '会员权益折扣',
        redPacket: '直播间红包 / 福袋'
      },
      hints: {
        categoryCoupon: '达播间常有专属券，与平台消费券是否互斥以券面规则为准。',
        redPacket: '直播间红包雨、福袋金额可直接抵扣。'
      },
      member: {
        enabled: false,
        rate: 100,
        label: '抖音会员权益折扣',
        hint: '抖音商城会员权益以积分、运费券为主，一般不影响商品价格，默认不勾选。'
      },
      voucher: VOUCHERS_DOUYIN,
      subsidy: { rate: 15, caps: { general: 0, digital: 500, computer: 1500, appliance: 1500 },
        note: '符合条件的耐用消费品可结合国家补贴、平台优惠一起换新。' },
      tips: [
        '抖音不设预售、全程现货，看到合适价格直接下单即可，不用等定金尾款。',
        '平台消费券每日发放，可在抖音端及豆包、红果短剧、今日头条、番茄小说等多端领取。',
        '价格校验自 08/31 起至 11/11，降价可依规则申请价格保护。'
      ],
      sources: [
        { t: '抖音商城「双11」启动：不设预售，多端发放消费券（中证网）', u: 'https://jnzstatic.cs.com.cn/zzb/htmlInfo/135169.html' },
        { t: '2026 年抖音商城双11 招商规则（抖音电商学习中心）', u: 'https://school.jinritemai.com/doudian/web/articlev0/aJqWoaCZesUW' },
        { t: '抖音电商「双11」启动：商品一件立减 15% 起', u: 'https://news.dayoo.com/finance/202510/10/171077_54881917.htm' }
      ]
    }
  ];

  /* 每一层在明细里的展示信息 */
  var STAGE_META = {
    official:       { name: '官方立减 / 官方直降', icon: '官' },
    store:          { name: '店铺券 / 店铺满减',   icon: '店' },
    categoryCoupon: { name: '品类券 / 加补券',     icon: '券' },
    voucher:        { name: '会员专享券',          icon: '会' },
    member:         { name: '会员折扣',            icon: '折' },
    redPacket:      { name: '平台红包 / 无门槛券', icon: '包' },
    subsidy:        { name: '国家以旧换新补贴',    icon: '补' },
    tradeIn:        { name: '旧机折抵',            icon: '旧' }
  };

  var META = {
    year: 2026,
    updatedAt: '2026-10-15',
    notice: '各平台 2026 双11 优惠以「官方立减 / 一件直降」替代沿用多年的跨店满减，规则普遍简化；会员（88VIP / PLUS）成为补贴重点。'
  };

  global.S11 = {
    DEFAULTS: DEFAULTS,
    SUBSIDY: SUBSIDY,
    PLATFORMS: PLATFORMS,
    STAGE_META: STAGE_META,
    META: META
  };
})(window);
