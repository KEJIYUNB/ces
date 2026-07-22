// ==UserScript==
// @name         🌟海角社区【永久免费】无损下载/VIP视频免费看
// @name:zh-CN   🌟海角社区【永久免费】无损下载/VIP视频免费看
// @namespace    haijiao-video-mod-ultimate
// @version      0.0.9
// @description  【全网最强】一键破除海角社区VIP限制，突破加密防盗链直接原画播放。内置高级HLS播放器(长按2X速/画中画)；无损下载(视频/语音)；强力拦截全端弹窗广告；支持自动展开帖子与本地自动登录；修复由于DOM加载时序导致的收费标记失效与广告拦截崩溃问题。
// @description:zh-CN 【全网最强】一键破除海角社区VIP限制，突破加密防盗链直接原画播放。内置高级HLS播放器(长按2X速/画中画)；无损下载(视频/语音)；强力拦截全端弹窗广告；支持自动展开帖子与本地自动登录；修复由于DOM加载时序导致的收费标记失效与广告拦截崩溃问题。
// @author       KEJIYU
// @license      MIT
// @match        *://*.haijiao.com/*
// @match        *://*/post/details*
// @require      https://cdn.jsdelivr.net/npm/jquery@4.0.0
// @connect      ghostbin.lain.la
// @connect      bytebin.lucko.me
// @connect      *
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'touchmove' && (this === document || this === document.body || this === window)) {
            let opts = typeof options === 'object' ? options : { capture: !!options };
            opts.passive = true;
            return originalAddEventListener.call(this, type, listener, opts);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };
})();

const injectAntiAdCss = () => {
    const style = document.createElement('style');
    style.innerHTML = `
        .custom_carousel,
        img[data-id^="banner_"],
        .ad-container,
        [class*="ad-box"],
        aside .el-carousel,
        .sidebar-ad,
        .prompttext,
        .containeradvertising,
        .bannerliststyle,
        .setting-btn,
        .van-icon-setting,
        [class*="setting-icon"],
        .addbox,
        [class*="addbox"],
        .topbanmer,
        [class*="topbanmer"],
        .my-swipe,
        .crossbutton {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1000 !important;
        }

        html.van-overflow-hidden,
        body.van-overflow-hidden,
        html.el-popup-parent--hidden,
        body.el-popup-parent--hidden {
            overflow: auto !important;
            overflow-y: auto !important;
        }

        html, body, #app, .pagecontainer, .van-pull-refresh, .van-list {
            touch-action: pan-x pan-y auto !important;
            overscroll-behavior: auto !important;
        }
    `;
    const appendCss = () => {
        const target = document.head || document.documentElement;
        if (target && !document.getElementById('k-anti-ad-style')) {
            style.id = 'k-anti-ad-style';
            target.appendChild(style);
        }
    };
    appendCss();
    const cssTimer = setInterval(() => {
        if (document.head || document.documentElement) {
            appendCss();
            clearInterval(cssTimer);
        }
    }, 50);
};

injectAntiAdCss();

const injectGlobalFA = () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
    const appendFa = () => {
        const target = document.head || document.documentElement;
        if (target && !document.getElementById('k-fa-style')) {
            link.id = 'k-fa-style';
            target.appendChild(link);
        }
    };
    appendFa();
    const faTimer = setInterval(() => {
        if (document.head || document.documentElement) {
            appendFa();
            clearInterval(faTimer);
        }
    }, 50);
};
injectGlobalFA();

const appEnv = {
    play: false,
    m3Url: "",
    rawStr: "",
    vidUrl: "",
    drawn: false,
    postId: "",
    pics: [],
    audios: [],
    xhrStore: [],
    fetched: false,
    miniPos: null
};
try { appEnv.miniPos = JSON.parse(localStorage.getItem('k_mini_pos')); } catch(e) {}

const priceApp = {
    enableTags: false,
    postMap: {},
    titleMap: {},
    titleList: [],
    debug: false,
    enableJsonDl: false,
    booted: false,
    observer: null,
    retryTimer: null,
    scanTimer: null,
    fetchHooked: false,
    xhrHooked: false
};
const VERSION = '1.1.2';

const normTitle = (s) => String(s || '')
    .replace(/<!---->/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const safeJsonParse = (s) => {
    try {
        return JSON.parse(s);
    } catch (e) {
        return null;
    }
};

const decodeData = (s) => {
    if (typeof s !== 'string') return s;
    try {
        return JSON.parse(atob(atob(atob(s))));
    } catch (e) {}
    try {
        return JSON.parse(atob(atob(s)));
    } catch (e) {}
    try {
        return JSON.parse(atob(s));
    } catch (e) {}
    return s;
};

const isDomNode = (obj) => {
    try {
        return typeof Node !== 'undefined' && obj instanceof Node;
    } catch (e) {
        return false;
    }
};

const isPlainObjectLike = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    if (isDomNode(obj)) return false;
    if (obj === window) return false;
    if (obj === document) return false;
    return true;
};

const getPostTitleFromObj = (obj) => {
    if (!isPlainObjectLike(obj)) return '';
    return normTitle(
        obj.title ||
        obj.subject ||
        obj.topicTitle ||
        obj.topic_title ||
        obj.contentTitle ||
        obj.content_title ||
        obj.postTitle ||
        obj.post_title ||
        obj.name ||
        ''
    );
};

const getPostIdFromObj = (obj) => {
    if (!isPlainObjectLike(obj)) return '';
    const id =
        obj.id ||
        obj.pid ||
        obj.postId ||
        obj.post_id ||
        obj.topicId ||
        obj.topic_id ||
        obj.tid;
    return /^\d+$/.test(String(id || '')) ? String(id) : '';
};

const registerPostObj = (obj) => {
    if (!isPlainObjectLike(obj)) return;
    const id = getPostIdFromObj(obj);
    const title = getPostTitleFromObj(obj);
    if (id) {
        priceApp.postMap[id] = obj;
        window.k_post_map = window.k_post_map || {};
        window.k_post_map[id] = obj;
    }
    if (title) {
        priceApp.titleMap[title] = obj;
        window.k_post_title_map = window.k_post_title_map || {};
        window.k_post_title_map[title] = obj;
        if (!priceApp.titleList.includes(obj)) {
            priceApp.titleList.push(obj);
        }
        window.k_post_title_list = window.k_post_title_list || [];
        if (!window.k_post_title_list.includes(obj)) {
            window.k_post_title_list.push(obj);
        }
    }
};

const traverseForMap = (obj, depth = 0, seen = new WeakSet()) => {
    if (!isPlainObjectLike(obj) && !Array.isArray(obj)) return;
    if (depth > 8) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
        obj.forEach(val => traverseForMap(val, depth + 1, seen));
        return;
    }
    registerPostObj(obj);
    let values = [];
    try {
        values = Object.values(obj);
    } catch (e) {
        return;
    }
    values.forEach(val => {
        if (isPlainObjectLike(val) || Array.isArray(val)) {
            traverseForMap(val, depth + 1, seen);
        }
    });
};

const handleApiPayload = (payload) => {
    if (!payload) return;
    let data = payload;
    if (payload && typeof payload === 'object' && 'data' in payload) {
        data = payload.data;
    }
    if (typeof data === 'string') {
        data = decodeData(data);
    }
    traverseForMap(data);
};

const toNum = (v) => {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {
        const m = v.match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : NaN;
    }
    return NaN;
};

const isTruthy = (v) => {
    if (v === true) return true;
    if (v === 1) return true;
    if (v === '1') return true;
    if (String(v).toLowerCase() === 'true') return true;
    if (String(v).toLowerCase() === 'yes') return true;
    return false;
};

const isFalsy = (v) => {
    if (v === false || v === null || v === undefined || v === '') return true;
    if (v === 0 || v === '0') return true;
    if (String(v).toLowerCase() === 'false') return true;
    if (String(v).toLowerCase() === 'no') return true;
    return false;
};

const makeRes = (state, text) => ({ state, text });

const sameTitle = (a, b) => {
    a = normTitle(a);
    b = normTitle(b);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 8 && b.includes(a)) return true;
    if (b.length >= 8 && a.includes(b)) return true;
    return false;
};

const isFreeText = (s) => {
    s = normTitle(s);
    if (!s) return false;
    return /不收费|不收钱|不要钱|不花钱|不花金币|不需要金币|不收金币|无需金币|免费|免费观看|免费查看|免费阅读|免费内容|随便看|全都不收费|全部不收费|都不收费|不设收费|无收费|零收费/.test(s);
};

const isPaidText = (s) => {
    s = normTitle(s);
    if (!s) return false;
    if (isFreeText(s)) return false;
    return /此处内容售价|本贴售价|本帖售价|购买出售内容|请点击购买|付费内容|收费内容|金币帖|钻石帖|购买后可见|付费可见|付费查看|金币查看|钻石查看|付费阅读|收费阅读|需要购买|需购买|需要支付|需支付|需要付费|需付费|购买可见|购买查看|购买阅读|隐藏内容需购买|出售内容|售卖内容/.test(s);
};

const checkStringPaid = (s) => {
    s = normTitle(s);
    if (!s) {
        return makeRes('unknown', '未知');
    }
    if (isFreeText(s)) {
        return makeRes('free', '免费');
    }
    if (isPaidText(s)) {
        return makeRes('paid', '收费');
    }
    return makeRes('unknown', '未知');
};

const isPriceFieldKey = (k) => {
    const key = String(k || '');
    const lk = key.toLowerCase();
    if (/(user|author|member|wallet|balance|account|my_|vip|view|reply|comment|like|count|total|num_total|id|node|category|level|score|credit_score|fans|follow|reward|tip|donate|gift|award)/i.test(lk)) {
        return false;
    }
    if (/sellprice|sell_price|saleprice|sale_price|topicprice|topic_price|postprice|post_price|contentprice|content_price|needcoin|need_coin|paycoin|pay_coin|coinprice|coin_price|goldprice|gold_price|diamondprice|diamond_price|price|amount|cost|fee|money/i.test(key)) {
        return true;
    }
    return false;
};

const isPaidFlagKey = (k) => {
    const key = String(k || '');
    return /^(is_?sell|is_?selling|need_?pay|need_?buy|is_?paid|is_?pay|charge|charged|fee_?type|sale_?type|sell_?type|pay_?type|permission|unlock_?type|content_?price_?type|sell|sale)$/i.test(key) ||
        /needPay|needBuy|isPaid|isPay|payType|sellType|saleType|unlockType|chargeType|isSell|isSelling/i.test(key);
};

const isPurchasedKey = (k) => {
    const key = String(k || '');
    return /^(is_?buy|has_?buy|buyed|bought|purchased|is_?purchased|has_?purchased)$/i.test(key) ||
        /isBuy|hasBuy|isPurchased|hasPurchased/i.test(key);
};

const isFreeFlagKey = (k) => {
    const key = String(k || '');
    return /^(is_?free|free|free_?flag|free_?view)$/i.test(key) ||
        /isFree|freeFlag|freeView/i.test(key);
};

const shouldSkipBranch = (k, val) => {
    const key = String(k || '');
    if (!isPlainObjectLike(val) && !Array.isArray(val)) return false;
    return /user|author|member|creator|profile|account|wallet|balance|avatar|cover|reply|comment|like|view|browse|stat|medal|vip|tag|node|category|reward|tip|donate|gift|award|recommend|hot|related|ad|banner|rank|message/i.test(key);
};

const scanPaidInfo = (obj, depth = 0, seen = new WeakSet()) => {
    if (obj == null || depth > 8) {
        return makeRes('unknown', '未知');
    }
    if (typeof obj === 'string') {
        return checkStringPaid(obj);
    }
    if (!isPlainObjectLike(obj) && !Array.isArray(obj)) {
        return makeRes('unknown', '未知');
    }

    if (!Array.isArray(obj) && ('money_type' in obj || 'sale' in obj || 'is_sell' in obj)) {
        let localState = 'unknown';
        if ('money_type' in obj) {
            const moneyType = toNum(obj.money_type);
            if (moneyType === 0) localState = 'free';
            else if (moneyType > 0) localState = 'paid';
        }
        if (localState === 'unknown' && 'sale' in obj) {
            if (obj.sale && typeof obj.sale === 'object' && obj.sale.amount > 0) localState = 'paid';
            else if (obj.sale === null || obj.sale === false || obj.sale === '') localState = 'free';
        }
        if (localState === 'unknown' && 'is_sell' in obj) {
            localState = (obj.is_sell === 1 || obj.is_sell === true) ? 'paid' : 'free';
        }

        if (localState !== 'unknown') {
            return makeRes(localState, localState === 'paid' ? '收费' : '免费');
        }
    }

    if (seen.has(obj)) {
        return makeRes('unknown', '未知');
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
        let hasFree = false;
        for (const val of obj) {
            const r = scanPaidInfo(val, depth + 1, seen);
            if (r.state === 'paid') return r;
            if (r.state === 'free') hasFree = true;
        }
        if (hasFree) return makeRes('free', '免费');
        return makeRes('unknown', '未知');
    }

    let paidHit = false;
    let freeHit = false;
    let entries = [];
    try {
        entries = Object.entries(obj);
    } catch (e) {
        return makeRes('unknown', '未知');
    }

    for (const [key, val] of entries) {
        const k = String(key);
        if (shouldSkipBranch(k, val)) {
            continue;
        }
        if (isFreeFlagKey(k)) {
            if (isTruthy(val)) freeHit = true;
            else if (isFalsy(val)) paidHit = true;
        }
        if (isPaidFlagKey(k)) {
            if (isTruthy(val) || (typeof val === 'number' && val > 0)) paidHit = true;
            else if (isFalsy(val)) freeHit = true;
        }
        if (isPurchasedKey(k)) {
            if (isTruthy(val)) paidHit = true;
        }
        if (isPriceFieldKey(k)) {
            const n = toNum(val);
            if (!Number.isNaN(n)) {
                if (n > 0) paidHit = true;
                if (n === 0) freeHit = true;
            }
        }
        if (typeof val === 'string') {
            const r = checkStringPaid(val);
            if (r.state === 'paid') paidHit = true;
            if (r.state === 'free') freeHit = true;
        }
        if (isPlainObjectLike(val) || Array.isArray(val)) {
            const r = scanPaidInfo(val, depth + 1, seen);
            if (r.state === 'paid') paidHit = true;
            if (r.state === 'free') freeHit = true;
        }
    }

    if (paidHit) return makeRes('paid', '收费');
    if (freeHit) return makeRes('free', '免费');
    return makeRes('unknown', '未知');
};

const getCardTitle = (card) => {
    if (!card) return '';
    return normTitle(
        card.querySelector('h4 span[title]')?.getAttribute('title') ||
        card.querySelector('.onepic-tit span[title]')?.getAttribute('title') ||
        card.querySelector('h4')?.innerText ||
        card.querySelector('.onepic-tit')?.innerText ||
        ''
    );
};

const getCleanCardText = (card) => {
    if (!card) return '';
    let clone = null;
    try {
        clone = card.cloneNode(true);
        clone.querySelectorAll('.k-price-tag, .k-price-tag-fixed').forEach(el => el.remove());
        return normTitle(clone.innerText || clone.textContent || '');
    } catch (e) {
        return normTitle(card.innerText || card.textContent || '');
    }
};

const checkDomPaid = (card) => {
    if (!card) return makeRes('unknown', '未知');

    let targetArea = card;
    const header = card.querySelector('.header');
    if (header) {
        targetArea = header;
    } else {
        const listTitle = card.querySelector('.onepic-tit, h4, .t-title');
        if (listTitle && listTitle.parentElement) {
            targetArea = listTitle.parentElement;
        }
    }

    const priceTag = targetArea.querySelector('.currency, .sell-btn, .pay-tag, .vip-tag, [class*="currency"]');
    if (priceTag) {
        const tagText = priceTag.innerText || priceTag.textContent || '';
        if (/售价|金币|钻石|收费|购买/.test(tagText)) return makeRes('paid', '收费');
    }

    const title = getCardTitle(card);
    const titleRes = checkStringPaid(title);
    if (titleRes.state === 'free') return titleRes;
    if (titleRes.state === 'paid') return titleRes;

    if (card.classList.contains('list') || card.classList.contains('list-item')) {
        const text = getCleanCardText(card);
        if (isPaidText(text)) return makeRes('paid', '收费');
        const textRes = checkStringPaid(text);
        if (textRes.state === 'free' || textRes.state === 'paid') return textRes;
    }

    return makeRes('unknown', '未知');
};


const findMapByTitle = (title) => {
    title = normTitle(title);
    if (!title) return null;
    if (priceApp.titleMap[title]) {
        return priceApp.titleMap[title];
    }
    if (window.k_post_title_map && window.k_post_title_map[title]) {
        return window.k_post_title_map[title];
    }
    const pools = [
        ...Object.values(priceApp.postMap || {}),
        ...Object.values(priceApp.titleMap || {}),
        ...(priceApp.titleList || []),
        ...Object.values(window.k_post_map || {}),
        ...Object.values(window.k_post_title_map || {}),
        ...(window.k_post_title_list || [])
    ];
    const used = new Set();
    for (const obj of pools) {
        if (!obj || used.has(obj)) continue;
        used.add(obj);
        const t = getPostTitleFromObj(obj);
        if (sameTitle(title, t)) {
            return obj;
        }
    }
    return null;
};

const deepFindTopicObj = (obj, title, depth = 0, seen = new WeakSet()) => {
    if (!title) return null;
    if (!isPlainObjectLike(obj) && !Array.isArray(obj)) return null;
    if (depth > 7) return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = deepFindTopicObj(item, title, depth + 1, seen);
            if (found) {
                return found;
            }
        }
        return null;
    }
    let objTitle = '';
    try {
        objTitle = getPostTitleFromObj(obj);
    } catch (e) {
        objTitle = '';
    }
    if (objTitle && sameTitle(title, objTitle)) {
        return obj;
    }
    const priorityKeys = [
        'item',
        'topic',
        'post',
        'data',
        'info',
        'row',
        'record',
        'article',
        'detail',
        'content',
        'list',
        'items',
        'topics',
        'posts',
        'articles',
        'records'
    ];
    for (const k of priorityKeys) {
        try {
            const found = deepFindTopicObj(obj[k], title, depth + 1, seen);
            if (found) {
                return found;
            }
        } catch (e) {}
    }
    let values = [];
    try {
        values = Object.values(obj);
    } catch (e) {
        return null;
    }
    for (const v of values) {
        if (isPlainObjectLike(v) || Array.isArray(v)) {
            const found = deepFindTopicObj(v, title, depth + 1, seen);
            if (found) {
                return found;
            }
        }
    }
    return null;
};

const getVueData = (card, title) => {
    let el = card;
    while (el) {
        try {
            if (el.__vue__) {
                const v = el.__vue__;
                const roots = [
                    v,
                    v.$props,
                    v.$data,
                    v.item,
                    v.topic,
                    v.post,
                    v.data,
                    v.info,
                    v.row,
                    v.article,
                    v.record
                ];
                for (const root of roots) {
                    const found = deepFindTopicObj(root, title);
                    if (found) {
                        return found;
                    }
                }
            }
            if (el.__vueParentComponent) {
                const c = el.__vueParentComponent;
                const roots = [
                    c.props,
                    c.data,
                    c.ctx,
                    c.setupState,
                    c.proxy,
                    c.exposed
                ];
                for (const root of roots) {
                    const found = deepFindTopicObj(root, title);
                    if (found) {
                        return found;
                    }
                }
            }
        } catch (e) {}
        el = el.parentElement;
    }
    return null;
};

const getPidFromCard = (card) => {
    if (!card) return '';
    const attrs = [
        'data-id',
        'data-pid',
        'data-topic-id',
        'data-topicid',
        'data-post-id',
        'data-postid',
        'data-tid'
    ];
    const nodes = [
        card,
        ...card.querySelectorAll('[data-id], [data-pid], [data-topic-id], [data-topicid], [data-post-id], [data-postid], [data-tid]')
    ];
    for (const node of nodes) {
        for (const attr of attrs) {
            const val = node.getAttribute?.(attr);
            if (/^\d+$/.test(String(val || ''))) {
                return String(val);
            }
        }
    }
    const links = card.querySelectorAll('a[href]');
    for (const a of links) {
        const href = a.getAttribute('href') || '';
        if (/nodeId=/.test(href)) {
            continue;
        }
        const m =
            href.match(/[?&](?:pid|id|topicId|topic_id|postId|post_id|tid)=(\d+)/) ||
            href.match(/\/(?:post|topic|details|p|t|article)\/(\d+)/);
        if (m) {
            return m[1];
        }
    }
    return '';
};

const removeOldTags = (rightDiv) => {
    if (!rightDiv) return;
    rightDiv.querySelectorAll('.k-price-tag, .k-price-tag-fixed').forEach(el => {
        el.remove();
    });
};

const renderTag = (footer, text, state = 'unknown') => {
    if (!footer) return;
    const rightDiv =
        footer.children[1] ||
        footer.querySelector('div:last-child') ||
        footer;
    if (!rightDiv) return;
    removeOldTags(rightDiv);
    let bgColor = '#f59e0b';
    let shadowColor = 'rgba(245,158,11,0.3)';
    if (state === 'paid') {
        bgColor = '#ef4444';
        shadowColor = 'rgba(239,68,68,0.3)';
    } else if (state === 'free') {
        bgColor = '#10b981';
        shadowColor = 'rgba(16,185,129,0.3)';
    } else if (state === 'loading') {
        bgColor = '#3b82f6';
        shadowColor = 'rgba(59,130,246,0.3)';
    }
    const badgeWrap = document.createElement('span');
    badgeWrap.className = 'k-price-tag-fixed';
    badgeWrap.dataset.kPriceTagFixed = '1';
    badgeWrap.dataset.kPriceFixVersion = VERSION;
    badgeWrap.title = text;
    badgeWrap.innerHTML = `
        <span style="
            padding:2px 6px;
            border-radius:4px;
            font-size:12px;
            margin-left:8px;
            color:#fff;
            background:${bgColor};
            font-weight:bold;
            box-shadow:0 2px 4px ${shadowColor};
            white-space:nowrap;
            line-height:18px;
            display:inline-block;
        ">${text}</span>
    `;
    badgeWrap.style.display = 'inline-block';
    badgeWrap.style.verticalAlign = 'middle';
    rightDiv.appendChild(badgeWrap);
    rightDiv.style.display = 'flex';
    rightDiv.style.alignItems = 'center';
    rightDiv.style.flexWrap = 'wrap';
    footer.dataset.kTagged = '1';
    footer.dataset.kPriceState = state;
    footer.dataset.kPriceText = text;
    footer.dataset.kPriceFixVersion = VERSION;
};

const renderByResult = (footer, res, fallbackFree = false) => {
    if (!res || res.state === 'unknown') {
        if (fallbackFree) {
            renderTag(footer, '免费', 'free');
        } else {
            renderTag(footer, '未知', 'unknown');
        }
        return;
    }
    if (res.state === 'paid') {
        renderTag(footer, '收费', 'paid');
        return;
    }
    if (res.state === 'free') {
        renderTag(footer, '免费', 'free');
        return;
    }
    renderTag(footer, '未知', 'unknown');
};

const getFooterRightDiv = (footer) => {
    if (!footer) return null;
    return footer.children[1] ||
        footer.querySelector('div:last-child') ||
        footer;
};

const processOneFooter = (footer) => {
    if (!footer || !footer.querySelector) {
        return;
    }
    const viewIcon = footer.querySelector('.icon-view');
    if (!viewIcon) {
        return;
    }
    const now = Date.now();
    const rightDiv = getFooterRightDiv(footer);
    const ownTag = !!footer.querySelector(`.k-price-tag-fixed[data-k-price-fix-version="${VERSION}"]`);
    const state = footer.dataset.kPriceState || '';
    const currentVersion = footer.dataset.kPriceFixVersion || '';
    if (ownTag && currentVersion === VERSION && (state === 'paid' || state === 'free')) {
        if (rightDiv) {
            rightDiv.querySelectorAll('.k-price-tag').forEach(el => el.remove());
        }
        return;
    }
    if (state === 'loading') {
        const loadingAt = Number(footer.dataset.kPriceLoadingAt || 0);
        if (now - loadingAt < 15000) {
            return;
        }
    }
    if (ownTag && state === 'unknown') {
        const lastCheck = Number(footer.dataset.kPriceLastCheck || 0);
        if (now - lastCheck < 1500) {
            return;
        }
    }
    footer.dataset.kPriceLastCheck = String(now);
    const card =
        footer.closest('.list.hjbox-container') ||
        footer.closest('.hjbox-container') ||
        footer.closest('.list') ||
        footer.parentElement;
    if (!card) {
        return;
    }
    if (rightDiv) {
        rightDiv.querySelectorAll('.k-price-tag').forEach(el => el.remove());
    }
    const title = getCardTitle(card);
    const domRes = checkDomPaid(card);
    if (domRes.state === 'paid' || domRes.state === 'free') {
        renderByResult(footer, domRes, false);
        return;
    }
    let pid = getPidFromCard(card);
    let dataObj = getVueData(card, title);
    if (!pid) {
        pid = getPostIdFromObj(dataObj);
    }
    if (!dataObj && pid && priceApp.postMap[pid]) {
        dataObj = priceApp.postMap[pid];
    }
    if (!dataObj && pid && window.k_post_map && window.k_post_map[pid]) {
        dataObj = window.k_post_map[pid];
    }
    if (!dataObj && title) {
        dataObj = findMapByTitle(title);
    }
    if (!pid) {
        pid = getPostIdFromObj(dataObj);
    }
    if (dataObj) {
        try {
            traverseForMap(dataObj);
        } catch (e) {}
        const res = scanPaidInfo(dataObj);
        if (priceApp.debug) {
            console.log('[K_PRICE_DEBUG_LOCAL]', {
                pid,
                title,
                data: dataObj,
                result: res
            });
        }
        if (res.state === 'paid' || res.state === 'free') {
            renderByResult(footer, res, false);
            return;
        }
    }
    if (!pid) {
        renderTag(footer, '未知', 'unknown');
        return;
    }
    const lastFetchPid = footer.dataset.kPriceFetchedPid || '';
    const lastFetchAt = Number(footer.dataset.kPriceLastFetchAt || 0);
    if (lastFetchPid === pid && now - lastFetchAt < 60000 && state === 'unknown') {
        return;
    }
    footer.dataset.kPriceFetchedPid = pid;
    footer.dataset.kPriceLastFetchAt = String(now);
    footer.dataset.kPriceLoadingAt = String(now);
    renderTag(footer, '检测中', 'loading');
    fetch(`/api/topic/${pid}`)
        .then(r => r.json())
        .then(pd => {
            let dt = pd && pd.data;
            if (typeof dt === 'string') {
                dt = decodeData(dt);
            }
            try {
                traverseForMap(dt);
            } catch (e) {}
            const res = scanPaidInfo(dt);
            const usableDetail = !!dt && typeof dt === 'object';
            if (priceApp.debug) {
                console.log('[K_PRICE_DEBUG_REMOTE]', {
                    pid,
                    title,
                    data: dt,
                    result: res,
                    usableDetail
                });
            }
            if (res.state === 'paid') {
                renderByResult(footer, res, false);
                return;
            }
            if (res.state === 'free') {
                renderByResult(footer, res, false);
                return;
            }
            if (usableDetail) {
                renderTag(footer, '免费', 'free');
                return;
            }
            renderTag(footer, '未知', 'unknown');
        })
        .catch(err => {
            if (priceApp.debug) {
                console.warn('[K_PRICE_DEBUG_FETCH_ERROR]', pid, title, err);
            }
            renderTag(footer, '未知', 'unknown');
        })
        .finally(() => {
            delete footer.dataset.kPriceLoadingAt;
        });
};

const renderMobileTag = (parentEl, state, card) => {
    if (!parentEl) return;
    const oldTags = parentEl.querySelectorAll('.k-price-tag-fixed');
    oldTags.forEach(el => el.remove());

    let text = '未知';
    let bgColor = '#f59e0b';
    if (state === 'paid') { text = '收费'; bgColor = '#ef4444'; }
    else if (state === 'free') { text = '免费'; bgColor = '#10b981'; }
    else if (state === 'loading') { text = '检测中...'; bgColor = '#3b82f6'; }

    const tag = document.createElement('span');
    tag.className = 'k-price-tag-fixed';
    tag.style.cssText = `padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px; color: #fff; background: ${bgColor}; font-weight: bold; display: inline-block; vertical-align: middle;`;
    tag.innerText = text;

    parentEl.appendChild(tag);
    if (state !== 'loading') {
        card.dataset.kTagged = '1';
    }
};

const processMobileList = (card) => {
    if (card.dataset.kTagged === '1') return;
    const titleEl = card.querySelector('.t-title');
    if (!titleEl) return;

    let pid = getPidFromCard(card);
    let title = card.innerText || '';

    let dataObj = getVueData(card, title);
    if (!dataObj && pid && priceApp.postMap[pid]) {
        dataObj = priceApp.postMap[pid];
    }

    if (dataObj) {
        const res = scanPaidInfo(dataObj);
        if (res.state === 'paid' || res.state === 'free') {
            renderMobileTag(titleEl, res.state, card);
            return;
        }
    }

    const text = card.innerText || '';
    if (/钻石|金币|售价|收费|购买|付费/.test(text)) {
        renderMobileTag(titleEl, 'paid', card);
        return;
    }

    if (pid) {
        renderMobileTag(titleEl, 'loading', card);
        fetch(`/api/topic/${pid}`)
            .then(r => r.json())
            .then(pd => {
                let dt = pd && pd.data;
                if (typeof dt === 'string') dt = decodeData(dt);
                const res = scanPaidInfo(dt);
                if (res.state === 'paid' || res.state === 'free') {
                    renderMobileTag(titleEl, res.state, card);
                } else {
                    renderMobileTag(titleEl, 'free', card);
                }
            }).catch(() => {
                renderMobileTag(titleEl, 'unknown', card);
            });
    } else {
        renderMobileTag(titleEl, 'unknown', card);
    }
};

const processMobileFooter = (footer) => {
    if (footer.dataset.kTagged === '1') return;

    const buyBtn = footer.querySelector('.buypost-btn');
    let state = buyBtn ? 'paid' : 'free';

    if (buyBtn) {
        const priceText = buyBtn.innerText || '';
        if (/钻石|金币|售价|收费|购买|付费/.test(priceText)) {
            state = 'paid';
        }
    }

    const tag = document.createElement('span');
    tag.className = 'k-price-tag-fixed';
    tag.style.cssText = `padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px; color: #fff; background: ${state === 'paid' ? '#ef4444' : '#10b981'}; font-weight: bold; display: inline-block; vertical-align: middle;`;
    tag.innerText = state === 'paid' ? '收费' : '免费';

    footer.appendChild(tag);
    footer.dataset.kTagged = '1';
};

const processFeedItems = () => {
    if (!priceApp.enableTags) return;
    if (!document.body) return;

    const desktopFooters = Array.from(document.querySelectorAll('.justify-content-between'));
    desktopFooters.forEach(footer => {
        try { processOneFooter(footer); } catch (e) {}
    });

    const mobileDetails = Array.from(document.querySelectorAll('.title-type'));
    mobileDetails.forEach(container => {
        try { processMobileFooter(container); } catch (e) {}
    });

    const mobileLists = Array.from(document.querySelectorAll('.list-item'));
    mobileLists.forEach(card => {
        try { processMobileList(card); } catch (e) {}
    });
};

const scheduleProcess = (delay = 200) => {
    clearTimeout(priceApp.scanTimer);
    priceApp.scanTimer = setTimeout(() => {
        processFeedItems();
    }, delay);
};

const startPriceObserver = () => {
    if (!document.body) return;
    if (priceApp.observer) return;
    priceApp.observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const m of mutations) {
            if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
                shouldCheck = true;
                break;
            }
        }
        if (shouldCheck) {
            scheduleProcess(300);
        }
    });
    priceApp.observer.observe(document.body, {
        childList: true,
        subtree: true
    });
};

const startPriceRetry = () => {
    if (priceApp.retryTimer) return;
    let retryCount = 0;
    priceApp.retryTimer = setInterval(() => {
        retryCount++;
        processFeedItems();
        if (retryCount > 40) {
            clearInterval(priceApp.retryTimer);
            priceApp.retryTimer = null;
        }
    }, 1000);
};

const D1 = "ABCD*EFGHIJKLMNOPQRSTUVWX#YZabcdefghijklmnopqrstuvwxyz1234567890";
const D2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const netHelper = {
    pushLain: (t) => new Promise(r => {
        if (typeof GM_xmlhttpRequest === "undefined") return r("");
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://bytebin.lucko.me/post",
            headers: {
                "Content-Type": "text/plain; charset=utf-8"
            },
            data: t,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.key) {
                        return r(`https://bytebin.lucko.me/${data.key}`);
                    }
                } catch(e) {}
                const f = new FormData();
                f.append("text", t);
                f.append("lang", "text");
                f.append("expire", "-1");
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "https://ghostbin.lain.la/paste/new",
                    data: f,
                    onload: (res2) => {
                        if (res2.finalUrl && res2.finalUrl.includes('/paste/')) {
                            return r(res2.finalUrl + '/raw');
                        }
                        const mk = String(res2.response).match(/href=["']([^"']+\/(?:raw|download))["']/i);
                        r(mk ? `https://ghostbin.lain.la${mk[1]}` : "");
                    },
                    onerror: () => r("")
                });
            },
            onerror: () => r("")
        });
    }),
    check: async (u) => {
        try {
            return (await fetch(u, { method: "HEAD", redirect: "follow" })).status !== 404;
        } catch (e) {
            return false;
        }
    }
};

const domUtils = {
    makeEle: (tag, attrs = {}) => {
        const el = document.createElement(tag);
        for (const k in attrs) {
            if (k === 'css') el.style.cssText = attrs[k];
            else if (k === 'html') el.innerHTML = attrs[k];
            else el[k] = attrs[k];
        }
        return el;
    },
    getBox: () => document.querySelector("span.sell-btn") || document.querySelector("div.pagecontainer") || document.querySelector("div.publicContainer")
};

const cryptoHelper = {
    swap: (s) => [...s].map(c => D1.indexOf(c) === -1 ? c : D2[D1.indexOf(c)]).join(''),
    dec: (s) => decodeURIComponent([...atob(cryptoHelper.swap(s))].map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join('')),
    unJson: (s) => {
        try { return JSON.parse(atob(atob(atob(s)))); } catch (e) { return s; }
    }
};

const blockClipboardHijack = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText = function(text) {
            return Promise.resolve();
        };
    }
    const oExec = document.execCommand;
    document.execCommand = function(cmd) {
        if (String(cmd).toLowerCase() === 'copy') {
            return true;
        }
        return oExec.apply(this, arguments);
    };
    window.addEventListener('copy', (e) => {
        if (!e.isTrusted) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
};
blockClipboardHijack();

const hijackNetwork = () => {
    if (!priceApp.fetchHooked && typeof window.fetch === 'function') {
        priceApp.fetchHooked = true;
        const originalFetch = window.fetch;
        window.fetch = async function() {
            try {
                const response = await originalFetch.apply(this, arguments);
                try {
                    const clone = response.clone();
                    clone.json().then(payload => {
                        handleApiPayload(payload);
                        scheduleProcess(80);
                    }).catch(() => {});
                } catch (e) {}
                return response;
            } catch (err) {
                throw err;
            }
        };
    }

    if (!priceApp.xhrHooked && typeof XMLHttpRequest !== 'undefined') {
        priceApp.xhrHooked = true;
        const oOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(m, u) {
            try {
                this.__k_price_url = String(u || '');
            } catch (e) {}
            if (typeof u === 'string' && u.includes("/api/attachment")) {
                this.addEventListener("readystatechange", function() {
                    if (this.readyState === 4 && this.responseText) {
                        try {
                            const p = JSON.parse(this.responseText);
                            if (p && p.data) appEnv.xhrStore.push(cryptoHelper.unJson(p.data));
                        } catch (e) {}
                    }
                });
            }
            this.addEventListener('readystatechange', function() {
                if (this.readyState !== 4) return;
                if (!this.responseText) return;
                const payload = safeJsonParse(this.responseText);
                if (payload) {
                    handleApiPayload(payload);
                    scheduleProcess(80);
                }
            });
            return oOpen.apply(this, arguments);
        };
    }
};
hijackNetwork();

const buildUi = () => {
    if (appEnv.drawn || !document.body) return;
    appEnv.drawn = true;

    const showTg = (cb) => {
        const md = domUtils.makeEle('div', { css: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(5px);' });
        md.innerHTML = `<div style="background:white;padding:25px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.4);max-width:85%;width:300px;-webkit-font-smoothing:antialiased;"><h3 style="margin:0 0 15px 0;color:#333;font-size:18px;">邀请您加入电报群组</h3><p style="margin:0 0 5px 0;color:#555;font-size:14px;">及时获取更新通知，防止失联</p><p style="margin:0 0 20px 0;color:red;font-size:12px;text-align:center;">(不强制加入)</p><a href="https://t.me/Kmodify" target="_blank" style="display:block;margin-bottom:20px;color:#0088cc;font-size:15px;font-weight:bold;text-decoration:none;background:#e6f3fa;padding:10px;border-radius:8px;transition:0.2s;"><i class="fab fa-telegram-plane"></i> 点击跳转电报群</a><button id="md-ok" style="background:#f1f1f1;color:#666;border:none;padding:10px 30px;border-radius:20px;font-size:14px;cursor:pointer;font-weight:bold;">关闭</button></div>`;
        document.body.appendChild(md);
        document.getElementById('md-ok').onclick = () => { md.remove(); if (cb) cb(); };
    };

    const showInitModal = (cb) => {
        if (document.getElementById('combined-overlay')) {
            const overlay = document.getElementById('combined-overlay');
            overlay.style.display = 'flex';
            const agreeCheck = document.getElementById('agree-check');
            const btnStart = document.getElementById('btn-start');
            const policyDetail = document.getElementById('policy-detail');
            agreeCheck.checked = false;
            btnStart.classList.add('is-disabled');
            policyDetail.style.display = 'none';
            overlay.hasViewedPolicy = false;
            overlay.cb = cb;
            return;
        }

        const overlay = domUtils.makeEle('div', { id: 'combined-overlay', css: 'display:flex;' });
        overlay.innerHTML = `
            <div class="dialog-box">
                <h3>欢迎使用本脚本</h3>
                <div class="tg-section">
                    <p>及时获取更新通知，防止失联</p>
                    <p class="tg-note">(不强制加入，后续想加可点击右侧 K 头像)</p>
                    <a href="https://t.me/Kmodify" target="_blank" class="tg-btn">
                        <i class="fab fa-telegram-plane"></i> 点击跳转电报群
                    </a>
                </div>
                <div class="divider"></div>
                <div class="privacy-section">
                    <p class="privacy-desc">为保障您的数据安全，请阅读以下协议：</p>
                    <div id="policy-detail">
                        <div class="policy-detail-title">1. 数据处理：纯本地运行</div>
                        本脚本的所有功能全部在您的浏览器本地进行计算与存储。我们没有任何云端服务器，绝对不存在任何将您的个人数据、浏览记录或账号信息上传至网络的逻辑。
                        <br><br>
                        <div class="policy-detail-title">2. 平台属性：开源与权威</div>
                        本脚本运行依赖的技术平台均为开源且受业界广泛监督的权威平台，拒绝引入任何闭源商业插件。
                        <br><br>
                        <div class="policy-detail-title">3. 协议生效</div>
                        您必须在点击查看本协议后方可勾选同意。一旦授权，即代表您认可我们的纯本地处理机制。
                    </div>
                    <div class="check-area">
                        <input type="checkbox" id="agree-check">
                        <label for="agree-check">我已阅读并同意 <span id="view-policy-btn">《隐私协议》</span></label>
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn-cancel" id="btn-cancel">拒绝并关闭</button>
                    <button class="btn-start is-disabled" id="btn-start">开始使用</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const toast = domUtils.makeEle('div', { id: 'toast' });
        document.body.appendChild(toast);
        let toastTimer = null;
        const showToast = (msg) => {
            clearTimeout(toastTimer);
            toast.innerText = msg;
            toast.style.display = 'block';
            toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
        };

        overlay.hasViewedPolicy = false;
        overlay.cb = cb;

        const viewPolicyBtn = document.getElementById('view-policy-btn');
        const policyDetail = document.getElementById('policy-detail');
        const agreeCheck = document.getElementById('agree-check');
        const btnStart = document.getElementById('btn-start');
        const btnCancel = document.getElementById('btn-cancel');

        viewPolicyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.hasViewedPolicy = true;
            policyDetail.style.display = 'block';
        });

        agreeCheck.addEventListener('click', (e) => {
            if (!overlay.hasViewedPolicy) {
                e.preventDefault();
                agreeCheck.checked = false;
                showToast("您未查看隐私协议");
            }
        });

        agreeCheck.addEventListener('change', (e) => {
            if (overlay.hasViewedPolicy && e.target.checked) {
                btnStart.classList.remove('is-disabled');
            } else {
                btnStart.classList.add('is-disabled');
            }
        });

        btnStart.addEventListener('click', () => {
            if (!overlay.hasViewedPolicy) {
                showToast("您未查看隐私协议");
                return;
            }
            if (!agreeCheck.checked) {
                showToast("请先勾选同意隐私协议");
                return;
            }
            overlay.style.display = 'none';
            if (overlay.cb) overlay.cb();
        });

        btnCancel.addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    };

    document.head.appendChild(domUtils.makeEle('style', { html: `
        #s-btn { position: fixed; left: 20px; top: 50%; transform: translateY(-50%); z-index: 2147483640; transition: all 0.3s; cursor: pointer; padding: 10px; display: none; opacity: 0; }
        #s-btn i { color: #ff477e; text-shadow: 0 4px 12px rgba(255,71,126,0.4); font-size: 28px; }
        #m-box { position: fixed; top: 50%; transform: translate(0, -50%); right: 10px; width: 48px; border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 2147483640; transition: all 0.3s cubic-bezier(0.25,0.8,0.25,1); display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 20px; background: #282830; border: 1px solid rgba(255,255,255,0.08); }
        .b-itm { position: relative; width: 100%; display: flex; justify-content: center; align-items: center; cursor: pointer; }
        .b-itm i { color: #d4d4d8; font-size: 20px; transition: all 0.2s; }
        .b-itm:hover i { transform: scale(1.15); color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); }
        .i-ava img { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #ff477e; box-shadow: 0 0 10px rgba(255,71,126,0.3); }
        .d-dot::after { content: ''; position: absolute; top: -3px; right: 10px; width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px rgba(16,185,129,0.6); border: 1px solid #282830; }
        #sub-dl { position: absolute; right: 60px; bottom: 0; background: #282830; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 10px; opacity: 0; pointer-events: none; transition: all 0.3s ease; transform: translateX(20px); box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 2147483641; }
        #sub-dl.active { opacity: 1; pointer-events: auto; transform: translateX(0); }
        .sub-btn { color: #d4d4d8; font-size: 14px; padding: 8px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 8px; transition: all 0.2s; background: rgba(255,255,255,0.05); }
        .sub-btn:hover { background: rgba(255,71,126,0.2); color: #fff; }
        #combined-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2147483645; display: none; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
        .dialog-box { background: #ffffff; color: #333; width: 90%; max-width: 360px; border-radius: 16px; padding: 25px; box-shadow: 0 10px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 15px; -webkit-font-smoothing: antialiased; }
        .dialog-box h3 { margin: 0; font-size: 18px; text-align: center; color: #222; }
        .tg-section { background: #f8f9fa; border: 1px dashed #ccc; border-radius: 8px; padding: 15px; text-align: center; }
        .tg-section p { margin: 0 0 5px 0; color: #555; font-size: 14px; }
        .tg-section .tg-note { margin: 0 0 15px 0; color: red; font-size: 12px; }
        .tg-btn { display: block; color: #0088cc; font-size: 15px; font-weight: bold; text-decoration: none; background: #e6f3fa; padding: 10px; border-radius: 8px; transition: 0.2s; }
        .tg-btn:hover { background: #d0eaf8; }
        .divider { height: 1px; background: #eee; margin: 5px 0; }
        .privacy-section { display: flex; flex-direction: column; gap: 10px; }
        .privacy-desc { font-size: 13px; color: #666; text-align: center; margin: 0; }
        #policy-detail { display: none; background: #f8f9fa; border: 1px solid #eee; border-radius: 8px; padding: 12px; font-size: 12px; color: #555; line-height: 1.6; max-height: 150px; overflow-y: auto; }
        .policy-detail-title { font-weight: bold; color: #333; margin-bottom: 3px; }
        .check-area { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; }
        .check-area input[type="checkbox"] { width: 16px; height: 16px; accent-color: #ff477e; cursor: pointer; }
        #view-policy-btn { color: #ff477e; text-decoration: underline; font-weight: bold; cursor: pointer; }
        .btn-group { display: flex; gap: 10px; margin-top: 5px; }
        .btn-cancel { flex: 1; background: #f1f1f1; color: #666; border: none; padding: 12px; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s; }
        .btn-cancel:hover { background: #e2e2e2; }
        .btn-start { flex: 1; background: #ff477e; color: #fff; border: none; padding: 12px; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s; }
        .btn-start.is-disabled { opacity: 0.5; }
        .btn-start:not(.is-disabled):hover { background: #e63e70; box-shadow: 0 4px 12px rgba(255,71,126,0.3); }
        #toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0, 0, 0, 0.85); color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: normal; box-shadow: 0 4px 16px rgba(0,0,0,0.3); display: none; z-index: 2147483647 !important; text-align: center; white-space: nowrap; -webkit-font-smoothing: antialiased; backdrop-filter: blur(4px); }
    `}));

    const sBtn = domUtils.makeEle('div', { id: 's-btn', html: '<i class="fas fa-eye"></i>' });
    const mBox = domUtils.makeEle('div', { id: 'm-box', html: `
        <div class="b-itm i-ava" id="a-tg"><img src="https://ui-avatars.com/api/?name=K&background=1085ba&color=fff&rounded=true" /></div>
        <div class="b-itm d-dot" id="a-ply"><i class="far fa-play-circle" style="font-size:24px;"></i></div>
        <div class="b-itm" id="a-cmt"><i class="far fa-comment-dots" style="font-size:20px;"></i></div>
        <div class="b-itm" id="a-hd"><i class="fas fa-eye-slash" style="font-size:18px;"></i></div>
        <div class="b-itm d-dot" id="a-more"><i class="fas fa-ellipsis-h" style="font-size:18px;"></i></div>
        <div id="sub-dl">
            <div class="sub-btn" id="sd-tag"><i class="fas fa-tags"></i> <span>开启收费检测</span></div>
            <div class="sub-btn" id="sd-vid"><i class="fas fa-video"></i> 下载视频</div>
            <div class="sub-btn" id="sd-aud"><i class="fas fa-music"></i> 下载语音</div>
            ${priceApp.enableJsonDl ? '<div class="sub-btn" id="sd-json"><i class="fas fa-download"></i> 下载json</div>' : ''}
        </div>
    `});

    document.body.appendChild(sBtn);
    document.body.appendChild(mBox);

    document.getElementById('a-tg').onclick = () => showTg();

    document.getElementById('a-more').onclick = () => {
        document.getElementById('sub-dl').classList.toggle('active');
    };

    document.getElementById('sd-tag').onclick = () => {
        priceApp.enableTags = !priceApp.enableTags;
        const btn = document.getElementById('sd-tag');
        if (priceApp.enableTags) {
            btn.innerHTML = '<i class="fas fa-tags" style="color:#10b981;"></i> <span>关闭收费检测</span>';
            startPriceObserver();
            processFeedItems();
            document.getElementById('sub-dl').classList.remove('active');
        } else {
            btn.innerHTML = '<i class="fas fa-tags"></i> <span>开启收费检测</span>';
            if (priceApp.observer) {
                priceApp.observer.disconnect();
                priceApp.observer = null;
            }
            clearTimeout(priceApp.scanTimer);
            clearInterval(priceApp.retryTimer);
            priceApp.retryTimer = null;
            document.querySelectorAll('.k-price-tag-fixed').forEach(el => el.remove());
            document.querySelectorAll('[data-k-tagged]').forEach(el => delete el.dataset.kTagged);
            document.getElementById('sub-dl').classList.remove('active');
        }
    };

    document.getElementById('a-hd').onclick = () => {
        document.getElementById('sub-dl').classList.remove('active');
        mBox.style.transform = "translate(150%, -50%)";
        mBox.style.opacity = "0";
        setTimeout(() => {
            sBtn.style.display = "block";
            setTimeout(() => { sBtn.style.opacity = "1"; sBtn.style.transform = "translateY(-50%)"; }, 50);
        }, 300);
    };

    sBtn.onclick = () => {
        sBtn.style.transform = "translate(-100px, -50%)";
        sBtn.style.opacity = "0";
        setTimeout(() => {
            sBtn.style.display = "none";
            mBox.style.transform = "translate(0, -50%)";
            mBox.style.opacity = "1";
        }, 300);
    };

    document.getElementById('a-cmt').onclick = () => {
        let targetEl = document.querySelector('li[data-floor-index="1"], .floor-show.hjbox-container, ul.floor-list');
        if (!targetEl) {
            const xpath = '//*[contains(text(),"海角社区客服联系方式") or contains(text(),"haijiao2029@proton.me")]';
            const anchorNodes = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < anchorNodes.snapshotLength; i++) {
                let node = anchorNodes.snapshotItem(i);
                if (node && node.offsetHeight > 0) {
                    targetEl = node.tagName === 'SPAN' ? node.parentElement : node;
                    break;
                }
            }
        }
        if (targetEl) {
            const offset = targetEl.getBoundingClientRect().top - 120;
            window.scrollBy({ top: offset, behavior: 'smooth' });
            const scrollBoxes = document.querySelectorAll('.pagescroll-box, .pagecontainer');
            for (let i = 0; i < scrollBoxes.length; i++) {
                scrollBoxes[i].scrollBy({ top: offset, behavior: 'smooth' });
            }
        } else {
            const ix = document.querySelector("#a-cmt i");
            const oc = ix.className;
            ix.className = "fas fa-times";
            ix.style.color = "#ff477e";
            setTimeout(() => {
                ix.className = oc;
                ix.style.color = "";
            }, 1000);
        }
    };

    if (document.getElementById('sd-json')) {
        document.getElementById('sd-json').onclick = async () => {
            const ix = document.querySelector("#sd-json i");
            const oc = ix ? ix.className : "";
            if (ix) ix.className = "fas fa-spinner fa-spin";
            try {
                let curPid = appEnv.postId || (window.location.href.match(/[?&](?:pid|id|topicId|topic_id|postId|post_id|tid)=(\d+)/) || window.location.href.match(/\/(?:post|topic|details|p|t|article)\/(\d+)/) || [])[1];
                let dlData = null;
                let dlName = "page_data.json";
                if (curPid) {
                    dlName = `post_${curPid}.json`;
                    try {
                        const res = await fetch(`/api/topic/${curPid}`).then(r => r.json());
                        dlData = res && res.data ? decodeData(res.data) : res;
                    } catch(e) {
                        dlData = priceApp.postMap[curPid] || window.k_post_map?.[curPid] || null;
                    }
                }
                if (!dlData) {
                    dlData = { url: window.location.href, postMap: priceApp.postMap, titleMap: priceApp.titleMap };
                    dlName = "haijiao_page_debug.json";
                }
                const blob = new Blob([JSON.stringify(dlData, null, 2)], { type: "application/json;charset=utf-8;" });
                const bu = URL.createObjectURL(blob);
                const a = domUtils.makeEle('a', { href: bu, download: dlName });
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(bu);
            } catch (err) {
                alert("获取 JSON 失败: " + err.message);
            } finally {
                if (ix) ix.className = oc;
                document.getElementById('sub-dl').classList.remove('active');
            }
        };
    }

    document.getElementById('sd-aud').onclick = async () => {
        const ix = document.querySelector("#sd-aud i");
        const oc = ix.className;
        ix.className = "fas fa-spinner fa-spin";

        await exeCore(false);

        if (!appEnv.audios.length) {
            ix.className = oc;
            document.getElementById('sub-dl').classList.remove('active');
            alert("该帖子暂无语音可以下载");
            return;
        }

        appEnv.audios.forEach((u, i) => {
            fetch(u).then(r => r.blob()).then(blob => {
                const bu = URL.createObjectURL(blob);
                const a = domUtils.makeEle('a', { href: bu, download: `audio_${i + 1}.mp3` });
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(bu);
            }).catch(()=>{});
        });

        ix.className = oc;
        document.getElementById('sub-dl').classList.remove('active');
    };

    document.getElementById('sd-vid').onclick = async () => {
        const ix = document.querySelector("#sd-vid i");
        const oc = ix.className;
        ix.className = "fas fa-spinner fa-spin";

        await exeCore(false);

        if (!appEnv.rawStr && !appEnv.vidUrl) {
            ix.className = oc;
            document.getElementById('sub-dl').classList.remove('active');
            alert("该帖子暂无视频可以下载");
            return;
        }

        let rawTtl = document.querySelector(".header .position-relative span:first-child")?.textContent || "video";
        const ttl = rawTtl.trim().replace(/[/\\?%*:|"<>]/g, '-');

        if (appEnv.vidUrl) {
            window.open(`https://m3u8player.app/zh-CN/m3u8-downloader/?video_url=${encodeURIComponent(appEnv.vidUrl)}&id=${appEnv.postId}&filename=${ttl}`, '_blank');
        } else if (appEnv.rawStr) {
            const l = await netHelper.pushLain(appEnv.rawStr);
            if (l) window.open(`https://m3u8player.app/zh-CN/m3u8-downloader/?video_url=${encodeURIComponent(l)}&id=${appEnv.postId}&filename=${ttl}`, '_blank');
        }

        ix.className = oc;
        document.getElementById('sub-dl').classList.remove('active');
    };

    document.getElementById('a-ply').onclick = (e) => {
        e.preventDefault();
        if (!localStorage.getItem('k_agreed_policy')) {
            showInitModal(() => {
                localStorage.setItem('k_agreed_policy', '1');
                exeCore(true);
            });
        } else {
            exeCore(true);
        }
    };
};

const initAutoLogin = () => {
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.login-form-button, .login-btn, button[class*="login"]');
        if (btn) {
            const uInp = document.querySelector('input[placeholder="请输入用户名"], input[placeholder="请输入账号"], .login-form input[type="text"], .login-box input[type="text"]');
            const pInp = document.querySelector('input[placeholder="请输入密码"], .login-form input[type="password"], .login-box input[type="password"]');
            if (uInp && pInp && uInp.value && pInp.value && !localStorage.getItem('hj_user_acc')) {
                const md = domUtils.makeEle('div', { css: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;justify-content:center;align-items:center;' });
                md.innerHTML = `<div style="background:white;padding:25px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.4);max-width:85%;width:300px;"><h3 style="margin:0 0 15px 0;color:#333;font-size:18px;">保存登录信息</h3><p style="margin:0 0 5px 0;color:#555;font-size:14px;">账号密码帮你缓存到本地，下次自动登录？</p><p style="margin:0 0 20px 0;color:red;font-size:12px;">纯本地功能，不会上传任何服务器或者是云端</p><div style="display:flex;justify-content:space-between;gap:10px;"><button id="md-no" style="flex:1;background:#ddd;color:#333;border:none;padding:10px;border-radius:20px;cursor:pointer;">否</button><button id="md-yes" style="flex:1;background:#ff477e;color:white;border:none;padding:10px;border-radius:20px;cursor:pointer;">是</button></div></div>`;
                document.body.appendChild(md);
                document.getElementById('md-no').onclick = () => md.remove();
                document.getElementById('md-yes').onclick = () => {
                    localStorage.setItem('hj_user_acc', JSON.stringify({u: uInp.value, p: pInp.value}));
                    md.remove();
                };
            }
        }
    }, true);

    setInterval(() => {
        const box = document.querySelector('.login-box, .login-form');
        if (box && !box.dataset.filled) {
            box.dataset.filled = '1';
            const acc = localStorage.getItem('hj_user_acc');
            if (acc) {
                try {
                    const {u, p} = JSON.parse(acc);
                    const uInp = box.querySelector('input[placeholder="请输入用户名"], input[placeholder="请输入账号"], input[type="text"]');
                    const pInp = box.querySelector('input[placeholder="请输入密码"], input[type="password"]');
                    const btn = box.querySelector('.login-form-button, .login-btn, button[class*="login"]');
                    if (uInp && pInp && btn) {
                        uInp.value = u; uInp.dispatchEvent(new Event('input', {bubbles: true}));
                        pInp.value = p; pInp.dispatchEvent(new Event('input', {bubbles: true}));
                        setTimeout(() => { btn.click(); }, 500);
                    }
                } catch(e) {}
            }
        }
    }, 1000);
};

const setPly = () => {
    if (document.getElementById("p-wrap") || !document.body) return;
    document.head.appendChild(domUtils.makeEle('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.8/hls.min.js' }));

    const vStyle = domUtils.makeEle('style', { html: `
        #h-vd { accent-color: #ff477e; }
        #h-vd::-webkit-media-controls-panel,
        #h-vd::-webkit-media-controls-enclosure {
            background: transparent !important;
            background-image: none !important;
            background-color: transparent !important;
            box-shadow: none !important;
        }
        .hide-center-play::-webkit-media-controls-overlay-play-button {
            display: none !important;
        }
        .mini-btn {
            opacity: 0.3 !important;
            transition: opacity 0.3s;
        }
        #p-wrap:hover .mini-btn, #p-wrap.k-active .mini-btn {
            opacity: 1 !important;
        }
        .k-resizer {
            position: absolute;
            width: 30px;
            height: 30px;
            z-index: 9999999;
            display: none;
        }
        #p-wrap[data-mini="1"] .k-resizer { display: block; }
        .k-resizer-tl { top: -15px; left: -15px; cursor: nwse-resize; }
        .k-resizer-tr { top: -15px; right: -15px; cursor: nesw-resize; }
        .k-resizer-bl { bottom: -15px; left: -15px; cursor: nesw-resize; }
        .k-resizer-br { bottom: -15px; right: -15px; cursor: nwse-resize; }
        #p-wrap.k-idle { cursor: none !important; }
        #p-wrap.k-idle > button { opacity: 0 !important; pointer-events: none !important; transition: all 0.3s ease; }
    `});
    document.head.appendChild(vStyle);

    const fullStyle = 'position:fixed;left:0px;top:0px;width:100vw;height:100vh;bottom:auto;right:auto;background:rgba(0,0,0,0.95);padding:10px;box-sizing:border-box;z-index:9999996;display:none;justify-content:center;align-items:center;overflow:hidden;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);';
    const wp = domUtils.makeEle('div', { id: 'p-wrap', css: fullStyle });
    const cl = domUtils.makeEle('button', { html: '<i class="fas fa-times"></i>', css: 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;z-index:10000000;display:flex;align-items:center;justify-content:center;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);' });
    const pip = domUtils.makeEle('button', { html: '<i class="fas fa-clone"></i>', css: 'position:absolute;top:20px;right:70px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:18px;cursor:pointer;z-index:10000000;display:flex;align-items:center;justify-content:center;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);' });
    const sp = domUtils.makeEle('div', { innerText: '▶▶ 2X', css: 'position:absolute;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:white;padding:6px 18px;border-radius:20px;font-size:14px;font-weight:bold;display:none;z-index:9999999;pointer-events:none;' });
    const vd = domUtils.makeEle('video', { id: 'h-vd', controls: true, playsinline: true, 'webkit-playsinline': true, css: 'width:100%;height:100%;object-fit:contain;outline:none;pointer-events:auto;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);' });

    const rTl = domUtils.makeEle('div', { className: 'k-resizer k-resizer-tl' });
    const rTr = domUtils.makeEle('div', { className: 'k-resizer k-resizer-tr' });
    const rBl = domUtils.makeEle('div', { className: 'k-resizer k-resizer-bl' });
    const rBr = domUtils.makeEle('div', { className: 'k-resizer k-resizer-br' });

    vd.disablePictureInPicture = true;
    vd.setAttribute('controlsList', 'nodownload noplaybackrate');

    wp.append(sp, vd, pip, cl, rTl, rTr, rBl, rBr);
    document.body.appendChild(wp);

    window.addEventListener('storage', (e) => {
        if (e.key === 'k_vid_takeover') {
            const pWrap = document.getElementById('p-wrap');
            const hVd = document.getElementById('h-vd');
            if (pWrap && pWrap.style.display !== 'none') {
                if (hVd && !hVd.paused) hVd.pause();
                pWrap.style.display = 'none';
                if (window.hlsInstance) window.hlsInstance.destroy();
                appEnv.play = false;
            }
        }
    });

    let isMini = false;
    let hasDragged = false;
    let isAnimating = false;
    let animTimer = null;
    let pWrapIdleTimer = null;

    const resetIdle = () => {
        if (wp.dataset.mini || wp.style.display === "none") return;
        wp.classList.remove('k-idle');
        clearTimeout(pWrapIdleTimer);
        if (!vd.paused) {
            pWrapIdleTimer = setTimeout(() => {
                wp.classList.add('k-idle');
            }, 2500);
        }
    };

    ['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'].forEach(evt => {
        window.addEventListener(evt, resetIdle, { capture: true, passive: true });
    });

    let pauseTimer;
    vd.addEventListener('pause', () => {
        clearTimeout(pWrapIdleTimer);
        wp.classList.remove('k-idle');
        pauseTimer = setTimeout(() => {
            if (vd.paused) vd.classList.add('hide-center-play');
        }, 2000);
        if (wp.style.display !== "none") {
            localStorage.setItem('k_vid_sync', JSON.stringify({
                u: appEnv.m3Url || appEnv.vidUrl || vd.src,
                t: vd.currentTime,
                s: 'pause',
                ts: Date.now()
            }));
        }
    });

    vd.addEventListener('timeupdate', () => {
        if (!vd.paused && wp.style.display !== "none") {
            localStorage.setItem('k_vid_sync', JSON.stringify({
                u: appEnv.m3Url || appEnv.vidUrl || vd.src,
                t: vd.currentTime,
                s: 'play',
                ts: Date.now()
            }));
        }
    });

    vd.addEventListener('play', () => {
        clearTimeout(pauseTimer);
        vd.classList.remove('hide-center-play');
        resetIdle();
    });

    vd.addEventListener('loadedmetadata', () => {
        if (wp.dataset.mini === "1") {
            const ratio = (vd.videoWidth && vd.videoHeight) ? (vd.videoWidth / vd.videoHeight) : (16/9);
            let mw = wp.offsetWidth;
            let mh = mw / ratio;
            if (mh > window.innerHeight * 0.65) {
                mh = window.innerHeight * 0.65;
                mw = mh * ratio;
            }
            wp.style.width = `${mw}px`;
            wp.style.height = `${mh}px`;
        }
    });

    const forceRepaintControls = () => {
        vd.controls = false;
        setTimeout(() => { vd.controls = true; }, 50);
    };

    document.addEventListener('fullscreenchange', forceRepaintControls);

    const preventDrag = (e) => e.stopPropagation();
    cl.addEventListener('mousedown', preventDrag);
    cl.addEventListener('touchstart', preventDrag, { passive: true });
    pip.addEventListener('mousedown', preventDrag);
    pip.addEventListener('touchstart', preventDrag, { passive: true });

    cl.onclick = (e) => {
        e.stopPropagation();
        clearTimeout(pWrapIdleTimer);
        wp.classList.remove('k-idle');
        wp.addEventListener('transitionend', function handler() {
            wp.style.display = "none";
            wp.removeEventListener('transitionend', handler);
        });
        wp.style.cssText = fullStyle;
        wp.style.opacity = "0";
        cl.style.opacity = "0";
        pip.style.opacity = "0";
        isMini = false;
        delete wp.dataset.mini;
        if (window.hlsInstance) window.hlsInstance.destroy();
        vd.pause();
        appEnv.play = false;
        if (window.location.hash === "#kplayer") {
            history.back();
        }
    };

    pip.onclick = (e) => {
        e.stopPropagation();
        if (window.kIsAnimating) return;
        window.kIsAnimating = true;
        setTimeout(() => { window.kIsAnimating = false; }, 380);

        isMini = !isMini;

        wp.style.transition = 'none';
        vd.style.transition = 'none';
        void wp.offsetWidth;
        void vd.offsetWidth;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                wp.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                vd.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';

                if (isMini) {
                    wp.classList.remove('k-idle');
                    clearTimeout(pWrapIdleTimer);
                    wp.dataset.mini = "1";
                    let mw, mh, targetLeft, targetTop;
                    const ratio = (vd.videoWidth && vd.videoHeight) ? (vd.videoWidth / vd.videoHeight) : (16/9);
                    if (appEnv.miniPos && typeof appEnv.miniPos.w === 'number') {
                        mw = appEnv.miniPos.w;
                        mh = mw / ratio;
                        if (mh > window.innerHeight * 0.65) {
                            mh = window.innerHeight * 0.65;
                            mw = mh * ratio;
                        }
                        targetLeft = Math.max(0, Math.min(window.innerWidth - mw, appEnv.miniPos.l));
                        targetTop = Math.max(0, Math.min(window.innerHeight - mh, appEnv.miniPos.t));
                    } else {
                        mw = window.innerWidth > 768 ? 400 : 240;
                        mh = mw / ratio;
                        if (mh > window.innerHeight * 0.6) {
                            mh = window.innerHeight * 0.6;
                            mw = mh * ratio;
                        }
                        targetLeft = Math.max(0, window.innerWidth - mw - 15);
                        targetTop = Math.max(0, window.innerHeight - mh - 20);
                    }

                    wp.style.width = `${mw}px`;
                    wp.style.height = `${mh}px`;
                    wp.style.left = `${targetLeft}px`;
                    wp.style.top = `${targetTop}px`;
                    wp.style.background = '#000';
                    wp.style.padding = '0';
                    wp.style.borderRadius = '12px';
                    wp.style.boxShadow = '0 8px 24px rgba(0,0,0,0.7)';

                    vd.style.borderRadius = '12px';

                    cl.style.top = '6px';
                    cl.style.right = '6px';
                    cl.style.width = '26px';
                    cl.style.height = '26px';
                    cl.style.fontSize = '14px';
                    cl.style.background = 'rgba(0,0,0,0.6)';

                    pip.style.top = '6px';
                    pip.style.right = '38px';
                    pip.style.width = '26px';
                    pip.style.height = '26px';
                    pip.style.fontSize = '12px';
                    pip.style.background = 'rgba(0,0,0,0.6)';

                    cl.className = 'mini-btn';
                    pip.className = 'mini-btn';
                    pip.innerHTML = '<i class="fas fa-expand"></i>';

                    clearTimeout(window.kHistTimer);
                    window.kHistTimer = setTimeout(() => {
                        if (wp.dataset.mini === "1" && window.location.hash === "#kplayer") {
                            history.back();
                        }
                    }, 360);
                } else {
                    delete wp.dataset.mini;

                    wp.style.width = '100vw';
                    wp.style.height = '100vh';
                    wp.style.left = '0px';
                    wp.style.top = '0px';
                    wp.style.background = 'rgba(0,0,0,0.95)';
                    wp.style.padding = '10px';
                    wp.style.borderRadius = '0';
                    wp.style.boxShadow = 'none';

                    vd.style.borderRadius = '0';

                    cl.style.top = '20px';
                    cl.style.right = '20px';
                    cl.style.width = '40px';
                    cl.style.height = '40px';
                    cl.style.fontSize = '20px';
                    cl.style.background = 'rgba(255, 255, 255, 0.2)';

                    pip.style.top = '20px';
                    pip.style.right = '70px';
                    pip.style.width = '40px';
                    pip.style.height = '40px';
                    pip.style.fontSize = '18px';
                    pip.style.background = 'rgba(255, 255, 255, 0.2)';

                    cl.className = '';
                    pip.className = '';
                    pip.innerHTML = '<i class="fas fa-clone"></i>';

                    clearTimeout(window.kHistTimer);
                    window.kHistTimer = setTimeout(() => {
                        if (!wp.dataset.mini && window.location.hash !== "#kplayer") {
                            window.location.hash = "kplayer";
                        }
                    }, 360);
                }
            });
        });
    };

    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
    let isDragging = false, isResizing = false, resizeDir = '', startW = 0, startH = 0;
    let lastTapTime = 0;

    const dragStart = (e, x, y) => {
        if (!isMini || isAnimating) return;
        hasDragged = false;
        vd.style.pointerEvents = 'none';
        wp.classList.add('k-active');
        clearTimeout(wp.activeTimeout);
        wp.activeTimeout = setTimeout(() => wp.classList.remove('k-active'), 3000);

        startX = x;
        startY = y;
        const rect = wp.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        isDragging = true;
        wp.style.transition = 'none';
    };

    const dragMove = (x, y) => {
        if (Math.abs(x - startX) > 5 || Math.abs(y - startY) > 5) {
            hasDragged = true;
        }

        if (isResizing) {
            const ratio = (vd.videoWidth && vd.videoHeight) ? (vd.videoWidth / vd.videoHeight) : (16/9);
            const dx = x - startX;
            const dy = y - startY;

            let newW = startW;
            if (resizeDir.includes('r')) newW = startW + dx;
            if (resizeDir.includes('l')) newW = startW - dx;

            if (newW < 150) newW = 150;
            let newH = newW / ratio;

            if (resizeDir === 't' || resizeDir === 'b') {
                newH = startH + (resizeDir === 'b' ? dy : -dy);
                if (newH < 84) newH = 84;
                newW = newH * ratio;
            }

            let newL = initialLeft;
            let newT = initialTop;

            if (resizeDir.includes('l')) newL = initialLeft + (startW - newW);
            if (resizeDir.includes('t')) newT = initialTop + (startH - newH);

            wp.style.width = `${newW}px`;
            wp.style.height = `${newH}px`;
            wp.style.left = `${newL}px`;
            wp.style.top = `${newT}px`;
            wp.style.bottom = 'auto';
            wp.style.right = 'auto';
            return;
        }

        if (!isMini || !isDragging) return;
        let newLeft = Math.max(0, Math.min(window.innerWidth - wp.offsetWidth, initialLeft + (x - startX)));
        let newTop = Math.max(0, Math.min(window.innerHeight - wp.offsetHeight, initialTop + (y - startY)));
        wp.style.bottom = 'auto';
        wp.style.right = 'auto';
        wp.style.left = `${newLeft}px`;
        wp.style.top = `${newTop}px`;
    };

    const dragEnd = (e) => {
        if (isMini) {
            vd.style.pointerEvents = 'auto';
        }

        let isTap = false;
        if (isDragging && !hasDragged) isTap = true;
        let didChange = false;

        if (isResizing) {
            isResizing = false;
            didChange = true;
            wp.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        }
        if (isDragging) {
            isDragging = false;
            if (hasDragged) didChange = true;
            if (isMini) wp.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        }

        if (isMini && didChange && !isAnimating) {
            const rect = wp.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
                appEnv.miniPos = { l: rect.left, t: rect.top, w: rect.width, h: rect.height };
                try { localStorage.setItem('k_mini_pos', JSON.stringify(appEnv.miniPos)); } catch(err) {}
            }
        }

        if (isMini && isTap && e && !isAnimating) {
            const target = e.target;
            if (target && (target.closest('button') || target.classList?.contains('k-resizer'))) return;

            let cy = e.clientY;
            if (e.type === 'touchend' && e.changedTouches) {
                cy = e.changedTouches[0].clientY;
            }

            const rect = wp.getBoundingClientRect();
            if (cy && cy < rect.bottom - 45) {
                vd.paused ? vd.play().catch(()=>{}) : vd.pause();
            }
        }
    };

    const rsStart = (e, dir) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        vd.style.pointerEvents = 'none';
        isResizing = true;
        resizeDir = dir;
        startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        startW = wp.offsetWidth;
        startH = wp.offsetHeight;
        const rect = wp.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        wp.style.transition = 'none';
    };

    [rTl, rTr, rBl, rBr].forEach(el => {
        el.addEventListener('mousedown', (e) => rsStart(e, el.className.split('-').pop()));
        el.addEventListener('touchstart', (e) => rsStart(e, el.className.split('-').pop()), { passive: false });
    });

    wp.addEventListener('touchstart', (e) => {
        if (e.target.closest('button') || e.target.classList?.contains('k-resizer')) return;
        const rect = wp.getBoundingClientRect();
        if (e.touches[0].clientY > rect.bottom - 55) return;
        dragStart(e, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false, capture: true });

    wp.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.classList?.contains('k-resizer')) return;
        const rect = wp.getBoundingClientRect();
        if (e.clientY > rect.bottom - 55) return;
        dragStart(e, e.clientX, e.clientY);
    }, { capture: true });

    window.addEventListener('mousemove', (e) => {
        if (isResizing) { e.preventDefault(); dragMove(e.clientX, e.clientY); }
        else dragMove(e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
        if (isResizing) { e.preventDefault(); dragMove(e.touches[0].clientX, e.touches[0].clientY); }
        else dragMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchend', dragEnd);

    let tm;
    const dn = () => {
        if (isMini) return;
        tm = setTimeout(() => { vd.playbackRate = 2.0; sp.style.display = "block"; }, 500);
    };
    const up = () => {
        if (isMini) return;
        clearTimeout(tm);
        if (vd.playbackRate === 2.0) { vd.playbackRate = 1.0; sp.style.display = "none"; }
    };

    ['mousedown','touchstart'].forEach(e => vd.addEventListener(e, dn));
    ['mouseup','mouseleave','touchend'].forEach(e => vd.addEventListener(e, up));

    vd.addEventListener('touchstart', (e) => {
        if (isMini) return;
        const now = Date.now();
        if (now - lastTapTime < 300) {
            const cx = e.touches[0].clientX;
            const sw = window.innerWidth;
            if (cx > sw * 0.2 && cx < sw * 0.8) {
                e.preventDefault();
                vd.paused ? vd.play().catch(()=>{}) : vd.pause();
            }
            lastTapTime = 0;
        } else {
            lastTapTime = now;
        }
    }, { passive: false });

    let rightKeyTimer = null;
    let isRightKeyLongPress = false;

    window.addEventListener('keydown', (e) => {
        if (wp.style.display === "none") return;
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (e.repeat) return;
            vd.paused ? vd.play().catch(()=>{}) : vd.pause();
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            if (e.repeat) return;
            isRightKeyLongPress = false;
            rightKeyTimer = setTimeout(() => {
                isRightKeyLongPress = true;
                vd.playbackRate = 2.0;
                sp.style.display = "block";
            }, 350);
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            if (!e.repeat) vd.currentTime -= 5;
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            vd.volume = Math.min(1, vd.volume + 0.1);
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            vd.volume = Math.max(0, vd.volume - 0.1);
        } else if (e.code === 'KeyF') {
            e.preventDefault();
            if (!e.repeat) {
                if (!document.fullscreenElement) vd.requestFullscreen().catch(()=>{});
                else document.exitFullscreen();
            }
        }
    }, { capture: true });

    window.addEventListener('keyup', (e) => {
        if (wp.style.display === "none") return;
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

        if (e.code === 'ArrowRight') {
            e.preventDefault();
            clearTimeout(rightKeyTimer);
            if (isRightKeyLongPress) {
                vd.playbackRate = 1.0;
                sp.style.display = "none";
            } else {
                vd.currentTime = Math.min(vd.currentTime + 5, vd.duration || 9999);
            }
            isRightKeyLongPress = false;
        }
    }, { capture: true });

    window.triggerVid = (u, forceMini = false, startT = 0) => {
        wp.style.transition = 'none';
        vd.style.transition = 'none';

        if (forceMini) {
            isMini = true;
            wp.dataset.mini = "1";

            const ratio = 16/9;
            let mw, mh, targetLeft, targetTop;
            if (appEnv.miniPos && typeof appEnv.miniPos.w === 'number') {
                mw = appEnv.miniPos.w;
                mh = mw / ratio;
                if (mh > window.innerHeight * 0.65) {
                    mh = window.innerHeight * 0.65;
                    mw = mh * ratio;
                }
                targetLeft = Math.max(0, Math.min(window.innerWidth - mw, appEnv.miniPos.l));
                targetTop = Math.max(0, Math.min(window.innerHeight - mh, appEnv.miniPos.t));
            } else {
                mw = window.innerWidth > 768 ? 400 : 240;
                mh = mw / ratio;
                if (mh > window.innerHeight * 0.6) {
                    mh = window.innerHeight * 0.6;
                    mw = mh * ratio;
                }
                targetLeft = Math.max(0, window.innerWidth - mw - 15);
                targetTop = Math.max(0, window.innerHeight - mh - 20);
            }

            wp.style.cssText = `position:fixed;width:${mw}px;height:${mh}px;left:${targetLeft}px;top:${targetTop}px;background:#000;padding:0;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.7);z-index:9999996;display:flex;justify-content:center;align-items:center;overflow:hidden;`;
            vd.style.cssText = 'width:100%;height:100%;object-fit:contain;outline:none;pointer-events:auto;border-radius:12px;';
            cl.style.cssText = 'position:absolute;top:6px;right:6px;width:26px;height:26px;font-size:14px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;cursor:pointer;z-index:10000000;display:flex;align-items:center;justify-content:center;';
            pip.style.cssText = 'position:absolute;top:6px;right:38px;width:26px;height:26px;font-size:12px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;cursor:pointer;z-index:10000000;display:flex;align-items:center;justify-content:center;';
            cl.className = 'mini-btn';
            pip.className = 'mini-btn';
            pip.innerHTML = '<i class="fas fa-expand"></i>';

            requestAnimationFrame(() => {
                wp.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                vd.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            });
            clearTimeout(window.kHistTimer);
            wp.style.display = "flex";
        } else {
            isMini = false;
            delete wp.dataset.mini;
            wp.style.cssText = fullStyle;
            wp.style.display = "flex";

            void wp.offsetHeight;

            vd.style.cssText = 'width:100%;height:100%;object-fit:contain;outline:none;pointer-events:auto;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);';
            cl.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;z-index:10000000;display:flex;align-items:center;justify-content:center;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);';
            pip.style.cssText = 'position:absolute;top:20px;right:70px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:18px;cursor:pointer;z-index:10000000;display:flex;align-items:center;justify-content:center;transition:all 0.35s cubic-bezier(0.4, 0, 0.2, 1);';
            pip.innerHTML = '<i class="fas fa-clone"></i>';
            cl.className = '';
            pip.className = '';
            window.location.hash = "kplayer";
        }

        resetIdle();

        const playAndRecover = () => {
            if (forceMini && startT > 0) {
                vd.currentTime = startT;
            }
            vd.play().catch(()=>{});
            appEnv.play = true;
        };

        if (typeof Hls !== "undefined" && Hls.isSupported()) {
            if (window.hlsInstance) window.hlsInstance.destroy();
            const h = new Hls();
            window.hlsInstance = h;
            h.loadSource(u);
            h.attachMedia(vd);
            h.on(Hls.Events.MANIFEST_PARSED, playAndRecover);
        } else if (vd.canPlayType("application/vnd.apple.mpegurl")) {
            vd.src = u;
            vd.addEventListener('loadedmetadata', function h() {
                playAndRecover();
                vd.removeEventListener('loadedmetadata', h);
            });
            vd.load();
        }

        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: document.querySelector(".header .position-relative span:first-child")?.textContent?.trim() || "VIP解密原画视频",
                    artist: "海角社区·看帖神器"
                });
                navigator.mediaSession.setActionHandler('seekbackward', (d) => {
                    vd.currentTime = Math.max(vd.currentTime - (d.seekOffset || 10), 0);
                });
                navigator.mediaSession.setActionHandler('seekforward', (d) => {
                    vd.currentTime = Math.min(vd.currentTime + (d.seekOffset || 10), vd.duration);
                });
                navigator.mediaSession.setActionHandler('seekto', (d) => {
                    if (d.fastSeek && 'fastSeek' in vd) vd.fastSeek(d.seekTime);
                    else vd.currentTime = d.seekTime;
                });
            } catch (e) {}
        }
    };
};

const exeCore = async (autoPlay = true) => {
    if (appEnv.fetched) {
        if (autoPlay && appEnv.m3Url) window.triggerVid(appEnv.m3Url);
        return;
    }

    const pi = document.querySelector("#a-ply i");
    if (pi && autoPlay) pi.className = "fas fa-spinner fa-spin";

    try {
        const pd = await fetch(`/api/topic/${appEnv.postId}`).then(r => r.json());
        const dt = cryptoHelper.unJson(pd.data);
        if (dt && dt.attachments) {
            appEnv.fetched = true;
            const ig = [], vd = [], ad = [];
            dt.attachments.forEach(e => {
                if (e.category === "images" && !String(dt.content).includes(String(e.id))) ig.push(e);
                else if (e.category === "audio") ad.push(e);
                else if (e.category === "video") vd.push(e);
            });
            const bx = domUtils.getBox();
            if (bx && autoPlay) bx.innerHTML = "";
            appEnv.audios = [];
            appEnv.pics = [];

            ad.forEach(a => {
                appEnv.audios.push(a.remoteUrl);
                if (autoPlay) bx?.appendChild(domUtils.makeEle('audio', { src: a.remoteUrl, controls: true, css: 'margin:auto;display:block;' }));
            });

            const picReqs = ig.map(async i => {
                const tx = await fetch(i.remoteUrl).then(r => r.text());
                const u = cryptoHelper.dec(tx);
                if (!appEnv.pics.includes(u)) appEnv.pics.push(u);
                if (autoPlay) bx?.appendChild(domUtils.makeEle('img', { src: u, css: 'max-width:100%;height:auto;margin-top:10px;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.1);' }));
            });
            await Promise.all(picReqs);

            if (vd.length === 0) {
                for (const v of appEnv.xhrStore) {
                    if (v.category === "video" && v.remoteUrl) {
                        appEnv.m3Url = v.remoteUrl;
                        appEnv.vidUrl = v.remoteUrl;
                        if (autoPlay) window.triggerVid(appEnv.m3Url);
                        break;
                    }
                }
            } else {
                for (const v of vd) {
                    if (v.remoteUrl && v.video_time_length) {
                        const tx = await fetch(v.remoteUrl).then(r => r.text());
                        const fl = tx.split("\n").find(l => l && !l.startsWith("#"));
                        if (!fl) continue;
                        const pf = new URL(fl, v.remoteUrl).href.split("?")[0];
                        const px = pf.slice(0, pf.lastIndexOf("/") + 1);
                        let l = 0, r = v.video_time_length * 2 - 1, mx = -1;
                        while (l <= r) {
                            const m = Math.floor((l + r) / 2);
                            if (await netHelper.check(pf.replace("0.ts", `${m}.ts`).split("?")[0])) { mx = m; l = m + 1; } else { r = m - 1; }
                        }
                        if (mx >= 0) {
                            let bd = "";
                            const ag = Number(v.video_time_length / mx).toFixed(6);
                            for (let i = 0; i <= mx; i++) bd += `#EXTINF:${ag},\n${pf.replace("0.ts", `${i}.ts`).split("?")[0]}\n`;
                            appEnv.rawStr = tx.split("#EXTINF")[0].replace(/URI="(enc_[^"]+\.key)"/g, `URI="${px}$1"`) + bd + `#EXT-X-ENDLIST`;
                            appEnv.m3Url = URL.createObjectURL(new Blob([appEnv.rawStr], { type: "application/x-mpegURL" }));
                            if (autoPlay) window.triggerVid(appEnv.m3Url);
                            break;
                        }
                    }
                }
            }
        }
    } catch (e) {} finally {
        if (pi && autoPlay) pi.className = "far fa-play-circle";
    }
};

const tickState = () => {
    if (!document.body) return;
    const wp = document.getElementById('p-wrap');
    if (wp && wp.style.display !== "none" && window.location.hash !== "#kplayer" && !wp.dataset.mini) {
        wp.style.display = "none";
        const vd = document.getElementById('h-vd');
        if(vd) vd.pause();
        if(window.hlsInstance) window.hlsInstance.destroy();
        appEnv.play = false;
        return;
    }

    const mt = window.location.href.match(/pid=(\d+)/);
    const id = mt ? mt[1] : null;

    if (id && id !== appEnv.postId) {
        appEnv.postId = id; appEnv.m3Url = ""; appEnv.rawStr = ""; appEnv.vidUrl = ""; appEnv.pics = []; appEnv.audios = []; appEnv.fetched = false;
        const pi = document.querySelector("#a-ply i"); if (pi) pi.className = "far fa-play-circle";
        setPly(); buildUi();

        if (window.kExpandInterval) clearInterval(window.kExpandInterval);
        let checkCount = 0;
        window.kExpandInterval = setInterval(() => {
            checkCount++;
            try {
                const el = document.evaluate('//*[contains(text(),"展开完整贴文")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (el && el.offsetHeight > 0) {
                    el.click();
                    clearInterval(window.kExpandInterval);
                } else if (checkCount > 60) {
                    clearInterval(window.kExpandInterval);
                }
            } catch (e) {}
        }, 800);
    }
};

const startPopupKiller = () => {
    if (!document.body) return;

    const kill = () => {
        let actionTaken = false;

        const buttons = document.querySelectorAll('button, .el-button, .van-button');
        buttons.forEach(btn => {
            const txt = btn.innerText || btn.textContent || '';

            if (txt.includes('我知道了')) {
                const wrapper = btn.closest('.el-dialog__wrapper, .el-overlay, div[role="dialog"]');
                if (wrapper && window.getComputedStyle(wrapper).display !== 'none' && !btn.dataset.kClicked) {
                    btn.dataset.kClicked = '1';
                    btn.click();
                }
            }
            else if (txt.includes('好 (') || txt.includes('同意') || txt.includes('确认')) {
                const wrapper = btn.closest('.el-dialog__wrapper, .el-overlay, div[role="dialog"], .luodiye_dialog, .van-dialog');
                if (wrapper && window.getComputedStyle(wrapper).display !== 'none') {
                    btn.click();
                    actionTaken = true;
                }
            }
        });

        const elements = document.querySelectorAll('p, span, div');
        for (let el of elements) {
            const text = el.textContent || '';
            if (text.includes('年满18周岁') || text.includes('自动复制')) {
                const wrapper = el.closest('.el-dialog__wrapper, .el-overlay, div[role="dialog"], .luodiye_dialog');
                if (wrapper && window.getComputedStyle(wrapper).display !== 'none') {
                    const btn = wrapper.querySelector('button.el-button--primary, button');
                    if (btn) btn.click();
                    else wrapper.style.display = 'none';
                    actionTaken = true;
                }
            }
        }

        const timeCount = document.getElementById('timeCount');
        if (timeCount) {
            const wrapper = timeCount.closest('.el-dialog__wrapper') || timeCount.closest('.el-overlay');
            if (wrapper && wrapper.style.display !== 'none') {
                wrapper.style.display = 'none';
                actionTaken = true;
            }
        }

        document.querySelectorAll('.btnbox').forEach(el => {
            if(el.style.display !== 'none') { el.style.display = 'none'; actionTaken = true; }
        });

        const confBtn = document.querySelector('img.ldys[src*="conf.png"], img.ldys[src*="comf.png"]');
        if (confBtn) {
            const link = confBtn.closest('a');
            if (link) link.click();
            else confBtn.click();
            actionTaken = true;
        }

        if (actionTaken) {
            setTimeout(() => {
                document.querySelectorAll('.v-modal, .van-overlay').forEach(m => {
                    m.style.display = 'none';
                });
                if (document.body.style.overflow === 'hidden' || document.body.classList.contains('el-popup-parent--hidden') || document.body.classList.contains('van-overflow-hidden')) {
                    document.body.style.removeProperty('overflow');
                    document.body.classList.remove('el-popup-parent--hidden', 'van-overflow-hidden');
                    document.documentElement.classList.remove('el-popup-parent--hidden', 'van-overflow-hidden');
                }
            }, 100);
        }
    };

    let count = 0;
    const fastTimer = setInterval(() => {
        kill();
        if (++count > 20) clearInterval(fastTimer);
    }, 300);
};

const checkSync = () => {
    try {
        const syncRaw = localStorage.getItem('k_vid_sync');
        if (syncRaw) {
            const sync = JSON.parse(syncRaw);
            if (sync.s === 'play' && (Date.now() - sync.ts) < 5000 && sync.u) {
                localStorage.setItem('k_vid_takeover', Date.now().toString());
                appEnv.m3Url = sync.u;
                setPly();
                window.triggerVid(sync.u, true, sync.t);
            }
        }
    } catch(e) {}
};

const rs = history.pushState;
history.pushState = function() { rs.apply(this, arguments); setTimeout(tickState, 500); setTimeout(processFeedItems, 500); };
const rr = history.replaceState;
history.replaceState = function() { rr.apply(this, arguments); setTimeout(tickState, 500); setTimeout(processFeedItems, 500); };

window.addEventListener("popstate", () => {
    const wp = document.getElementById('p-wrap');
    if (wp && wp.dataset.mini) return;
    if (wp && wp.style.display !== "none" && window.location.hash !== "#kplayer") {
        tickState();
    } else {
        setTimeout(tickState, 500);
    }
    setTimeout(processFeedItems, 500);
});

const bootApp = () => {
    if (!document.body) return;
    if (window.__k_booted) return;
    window.__k_booted = true;

    tickState();
    startPopupKiller();
    initAutoLogin();
};

const waitBodyTimer = setInterval(() => {
    if (document.body) {
        clearInterval(waitBodyTimer);
        bootApp();
    }
}, 50);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    if (document.body) bootApp();
}

Promise.resolve().then(() => {
    setTimeout(() => {
        if (document.body) {
            tickState();
            checkSync();
            processFeedItems();
        }
    }, 500);
});
