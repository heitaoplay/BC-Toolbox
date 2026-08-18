// ==UserScript==
// @name         BC工具箱
// @name:zh      BC工具箱
// @namespace    https://github.com/heitaoplay/BC-Toolbox
// @version      3.3.2
// @description  BC 多功能工具箱 - BC工具箱 (R121 Compatible) + UI 面板 + 角色选择器 + Canvas SVG 图标 + 拖拽排序 + 主题自定义 + 自动解绑女仆
// @author       heitaoplay
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @icon         https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/icon.png
// @grant        none
// @require      https://awdrrawd.github.io/liko-Plugin-Repository/Plugins/expand/bcmodsdk.js
// @require      https://awdrrawd.github.io/liko-Plugin-Repository/Plugins/expand/BC_toast_system.user.js
// @updateURL    https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox.user.js
// @downloadURL  https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox.user.js
// @run-at       document-end
// ==/UserScript==

/*
 * 原作者 (Original Author): Liko (Likolisu)
 *   脚本原始版本由 Liko 开发，感谢 Liko 提供如此优秀的工具！
 * 本项目已重新品牌化为「BC工具箱」，由 heitaoplay 维护。
 */

// ── 防重複加载 guard ──────────────────────────────────────────────────────────

(function () {
    if (window.__BCToolboxLoaded__) {
        console.warn("🐈‍⬛ [BC] ⚠️ 已侦测到重複加载，跳过初始化");
        return;
    }
    window.__BCToolboxLoaded__ = true;
    let modApi = null;
    const modversion = "3.4.0";

    const rpBtnX    = 955;
    const rpBtnY    = 855;
    const rpBtnSize = 45;
    const rpIconUrl = "https://raw.githubusercontent.com/awdrrawd/liko-tool-Image-storage/refs/heads/main/Images/likorp.png";

    /* ── UI 触发按钮位置（默认左上安全区，避开右侧聊天栏） ── */
    const TOOL_BTN_X = 20;
    const TOOL_BTN_Y = 60;
    const TOOL_BTN_W = 45;
    const TOOL_BTN_H = 45;
    const STORAGE_TOOL_BTN   = 'bcToolbox_float_btn';
    const STORAGE_TOOL_PANEL = 'bcToolbox_ui_panel';

    // 浮动按钮位置（屏幕中央默认 + 拖拽记忆）
    function loadToolBtnPos() {
        try {
            const s = localStorage.getItem(STORAGE_TOOL_BTN);
            if (s) {
                const p = JSON.parse(s);
                if (typeof p.x === 'number' && typeof p.y === 'number') {
                    // 旧版默认右上角 (w-60,15) 会被 BC 聊天室右侧栏遮挡，导致按钮不可见。
                    // 用户若从未拖动（恰为旧默认坐标），重置回屏幕中央。
                    const w = (typeof CommonScreenWidth !== 'undefined' && CommonScreenWidth) ? CommonScreenWidth : 1920;
                    if (p.x === w - TOOL_BTN_W - 15 && p.y === 15) {
                        return { x: TOOL_BTN_X, y: TOOL_BTN_Y };
                    }
                    return { x: p.x, y: p.y };
                }
            }
        } catch (_) {}
        return { x: TOOL_BTN_X, y: TOOL_BTN_Y };
    }
    function saveToolBtnPos() {
        try { localStorage.setItem(STORAGE_TOOL_BTN, JSON.stringify(toolBtnPos)); } catch (_) {}
    }
    const toolBtnPos = loadToolBtnPos();
    let toolBtnDrag = null;          // { offX, offY, moved, sx, sy }
    let toolBtnSuppressClick = false; // 拖拽后抑制一次点击 toggl
    const STORAGE_TOOL_THEME = 'bcToolbox_theme';
    const STORAGE_TOOL_ORDER = 'bcToolbox_btn_order';
    const STORAGE_RM_TRIGGER = 'bcToolbox_rm_trigger';
    const STORAGE_RM_UNLOCK  = 'bcToolbox_rm_unlock';
    const STORAGE_CAT_COLLAPSED = 'bcToolbox_cat_collapsed';  // 分类折叠状态持久化 key
    let toolPanelEl = null;
    let toolPanelVisible = false;
    let _toolDragging = false;
    let actionGridEl = null;

    // 低频分类默认折叠（magic=LSCG与魔法 / craft=订制与导入 / boost=增益）
    const CAT_TOGGLES_KEY   = '__toggles__';  // 开关区折叠状态在 catCollapsed 中的 key
    const DEFAULT_COLLAPSED = new Set(['magic', 'craft', 'boost']);

    // 从 localStorage 读取分类折叠状态
    //   - 完全没有该 key 时返回 null（供初始化区分「首次使用」）
    //   - key 存在（即使是 '{}' 全展开）时返回 JSON.parse 结果；解析失败 / 非对象则 {}
    function loadCatCollapsed() {
        try {
            const s = localStorage.getItem(STORAGE_CAT_COLLAPSED);
            if (s === null) return null;
            const obj = JSON.parse(s);
            if (obj && typeof obj === 'object') return obj;
        } catch (_) {}
        return {};
    }
    // 将分类折叠状态序列化写入 localStorage
    function saveCatCollapsed() {
        try { localStorage.setItem(STORAGE_CAT_COLLAPSED, JSON.stringify(catCollapsed)); } catch (_) {}
    }

    // 初始化折叠状态：严格区分「首次无记录」与「已有记录（含 {} 全展开）」
    //   - 首次（localStorage 无该 key）：套用默认折叠
    //   - 已有记录（含 {} 全展开）：严格尊重存储，不再套默认覆盖用户偏好
    var storedState = localStorage.getItem(STORAGE_CAT_COLLAPSED);
    var catCollapsed;
    if (storedState === null) {
        catCollapsed = {};
        DEFAULT_COLLAPSED.forEach(function(k) { catCollapsed[k] = true; });
        catCollapsed[CAT_TOGGLES_KEY] = true;  // 开关区默认折叠
    } else {
        try { catCollapsed = JSON.parse(storedState) || {}; } catch (_) { catCollapsed = {}; }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SVG 图标库 — 线条风格，stroke=currentColor
    // ════════════════════════════════════════════════════════════════════════
    const SVG = {
        wardrobe:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
        undo:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7"/></svg>',
        free:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>',
        lock:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1.5"/></svg>',
        freetotal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1"/></svg>',
        unlock:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4"/><path d="M18 5l2 2"/><path d="M15 8l2 2"/></svg>',
        password:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
        struggle:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v6"/><path d="M8 10l4 1 4-1"/><path d="M10 13l-2 7M14 13l2 7"/></svg>',
        enhance:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 5L19 9.5 13.5 11 12 16l-1.5-5L5 9.5 10.5 8z"/><path d="M19 15v3M20.5 16.5h-3M5 17v2M6 18H4"/></svg>',
        bcx:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
        settings:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>',
        dark:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        light:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
        grip:      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>',
        close:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        chevron:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
        rp:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="22" y1="2" x2="2" y2="22"/></svg>',
        heightLock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v3M11 9v3M15 9v3M19 9v3"/></svg>',
        rpBtn:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="8" cy="12" r="1.5"/></svg>',
        maid:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
        antirestraint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/><path d="M16 11V7a4 4 0 0 0-3-3.8"/><circle cx="12" cy="15.5" r="1.4"/></svg>',
        ooc:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/><path d="M8 10h8M8 13.5h5"/></svg>',
        edit:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        wake:      '<svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M512.937997 170.797882l55.001808 14.07023a263.497034 263.497034 0 0 1 200.820556 251.985028v290.358382l20.465789 20.46579 28.780015 28.780015H205.951161l28.780016-28.780015 22.384457-20.46579V436.85314a260.299255 260.299255 0 0 1 198.262331-251.985028l57.560032-14.07023m0-170.121871a74.188485 74.188485 0 0 0-73.548929 78.02582v34.536019a331.929516 331.929516 0 0 0-255.822364 323.61529v259.659699l-100.410277 102.328945v51.164473h859.563141v-51.164473l-100.410278-102.328945V436.85314a333.848184 333.848184 0 0 0-255.822363-323.61529v-34.536019A72.269818 72.269818 0 0 0 531.485119 0.676011a63.955591 63.955591 0 0 0-18.547122 0zM613.348275 923.555186H412.52772A97.852054 97.852054 0 0 0 512.937997 1023.965464a97.852054 97.852054 0 0 0 100.410278-100.410278zM79.958647 379.293108h-63.955591a511.644727 511.644727 0 0 1 29.419572-172.680095A511.644727 511.644727 0 0 1 129.204452 58.236042l48.606249 38.373355A452.805583 452.805583 0 0 0 79.958647 379.293108zM1005.396047 379.293108h-63.955591a450.886915 450.886915 0 0 0-97.852054-282.044155l53.08314-38.373355a520.598509 520.598509 0 0 1 110.643172 319.777954z"/></svg>',
        superDice: '<svg viewBox="0 0 1024 1024" fill="currentColor" fill-rule="evenodd"><path d="M472.576 164.4544c44.2368-10.1376 90.3168 14.0288 182.272 62.2592l39.936 20.8896c92.16 48.2304 138.24 72.3968 155.0336 114.4832 2.4576 5.9392 4.3008 12.0832 5.7344 18.432 10.0352 44.1344-14.0288 90.2144-62.2592 182.272l-20.8896 39.936-14.5408 27.4432c-5.3248 10.0352-20.0704 6.144-20.0704-5.12v-45.056c0-50.176 0-94.208-4.3008-129.8432-4.5056-37.2736-14.7456-74.752-42.3936-107.1104a195.2768 195.2768 0 0 0-21.504-21.504c-32.256-27.648-69.7344-37.888-107.008-42.496-35.6352-4.3008-79.872-4.1984-129.9456-4.1984h-45.056a12.288 12.288 0 0 1-10.8544-18.3296c26.8288-47.5136 47.5136-74.3424 77.4144-86.3232 6.0416-2.4576 12.1856-4.3008 18.432-5.7344z"/><path d="M432.128 348.16c103.936 0 155.8528 0 190.3616 29.4912 4.9152 4.096 9.4208 8.704 13.6192 13.6192 29.3888 34.4064 29.4912 86.4256 29.4912 190.3616v45.056c0 103.936 0 155.8528-29.4912 190.3616a122.88 122.88 0 0 1-13.6192 13.6192c-34.5088 29.3888-86.4256 29.4912-190.464 29.4912H387.072c-103.936 0-155.9552 0-190.464-29.4912a122.88 122.88 0 0 1-13.5168-13.6192C153.6 782.5408 153.6 730.624 153.6 626.5856V581.632c0-103.936 0-155.9552 29.4912-190.464a122.88 122.88 0 0 1 13.6192-13.5168c34.4064-29.4912 86.4256-29.4912 190.464-29.4912h44.9536zM289.792 668.16a56.32 56.32 0 1 0 0.1024 112.64 56.32 56.32 0 0 0 0-112.64z m240.128 0a56.32 56.32 0 1 0 0 112.64 56.32 56.32 0 0 0 0-112.64zM289.792 428.032a56.32 56.32 0 1 0 0 112.64 56.32 56.32 0 0 0 0-112.64z m240.0256 0a56.32 56.32 0 1 0 0 112.64 56.32 56.32 0 0 0 0-112.64z"/></svg>',
        wakeSleep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        wakeHypno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2"/></svg>',
        infinity:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 9.5a2.5 2.5 0 1 0 0 5c1.6 0 2.6-1.1 3.5-2.5S14.4 9.5 16 9.5a2.5 2.5 0 1 1 0 5c-1.6 0-2.6-1.1-3.5-2.5S10.6 9.5 8.5 9.5z"/></svg>',
        guard:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
        craftEdit:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.4"/></svg>',
        craftClear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M4 4l16 16"/></svg>',
        bcxcmd:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3 3-3"/><path d="M7 14h6"/><path d="M15 14v4"/></svg>',
    };

    // ════════════════════════════════════════════════════════════════════════
    // Canvas 图标渲染 — SVG → Image → MainCanvas.drawImage
    // ════════════════════════════════════════════════════════════════════════
    var _canvasIconCache = {};
    function _makeCanvasSvg(paths, color) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#ffffff') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }
    var CANVAS_ICONS = {
        tool: _makeCanvasSvg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
        rp:   _makeCanvasSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="22" y1="2" x2="2" y2="22"/>'),
    };
    function getCanvasIcon(key) {
        if (_canvasIconCache[key]) return _canvasIconCache[key];
        var img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CANVAS_ICONS[key]);
        _canvasIconCache[key] = img;
        return img;
    }
    function drawCanvasIconOnButton(key, btnX, btnY, btnW, btnH, iconSize) {
        var img = getCanvasIcon(key);
        if (img.complete && img.naturalWidth > 0) {
            var sz = iconSize || 22;
            var x = btnX + (btnW - sz) / 2;
            var y = btnY + (btnH - sz) / 2;
            try { MainCanvas.drawImage(img, x, y, sz, sz); } catch (e) {}
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 强调色预设
    // ════════════════════════════════════════════════════════════════════════
    const ACCENT_PRESETS = [
        { id: 'purple', name: '紫', accent: '#8b2dc4', accentDark: '#3a1070', accentLight: '#a060e0' },
        { id: 'blue',   name: '蓝', accent: '#2d6bc4', accentDark: '#103a70', accentLight: '#6090e0' },
        { id: 'teal',   name: '青', accent: '#1aaa88', accentDark: '#0a6048', accentLight: '#40c8a8' },
        { id: 'pink',   name: '粉', accent: '#c42d8b', accentDark: '#70103a', accentLight: '#e060a0' },
        { id: 'orange', name: '橙', accent: '#c47b2d', accentDark: '#704010', accentLight: '#e0a060' },
        { id: 'red',    name: '红', accent: '#c42d2d', accentDark: '#701010', accentLight: '#e06060' },
    ];

    // ════════════════════════════════════════════════════════════════════════
    // 主题系统
    // ════════════════════════════════════════════════════════════════════════
    function loadTheme() {
        try {
            const s = localStorage.getItem(STORAGE_TOOL_THEME);
            if (s) {
                const parsed = JSON.parse(s);
                if (parsed && parsed.mode && parsed.accentId) return parsed;
            }
        } catch (_) {}
        return { mode: 'dark', accentId: 'purple' };
    }

    function saveTheme(theme) {
        try { localStorage.setItem(STORAGE_TOOL_THEME, JSON.stringify(theme)); } catch (_) {}
    }

    let currentTheme = loadTheme();

    function getAccentPreset() {
        return ACCENT_PRESETS.find(function(p) { return p.id === currentTheme.accentId; }) || ACCENT_PRESETS[0];
    }

    function applyTheme() {
        var preset = getAccentPreset();
        var wantLight = (currentTheme.mode === 'light') || (currentTheme.mode === 'system' && !isSystemDark());
        var a = preset.accent;
        var ad = preset.accentDark;
        var al = preset.accentLight;

        var styleEl = document.getElementById('lt-theme-vars');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'lt-theme-vars';
            document.head.appendChild(styleEl);
        }

        if (!wantLight) {
            styleEl.textContent = [
                '#lt-quick-panel,.lt-panel{',
                '--lt-bg:rgba(12,16,26,0.98);',
                '--lt-surface:rgba(255,255,255,0.04);',
                '--lt-surface-2:rgba(255,255,255,0.07);',
                '--lt-surface-hover:' + a + '1a;',
                '--lt-border:rgba(255,255,255,0.07);',
                '--lt-border-hover:' + a + '4d;',
                '--lt-text:#dde8f8;',
                '--lt-text-secondary:#b8c8e0;',
                '--lt-text-dim:#6a8ab0;',
                '--lt-text-faint:#4a5a7a;',
                '--lt-accent:' + a + ';',
                '--lt-accent-dark:' + ad + ';',
                '--lt-accent-light:' + al + ';',
                '--lt-accent-glow:' + a + '40;',
                '--lt-header-grad:linear-gradient(135deg,' + ad + ' 0%,' + a + ' 100%);',
                '--lt-shadow:rgba(0,0,0,0.5);',
                '--lt-scrollbar:' + a + '59;',
                '--lt-switch-on:' + a + ';',
                '--lt-switch-glow:' + a + '80;',
                '}'
            ].join('');
        } else {
            styleEl.textContent = [
                '#lt-quick-panel,.lt-panel{',
                '--lt-bg:rgba(248,250,252,0.98);',
                '--lt-surface:rgba(0,0,0,0.025);',
                '--lt-surface-2:rgba(0,0,0,0.05);',
                '--lt-surface-hover:' + a + '14;',
                '--lt-border:rgba(0,0,0,0.07);',
                '--lt-border-hover:' + a + '40;',
                '--lt-text:#2a3a4a;',
                '--lt-text-secondary:#4a5a6a;',
                '--lt-text-dim:#7a8a9a;',
                '--lt-text-faint:#aab4c0;',
                '--lt-accent:' + a + ';',
                '--lt-accent-dark:' + ad + ';',
                '--lt-accent-light:' + al + ';',
                '--lt-accent-glow:' + a + '33;',
                '--lt-header-grad:linear-gradient(135deg,' + ad + ' 0%,' + a + ' 100%);',
                '--lt-shadow:rgba(0,0,0,0.15);',
                '--lt-scrollbar:' + a + '40;',
                '--lt-switch-on:' + a + ';',
                '--lt-switch-glow:' + a + '80;',
                '}'
            ].join('');
        }

        document.querySelectorAll('#lt-quick-panel,.lt-panel').forEach(function(el) {
            el.classList.toggle('lt-light', wantLight);
            el.classList.toggle('bct-light', wantLight);
        });

        // 跟随系统：监听操作系统配色变化，仅当模式为 system 时联动
        if (window.matchMedia && !applyTheme._sysBound) {
            applyTheme._sysBound = true;
            var _mql = window.matchMedia('(prefers-color-scheme: dark)');
            var _onChange = function() { if (currentTheme.mode === 'system') applyTheme(); };
            try { _mql.addEventListener('change', _onChange); }
            catch (e) { try { _mql.addListener(_onChange); } catch (e2) {} }
        }
    }

    function isSystemDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function setThemeMode(mode) {
        if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return;
        currentTheme.mode = mode;
        saveTheme(currentTheme);
        applyTheme();
    }

    // 三档主题旋钮（日间 / 夜间 / 跟随系统），替代原设置齿轮弹窗
    function createThemeKnob() {
        var MODES = [
            { id: 'light',  label: '日间',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' },
            { id: 'dark',   label: '夜间',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' },
            { id: 'system', label: '跟随系统', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' }
        ];
        var startIdx = MODES.findIndex(function(m) { return m.id === currentTheme.mode; });
        if (startIdx < 0) startIdx = 1; // 默认夜间
        var wrap = document.createElement('div');
        wrap.className = 'bct-theme-knob pos-' + startIdx;
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', '主题模式');
        var thumb = document.createElement('div');
        thumb.className = 'bct-knob-thumb';
        wrap.appendChild(thumb);
        MODES.forEach(function(mode, i) {
            var seg = document.createElement('button');
            seg.className = 'bct-knob-seg' + (i === startIdx ? ' active' : '');
            seg.type = 'button';
            seg.title = mode.label;
            seg.innerHTML = mode.icon;
            seg.addEventListener('click', function() {
                setThemeMode(mode.id);
                wrap.className = 'bct-theme-knob pos-' + i;
                wrap.querySelectorAll('.bct-knob-seg').forEach(function(s, idx) {
                    s.classList.toggle('active', idx === i);
                });
            });
            wrap.appendChild(seg);
        });
        return wrap;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 按钮顺序系统
    // ════════════════════════════════════════════════════════════════════════
    function loadBtnOrder() {
        try {
            var s = localStorage.getItem(STORAGE_TOOL_ORDER);
            if (s) {
                var saved = JSON.parse(s);
                var validIds = ALL_ACTIONS.map(function(a) { return a.id; });
                if (Array.isArray(saved)) {
                    // 过滤掉已移除的动作，并补齐新增动作，保留用户自定义顺序
                    var known = saved.filter(function(id) { return validIds.includes(id); });
                    validIds.forEach(function(id) { if (!known.includes(id)) known.push(id); });
                    if (known.length === validIds.length) return known;
                }
            }
        } catch (_) {}
        return ALL_ACTIONS.map(function(a) { return a.id; });
    }

    function saveBtnOrder(order) {
        try { localStorage.setItem(STORAGE_TOOL_ORDER, JSON.stringify(order)); } catch (_) {}
    }

    function getOrderedActions() {
        var order = loadBtnOrder();
        return order.map(function(id) {
            return ALL_ACTIONS.find(function(a) { return a.id === id; });
        }).filter(Boolean);
    }

    // ──────────────────────────────────────────
    // 雙語言系統
    // ──────────────────────────────────────────
    function isZh() {
        if (typeof TranslationLanguage !== 'undefined' && TranslationLanguage) {
            const l = TranslationLanguage.toLowerCase();
            return l === 'cn' || l === 'tw';
        }
        return (navigator.language || '').toLowerCase().startsWith('zh');
    }

    const LANG = {
        zh: {
            close:        "关闭",
            confirm:      "确认",
            cancel:       "取消",
            noPermission: "无权限互动",
            notInRoom:    "不在房间内",
            unknown:      "未知",
            notInChat:    "不在聊天室",

            undoTitle:       "外观回滚",
            undoNoRecord:    "没有外观变更记录",
            undoChangedAt:   "变更时间",
            undoChangedBy:   "操作者",
            undoPrev:        "上一条",
            undoNext:        "下一条",
            undoApply:       "应用此状态",
            undoCount:       "共",
            undoCountUnit:   "条记录",
            undoApplyDone:   "外观已回滚",
            undoApplySize:   "变更大小",

            freeNoItem:      "没有束缚物品",
            freeDone:        "解除束缚",
            freetotalDone:   "完全解除了所有束缚",
            unlockNone:      "没有可移除的锁",
            unlockDone:      "移除了所有锁",
            lockNone:        "没有可锁定的束缚",
            lockDone:        "个束缚添加了",
            lockInvalid:     "无效的锁名称",
            lockAvailable:   "可用锁",
            craftNoItem:     "没有可编辑的束缚物品",
            craftClearNone:  "没有可清除的订制物品属性",
            craftClearTitle: "选择要清除订制属性的束缚",
            craftClearDone:  "清除了订制物品属性",
            craftEditTitle:  "编辑订制物品属性（批量套用到所选束缚）",
            craftName:       "物品名称",
            craftDesc:       "物品描述",
            craftPrivate:    "设为私有（仅自己可见名称）",
            craftEditDone:   "个束缚已套用订制属性",
            craftPickTitle:  "选择要编辑订制属性的束缚",
            lockSpecify:     "请指定目标（例如 /bc fulllock [目标] [锁名称]）",
            wardrobeDone:    "已开启衣柜",
            clipboardFail:   "无法读取剪贴板",
            bcxInvalid:      "无效的 BCX 代码",
            bcxDone:         "导入了 BCX 外观",
            rpOn:            "RP模式已开启",
            rpOff:           "RP模式已关闭",
            rpBtnShow:       "RP按钮已显示",
            rpBtnHide:       "RP按钮已隐藏",
            heightLockOn:    "身高锁定已启用（强制身高为标准值）",
            heightLockOff:   "身高锁定已停用",
            rmOn:            "自动解绑女仆已启用（监听求救/解锁消息）",
            rmOff:           "自动解绑女仆已停用",
            arOn:            "反束缚已启用（自动解除他人施加的拘束）",
            arOff:           "反束缚已停用",
            oocOn:           "OOC 模式已开启（消息自动加 ( 表示出戏）",
            oocOff:          "OOC 模式已关闭",
            arPanelTitle:    "反束缚设置",
            arAnnounce:      "解除时发送瞪视表情",
            arAnnounceDesc:  "自动解除后向房间发送一条瞪视动作",
            arConfirm:       "解除前先询问",
            arConfirmDesc:   "每次被施加拘束时弹出确认，可选保留或挣脱",
            arEmote:         "自定义瞪视文字",
            arEmoteDesc:     "可用 {item}（物品名） {restrainer}（施加者），留空用默认",
            arWhitelist:     "白名单（永不自动解除）",
            arWhitelistDesc: "点击身上穿着的拘束项加入/移出白名单",
            arKeep:          "保留",
            arEscape:        "挣脱！",
            arEscaped:       "已自动挣脱 {item}",
            arNoRestraint:   "当前身上没有可加入白名单的拘束",

            lscgSection:     "LSCG 唤醒",
            lscgWake:        "睡眠",
            lscgUnzonk:      "催眠",
            lscgWakeCmd:     "睡眠醒来",
            lscgMissing:     "未检测到 LSCG 插件，无法执行该命令",
            lscgHelp:        "lscg <unzonk|wake>：执行 LSCG 唤醒命令",
            sendFail:        "自定义动作发送失败，可能有插件冲突",
            cmdFail:         "执行失败",
            unknownCmd:      "未知指令",

            geTitle:      "选择增强功能",
            geItems:      "获得所有道具",
            geMoney:      "设置金钱为 999,999",
            geSkills:     "所有技能升至 10 级",
            geItemsDone:  "个新物品已添加",
            geMoneyDone:  "金钱已设置为 999,999",
            geSkillsDone: "所有技能已升至 10 级",

            freeTitle:    "选择要移除的束缚",
            password:     "密码",

            settingsTitle:    "设置",
            settingsTheme:    "主题模式",
            settingsDark:     "深色",
            settingsLight:    "浅色",
            settingsAccent:   "主题色",
            settingsReset:    "重置全部",
            settingsResetDone:"设置已重置",
            settingsOrderReset:"按钮顺序已重置",

            helpText:
                "BC工具箱 使用说明\n\n" +
                "/bc help              - 显示此说明\n" +
                "/bc free [目标]       - 选择移除束缚\n" +
                "/bc freetotal [目标]  - 移除所有束缚\n" +
                "/bc bcximport [目标]  - 导入 BCX 外观\n" +
                "/bc fullunlock [目标] - 移除所有锁\n" +
                "/bc fulllock [目标] [锁名称] - 添加锁\n" +
                "/bc undo [目标]       - 外观回滚\n" +
                "/bc rpmode            - 切换 RP 模式\n" +
                "/bc rpbtn             - 显示/隐藏 RP 按钮\n" +
                "/bc heightlock        - 锁定身高为标准值\n" +
                "/bc releasemaid      - 自动解绑女仆（监听求救消息自动解绑）\n" +
                "/bc rmwords          - 自定义救援/解锁短语\n" +
                "/bc antirestraint    - 切换反束缚（自动解除他人拘束）\n" +
                "/bc ooc              - 切换 OOC 模式（出戏括号）\n" +
                "  提示: 戴口塞时把求救词放括号内可绕过口塞，如 (开锁)\n" +
                "  工具箱另含「动作解绑」开关：被拘束者发 full emote 时自动解绑\n" +
                "/bc geteverything     - 增强功能\n" +
                "/bc lscg <命令>       - 执行 LSCG 命令（如 unzonk / wake / drug-boost sleepy）\n" +
                "/bc editcraft [目标]  - 批量编辑束缚的订制属性（名称/描述/私有）\n" +
                "/bc clearcraft [目标] - 清除束缚的所有订制属性\n" +
                "/bc wardrobe          - 开启衣柜\n" +
                "/bc theme             - 打开主题设置",

            loaded: "BC工具箱 v{v} 载入！使用 /bc help 查看说明",
        },
        en: {
            close:        "Close",
            confirm:      "Confirm",
            cancel:       "Cancel",
            noPermission: "No permission to interact with",
            notInRoom:    "is not in the room",
            unknown:      "Unknown",
            notInChat:    "Not in chat room",

            undoTitle:       "Appearance Rollback",
            undoNoRecord:    "No appearance change records",
            undoChangedAt:   "Changed at",
            undoChangedBy:   "Changed by",
            undoPrev:        "Previous",
            undoNext:        "Next",
            undoApply:       "Apply this state",
            undoCount:       "",
            undoCountUnit:   "records",
            undoApplyDone:   "Appearance rolled back",
            undoApplySize:   "Change size",

            freeNoItem:      "has no restrained items",
            freeDone:        "removed restraints",
            freetotalDone:   "fully released all restraints of",
            unlockNone:      "has no removable locks",
            unlockDone:      "removed all locks from",
            lockNone:        "has no lockable restraints",
            lockDone:        "restraints locked with",
            lockInvalid:     "Invalid lock name",
            lockAvailable:   "Available locks",
            craftNoItem:     "has no editable restraint items",
            craftClearNone:  "has no craft properties to clear",
            craftClearTitle: "Select restraints to clear craft",
            craftClearDone:  "cleared craft from",
            craftEditTitle:  "Edit craft (batch-apply to selected restraints)",
            craftName:       "Item name",
            craftDesc:       "Item description",
            craftPrivate:    "Private (only you see the name)",
            craftEditDone:   "restraints updated with craft",
            craftPickTitle:  "Select restraints to edit craft",
            lockSpecify:     "Please specify a target (e.g. /bc fulllock [target] [lock name])",
            wardrobeDone:    "Wardrobe opened",
            clipboardFail:   "Cannot read clipboard",
            bcxInvalid:      "Invalid BCX code",
            bcxDone:         "imported BCX appearance for",
            rpOn:            "RP Mode enabled",
            rpOff:           "RP Mode disabled",
            rpBtnShow:       "RP button shown",
            rpBtnHide:       "RP button hidden",
            heightLockOn:    "Height lock enabled (forces standard height)",
            heightLockOff:   "Height lock disabled",
            rmOn:            "Release Maid enabled (auto-responds to rescue/unlock messages)",
            rmOff:           "Release Maid disabled",
            arOn:            "Anti-restraint enabled (auto-remove restraints applied by others)",
            arOff:           "Anti-restraint disabled",
            oocOn:           "OOC mode enabled (messages auto-prefixed with ( for out-of-character)",
            oocOff:          "OOC mode disabled",
            arPanelTitle:    "Anti-restraint Settings",
            arAnnounce:      "Send glare emote on escape",
            arAnnounceDesc:  "Broadcast a glare action to the room after auto-escaping",
            arConfirm:       "Ask before escaping",
            arConfirmDesc:   "Show a confirm prompt each time a restraint is applied",
            arEmote:         "Custom glare text",
            arEmoteDesc:     "Use {item} (item name) {restrainer} (applier); blank = default",
            arWhitelist:     "Whitelist (never auto-remove)",
            arWhitelistDesc: "Click worn restraints to add/remove from whitelist",
            arKeep:          "Keep it",
            arEscape:        "Escape!",
            arEscaped:       "Auto-escaped {item}",
            arNoRestraint:   "No worn restraints available to whitelist",

            lscgSection:     "LSCG Wake",
            lscgWake:        "Sleep",
            lscgUnzonk:      "Hypnosis",
            lscgWakeCmd:     "Wake (sleep)",
            lscgMissing:     "LSCG not detected, command unavailable",
            lscgHelp:        "lscg <unzonk|wake>: run an LSCG wake command",
            sendFail:        "Custom action failed, possible plugin conflict",
            cmdFail:         "Command failed",
            unknownCmd:      "Unknown command",

            geTitle:      "Select enhancement",
            geItems:      "Get all items",
            geMoney:      "Set money to 999,999",
            geSkills:     "Max all skills to level 10",
            geItemsDone:  "new items added",
            geMoneyDone:  "Money set to 999,999",
            geSkillsDone: "All skills maxed to level 10",

            freeTitle:    "Select restraints to remove",
            password:     "Password",

            settingsTitle:    "Settings",
            settingsTheme:    "Theme",
            settingsDark:     "Dark",
            settingsLight:    "Light",
            settingsAccent:   "Accent Color",
            settingsReset:    "Reset All",
            settingsResetDone:"Settings reset",
            settingsOrderReset:"Button order reset",

            helpText:
                "BC工具箱 帮助\n\n" +
                "/bc help              - Show this help\n" +
                "/bc free [target]     - Select restraints to remove\n" +
                "/bc freetotal [target]- Remove all restraints\n" +
                "/bc bcximport [target]- Import BCX appearance\n" +
                "/bc fullunlock [target]-Remove all locks\n" +
                "/bc fulllock [target] [lock] - Add lock\n" +
                "/bc undo [target]     - Rollback appearance\n" +
                "/bc rpmode            - Toggle RP mode\n" +
                "/bc rpbtn             - Show/hide RP button\n" +
                "/bc heightlock        - Lock height to standard value\n" +
                "/bc releasemaid      - Toggle Release Maid (auto-rescue on messages)\n" +
                "/bc rmwords          - Customize rescue/unlock phrases\n" +
                "/bc antirestraint    - Toggle anti-restraint\n" +
                "/bc ooc              - Toggle OOC mode\n" +
                "  Tip: Put rescue words in parentheses to bypass gags, e.g. (unlock)\n" +
                "  Panel also has 'Action rescue' toggle: auto-unbinds on full emote\n" +
                "/bc geteverything     - Enhancement menu\n" +
                "/bc lscg <cmd>        - Run an LSCG command (e.g. unzonk / wake / drug-boost sleepy)\n" +
                "/bc editcraft [target]- Batch-edit restraint craft (name/desc/private)\n" +
                "/bc clearcraft [target]-Clear all craft on restraints\n" +
                "/bc wardrobe          - Open wardrobe\n" +
                "/bc theme             - Open theme settings",

            loaded: "BC工具箱 v{v} loaded! Use /bc help for help",
        }
    };

    function t(key, vars = {}) {
        const lang = isZh() ? LANG.zh : LANG.en;
        let str = lang[key] || key;
        for (const [k, v] of Object.entries(vars)) {
            str = str.replace("{" + k + "}", v);
        }
        return str;
    }

    // ──────────────────────────────────────────
    // 等待系列
    // ──────────────────────────────────────────
    function waitForBcModSdk() {
        return new Promise(resolve => {
            const check = () => {
                if (typeof bcModSdk !== 'undefined' && bcModSdk?.registerMod) resolve(true);
                else setTimeout(check, 100);
            };
            check();
        });
    }

    function waitFor(condition) {
        return new Promise(resolve => {
            const check = () => {
                if (condition()) resolve();
                else setTimeout(check, 500);
            };
            check();
        });
    }

    // ──────────────────────────────────────────
    // 初始化 modApi
    // ──────────────────────────────────────────
    async function initializeModApi() {
        await waitForBcModSdk();
        try {
            modApi = bcModSdk.registerMod({
                name: "BC工具箱",
                fullName: "BC工具箱",
                version: modversion,
                repository: 'https://github.com/heitaoplay/BC-Toolbox'
            });
            console.log("🐈‍⬛ [BC] ✅ modApi 初始化完成");
        } catch (e) {
            console.error("🐈‍⬛ [BC] ❌ 初始化 modApi 失敗:", e.message);
        }
    }

    // ──────────────────────────────────────────
    // 载入 Toast 系統
    // ──────────────────────────────────────────
    function loadToastSystem() {
        return new Promise((resolve, reject) => {
            if (window.ChatRoomSendLocalStyled) { resolve(); return; }
            const script = document.createElement('script');
            script.src = "https://awdrrawd.github.io/liko-Plugin-Repository/Plugins/expand/BC_toast_system.user.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Toast 载入失敗"));
            document.head.appendChild(script);
        });
    }

    // ──────────────────────────────────────────
    // ExtensionSettings 存取器
    // ──────────────────────────────────────────
    function getES() {
        if (!Player.ExtensionSettings) Player.ExtensionSettings = {};
        if (!Player.ExtensionSettings.BCToolbox) {
            Player.ExtensionSettings.BCToolbox = { heightLock: 0, rpBtnVisible: 0, stealthRp: 0, rpModeLocal: 0, releaseMaid: 0, antiRestraint: 0, antiRestraintAnnounce: 1, antiRestraintConfirm: 0, antiRestraintWhitelist: [], escapeEmoteText: '', oocEnabled: 0, superDice: 0, superDiceMode: 0, guardResident: 0 };
        }
        const s = Player.ExtensionSettings.BCToolbox;
        if (typeof s.heightLock       === 'undefined') s.heightLock       = 0;
        if (typeof s.rpBtnVisible     === 'undefined') s.rpBtnVisible     = 0;
        if (typeof s.stealthRp        === 'undefined') s.stealthRp        = 0;
        if (typeof s.rpModeLocal      === 'undefined') s.rpModeLocal      = 0;
        if (typeof s.releaseMaid      === 'undefined') s.releaseMaid      = 0;
        if (typeof s.antiRestraint         === 'undefined') s.antiRestraint         = 0;
        if (typeof s.antiRestraintAnnounce === 'undefined') s.antiRestraintAnnounce = 1;
        if (typeof s.antiRestraintConfirm  === 'undefined') s.antiRestraintConfirm  = 0;
        if (typeof s.antiRestraintWhitelist === 'undefined' || !Array.isArray(s.antiRestraintWhitelist)) s.antiRestraintWhitelist = [];
        if (typeof s.escapeEmoteText       === 'undefined') s.escapeEmoteText       = '';
        if (typeof s.oocEnabled            === 'undefined') s.oocEnabled            = 0;
        if (typeof s.superDice             === 'undefined') s.superDice             = 0;
        if (typeof s.superDiceMode         === 'undefined') s.superDiceMode         = 0;
        if (typeof s.guardResident         === 'undefined') s.guardResident         = 0;
        return s;
    }

    function saveES() {
        if (typeof ServerPlayerExtensionSettingsSync === 'function') {
            ServerPlayerExtensionSettingsSync("BCToolbox");
        }
    }

    // ──────────────────────────────────────────
    // 初始化储存
    // ──────────────────────────────────────────
    function initializeStorage() {
        // 旧名称数据迁移（Liko → BC工具箱）：用方括号语法读取旧键，避免被改名覆盖，保留用户原有设置
        if (Player.ExtensionSettings && Player.ExtensionSettings['LikoTOOL'] && !Player.ExtensionSettings.BCToolbox) {
            Player.ExtensionSettings.BCToolbox = Player.ExtensionSettings['LikoTOOL'];
            delete Player.ExtensionSettings['LikoTOOL'];
        }
        if (Player['LikoTool'] && !Player.BCToolbox) {
            Player.BCToolbox = Player['LikoTool'];
            delete Player['LikoTool'];
        }
        if (Player.OnlineSharedSettings && Player.OnlineSharedSettings['LikoTOOL'] && !Player.OnlineSharedSettings.BCToolbox) {
            Player.OnlineSharedSettings.BCToolbox = Player.OnlineSharedSettings['LikoTOOL'];
            delete Player.OnlineSharedSettings['LikoTOOL'];
        }

        if (!Player.BCToolbox) {
            Player.BCToolbox = { bypassActivities: false };
        }
        if (!Player.OnlineSharedSettings) Player.OnlineSharedSettings = {};
        if (!Player.OnlineSharedSettings.BCToolbox) {
            Player.OnlineSharedSettings.BCToolbox = { RPmode: 0 };
        }
        if (typeof Player.OnlineSharedSettings.BCToolbox.RPmode === 'undefined') {
            Player.OnlineSharedSettings.BCToolbox.RPmode = 0;
        }
        getES();
    }

    // ──────────────────────────────────────────
    // RP 模式（支持隐身：stealthRp=1 时状态纯本地，不广播）
    //  - stealthRp ON  → 自己能看到图标，别人看不到（存 ExtensionSettings）
    //  - stealthRp OFF → 所有人都能看到图标（存 OnlineSharedSettings 广播）
    //  - Shift+P 长按 1.5 秒切换 stealthRp
    // ──────────────────────────────────────────
    function getRpMode(character) {
        if (!character) return false;
        if (character.IsPlayer && character.IsPlayer()) {
            return getES().stealthRp === 1
                ? getES().rpModeLocal === 1
                : Player.OnlineSharedSettings?.BCToolbox?.RPmode === 1;
        }
        return character.OnlineSharedSettings?.BCToolbox?.RPmode === 1;
    }

    function setRpMode(enabled) {
        const s = getES();
        if (s.stealthRp === 1) {
            s.rpModeLocal = enabled ? 1 : 0;
            saveES();
        } else {
            if (!Player.OnlineSharedSettings) Player.OnlineSharedSettings = {};
            if (!Player.OnlineSharedSettings.BCToolbox) Player.OnlineSharedSettings.BCToolbox = {};
            Player.OnlineSharedSettings.BCToolbox.RPmode = enabled ? 1 : 0;
            if (typeof ServerAccountUpdate?.QueueData === 'function') {
                ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings });
            }
        }
        if (typeof window.__LT_updateToggles === 'function') window.__LT_updateToggles();
    }

    // ──────────────────────────────────────────
    // 反束缚（移植自 EmeryBC antiRestraint）
    //   - 开启后，房间内他人（及任何新施加）的拘束只要不在白名单、不在进房快照里，都会被自动解除
    //   - 可选「解除前先询问」弹窗 / 「解除时发送瞪视表情」/ 自定义瞪视文字 / 白名单
    // ──────────────────────────────────────────
    const LT_RESTRAINT_GROUPS = new Set([
        "ItemArms","ItemArmbinder","ItemArmsCuffs","ItemBoots","ItemBreast","ItemBreast2",
        "ItemButt","ItemButtPlug","ItemCollar","ItemCollar2","ItemCorset","ItemCorset2",
        "ItemElbow","ItemFeet","ItemFeet2","ItemFoot","ItemGag","ItemGag2","ItemGag3",
        "ItemHood","ItemHood2","ItemHood3","ItemLegs","ItemLegCuffs","ItemMittens",
        "ItemMouth","ItemMouth2","ItemMouth3","ItemNeck","ItemNose","ItemPelvis",
        "ItemPlug","ItemPussy","ItemPussy2","ItemSuit","ItemSuit2","ItemTorso",
        "ItemTorso2","ItemWaist","ItemWings","ItemDevices","ItemNipple","ItemNipple2",
        "ItemTapedHands","ItemTapedFeet","ItemHempRope","ItemLeatherRope","ItemRope",
        "ItemSpreader","ItemStraitJacket","ItemYoke","ItemBra","ItemPanties"
    ]);

    function getAntiRestraint()            { return getES().antiRestraint === 1; }
    function getAntiRestraintAnnounce()    { return getES().antiRestraintAnnounce !== 0; }
    function getAntiRestraintConfirm()      { return getES().antiRestraintConfirm === 1; }
    function getAntiRestraintWhitelist()    { const w = getES().antiRestraintWhitelist; return Array.isArray(w) ? w : []; }
    function getEscapeEmoteText()           { return getES().escapeEmoteText || ""; }
    function getOocEnabled()                { return getES().oocEnabled === 1; }

    function setAntiRestraintAnnounce(v)    { getES().antiRestraintAnnounce = v ? 1 : 0; saveES(); }
    function setAntiRestraintConfirm(v)      { getES().antiRestraintConfirm  = v ? 1 : 0; saveES(); }
    function setEscapeEmoteText(v)           { getES().escapeEmoteText = v || ""; saveES(); }
    function setOocEnabled(v)                { getES().oocEnabled = v ? 1 : 0; saveES(); }

    // ──────────────────────────────────────────
    // 超级骰子（仅影响自己）
    //   - 钩住 LSCG 的 MakeActivityCheck / UnopposedActivityRoll / GetResistRoll
    //   - 只要「自己」是 roll 的攻方或守方，就让自己必胜
    //   - 两种显示模式可切换（_superDice.mode）：
    //       'A'（智能碾压）：显示成自然高点数（如 [20+2]），刚好压过对手
    //       'C'（∞ 伪装）：显示成 [∞]，诚实表明无限大（借鉴 BBC 的 Chaos Aura 思路）
    //   - 绝不修改对手的 LSCG 参数 / 点数（self-only）
    //   - 开关只翻转标志；wrapper 在调用时按标志/模式生效
    //   - 每 2 秒心跳重装补丁，兼容 LSCG 重载
    // ──────────────────────────────────────────
    var _superDice = { enabled: false, mode: 'A', iu: null, hy: null };

    // 把一个 roll 实例改造成「必胜」；isUnopposed=true 时无视对手、直接给合法上限高点数
    function applySuperDiceRoll(roll, opponentTotal, isUnopposed) {
        if (_superDice.mode === 'C') {
            // ∞ 伪装：显示 [∞]，判定无限大
            // 双保险：优先用 getter 覆盖 Total/TotalStr；若 BC 把该属性定义为 non-configurable
            // （defineProperty 会抛错），则退化为「超大数值 + 尽力改写显示」，确保 ∞ 永不静默失效。
            var okTotal = true, okStr = true;
            try { Object.defineProperty(roll, 'TotalStr', { get: function () { return '[∞] '; }, configurable: true }); } catch (e) { okStr = false; }
            try { Object.defineProperty(roll, 'Total',   { get: function () { return Infinity; }, configurable: true }); } catch (e) { okTotal = false; }
            if (!okTotal || !okStr) {
                try { roll.Raw = 1e9; roll.Modifier = 0; } catch (e) {}   // 兜底：数值层面保证必胜
                if (!okStr) { try { roll.TotalStr = '[∞] '; } catch (e) {} } // 尽力改写显示
            }
            return;
        }
        // 智能碾压：自然高点数，刚好压过对手
        if (isUnopposed) {
            roll.Raw = 20;       // 天然 20
            roll.Modifier = 18;  // 合法修正上限 → [20+18]=38，通过绝大多数 DC
        } else {
            var margin = 1 + Math.floor(Math.random() * 5); // 压过对手 1~5 点
            var target = (typeof opponentTotal === 'number' ? opponentTotal : 0) + margin;
            roll.Raw = 20; // 天然 20
            roll.Modifier = Math.max(-18, Math.min(18, target - 20)); // 合理修正，范围 -18~+18
            if (target > 38) {
                // 对手极端高：显示仍合理，但 Total 强制必胜
                try { Object.defineProperty(roll, 'Total', { get: function () { return Math.max(0, target); }, configurable: true }); } catch (e) {}
                return;
            }
        }
        // 从 ∞ 模式切回智能模式时，清理之前覆盖的 getter，让原型方法重新生效
        try { delete roll.Total; } catch (e) {}
        try { delete roll.TotalStr; } catch (e) {}
    }

    // ── 单一合并的 MakeActivityCheck 包裹（超级骰子 + 守护常驻共用，幂等，杜绝反复套娃）──
    // 之前两功能各自独立包裹同一函数、且只校验自己的 __*Patched 标志，导致心跳每次都重新嵌套，
    // 链深到触发 Maximum call stack size exceeded，使两个模式「整体失效」。现改为一个合并 wrapper。
    var LT_MAKE_PATCHED = '__ltMakePatched';
    function ltMakeActivityCheck(orig, attacker, defender) {
        var check = orig.call(this, attacker, defender);
        // 超级骰子：自己参与的 roll 强制必胜（self-only，不改他人参数）
        if (_superDice.enabled) {
            try {
                if (attacker && Player && attacker === Player && check && check.AttackerRoll) applySuperDiceRoll(check.AttackerRoll, check.DefenderRoll ? check.DefenderRoll.Total : 0, false);
                if (defender && Player && defender === Player && check && check.DefenderRoll) applySuperDiceRoll(check.DefenderRoll, check.AttackerRoll ? check.AttackerRoll.Total : 0, false);
            } catch (e) {}
        }
        // 守护常驻：仅在处理法术且自己是守方、屏障生效时，强制防御方获胜（让有害法术反弹）
        try {
            if (_guard.enabled && _guard.inSpell && defender === Player) {
                var barrier = window.LSCG.getModule('StateModule') && window.LSCG.getModule('StateModule').BarrierState;
                if (barrier && barrier.Active) {
                    check.DefenderRoll.Raw = 20;
                    var at = check.AttackerRoll.Total;
                    check.DefenderRoll.Modifier = (at === Infinity) ? Infinity : Math.max(0, at + 1 - 20);
                }
            }
        } catch (e) {}
        return check;
    }
    function ensureMakeActivityCheckPatched() {
        try {
            if (typeof window.LSCG === 'undefined' || !window.LSCG || typeof window.LSCG.getModule !== 'function') return;
            var iu = window.LSCG.getModule('ItemUseModule');
            if (!iu || !iu.MakeActivityCheck) return;
            if (iu.MakeActivityCheck[LT_MAKE_PATCHED]) return;   // 已合并打补丁 → 幂等，不重包裹
            var orig = iu.MakeActivityCheck;
            iu.MakeActivityCheck = function (attacker, defender) {
                return ltMakeActivityCheck.call(this, orig, attacker, defender);
            };
            iu.MakeActivityCheck[LT_MAKE_PATCHED] = true;
        } catch (e) {}
    }

    function ensureSuperDicePatched() {
        try {
            if (typeof window.LSCG === 'undefined' || !window.LSCG || typeof window.LSCG.getModule !== 'function') return;
            var iu = window.LSCG.getModule('ItemUseModule');
            var hy = window.LSCG.getModule('HypnoModule');
            var lm = window.LSCG.getModule('LeashingModule');
            if (!iu || !hy) return;
            ensureMakeActivityCheckPatched();   // MakeActivityCheck 由合并 wrapper 统一处理
            if (_superDice.iu === iu && iu.UnopposedActivityRoll && iu.UnopposedActivityRoll.__superDicePatched && hy.GetResistRoll && hy.GetResistRoll.__superDicePatched && lm && lm.IncomingEscape && lm.IncomingEscape.__ltSuperDiceEscapePatched) return;

            // MakeActivityCheck 已合并包裹（见上方 ensureMakeActivityCheckPatched），此处只处理其他两个 hook

            var origUnop = iu.UnopposedActivityRoll;
            iu.UnopposedActivityRoll = function (C) {
                var roll = origUnop.call(this, C);
                if (_superDice.enabled) { try { if (C && Player && C === Player && roll) applySuperDiceRoll(roll, 0, true); } catch (e) {} }
                return roll;
            };
            iu.UnopposedActivityRoll.__superDicePatched = true;

            var origResist = hy.GetResistRoll;
            hy.GetResistRoll = function () {
                if (!_superDice.enabled) return origResist.call(this);
                if (_superDice.mode === 'C') return Infinity; // ∞ 伪装
                return 100; // 智能：满值抵抗（内部判定，不显示于聊天），稳赢
            };
            hy.GetResistRoll.__superDicePatched = true;

            // 挣扎反制：LSCG 的挣脱检定完全在挣扎者本地执行，控制方无法干预其 roll 点。
            // 因此在控制方收到 escape 命令时，立即重新抓取对方，使对方无法真正脱离控制。
            if (lm && (!lm.IncomingEscape || !lm.IncomingEscape.__ltSuperDiceEscapePatched)) {
                var origEscape = lm.IncomingEscape;
                lm.IncomingEscape = function (sender, escapeFromMemberNumber) {
                    var senderMemberNumber = sender && sender.MemberNumber;
                    var typesToRegrab = [];
                    // 在移除前先记录被自己抓住的 grab 类型
                    if (_superDice.enabled && senderMemberNumber && escapeFromMemberNumber == Player.MemberNumber && lm && lm.Leashings) {
                        try {
                            typesToRegrab = lm.Leashings
                                .filter(function (p) { return p.IsSource && p.PairedMember === senderMemberNumber; })
                                .map(function (p) { return p.Type; });
                        } catch (e) {}
                    }
                    var ret = origEscape.call(this, sender, escapeFromMemberNumber);
                    // 移除后立即重新抓回
                    if (_superDice.enabled && typesToRegrab.length > 0) {
                        try {
                            var target = (typeof getCharacter === 'function') ? getCharacter(senderMemberNumber) : null;
                            if (target) {
                                typesToRegrab.forEach(function (type) {
                                    try { lm.DoGrab(target, type); } catch (e) {}
                                });
                            }
                        } catch (e) {}
                    }
                    return ret;
                };
                lm.IncomingEscape.__ltSuperDiceEscapePatched = true;
            }

            _superDice.iu = iu;
            _superDice.hy = hy;
        } catch (e) {}
    }
    function getSuperDice() { try { return getES().superDice === 1; } catch (e) { return false; } }
    function getSuperDiceMode() { try { return getES().superDiceMode === 1 ? 'C' : 'A'; } catch (e) { return 'A'; } }
    function setSuperDice(v) {
        try {
            getES().superDice = v ? 1 : 0;
            saveES();
            _superDice.enabled = v;
            ensureSuperDicePatched();
        } catch (e) {}
        if (typeof window.__LT_updateToggles === 'function') window.__LT_updateToggles();
    }
    function setSuperDiceMode(c) {
        try {
            getES().superDiceMode = (c === 'C') ? 1 : 0;
            saveES();
            _superDice.mode = (c === 'C') ? 'C' : 'A';
        } catch (e) {}
        if (typeof window.__LT_updateToggles === 'function') window.__LT_updateToggles();
    }

    // ──────────────────────────────────────────
    // 守护常驻（LSCG 魔法屏障 / type "protected"）
    //   - 开启即自动获得一个无限屏障（无需手动先释放护盾魔法）
    //   - 让 BarrierState 时长无限（duration=0），不会自然过期
    //   - 别人对你施放有害法术时，强制防御检定成功 → 法术被反弹，屏障不消耗
    //   - 关闭时恢复 LSCG 默认 15min 过期行为
    //   - self-only / 持久化 / 2 秒心跳重装补丁兼容 LSCG 重载
    // ──────────────────────────────────────────
    var _guard = { enabled: false, sm: null, mm: null, ium: null, inSpell: false, patched: false };

    function ensureGuardPatched() {
        try {
            if (typeof window.LSCG === 'undefined' || !window.LSCG || typeof window.LSCG.getModule !== 'function') return;
            var sm = window.LSCG.getModule('StateModule');
            var mm = window.LSCG.getModule('MagicModule');
            var ium = window.LSCG.getModule('ItemUseModule');
            if (!sm || !sm.BarrierState || !mm || !ium) return;
            ensureMakeActivityCheckPatched();   // 确保合并 wrapper 已就位（处理法术防御分支）
            var bs = sm.BarrierState;
            // 开启状态且当前无屏障：自动给自己加一个无限屏障（免去手动释放护盾魔法；
            // 同时作为延迟加载兜底 + 屏障被其它路径消耗后的自动补回）
            if (_guard.enabled && bs && !bs.Active) {
                try { bs.Barrier((typeof Player !== 'undefined' && Player && Player.MemberNumber) || -1, false, 0); } catch (e) {}
            }
            // 以「模块实例是否变化」判定是否需要重包裹，不再依赖 MakeActivityCheck 上的标志
            // （否则超级骰子重包 MakeActivityCheck 后会剥掉本标志，导致本功能也被迫反复套娃）
            var alreadyPatched = _guard.patched && _guard.sm === sm && _guard.mm === mm && _guard.ium === ium &&
                                 bs.Barrier && bs.Barrier.__guardPatched &&
                                 bs.Recover && bs.Recover.__guardPatched &&
                                 mm.IncomingSpellCommand && mm.IncomingSpellCommand.__guardPatched;
            if (alreadyPatched) return;

            // 1) 施法入口打标记，用于 MakeActivityCheck 识别「正在处理法术」
            var origIncomingSpellCommand = mm.IncomingSpellCommand;
            mm.IncomingSpellCommand = function(sender, msg) {
                if (_guard.enabled) {
                    _guard.inSpell = true;
                    try { return origIncomingSpellCommand.call(this, sender, msg); }
                    finally { _guard.inSpell = false; }
                }
                return origIncomingSpellCommand.call(this, sender, msg);
            };
            mm.IncomingSpellCommand.__guardPatched = true;

            // 2) 防御检定（强制防御方获胜）已由合并 wrapper 的守护常驻分支处理，此处不再单独包裹 MakeActivityCheck

            // 3) 屏障施放时改为无限时长
            var origBarrier = bs.Barrier;
            bs.Barrier = function(memberNumber, emote, duration) {
                if (_guard.enabled) {
                    try { return origBarrier.call(this, memberNumber, emote, 0); }
                    catch (e) { return origBarrier.call(this, memberNumber, emote, duration); }
                }
                return origBarrier.call(this, memberNumber, emote, duration);
            };
            bs.Barrier.__guardPatched = true;

            // 4) 任何移除（反弹/击碎/到期/解除）都先走原版移除，再立即补回（保持常驻）
            var origRecover = bs.Recover;
            bs.Recover = function(emote) {
                if (_guard.enabled) {
                    try {
                        var by = (this.config && this.config.activatedBy) ||
                                 (typeof Player !== 'undefined' && Player && Player.MemberNumber) || -1;
                        origRecover.call(this, emote);
                        this.Activate(by, 0, false);
                    } catch (e) {}
                    return this;
                }
                return origRecover.call(this, emote);
            };
            bs.Recover.__guardPatched = true;

            // 开启状态下若屏障已存在，立即补满为无限时长
            if (_guard.enabled && bs.Active) {
                try { var by2 = (bs.config && bs.config.activatedBy) || -1; bs.Activate(by2, 0, false); } catch (e) {}
            }

            _guard.sm = sm;
            _guard.mm = mm;
            _guard.ium = ium;
            _guard.patched = true;
        } catch (e) {}
    }
    function getGuard() { try { return getES().guardResident === 1; } catch (e) { return false; } }
    function setGuard(v) {
        try {
            getES().guardResident = v ? 1 : 0;
            saveES();
            _guard.enabled = v;
            ensureGuardPatched();
            // 关闭时：把已存在的无限屏障恢复为 LSCG 默认 15min 时长
            if (!v) {
                try {
                    var sm = window.LSCG && window.LSCG.getModule && window.LSCG.getModule('StateModule');
                    var bs = sm && sm.BarrierState;
                    if (bs && bs.Active && !(bs.config && bs.config.duration)) {
                        var defDur = (bs.constructor && bs.constructor.BUFF_DURATION) || 900000;
                        bs.Activate((bs.config && bs.config.activatedBy) || (typeof Player !== 'undefined' && Player && Player.MemberNumber) || -1, defDur, false);
                    }
                } catch (e) {}
            }
        } catch (e) {}
        if (typeof window.__LT_updateToggles === 'function') window.__LT_updateToggles();
    }

    function addAntiRestraintWhitelist(group)   { const w = getAntiRestraintWhitelist(); if (!w.includes(group)) { w.push(group); getES().antiRestraintWhitelist = w; saveES(); } }
    function removeAntiRestraintWhitelist(group) { getES().antiRestraintWhitelist = getAntiRestraintWhitelist().filter(g => g !== group); saveES(); }

    let ltKnownRestraints = new Set();
    let ltLastRestrainer = null;
    const LT_ESCAPE_SYNC_MS = 2000;
    let ltLastEscapeSync = 0;

    function ltSnapshotRestraints() {
        try {
            ltKnownRestraints = new Set(
                Player.Appearance
                    .filter(i => LT_RESTRAINT_GROUPS.has(i.Asset.Group.Name))
                    .map(i => i.Asset.Group.Name)
            );
        } catch (e) { /* ignore */ }
    }

    function ltRecordRestrainer(sourceNum) {
        try {
            const room = ChatRoomCharacter;
            if (!Array.isArray(room)) return;
            const c = room.find(ch => ch && ch.MemberNumber === sourceNum);
            if (!c) return;
            ltLastRestrainer = (c.Nickname && c.Nickname.trim()) || c.Name || null;
        } catch (e) { /* ignore */ }
    }

    function ltAntiRestraintEmote(text) {
        if (CurrentScreen !== "ChatRoom" || !text || !text.trim()) return;
        try {
            // BC Action 消息：Content 即动作文本，客户端会自动在前面加上发送者名字。
            // 不要再手动拼接 Player.Name，否则会出现「名字 名字 动作」的重复。
            ServerSend("ChatRoomChat", {
                Type: "Action",
                Content: text.trim(),
                Dictionary: [
                    { SourceCharacter: Player.MemberNumber },
                ],
            });
        } catch (e) {
            console.error("🐈‍⬛ [BC] ❌ 反束缚表情发送错误:", e.message);
            if (typeof ChatRoomSendLocal === 'function') {
                ChatRoomSendLocal(t('sendFail'));
            }
        }
    }

    function ltDoEscape(newItems, restrainer, itemName) {
        try {
            newItems.forEach(i => { try { InventoryRemove(Player, i.Asset.Group.Name, false); } catch (e) {} });
            CharacterRefresh(Player, false);
            const now = Date.now();
            if (now - ltLastEscapeSync >= LT_ESCAPE_SYNC_MS) {
                ltLastEscapeSync = now;
                try { ChatRoomCharacterUpdate(Player); } catch (e) {}
                try { ServerPlayerAppearanceSync(); } catch (e) {}
            }
            if (getAntiRestraintAnnounce()) {
                const custom = getEscapeEmoteText();
                let text;
                if (custom && custom.trim()) {
                    text = custom.replace("{item}", itemName).replace("{restrainer}", restrainer || "");
                } else {
                    text = restrainer
                        ? `glares at ${restrainer} as the ${itemName} falls away.`
                        : `glares ahead as the ${itemName} falls away.`;
                }
                ltAntiRestraintEmote(text);
            }
            if (typeof ChatRoomSendLocal === 'function') {
                ChatRoomSendLocal(t('arEscaped', { item: itemName }));
            }
        } catch (e) { /* ignore */ }
    }

    function ltShowEscapePrompt(itemName, restrainer, onKeep, onEscape) {
        const overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed", "top:50%", "left:50%",
            "transform:translate(-50%,-50%)",
            "background:var(--lt-surface,#1a1018)", "border:2px solid var(--lt-accent,#FF5C7A)",
            "border-radius:12px", "padding:18px 22px",
            "z-index:999999", "font-family:var(--lt-font,-apple-system,sans-serif)",
            "min-width:260px", "max-width:340px",
            "box-shadow:0 6px 32px rgba(0,0,0,0.85)",
            "display:flex", "flex-direction:column", "gap:12px",
            "color:var(--lt-text,#f3e9ee)",
        ].join(";");

        const who = restrainer ? `<b style="color:var(--lt-accent,#FF5C7A)">${restrainer}</b> 正在` : "有人正在";
        const msg = document.createElement("div");
        msg.style.cssText = "font-size:13px;line-height:1.55;";
        msg.innerHTML = `${who}对你施加 <b>${itemName}</b>。<br>你想怎么做？`;
        overlay.appendChild(msg);

        const btns = document.createElement("div");
        btns.style.cssText = "display:flex;gap:8px;";
        const keepBtn = document.createElement("button");
        keepBtn.textContent = t('arKeep');
        keepBtn.style.cssText = "flex:1;font-size:12px;font-weight:bold;padding:7px;border-radius:8px;cursor:pointer;border:1px solid #79a885;background:#0f2a1a;color:#79a885;";
        keepBtn.addEventListener("click", () => { overlay.remove(); onKeep(); });
        const escBtn = document.createElement("button");
        escBtn.textContent = t('arEscape');
        escBtn.style.cssText = "flex:1;font-size:12px;font-weight:bold;padding:7px;border-radius:8px;cursor:pointer;border:1px solid var(--lt-accent,#FF5C7A);background:#3a1020;color:var(--lt-accent,#FF5C7A);";
        escBtn.addEventListener("click", () => { overlay.remove(); onEscape(); });
        btns.appendChild(keepBtn);
        btns.appendChild(escBtn);
        overlay.appendChild(btns);
        document.body.appendChild(overlay);
    }

    function ltAntiRestraintRefresh() {
        if (!getAntiRestraint()) return;
        if (CurrentScreen !== "ChatRoom") return;
        try {
            const wl = getAntiRestraintWhitelist();
            const current = Player.Appearance.filter(i => LT_RESTRAINT_GROUPS.has(i.Asset.Group.Name));
            const candidates = current.filter(i =>
                !ltKnownRestraints.has(i.Asset.Group.Name) && !wl.includes(i.Asset.Group.Name)
            );
            if (!candidates.length) return;

            // 立刻标记为已知，避免同一批物品反复触发
            candidates.forEach(i => ltKnownRestraints.add(i.Asset.Group.Name));

            const first = candidates[0];
            const itemName = (first.Asset && (first.Asset.Description || first.Asset.Name)) || "restraint";
            const restrainer = ltLastRestrainer;
            ltLastRestrainer = null;

            if (getAntiRestraintConfirm()) {
                ltShowEscapePrompt(itemName, restrainer,
                    () => {
                        // 保留：把这次检测到的物品从已知集合移除，否则下次不会再提示
                        candidates.forEach(i => ltKnownRestraints.delete(i.Asset.Group.Name));
                    },
                    () => { ltDoEscape(candidates, restrainer, itemName); }
                );
            } else {
                ltDoEscape(candidates, restrainer, itemName);
            }
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ 反束缚检测错误:", e.message); }
    }

    function antiRestraintCommand() {
        const s = getES();
        s.antiRestraint = s.antiRestraint !== 1 ? 1 : 0;
        saveES();
        if (s.antiRestraint === 1) {
            ltSnapshotRestraints();
        } else {
            // 关闭时清理状态，避免重开后旧标记导致新拘束不被检测
            ltKnownRestraints.clear();
            ltLastRestrainer = null;
        }
        ChatRoomSendLocal(s.antiRestraint === 1 ? t('arOn') : t('arOff'));
        return true;
    }

    function oocCommand() {
        const s = getES();
        s.oocEnabled = s.oocEnabled !== 1 ? 1 : 0;
        saveES();
        ChatRoomSendLocal(s.oocEnabled === 1 ? t('oocOn') : t('oocOff'));
        return true;
    }

    // ──────────────────────────────────────────
    // 身高系統
    // ──────────────────────────────────────────
    let heightTargetChar = null;

    function _ltGetRealRatio(C) {
        return Object.prototype.hasOwnProperty.call(C, '_ltRealHeightRatio')
            ? C._ltRealHeightRatio
            : C.HeightRatio;
    }
    function _ltGetRealModifier(C) {
        return Object.prototype.hasOwnProperty.call(C, '_ltRealHeightModifier')
            ? C._ltRealHeightModifier
            : C.HeightModifier;
    }

    function _ltClearHeightDefine(C) {
        const r = _ltGetRealRatio(C);
        const m = _ltGetRealModifier(C);
        try { delete C.HeightRatio;    } catch (e) {}
        try { delete C.HeightModifier; } catch (e) {}
        delete C._ltRealHeightRatio;
        delete C._ltRealHeightModifier;
        delete C._ltHeightLocked;
        C.HeightRatio    = r;
        C.HeightModifier = m;
    }

    function applyHeightLock(C) {
        if (!C || C._ltHeightLocked) return;
        const realRatio    = _ltGetRealRatio(C);
        const realModifier = _ltGetRealModifier(C);
        try { delete C.HeightRatio;    } catch (e) {}
        try { delete C.HeightModifier; } catch (e) {}
        C._ltRealHeightRatio    = realRatio;
        C._ltRealHeightModifier = realModifier;
        Object.defineProperty(C, 'HeightRatio', {
            get()  { const r = this._ltRealHeightRatio; return (r < 0.8 || r > 1) ? 1.0 : r; },
            set(v) { this._ltRealHeightRatio = v; },
            configurable: true, enumerable: true
        });
        Object.defineProperty(C, 'HeightModifier', {
            get()  { return 0; },
            set(v) { this._ltRealHeightModifier = v; },
            configurable: true, enumerable: true
        });
        C._ltHeightLocked = true;
        console.log("🐈‍⬛ [BC] heightlock 套用 → " + C.Name);
    }

    function removeHeightHijack(C) {
        if (!C || !C._ltHeightLocked) return;
        _ltClearHeightDefine(C);
        console.log("🐈‍⬛ [BC] 身高还原 → " + C.Name);
    }

    function applyHeightToTarget(C) {
        if (!C) return;
        const s = getES();
        if (s.heightLock === 1)     applyHeightLock(C);
    }

    // ──────────────────────────────────────────
    // Canvas：绘制 RP 图标
    // ──────────────────────────────────────────
    function drawRpIcon(C, CharX, CharY, Zoom) {
        if (!getRpMode(C)) return;
        const offsetY = (C.IsKneeling && C.IsKneeling()) ? 300 : 40;
        DrawImageResize(rpIconUrl, CharX + 340 * Zoom, CharY + offsetY * Zoom, 45 * Zoom, 50 * Zoom);
    }

    // ──────────────────────────────────────────
    // 工具函数
    // ──────────────────────────────────────────
    function ChatRoomSendLocal(message, sec = 0) {
        if (CurrentScreen !== "ChatRoom") { console.warn("🐈‍⬛ [BC] ❗ " + t('notInChat')); return; }
        try {
            ChatRoomMessage({
                Type: "LocalMessage",
                Sender: Player.MemberNumber,
                Content: '<font color="#FF69B4">[BC] ' + message + '</font>',
                Timeout: sec
            });
        } catch (e) {
            console.error("🐈‍⬛ [BC] ❌ 发送本地讯息错误:", e.message);
        }
    }

    function getPlayer(identifier) {
        if (!identifier || identifier.trim() === "") return Player;
        if (typeof identifier === "number" || /^\d+$/.test(identifier)) {
            return ChatRoomCharacter?.find(c => c.MemberNumber === parseInt(identifier)) || Player;
        }
        return ChatRoomCharacter?.find(c =>
            c.Name.toLowerCase()        === identifier.toLowerCase() ||
            c.Nickname?.toLowerCase()   === identifier.toLowerCase() ||
            c.AccountName.toLowerCase() === identifier.toLowerCase()
        ) || Player;
    }

    function getNickname(character) {
        return character?.Nickname || character?.Name || character?.AccountName || t('unknown');
    }

    function chatSendCustomAction(message) {
        if (CurrentScreen !== "ChatRoom") return;
        try {
            ServerSend("ChatRoomChat", {
                Type: "Action",
                Content: "CUSTOM_SYSTEM_ACTION",
                Dictionary: [{ Tag: 'MISSING TEXT IN "Interface.csv": CUSTOM_SYSTEM_ACTION', Text: message }]
            });
        } catch (e) {
            console.error("🐈‍⬛ [BC] ❌ 自訂动作发送错误:", e.message);
            ChatRoomSendLocal(t('sendFail'));
        }
    }

    // ── 自带彩色 Toast（成功绿 / 失败红 / 信息中性），单条替换式、自动消失 ──
    // ltToastSuppressed 用于批量模式：循环内抑制单目标 toast，结束由 batchApplyToTargets 统一汇报。
    var ltToastSuppressed = false;
    function ltToast(msg, type) {
        if (!document || !document.body) return;
        type = type || 'info';
        let host = document.getElementById('lt-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'lt-toast-host';
            document.body.appendChild(host);
        }
        host.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'lt-toast lt-toast-' + type;
        el.textContent = msg;
        host.appendChild(el);
        const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function (fn) { setTimeout(fn, 0); };
        raf(function () { el.classList.add('show'); });
        clearTimeout(el._ltTimer);
        el._ltTimer = setTimeout(function () {
            el.classList.remove('show');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
        }, 2600);
    }

    function hasBCItemPermission(target) {
        if (Player.BCToolbox?.bypassActivities) return true;
        return typeof ServerChatRoomGetAllowItem === "function"
            ? ServerChatRoomGetAllowItem(Player, target)
            : true;
    }

    // ════════════════════════════════════════════════════════════════════════
    // UI 樣式注入 — v2.1 CSS 变量 + 双主题
    // ════════════════════════════════════════════════════════════════════════
    function injectLtStyles() {
        if (document.getElementById("lt-styles")) return;
        const s = document.createElement("style");
        s.id = "lt-styles";
        s.textContent = [
            "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap');",

            // ── Global reset ──
            ".lt-panel,.lt-panel *,#lt-quick-panel,#lt-quick-panel *{box-sizing:border-box;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;user-select:none;-webkit-user-select:none;}",

            // ═══ 弹窗 Panel ════════════════════════════════════════════════════
            ".lt-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);min-width:340px;max-width:600px;max-height:90vh;background:var(--lt-bg,rgba(14,18,30,0.98));backdrop-filter:blur(28px) saturate(1.4);-webkit-backdrop-filter:blur(28px) saturate(1.4);border:1px solid var(--lt-border,rgba(255,255,255,0.08));border-radius:18px;z-index:99999;display:flex;flex-direction:column;box-shadow:0 2px 4px rgba(0,0,0,0.2),0 8px 32px rgba(0,0,0,0.4),0 24px 64px var(--lt-shadow,rgba(0,0,0,0.5)),inset 0 1px 0 rgba(255,255,255,0.06),0 0 0 1px var(--lt-accent-glow,transparent);color:var(--lt-text,#d8e6f8);font-size:13px;overflow:hidden;animation:lt-modal-in 0.22s cubic-bezier(0.16,1,0.3,1);}",
            "@keyframes lt-modal-in{from{opacity:0;transform:translate(-50%,-50%) scale(0.93)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}",

            // ── Modal Header ──
            ".lt-header{background:var(--lt-header-grad);padding:13px 18px;display:flex;align-items:center;justify-content:space-between;cursor:grab;flex-shrink:0;position:relative;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.12),inset 0 -1px 0 rgba(0,0,0,0.15);}",
            ".lt-header:active{cursor:grabbing;}",
            ".lt-header::before{content:'';position:absolute;top:0;left:-100%;width:40%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,0.1),transparent);animation:lt-shimmer 6s ease-in-out infinite;pointer-events:none;}",
            "@keyframes lt-shimmer{0%{transform:translateX(0)}100%{transform:translateX(600%)}}",
            ".lt-title{font-size:13px;font-weight:600;color:#fff;position:relative;z-index:1;letter-spacing:0.03em;text-shadow:0 1px 2px rgba(0,0,0,0.2);}",
            ".lt-hclose{background:rgba(255,255,255,0.1);border:none;border-radius:7px;color:#fff;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);position:relative;z-index:1;flex-shrink:0;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.1);}",
            ".lt-hclose:hover{background:rgba(255,255,255,0.2);box-shadow:inset 0 1px 0 rgba(255,255,255,0.15),0 0 8px rgba(255,255,255,0.08);}",
            ".lt-hclose:active{transform:scale(0.9);}",
            ".lt-hclose svg{width:14px;height:14px;}",

            // ── Modal Content ──
            ".lt-content{padding:16px 18px 8px;overflow-y:auto;overflow-x:hidden;flex:1;scrollbar-width:thin;scrollbar-color:var(--lt-scrollbar,rgba(139,45,196,0.4)) transparent;}",
            ".lt-content::-webkit-scrollbar{width:4px;}",
            ".lt-content::-webkit-scrollbar-thumb{background:var(--lt-scrollbar,rgba(139,45,196,0.4));border-radius:2px;}",
            ".lt-content::-webkit-scrollbar-track{background:transparent;}",
            ".lt-section{margin-bottom:12px;}",
            ".lt-hr{height:1px;background:var(--lt-border,rgba(255,255,255,0.05));margin:4px 0 12px;}",

            // ── Button List (modal) ──
            ".lt-btn-list{display:flex;flex-direction:column;gap:6px;}",
            ".lt-list-btn{width:100%;padding:11px 14px;text-align:left;background:linear-gradient(180deg,var(--lt-surface,rgba(255,255,255,0.04)),rgba(255,255,255,0.01));border:1px solid var(--lt-border,rgba(255,255,255,0.06));border-radius:10px;color:var(--lt-text-secondary,#b8c8e0);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);font-family:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);}",
            ".lt-list-btn:hover{background:linear-gradient(180deg,var(--lt-surface-hover),var(--lt-surface,rgba(255,255,255,0.02)));border-color:var(--lt-border-hover);color:var(--lt-accent-light);box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),0 2px 8px var(--lt-accent-glow);}",
            ".lt-list-btn:active{transform:scale(0.985);}",
            ".lt-list-btn.selected{background:var(--lt-surface-hover);border-color:var(--lt-border-hover);color:var(--lt-accent-light);box-shadow:inset 0 0 0 1px var(--lt-border-hover);}",
            ".lt-list-btn .lt-check{font-size:14px;color:var(--lt-accent);opacity:0.2;transition:opacity 0.18s;}",
            ".lt-list-btn.selected .lt-check{opacity:1;}",

            // ── Undo Meta ──
            ".lt-undo-meta{background:var(--lt-surface,rgba(255,255,255,0.03));border:1px solid var(--lt-border,rgba(255,255,255,0.05));border-radius:10px;padding:11px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.02);}",
            ".lt-undo-meta-row{font-size:11px;color:var(--lt-text-dim,#6a8ab0);margin-bottom:4px;}",
            ".lt-undo-meta-row:last-child{margin-bottom:0;}",
            ".lt-undo-meta-row span{color:var(--lt-accent-light,#a0c0e8);font-weight:500;}",

            // ── Nav Buttons ──
            ".lt-nav-btn{flex:1;padding:9px 4px;background:linear-gradient(180deg,var(--lt-surface,rgba(255,255,255,0.04)),rgba(255,255,255,0.01));border:1px solid var(--lt-border,rgba(255,255,255,0.06));border-radius:9px;color:var(--lt-text-dim,#6a6a9a);font-size:11px;cursor:pointer;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);}",
            ".lt-nav-btn svg{width:12px;height:12px;}",
            ".lt-nav-btn:hover:not(:disabled){background:var(--lt-surface-hover);border-color:var(--lt-border-hover);color:var(--lt-accent-light);box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),0 2px 6px var(--lt-accent-glow);}",
            ".lt-nav-btn:disabled{opacity:0.25;cursor:not-allowed;}",

            // ── Footer ──
            ".lt-footer{display:flex;gap:8px;padding:12px 18px;background:rgba(0,0,0,0.15);flex-shrink:0;border-top:1px solid var(--lt-border,rgba(255,255,255,0.04));box-shadow:inset 0 1px 0 rgba(0,0,0,0.1);}",
            ".lt-btn{flex:1;padding:10px;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);font-family:inherit;}",
            ".lt-btn-primary{background:var(--lt-header-grad);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,0.15),0 2px 8px rgba(0,0,0,0.2);}",
            ".lt-btn-primary:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,0.2),0 4px 16px var(--lt-accent-glow),0 2px 8px rgba(0,0,0,0.2);filter:brightness(1.08);}",
            ".lt-btn-primary:active{transform:scale(0.97);}",
            ".lt-btn-secondary{background:linear-gradient(180deg,var(--lt-surface-2,rgba(255,255,255,0.06)),rgba(255,255,255,0.02));color:var(--lt-text-dim,#5a7a9a);border:1px solid var(--lt-border,rgba(255,255,255,0.06));box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);}",
            ".lt-btn-secondary:hover{background:var(--lt-surface-hover);color:var(--lt-text-secondary);border-color:var(--lt-border-hover);}",
            ".lt-btn-secondary:active{transform:scale(0.97);}",
            ".lt-empty{text-align:center;color:var(--lt-text-dim,#4a6a8a);font-size:13px;padding:20px 0;}",

            // ═══ 快捷面板 Quick Panel ═══════════════════════════════════════════
            "#lt-quick-panel{position:fixed;z-index:99998;width:248px;border-radius:16px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.15),0 8px 24px rgba(0,0,0,0.35),0 20px 56px var(--lt-shadow,rgba(0,0,0,0.45)),inset 0 1px 0 rgba(255,255,255,0.06),0 0 0 1px var(--lt-accent-glow,transparent);background:var(--lt-bg,rgba(14,18,30,0.98));backdrop-filter:blur(28px) saturate(1.4);-webkit-backdrop-filter:blur(28px) saturate(1.4);border:1px solid var(--lt-border,rgba(255,255,255,0.08));opacity:0;transform:scale(0.92) translateY(8px);pointer-events:none;transition:opacity 0.22s ease,transform 0.22s cubic-bezier(0.16,1,0.3,1);}",
            "#lt-quick-panel.show{opacity:1;transform:scale(1) translateY(0);pointer-events:auto;}",
            "#lt-quick-panel.lt-light{backdrop-filter:blur(28px) saturate(1.5);-webkit-backdrop-filter:blur(28px) saturate(1.5);}",

            // ── Quick Panel Header ──
            "#lt-quick-panel .ltq-hdr{background:var(--lt-header-grad);color:#fff;font-size:13px;font-weight:600;padding:8px 12px;cursor:move;display:flex;align-items:center;justify-content:space-between;position:relative;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.12),inset 0 -1px 0 rgba(0,0,0,0.15);}",
            "#lt-quick-panel .ltq-hdr::before{content:'';position:absolute;top:0;left:-100%;width:40%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,0.1),transparent);animation:lt-shimmer 6s ease-in-out infinite;pointer-events:none;}",
            "#lt-quick-panel .ltq-hdr .ltq-title{pointer-events:none;position:relative;z-index:1;font-size:13px;letter-spacing:0.03em;text-shadow:0 1px 2px rgba(0,0,0,0.2);}",
            "#lt-quick-panel .ltq-hdr .ltq-hdr-btns{display:flex;align-items:center;gap:2px;position:relative;z-index:1;}",
            "#lt-quick-panel .ltq-hdr .ltq-icon-btn{cursor:pointer;opacity:0.55;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);background:none;border:none;color:#fff;padding:5px;border-radius:6px;display:flex;align-items:center;justify-content:center;}",
            "#lt-quick-panel .ltq-hdr .ltq-icon-btn:hover{opacity:1;background:rgba(255,255,255,0.14);box-shadow:inset 0 1px 0 rgba(255,255,255,0.1);}",
            "#lt-quick-panel .ltq-hdr .ltq-icon-btn:active{transform:scale(0.9);}",
            "#lt-quick-panel .ltq-hdr .ltq-icon-btn svg{width:16px;height:16px;}",

            // ── Quick Panel Body ──
            "#lt-quick-panel .ltq-body{padding:8px;display:flex;flex-direction:column;gap:3px;max-height:calc(100vh - 60px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--lt-scrollbar,rgba(139,45,196,0.35)) transparent;}",
            "#lt-quick-panel .ltq-body::-webkit-scrollbar{width:3px;}",
            "#lt-quick-panel .ltq-body::-webkit-scrollbar-thumb{background:var(--lt-scrollbar,rgba(139,45,196,0.35));border-radius:2px;}",

            // ── Action Grid (2-column, draggable) ──
            "#lt-quick-panel .ltq-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}",
            "#lt-quick-panel .ltq-action{background:linear-gradient(180deg,var(--lt-surface,rgba(255,255,255,0.04)),rgba(255,255,255,0.01));color:var(--lt-text-secondary,#b8c8e0);border:1px solid var(--lt-border,rgba(255,255,255,0.06));border-radius:8px;padding:7px 4px 6px;font-size:10.5px;cursor:pointer;text-align:center;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;align-items:center;gap:4px;font-family:inherit;font-weight:500;position:relative;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);}",
            "#lt-quick-panel .ltq-action::before{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:var(--lt-accent);opacity:0.2;transition:opacity 0.18s;}",
            "#lt-quick-panel .ltq-action:hover{background:linear-gradient(180deg,var(--lt-surface-hover),var(--lt-surface,rgba(255,255,255,0.02)));border-color:var(--lt-border-hover);color:var(--lt-accent-light);transform:translateY(-1px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 4px 12px var(--lt-accent-glow);}",
            "#lt-quick-panel .ltq-action:hover::before{opacity:0.6;}",
            "#lt-quick-panel .ltq-action:active{transform:scale(0.94);}",
            "#lt-quick-panel .ltq-action .ltq-action-icon{width:18px;height:18px;color:var(--lt-accent);opacity:0.75;transition:all 0.18s;}",
            "#lt-quick-panel .ltq-action .ltq-action-icon svg{width:100%;height:100%;}",
            "#lt-quick-panel .ltq-action:hover .ltq-action-icon{opacity:1;transform:scale(1.08);}",
            "#lt-quick-panel .ltq-action .ltq-label{font-size:10.5px;line-height:1.15;}",
            "#lt-quick-panel .ltq-action .ltq-grip{position:absolute;top:4px;right:4px;width:12px;height:12px;opacity:0;transition:opacity 0.18s;color:var(--lt-text-faint,#4a5a7a);cursor:grab;}",
            "#lt-quick-panel .ltq-action .ltq-grip svg{width:100%;height:100%;}",
            "#lt-quick-panel .ltq-action:hover .ltq-grip{opacity:0.45;}",
            "#lt-quick-panel .ltq-action .ltq-grip:active{cursor:grabbing;}",

            // ── Drag-over state ──
            "#lt-quick-panel .ltq-action.ltq-drag-over{border-color:var(--lt-accent);border-style:dashed;background:var(--lt-surface-hover);transform:scale(1.04);box-shadow:0 0 0 2px var(--lt-accent-glow),0 4px 16px var(--lt-accent-glow);}",
            "#lt-quick-panel .ltq-action.ltq-dragging{opacity:0.25;}",
            "#lt-quick-panel .ltq-action.acting{transform:scale(0.9);border-color:var(--lt-accent);box-shadow:inset 0 1px 0 rgba(255,255,255,0.22),0 0 0 2px var(--lt-accent),0 0 16px var(--lt-accent-glow);}",

            // ── Section Label ──
            "#lt-quick-panel .ltq-section{font-size:10px;font-weight:600;color:var(--lt-text-faint,#5a4a7a);text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:8px;margin:6px 2px 3px;}",
            "#lt-quick-panel .ltq-section::after{content:'';flex:1;height:1px;background:linear-gradient(to right,var(--lt-border,rgba(255,255,255,0.06)),transparent);}",

            // ── Category groups ──
            "#lt-quick-panel .ltq-actions{display:block;margin-top:2px;}",
            "#lt-quick-panel .ltq-cat{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:600;color:var(--lt-text-faint,#5a4a7a);text-transform:uppercase;letter-spacing:0.10em;margin:7px 2px 3px;cursor:pointer;user-select:none;}",
            "#lt-quick-panel .ltq-cat::after{content:'';flex:1;height:1px;background:linear-gradient(to right,var(--lt-border,rgba(255,255,255,0.06)),transparent);}",
            "#lt-quick-panel .ltq-cat-caret{display:inline-block;font-size:9px;transition:transform 0.18s;color:var(--lt-text-faint,#5a6a85);}",
            "#lt-quick-panel .ltq-cat.collapsed .ltq-cat-caret{transform:rotate(-90deg);}",
            "#lt-quick-panel .ltq-section.collapsed .ltq-cat-caret{transform:rotate(-90deg);}",
            "#lt-quick-panel .ltq-cat.collapsed + .ltq-grid{display:none;}",

            // ── Toggle Row ──
            "#lt-quick-panel .ltq-toggle{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:linear-gradient(180deg,var(--lt-surface,rgba(255,255,255,0.03)),rgba(255,255,255,0.01));border:1px solid var(--lt-border,rgba(255,255,255,0.05));border-radius:8px;font-size:11.5px;color:var(--lt-text-secondary,#a0b0c8);cursor:pointer;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);font-family:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,0.02);}",
            "#lt-quick-panel .ltq-toggle:hover{background:linear-gradient(180deg,var(--lt-surface-hover),var(--lt-surface,rgba(255,255,255,0.02)));border-color:var(--lt-border-hover);color:var(--lt-accent-light);}",
            "#lt-quick-panel .ltq-toggle:active{transform:scale(0.98);}",
            "#lt-quick-panel .ltq-toggle.on{border-color:var(--lt-border-hover);color:var(--lt-accent-light);background:linear-gradient(180deg,var(--lt-surface-hover),var(--lt-surface,rgba(255,255,255,0.01)));box-shadow:inset 0 1px 0 rgba(255,255,255,0.04),inset 2px 0 0 var(--lt-accent);}",
            "#lt-quick-panel .ltq-toggle-label{display:flex;align-items:center;gap:8px;}",
            "#lt-quick-panel .ltq-toggle-icon{width:16px;height:16px;color:var(--lt-accent);opacity:0.65;transition:opacity 0.18s;}",
            "#lt-quick-panel .ltq-toggle-icon svg{width:100%;height:100%;}",
            "#lt-quick-panel .ltq-toggle.on .ltq-toggle-icon{opacity:1;}",

            // ── Toggle Switch (iOS-style) ──
            "#lt-quick-panel .ltq-switch{width:36px;height:20px;border-radius:10px;background:var(--lt-surface-2,rgba(255,255,255,0.08));position:relative;transition:background 0.25s ease;flex-shrink:0;box-shadow:inset 0 1px 2px rgba(0,0,0,0.25);}",
            "#lt-quick-panel .ltq-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:linear-gradient(180deg,#888894,#60606c);transition:all 0.28s cubic-bezier(0.16,1,0.3,1);box-shadow:0 1px 3px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.15);}",
            "#lt-quick-panel .ltq-switch.on{background:var(--lt-switch-on,#8b2dc4);box-shadow:inset 0 1px 2px rgba(0,0,0,0.2),0 0 8px var(--lt-switch-glow);}",
            "#lt-quick-panel .ltq-switch.on::after{left:18px;background:linear-gradient(180deg,#fff,#e8e8f0);box-shadow:0 1px 3px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.3),0 0 8px var(--lt-switch-glow);}",

            // ── LSCG 唤醒菜单（单按钮、全宽、与行动按钮区风格一致） ──
            "#lt-quick-panel .ltq-lscg-wrap{display:flex;flex-direction:column;gap:8px;padding:0 2px;}",
            "#lt-quick-panel .ltq-lscg-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:11px 14px;background:linear-gradient(180deg,var(--lt-surface,rgba(255,255,255,0.05)),rgba(255,255,255,0.01));border:1px solid var(--lt-border,rgba(255,255,255,0.08));border-radius:10px;font-size:12px;color:var(--lt-text-secondary,#b0c0d8);cursor:pointer;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);font-family:inherit;font-weight:600;position:relative;}",
            "#lt-quick-panel .ltq-lscg-btn:hover{background:linear-gradient(180deg,var(--lt-surface-hover,rgba(255,255,255,0.09)),rgba(255,255,255,0.03));border-color:var(--lt-border-hover,rgba(139,45,196,0.45));color:var(--lt-text);transform:translateY(-1px);box-shadow:0 4px 14px var(--lt-accent-glow,rgba(139,45,196,0.28));}",
            "#lt-quick-panel .ltq-lscg-btn:active{transform:scale(0.98);}",
            "#lt-quick-panel .ltq-lscg-btn .ltq-lscg-ic{width:17px;height:17px;color:var(--lt-scrollbar,#9b3dd4);opacity:0.9;}",
            "#lt-quick-panel .ltq-lscg-btn .ltq-lscg-ic svg{width:100%;height:100%;}",
            "#lt-quick-panel .ltq-lscg-btn .ltq-caret{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:12px;height:12px;opacity:0.5;transition:transform 0.2s;}",
            "#lt-quick-panel .ltq-lscg-btn .ltq-caret svg{width:100%;height:100%;}",
            "#lt-quick-panel .ltq-lscg-btn.open .ltq-caret{transform:translateY(-50%) rotate(180deg);}",
            ".lt-lscg-pop{position:fixed;z-index:2147483647;background:linear-gradient(180deg,#241a3d,#1a1430);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:6px;box-shadow:0 12px 34px rgba(0,0,0,0.55);display:flex;flex-direction:column;gap:2px;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-sizing:border-box;}",
            ".lt-lscg-pop .lt-lscg-item{padding:10px 14px;border-radius:8px;font-size:12.5px;color:#e8e8f0;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:10px;}",
            ".lt-lscg-pop .lt-lscg-item:hover{background:rgba(139,45,196,0.24);color:#fff;}",
            ".lt-lscg-pop .lt-lscg-item .lt-lscg-sub{font-size:10.5px;color:#8a7ab0;margin-left:auto;opacity:0.85;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}",

            // ═══ 唤醒二级菜单（睡眠 / 催眠）═══════════════════════════════════════════
            ".lt-wake-pop{position:fixed;z-index:2147483647;background:linear-gradient(180deg,#241a3d,#1a1430);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:6px;box-shadow:0 12px 34px rgba(0,0,0,0.55);display:flex;flex-direction:column;gap:2px;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-sizing:border-box;}",
            ".lt-wake-pop .lt-wake-item{padding:10px 14px;border-radius:8px;font-size:12.5px;color:#e8e8f0;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:10px;}",
            ".lt-wake-pop .lt-wake-item .lt-wake-ic{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 18px;}",
            ".lt-wake-pop .lt-wake-item .lt-wake-ic svg{width:18px;height:18px;}",
            ".lt-wake-pop .lt-wake-item .lt-wake-label{font-weight:600;}",
            ".lt-wake-pop .lt-wake-item .lt-wake-sub{font-size:10.5px;color:#9a8ac0;margin-left:auto;opacity:0.85;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}",
            ".lt-wake-pop .lt-wake-sleep{border-left:3px solid #4ea3ff;}",
            ".lt-wake-pop .lt-wake-sleep .lt-wake-ic{color:#4ea3ff;}",
            ".lt-wake-pop .lt-wake-sleep:hover{background:rgba(78,163,255,0.18);color:#fff;}",
            ".lt-wake-pop .lt-wake-hypno{border-left:3px solid #b15cff;}",
            ".lt-wake-pop .lt-wake-hypno .lt-wake-ic{color:#b15cff;}",
            ".lt-wake-pop .lt-wake-hypno:hover{background:rgba(177,92,255,0.18);color:#fff;}",

            // ═══ 设置面板样式 ═══════════════════════════════════════════════════
            ".lt-settings{display:flex;flex-direction:column;gap:20px;padding:4px 0;}",
            ".lt-settings-label{font-size:10px;font-weight:600;color:var(--lt-text-dim,#6a8ab0);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;}",
            ".lt-theme-row{display:flex;gap:10px;}",
            ".lt-theme-option{flex:1;padding:16px 8px;border-radius:12px;border:2px solid var(--lt-border,rgba(255,255,255,0.08));background:linear-gradient(180deg,var(--lt-surface,rgba(255,255,255,0.03)),rgba(255,255,255,0.01));cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);font-family:inherit;color:var(--lt-text-secondary,#b8c8e0);font-size:12px;font-weight:500;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);}",
            ".lt-theme-option:hover{border-color:var(--lt-border-hover);background:var(--lt-surface-hover);box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),0 2px 8px var(--lt-accent-glow);}",
            ".lt-theme-option.selected{border-color:var(--lt-accent);background:var(--lt-surface-hover);color:var(--lt-accent-light);box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),0 0 0 1px var(--lt-accent-glow),0 2px 12px var(--lt-accent-glow);}",
            ".lt-theme-option svg{width:22px;height:22px;}",
            ".lt-theme-preview{width:100%;height:32px;border-radius:6px;margin-top:3px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.15);}",
            ".lt-theme-preview.dark{background:linear-gradient(135deg,#0e121e 0%,#2a2040 100%);border:1px solid rgba(255,255,255,0.1);}",
            ".lt-theme-preview.light{background:linear-gradient(135deg,#f8fafc 0%,#e8ecf0 100%);border:1px solid rgba(0,0,0,0.08);}",
            ".lt-accent-row{display:flex;gap:12px;flex-wrap:wrap;}",
            ".lt-accent-swatch{width:34px;height:34px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all 0.18s cubic-bezier(0.16,1,0.3,1);position:relative;box-shadow:0 2px 6px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.15);}",
            ".lt-accent-swatch:hover{transform:scale(1.12);box-shadow:0 4px 12px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.2);}",
            ".lt-accent-swatch.selected{border-color:var(--lt-text,#fff);box-shadow:0 0 0 2px var(--lt-accent),0 4px 12px var(--lt-accent-glow);}",
            ".lt-accent-swatch.selected::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);}",

            // ═══ Edit button (toggle row) ═════════════════════════════════════
            "#lt-quick-panel .ltq-edit-btn{width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--lt-text-dim);cursor:pointer;opacity:0.5;transition:opacity 0.18s;padding:0;flex-shrink:0;}",
            "#lt-quick-panel .ltq-edit-btn:hover{opacity:1;color:var(--lt-accent);}",
            "#lt-quick-panel .ltq-edit-btn svg{width:14px;height:14px;}",

            // ═══ 超级骰子模式药丸 + 二级菜单 ═════════════════════════
            "#lt-quick-panel .ltq-mode-wrap{display:flex;align-items:center;flex-shrink:0;margin-right:8px;}",
            "#lt-quick-panel .ltq-mode-pill{display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:20px;padding:0 9px;border-radius:10px;background:var(--lt-surface-2,rgba(255,255,255,0.08));border:1px solid var(--lt-border,rgba(255,255,255,0.1));color:var(--lt-text-secondary,#a0b0c8);font-size:10.5px;font-weight:600;cursor:pointer;transition:all 0.16s cubic-bezier(0.16,1,0.3,1);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.02em;}",
            "#lt-quick-panel .ltq-mode-pill:hover:not(.disabled){border-color:var(--lt-border-hover);color:var(--lt-accent-light);background:var(--lt-surface-hover);}",
            "#lt-quick-panel .ltq-mode-pill.c{color:#fff;background:linear-gradient(180deg,var(--lt-accent),var(--lt-accent-dark));border-color:transparent;box-shadow:0 0 8px var(--lt-switch-glow);}",
            "#lt-quick-panel .ltq-mode-pill.disabled{opacity:0.35;cursor:not-allowed;}",
            "#lt-quick-panel .ltq-mode-pill.open{border-color:var(--lt-accent);}",
            ".lt-mode-pop{position:fixed;z-index:2147483647;background:linear-gradient(180deg,#241a3d,#1a1430);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:6px;box-shadow:0 12px 34px rgba(0,0,0,0.55);display:flex;flex-direction:column;gap:2px;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-sizing:border-box;}",
            ".lt-mode-pop .lt-mode-item{padding:10px 14px;border-radius:8px;font-size:12.5px;color:#e8e8f0;cursor:pointer;transition:all 0.15s;display:flex;flex-direction:column;gap:2px;}",
            ".lt-mode-pop .lt-mode-item:hover{background:rgba(139,45,196,0.24);color:#fff;}",
            ".lt-mode-pop .lt-mode-item.sel{background:rgba(139,45,196,0.34);color:#fff;box-shadow:inset 0 0 0 1px var(--lt-accent,rgba(139,45,196,0.6));}",
            ".lt-mode-pop .lt-mode-item .lt-mode-sub{font-size:10.5px;color:#8a7ab0;opacity:0.85;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}",

            // ═══ Release Maid word chips ═════════════════════════════════════
            ".lt-rm-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:7px;font-size:11px;font-weight:500;line-height:1.4;white-space:nowrap;}",
            ".lt-rm-default{background:var(--lt-surface-2);color:var(--lt-text-dim);border:1px solid var(--lt-border);}",
            ".lt-rm-custom{background:var(--lt-surface-hover);color:var(--lt-accent-light);border:1px solid var(--lt-border-hover);cursor:default;}",
            ".lt-rm-tag{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.6;padding:1px 3px;border-radius:3px;background:rgba(255,255,255,0.08);}",
            ".lt-rm-del{cursor:pointer;font-size:14px;line-height:1;opacity:0.5;transition:opacity 0.15s;padding:0 0 0 2px;}",
            ".lt-rm-del:hover{opacity:1;color:var(--lt-accent);}",

            // ═══ 自带彩色 Toast（成功绿 / 失败红 / 信息中性）═════════════════════
            "#lt-toast-host{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}",
            "#lt-toast-host .lt-toast{pointer-events:auto;max-width:440px;padding:10px 18px;border-radius:11px;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:600;color:#fff;letter-spacing:0.01em;opacity:0;transform:translateY(-12px) scale(0.96);transition:opacity 0.26s cubic-bezier(0.16,1,0.3,1),transform 0.26s cubic-bezier(0.16,1,0.3,1);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 28px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.2);}",
            "#lt-toast-host .lt-toast.show{opacity:1;transform:translateY(0) scale(1);}",
            "#lt-toast-host .lt-toast-success{background:linear-gradient(180deg,rgba(34,168,94,0.95),rgba(20,120,64,0.95));border:1px solid rgba(130,255,180,0.4);box-shadow:0 8px 28px rgba(0,0,0,0.45),0 0 20px rgba(40,210,120,0.45),inset 0 1px 0 rgba(255,255,255,0.22);}",
            "#lt-toast-host .lt-toast-error{background:linear-gradient(180deg,rgba(206,52,62,0.96),rgba(150,28,38,0.96));border:1px solid rgba(255,150,160,0.45);box-shadow:0 8px 28px rgba(0,0,0,0.45),0 0 20px rgba(226,62,72,0.5),inset 0 1px 0 rgba(255,255,255,0.22);}",
            "#lt-toast-host .lt-toast-info{background:linear-gradient(180deg,rgba(62,74,116,0.96),rgba(40,48,82,0.96));border:1px solid rgba(150,175,235,0.4);box-shadow:0 8px 28px rgba(0,0,0,0.45),0 0 20px rgba(100,135,215,0.4),inset 0 1px 0 rgba(255,255,255,0.22);}",
        ].join("\n");
        document.head.appendChild(s);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 所有动作定义（含 SVG 图标）
    // ════════════════════════════════════════════════════════════════════════
    // 唤醒二级菜单：睡眠（/lscg wake）/ 催眠（/lscg unzonk），差异化视觉
    var wakePop = null;
    var wakePopClose = null;
    function closeWakePop() {
        if (wakePop) {
            try { wakePop.remove(); } catch (_) {}
            wakePop = null;
        }
        if (wakePopClose) {
            try { document.removeEventListener('mousedown', wakePopClose, true); } catch (_) {}
            wakePopClose = null;
        }
    }
    function openWakeMenu() {
        try {
            if (wakePop) { closeWakePop(); return; }
            var anchor = document.querySelector('.ltq-action[data-id="wake"]') || actionGridEl;
            if (!anchor) { console.error('[BC] openWakeMenu: anchor not found'); return; }
            var pop = document.createElement('div');
            pop.className = 'lt-wake-pop';

            var items = [
                { label: '睡眠', sub: '/lscg wake',   icon: SVG.wakeSleep, cmd: 'wake',   cls: 'lt-wake-sleep' },
                { label: '催眠', sub: '/lscg unzonk', icon: SVG.wakeHypno, cmd: 'unzonk', cls: 'lt-wake-hypno' }
            ];
            items.forEach(function(it) {
                var item = document.createElement('div');
                item.className = 'lt-wake-item ' + it.cls;

                var ic = document.createElement('span');
                ic.className = 'lt-wake-ic';
                ic.innerHTML = it.icon;

                var lbl = document.createElement('span');
                lbl.className = 'lt-wake-label';
                lbl.textContent = it.label;

                var sub = document.createElement('span');
                sub.className = 'lt-wake-sub';
                sub.textContent = it.sub;

                item.appendChild(ic);
                item.appendChild(lbl);
                item.appendChild(sub);

                item.addEventListener('click', function(ev) {
                    ev.stopPropagation();
                    ltSendLscg(it.cmd);
                    ltToast((isZh() ? '已发送 · ' : 'Sent · ') + it.label, 'success');
                    closeWakePop();
                });
                pop.appendChild(item);
            });

            document.body.appendChild(pop);

            var r = anchor.getBoundingClientRect();
            pop.style.width = Math.max(r.width, 170) + 'px';
            pop.style.left = r.left + 'px';
            var ph = pop.offsetHeight;
            var top = r.bottom + 6;
            if (top + ph > window.innerHeight) top = r.top - ph - 6;
            pop.style.top = top + 'px';

            function onDown(e) {
                if (!pop.contains(e.target) && !anchor.contains(e.target)) {
                    closeWakePop();
                }
            }
            wakePop = pop;
            wakePopClose = onDown;
            setTimeout(function() { if (wakePopClose === onDown) document.addEventListener('mousedown', onDown, true); }, 0);
        } catch (err) {
            console.error('[BC] openWakeMenu error:', err);
        }
    }

    const ACTION_CATS = [
        { key: 'appearance', zh: '外观',       en: 'Appearance' },
        { key: 'restraint',  zh: '束缚管理',   en: 'Restraint' },
        { key: 'magic',      zh: 'LSCG与魔法', en: 'LSCG & Magic' },
        { key: 'craft',      zh: '订制与导入', en: 'Craft & Import' },
        { key: 'boost',      zh: '增益',       en: 'Boost' },
    ];

    const ALL_ACTIONS = [
        { id: 'wardrobe',  icon: SVG.wardrobe,  label: '衣柜',    title: '打开衣柜', category: 'appearance', fn: function() { wardrobe(); } },
        { id: 'undo',      icon: SVG.undo,      label: '回滚',    title: '回滚外观到之前的状态', category: 'appearance', fn: async function() {
            const target = await pickTarget('选择要回滚外观的目标');
            if (target) undoCommand(getNickname(target));
        }},
        { id: 'free',      icon: SVG.free,      label: '解除束缚', title: '选择性移除束缚物品', category: 'restraint', fn: async function() {
            const target = await pickTarget('选择要解除束缚的目标');
            if (target) free(getNickname(target));
        }},
        { id: 'lock',      icon: SVG.lock,      label: '上锁',    title: '为束缚添加锁（可多选目标）', category: 'restraint', fn: async function() {
            const targets = await pickTargets('选择要上锁的目标（可多选）');
            if (!targets.length) return;
            const itemMiscGroup = AssetGroupGet(Player.AssetFamily, "ItemMisc");
            if (!itemMiscGroup) { ChatRoomSendLocal('无法获取锁类型列表'); return; }
            const validLocks = itemMiscGroup.Asset.filter(a => a.IsLock).map(a => ({ Name: a.Name, Description: a.Description || a.Name }));
            if (!validLocks.length) { ChatRoomSendLocal('没有可用的锁类型'); return; }
            const lockOpts = validLocks.map(l => ({ text: l.Description }));
            const selectedLock = await requestButtons('选择锁类型', lockOpts, false);
            if (!selectedLock) return;
            const lock = validLocks.find(l => l.Description === selectedLock);
            if (!lock) return;
            await batchApplyToTargets('上锁', targets, function(t) { fullLock(getNickname(t) + ' ' + lock.Name); });
        }},
        { id: 'freetotal', icon: SVG.freetotal, label: '全解除',  title: '移除所有束缚（可多选目标）', category: 'restraint', fn: async function() {
            const targets = await pickTargets('选择要全部解除的目标（可多选）');
            if (!targets.length) return;
            await batchApplyToTargets('全解除', targets, function(t) { freetotal(getNickname(t)); });
        }},
        { id: 'unlock',    icon: SVG.unlock,    label: '全解锁',  title: '移除所有锁（跳过主人/恋人锁，可多选目标）', category: 'restraint', fn: async function() {
            const targets = await pickTargets('选择要解锁的目标（可多选）');
            if (!targets.length) return;
            await batchApplyToTargets('全解锁', targets, function(t) { fullUnlock(getNickname(t)); });
        }},
        { id: 'password',  icon: SVG.password,  label: '锁密码',  title: '查看当前锁的密码', category: 'restraint', fn: function() { execChatCommand('/infolock'); } },
        { id: 'struggle',  icon: SVG.struggle,  label: '挣扎',    title: 'LSCG 挣脱指令', category: 'magic', fn: function() { execChatCommand('/lscg escape'); ltToast(isZh() ? '已发送挣扎指令' : 'Struggle command sent', 'info'); } },
        { id: 'wake',      icon: SVG.wake,      label: '唤醒',    title: 'LSCG 唤醒：睡眠 / 催眠', category: 'magic', fn: function() { openWakeMenu(); } },
        { id: 'enhance',   icon: SVG.enhance,   label: '增强',    title: '获取道具/金钱/技能', category: 'boost', fn: function() { getEverything(); } },
        { id: 'bcxcmd',    icon: SVG.bcxcmd,    label: 'BCX指令', title: '触发 BCX 指令（表情/姿态/场所/文本等）', category: 'craft', fn: async function() {
            await openBcxCommandPanel();
        }},
        { id: 'bcx',       icon: SVG.bcx,       label: 'BCX导入', title: '从剪贴板导入 BCX 外观', category: 'craft', fn: async function() {
            const target = await pickTarget('选择要导入外观的目标');
            if (target) bcxImport(getNickname(target));
        }},
        { id: 'editcraft', icon: SVG.craftEdit, label: '编辑订制', title: '批量编辑束缚的订制属性（名称/描述/私有）', category: 'craft', fn: async function() {
            const target = await pickTarget('选择要编辑属性的目标');
            if (target) editCraftBatch(target);
        }},
        { id: 'clearcraft',icon: SVG.craftClear,label: '清除订制', title: '清除对象身上所有束缚的订制属性', category: 'craft', fn: async function() {
            const target = await pickTarget('选择要清除订制属性的目标');
            if (target) clearAllCraft(target);
        }},
    ];

    // ════════════════════════════════════════════════════════════════════════
    // 工具快捷面板 — v2.1 SVG图标 + 拖拽排序 + 主题
    // ════════════════════════════════════════════════════════════════════════
    function loadToolPanelPos() {
        try {
            const s = localStorage.getItem(STORAGE_TOOL_PANEL);
            if (s) return JSON.parse(s);
        } catch (_) {}
        return { x: toolBtnPos.x, y: toolBtnPos.y + TOOL_BTN_H + 10 };
    }
    function saveToolPanelPos() {
        try { localStorage.setItem(STORAGE_TOOL_PANEL, JSON.stringify(toolPanelPos)); } catch (_) {}
    }
    let toolPanelPos = loadToolPanelPos();

    // 面板常显在视口内：默认按钮在右上角，面板宽 248px，
    // 若直接按按钮坐标定位会越过右边缘 → 显示前统一夹回安全区。
    const TOOL_PANEL_W = 248;
    const TOOL_PANEL_M = 8;
    function clampPanelOnScreen() {
        const vw = (typeof window !== 'undefined' && window.innerWidth)  ? window.innerWidth  : 1920;
        const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080;
        if (typeof toolPanelPos.x !== 'number') toolPanelPos.x = TOOL_PANEL_M;
        if (typeof toolPanelPos.y !== 'number') toolPanelPos.y = TOOL_PANEL_M;
        // 水平：保证整块面板留在视口内（优先贴右、必要时贴左）
        if (toolPanelPos.x + TOOL_PANEL_W > vw - TOOL_PANEL_M) {
            toolPanelPos.x = Math.max(TOOL_PANEL_M, vw - TOOL_PANEL_W - TOOL_PANEL_M);
        }
        if (toolPanelPos.x < TOOL_PANEL_M) toolPanelPos.x = TOOL_PANEL_M;
        // 垂直：保证顶部与底部都在视口内
        if (toolPanelPos.y < TOOL_PANEL_M) toolPanelPos.y = TOOL_PANEL_M;
        if (toolPanelPos.y > vh - 140) toolPanelPos.y = Math.max(TOOL_PANEL_M, vh - 140);
    }

    function buildToolPanel() {
        if (toolPanelEl) return;
        // 清理旧面板：热注入 / 多实例加载 / 油猴更新时可能残留多个 #lt-quick-panel，
        // 重叠后会导致 pointer-events 混乱、按钮点不动。
        document.querySelectorAll('#lt-quick-panel, .lt-panel').forEach(function(el) {
            try { el.remove(); } catch (e) {}
        });
        injectLtStyles();
        applyTheme();

        toolPanelEl = document.createElement('div');
        toolPanelEl.id = 'lt-quick-panel';
        toolPanelEl.style.left = toolPanelPos.x + 'px';
        toolPanelEl.style.top  = toolPanelPos.y + 'px';

        // ── Header ──
        const hdr = document.createElement('div');
        hdr.className = 'ltq-hdr';

        var titleSpan = document.createElement('span');
        titleSpan.className = 'ltq-title';
        titleSpan.textContent = isZh() ? '工具箱' : 'Toolbox';

        var hdrBtns = document.createElement('div');
        hdrBtns.className = 'ltq-hdr-btns';

        // 三档主题旋钮（日间 / 夜间 / 跟随系统）替代原设置齿轮
        var knob = createThemeKnob();
        hdrBtns.appendChild(knob);

        var closeBtn = document.createElement('button');
        closeBtn.className = 'ltq-icon-btn';
        closeBtn.title = t('close');
        closeBtn.innerHTML = SVG.close;

        hdrBtns.appendChild(closeBtn);
        hdr.appendChild(titleSpan);
        hdr.appendChild(hdrBtns);

        const body = document.createElement('div');
        body.className = 'ltq-body';

        // ── Action Grid (grouped, draggable) ──
        actionGridEl = document.createElement('div');
        actionGridEl.className = 'ltq-actions';
        body.appendChild(actionGridEl);
        rebuildActionGrid();

        // ── Toggle Section ──
        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'ltq-section';
        sectionLabel.style.cursor = 'pointer';
        const sectionCaret = document.createElement('span');
        sectionCaret.className = 'ltq-cat-caret';
        sectionCaret.innerHTML = SVG.chevron;
        const sectionText = document.createElement('span');
        sectionText.textContent = isZh() ? '开关' : 'Toggles';
        sectionLabel.appendChild(sectionCaret);
        sectionLabel.appendChild(sectionText);
        body.appendChild(sectionLabel);

        // 开关区容器：点击 section label 可折叠 / 展开
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'ltq-toggles';

        const toggleBtnRefs = {};
        const toggleOn = {};  // 记录各开关开启状态，用于折叠态计数

        const toggles = [
            { icon: SVG.rp,        label: isZh() ? 'RP模式'  : 'RP Mode',    title: isZh() ? '开启后屏蔽游戏 Action 消息' : 'Block game Action messages', toggle: 'rp', fn: function() { rpmode(); updateToggleBtns(); } },
            { icon: SVG.rpBtn,     label: isZh() ? '显示RP按钮' : 'Show RP Btn', title: isZh() ? '在游戏画面显示 RP 切换按钮' : 'Show RP toggle button on canvas', toggle: 'rpBtn', fn: function() { rpbtn(); updateToggleBtns(); } },
            { icon: SVG.heightLock,label: isZh() ? '身高锁'  : 'Height Lock',title: isZh() ? '强制身高为标准值' : 'Force standard height', toggle: 'heightLock', fn: function() { heightLockCommand(); updateToggleBtns(); } },
            { icon: SVG.maid,      label: isZh() ? '解绑女仆' : 'Release Maid', title: isZh() ? '自动回应求救消息解除拘束' : 'Auto-respond to rescue messages', toggle: 'releaseMaid', fn: function() { releaseMaidCommand(); updateToggleBtns(); }, editFn: function() { openRmWordsPanel(); } },
            { icon: SVG.antirestraint, label: isZh() ? '反束缚' : 'Anti-Restraint', title: isZh() ? '自动解除他人施加的拘束' : 'Auto-remove restraints applied by others', toggle: 'antiRestraint', fn: function() { antiRestraintCommand(); updateToggleBtns(); }, editFn: function() { openAntiRestraintPanel(); } },
            { icon: SVG.ooc,         label: isZh() ? 'OOC模式' : 'OOC Mode', title: isZh() ? '出戏：消息自动加 ( 前缀' : 'Out-of-character: auto-prefix messages with (', toggle: 'ooc', fn: function() { oocCommand(); updateToggleBtns(); } },
            { icon: SVG.superDice,   label: isZh() ? '超级骰子' : 'Super Dice', title: isZh() ? '对自己参与的所有 LSCG roll 点强制必胜（仅影响自己，不改他人参数）；右侧按钮可选「智能 / 无限」模式' : 'Force your own LSCG rolls to always win (self-only); use the side button to pick Smart / Infinite mode', toggle: 'superDice', fn: function() { setSuperDice(!getSuperDice()); }, modeBtn: true },
            { icon: SVG.guard,       label: isZh() ? '守护常驻' : 'Guard Resident', title: isZh() ? '开启后让自身「守护术」法术屏障常驻，反弹魔法不再消耗屏障（仅影响自己）' : 'Keep your Protection barrier permanent; reflected magic no longer drains it (self-only)', toggle: 'guardResident', fn: function() { setGuard(!getGuard()); } },
        ];

        toggles.forEach(function(tg) {
            const row = document.createElement('div');
            row.className = 'ltq-toggle';
            row.title = tg.title;

            const labelWrap = document.createElement('div');
            labelWrap.className = 'ltq-toggle-label';
            const iconEl = document.createElement('span');
            iconEl.className = 'ltq-toggle-icon';
            iconEl.innerHTML = tg.icon;
            const labelEl = document.createElement('span');
            labelEl.textContent = tg.label;
            labelWrap.appendChild(iconEl);
            labelWrap.appendChild(labelEl);

            // Optional edit button (for Release Maid phrase customization)
            if (tg.editFn) {
                var editBtn = document.createElement('button');
                editBtn.className = 'ltq-edit-btn';
                editBtn.title = isZh() ? '自定义短语' : 'Customize phrases';
                editBtn.innerHTML = SVG.edit;
                editBtn.addEventListener('click', function(e) { e.stopPropagation(); tg.editFn(); });
                labelWrap.appendChild(editBtn);
            }

            // Optional mode button (super dice secondary menu: Smart / Infinite)
            let modeRender = null;
            let modeWrap = null;
            if (tg.modeBtn) {
                modeWrap = document.createElement('div');
                modeWrap.className = 'ltq-mode-wrap';
                const modePill = document.createElement('button');
                modePill.type = 'button';
                modePill.className = 'ltq-mode-pill';
                modePill.title = isZh() ? '选择超级骰子模式' : 'Select super dice mode';
                let modePop = null;
                function closeModePop() {
                    if (modePop) { modePop.remove(); modePop = null; }
                    modePill.classList.remove('open');
                    document.removeEventListener('mousedown', onModeDown, true);
                }
                function onModeDown(e) {
                    if (modePop && !modePop.contains(e.target) && !modePill.contains(e.target)) closeModePop();
                }
                modePill.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (!getSuperDice()) return; // 主开关关闭时禁用
                    if (modePop) { closeModePop(); return; }
                    modePop = document.createElement('div');
                    modePop.className = 'lt-mode-pop';
                    const opts = [
                        ['A', isZh() ? '智能模式' : 'Smart Mode',   isZh() ? '显示自然高点数 如 [20+3]'      : 'Show natural high roll e.g. [20+3]'],
                        ['C', isZh() ? '无限模式 ∞' : 'Infinite ∞', isZh() ? '显示 [∞] 诚实无限'            : 'Show [∞] honest infinity']
                    ];
                    opts.forEach(function(opt) {
                        const item = document.createElement('div');
                        item.className = 'lt-mode-item' + (getSuperDiceMode() === opt[0] ? ' sel' : '');
                        const lbl = document.createElement('span');
                        lbl.textContent = opt[1];
                        const sub = document.createElement('span');
                        sub.className = 'lt-mode-sub';
                        sub.textContent = opt[2];
                        item.appendChild(lbl);
                        item.appendChild(sub);
                        item.addEventListener('click', function(ev) {
                            ev.stopPropagation();
                            setSuperDiceMode(opt[0]);
                            if (modeRender) modeRender();
                            closeModePop();
                        });
                        modePop.appendChild(item);
                    });
                    document.body.appendChild(modePop);
                    const r = modePill.getBoundingClientRect();
                    modePop.style.minWidth = Math.max(r.width, 210) + 'px';
                    modePop.style.left = r.left + 'px';
                    const ph = modePop.offsetHeight;
                    let top = r.bottom + 6;
                    if (top + ph > window.innerHeight) top = r.top - ph - 6;
                    modePop.style.top = top + 'px';
                    modePill.classList.add('open');
                    setTimeout(function() { document.addEventListener('mousedown', onModeDown, true); }, 0);
                });
                modeRender = function() {
                    var m = getSuperDiceMode();
                    modePill.textContent = (m === 'C') ? '∞' : (isZh() ? '智能' : 'Smart');
                    modePill.classList.toggle('c', m === 'C');
                    modePill.classList.toggle('disabled', !getSuperDice());
                };
                modeRender();
                modeWrap.appendChild(modePill);
            }

            const sw = document.createElement('div');
            sw.className = 'ltq-switch';

            row.appendChild(labelWrap);
            if (modeWrap) row.appendChild(modeWrap);
            row.appendChild(sw);

            toggleBtnRefs[tg.toggle] = { sw: sw, row: row };
            if (modeRender) toggleBtnRefs[tg.toggle].modeRender = modeRender;
            updateToggleState(toggleBtnRefs[tg.toggle], tg.toggle);

            row.addEventListener('click', tg.fn);
            toggleContainer.appendChild(row);
        });

        // 开关区折叠：从 catCollapsed 读取状态，默认折叠
        let togglesCollapsed = !!catCollapsed[CAT_TOGGLES_KEY];
        function applyToggleCollapse() {
            toggleContainer.style.display = togglesCollapsed ? 'none' : '';
            sectionLabel.classList.toggle('collapsed', togglesCollapsed);
            refreshToggleLabel();
        }
        function refreshToggleLabel() {
            let onCount = 0;
            toggles.forEach(function(tg) { if (toggleOn[tg.toggle]) onCount++; });
            sectionText.textContent = (isZh() ? '开关' : 'Toggles') + (togglesCollapsed ? ' (' + onCount + '/' + toggles.length + ')' : '');
        }
        sectionLabel.addEventListener('click', function() {
            togglesCollapsed = !togglesCollapsed;
            catCollapsed[CAT_TOGGLES_KEY] = togglesCollapsed;
            saveCatCollapsed();
            applyToggleCollapse();
        });
        body.appendChild(toggleContainer);
        applyToggleCollapse();

        function buildLscgMenu(title, icon, items) {
            const btn = document.createElement('div');
            btn.className = 'ltq-lscg-btn';
            const ic = document.createElement('span');
            ic.className = 'ltq-lscg-ic';
            ic.innerHTML = icon;
            const tx = document.createElement('span');
            tx.textContent = title;
            const caret = document.createElement('span');
            caret.className = 'ltq-caret';
            caret.innerHTML = SVG.chevron;
            btn.appendChild(ic);
            btn.appendChild(tx);
            btn.appendChild(caret);

            let pop = null;
            function closePop() {
                if (pop) { pop.remove(); pop = null; }
                btn.classList.remove('open');
                document.removeEventListener('mousedown', onDocDown, true);
            }
            function onDocDown(e) {
                if (pop && !pop.contains(e.target) && !btn.contains(e.target)) closePop();
            }
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (pop) { closePop(); return; }
                pop = document.createElement('div');
                pop.className = 'lt-lscg-pop';
                items.forEach(function(it) {
                    const item = document.createElement('div');
                    item.className = 'lt-lscg-item';
                    const lbl = document.createElement('span');
                    lbl.textContent = it.label;
                    const sub = document.createElement('span');
                    sub.className = 'lt-lscg-sub';
                    sub.textContent = it.sub;
                    item.appendChild(lbl);
                    item.appendChild(sub);
                    item.addEventListener('click', function(ev) {
                        ev.stopPropagation();
                        ltSendLscg(it.cmd);
                        closePop();
                    });
                    pop.appendChild(item);
                });
                document.body.appendChild(pop);
                const r = btn.getBoundingClientRect();
                // 弹层与按钮同宽并对齐，整体更协调
                pop.style.width = Math.max(r.width, 160) + 'px';
                pop.style.left = r.left + 'px';
                const ph = pop.offsetHeight;
                let top = r.bottom + 6;
                if (top + ph > window.innerHeight) top = r.top - ph - 6;
                pop.style.top = top + 'px';
                btn.classList.add('open');
                setTimeout(function() { document.addEventListener('mousedown', onDocDown, true); }, 0);
            });
            return btn;
        }

        function updateToggleState(ref, key) {
            var isOn = false;
            if (key === 'rp') isOn = getRpMode(Player);
            else if (key === 'rpBtn') isOn = getES().rpBtnVisible === 1;
            else if (key === 'heightLock') isOn = getES().heightLock === 1;
            else if (key === 'releaseMaid') isOn = getES().releaseMaid === 1;
            else if (key === 'antiRestraint') isOn = getAntiRestraint();
            else if (key === 'ooc') isOn = getOocEnabled();
            else if (key === 'superDice') isOn = getSuperDice();
            else if (key === 'guardResident') isOn = getGuard();
            ref.sw.classList.toggle('on', isOn);
            ref.row.classList.toggle('on', isOn);
            toggleOn[key] = isOn;
        }

        function updateToggleBtns() {
            Object.keys(toggleBtnRefs).forEach(function(key) {
                updateToggleState(toggleBtnRefs[key], key);
                if (toggleBtnRefs[key].modeRender) toggleBtnRefs[key].modeRender();
            });
            refreshToggleLabel();
        }
        window.__LT_updateToggles = updateToggleBtns;

        // ── Assemble ──
        toolPanelEl.appendChild(hdr);
        toolPanelEl.appendChild(body);
        document.body.appendChild(toolPanelEl);

        // Apply theme class
        if (currentTheme.mode === 'light') toolPanelEl.classList.add('lt-light');

        // ── Close button ──
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            hideToolPanel();
        });

        // ── Drag logic (panel move) ──
        let drag = { on: false, dx: 0, dy: 0 };

        hdr.addEventListener('mousedown', function (e) {
            if (e.target.closest('.ltq-icon-btn')) return;
            drag.on = true;
            drag.dx = e.clientX - toolPanelEl.offsetLeft;
            drag.dy = e.clientY - toolPanelEl.offsetTop;
            _toolDragging = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!drag.on) return;
            toolPanelPos.x = e.clientX - drag.dx;
            toolPanelPos.y = e.clientY - drag.dy;
            toolPanelEl.style.left = toolPanelPos.x + 'px';
            toolPanelEl.style.top  = toolPanelPos.y + 'px';
        });

        document.addEventListener('mouseup', function () {
            if (drag.on) {
                drag.on = false;
                _toolDragging = false;
                saveToolPanelPos();
            }
        });

        // ── ESC to close ──
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && toolPanelVisible) {
                hideToolPanel();
            }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // 动作网格重建（拖拽排序后调用）
    // ════════════════════════════════════════════════════════════════════════
    function rebuildActionGrid() {
        if (!actionGridEl) return;
        actionGridEl.innerHTML = '';
        var dragSrc = null;

        function makeActionBtn(a) {
            var btn = document.createElement('div');
            btn.className = 'ltq-action';
            btn.title = a.title;
            btn.dataset.id = a.id;
            btn.draggable = true;

            var iconEl = document.createElement('span');
            iconEl.className = 'ltq-action-icon';
            iconEl.innerHTML = a.icon;

            var labelEl = document.createElement('span');
            labelEl.className = 'ltq-label';
            labelEl.textContent = a.label;

            var gripEl = document.createElement('span');
            gripEl.className = 'ltq-grip';
            gripEl.innerHTML = SVG.grip;

            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.appendChild(gripEl);

            // Click action
            btn.addEventListener('click', function(e) {
                if (btn.dataset.dragged === '1') {
                    btn.dataset.dragged = '';
                    return;
                }
                btn.classList.add('acting');
                setTimeout(function() { btn.classList.remove('acting'); }, 320);
                a.fn();
            });

            // Drag-and-drop
            btn.addEventListener('dragstart', function(e) {
                dragSrc = btn;
                btn.classList.add('ltq-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', a.id);
            });

            btn.addEventListener('dragend', function() {
                btn.classList.remove('ltq-dragging');
                btn.dataset.dragged = '1';
                actionGridEl.querySelectorAll('.ltq-drag-over').forEach(function(el) {
                    el.classList.remove('ltq-drag-over');
                });
                setTimeout(function() { btn.dataset.dragged = ''; }, 50);
            });

            btn.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (btn !== dragSrc) btn.classList.add('ltq-drag-over');
            });

            btn.addEventListener('dragleave', function() {
                btn.classList.remove('ltq-drag-over');
            });

            btn.addEventListener('drop', function(e) {
                e.preventDefault();
                btn.classList.remove('ltq-drag-over');
                if (!dragSrc || dragSrc === btn) return;

                var srcId = dragSrc.dataset.id;
                var dstId = btn.dataset.id;
                var order = loadBtnOrder();
                var srcIdx = order.indexOf(srcId);
                var dstIdx = order.indexOf(dstId);
                order.splice(dstIdx, 0, order.splice(srcIdx, 1)[0]);
                saveBtnOrder(order);
                rebuildActionGrid();
            });

            return btn;
        }

        var orderedActions = getOrderedActions();

        ACTION_CATS.forEach(function(cat) {
            var items = orderedActions.filter(function(a) { return a.category === cat.key; });
            if (!items.length) return;

            var header = document.createElement('div');
            header.className = 'ltq-cat' + (catCollapsed[cat.key] ? ' collapsed' : '');
            var nameEl = document.createElement('span');
            nameEl.className = 'ltq-cat-name';
            nameEl.textContent = isZh() ? cat.zh : cat.en;
            var caret = document.createElement('span');
            caret.className = 'ltq-cat-caret';
            caret.textContent = '▾';
            header.appendChild(nameEl);
            header.appendChild(caret);
            header.addEventListener('click', function() {
                catCollapsed[cat.key] = !catCollapsed[cat.key];
                saveCatCollapsed();
                rebuildActionGrid();
            });
            actionGridEl.appendChild(header);

            var bodyWrap = document.createElement('div');
            bodyWrap.className = 'ltq-grid';
            items.forEach(function(a) { bodyWrap.appendChild(makeActionBtn(a)); });
            actionGridEl.appendChild(bodyWrap);
        });
    }

    function showToolPanel() {
        if (!toolPanelEl) buildToolPanel();
        clampPanelOnScreen();
        if (toolPanelEl) {
            toolPanelEl.style.left = toolPanelPos.x + 'px';
            toolPanelEl.style.top  = toolPanelPos.y + 'px';
        }
        saveToolPanelPos();
        toolPanelVisible = true;
        if (toolPanelEl) {
            requestAnimationFrame(function() {
                toolPanelEl.classList.add('show');
            });
        }
    }

    function hideToolPanel() {
        toolPanelVisible = false;
        if (toolPanelEl) toolPanelEl.classList.remove('show');
        document.querySelectorAll('.lt-lscg-pop').forEach(function(e) { e.remove(); });
        closeWakePop();
    }

    function toggleToolPanel() {
        if (toolPanelVisible) hideToolPanel(); else showToolPanel();
    }

    // ════════════════════════════════════════════════════════════════════════
    // 设置面板
    // ════════════════════════════════════════════════════════════════════════
    function openSettingsPanel() {
        injectLtStyles();
        applyTheme();

        var content = document.createElement('div');
        content.className = 'lt-settings';

        // ── Theme mode ──
        var themeSection = document.createElement('div');
        var themeLabel = document.createElement('div');
        themeLabel.className = 'lt-settings-label';
        themeLabel.textContent = t('settingsTheme');
        themeSection.appendChild(themeLabel);

        var themeRow = document.createElement('div');
        themeRow.className = 'lt-theme-row';

        var darkOption = document.createElement('div');
        darkOption.className = 'lt-theme-option' + (currentTheme.mode !== 'light' ? ' selected' : '');
        darkOption.innerHTML = SVG.dark + '<span>' + t('settingsDark') + '</span><div class="lt-theme-preview dark"></div>';

        var lightOption = document.createElement('div');
        lightOption.className = 'lt-theme-option' + (currentTheme.mode === 'light' ? ' selected' : '');
        lightOption.innerHTML = SVG.light + '<span>' + t('settingsLight') + '</span><div class="lt-theme-preview light"></div>';

        themeRow.appendChild(darkOption);
        themeRow.appendChild(lightOption);
        themeSection.appendChild(themeRow);
        content.appendChild(themeSection);

        darkOption.addEventListener('click', function() {
            currentTheme.mode = 'dark';
            saveTheme(currentTheme);
            applyTheme();
            darkOption.classList.add('selected');
            lightOption.classList.remove('selected');
        });

        lightOption.addEventListener('click', function() {
            currentTheme.mode = 'light';
            saveTheme(currentTheme);
            applyTheme();
            lightOption.classList.add('selected');
            darkOption.classList.remove('selected');
        });

        // ── Accent color ──
        var accentSection = document.createElement('div');
        var accentLabel = document.createElement('div');
        accentLabel.className = 'lt-settings-label';
        accentLabel.textContent = t('settingsAccent');
        accentSection.appendChild(accentLabel);

        var accentRow = document.createElement('div');
        accentRow.className = 'lt-accent-row';

        ACCENT_PRESETS.forEach(function(preset) {
            var swatch = document.createElement('div');
            swatch.className = 'lt-accent-swatch' + (currentTheme.accentId === preset.id ? ' selected' : '');
            swatch.style.background = preset.accent;
            swatch.title = preset.name;
            swatch.addEventListener('click', function() {
                currentTheme.accentId = preset.id;
                saveTheme(currentTheme);
                applyTheme();
                accentRow.querySelectorAll('.lt-accent-swatch').forEach(function(s) { s.classList.remove('selected'); });
                swatch.classList.add('selected');
            });
            accentRow.appendChild(swatch);
        });

        accentSection.appendChild(accentRow);
        content.appendChild(accentSection);

        // ── Reset button ──
        var footerEl = document.createElement('div');
        footerEl.style.cssText = 'width:100%;display:flex;gap:8px;';
        var resetBtn = document.createElement('button');
        resetBtn.className = 'lt-btn lt-btn-secondary';
        resetBtn.textContent = t('settingsReset');
        resetBtn.style.flex = '1';
        footerEl.appendChild(resetBtn);

        resetBtn.addEventListener('click', function() {
            // Reset theme
            currentTheme = { mode: 'dark', accentId: 'purple' };
            saveTheme(currentTheme);
            applyTheme();
            // Reset button order
            saveBtnOrder(ALL_ACTIONS.map(function(a) { return a.id; }));
            rebuildActionGrid();
            // Update UI
            darkOption.classList.add('selected');
            lightOption.classList.remove('selected');
            accentRow.querySelectorAll('.lt-accent-swatch').forEach(function(s) { s.classList.remove('selected'); });
            accentRow.querySelector('.lt-accent-swatch').classList.add('selected');
            ChatRoomSendLocal(t('settingsResetDone'));
            panel.remove();
        });

        var panel = createPanel(t('settingsTitle'), content, footerEl);
        panel.style.width = '340px';
        if (currentTheme.mode === 'light') panel.classList.add('lt-light');
    }

    // ════════════════════════════════════════════════════════════════════════
    // 通用面板建构器
    // ════════════════════════════════════════════════════════════════════════
    function createPanel(titleText, contentEl, footerEl, options) {
        injectLtStyles();
        applyTheme();
        const panel = document.createElement("div");
        panel.className = "lt-panel";
        if ((currentTheme.mode === 'light') || (currentTheme.mode === 'system' && !isSystemDark())) {
            panel.classList.add('lt-light');
            panel.classList.add('bct-light');
        }

        const header = document.createElement("div");
        header.className = "lt-header";
        const title = document.createElement("span");
        title.className = "lt-title";
        title.textContent = titleText;
        title.style.fontFamily = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji","Noto Sans TC",sans-serif';
        const hClose = document.createElement("button");
        hClose.className = "lt-hclose";
        hClose.innerHTML = SVG.close;
        hClose.onclick = () => panel.remove();
        header.appendChild(title);
        header.appendChild(hClose);
        panel.appendChild(header);

        let drag = { on: false, sx: 0, sy: 0, px: 0, py: 0 };
        const onMove = e => {
            if (!drag.on) return;
            panel.style.left = (drag.px + e.clientX - drag.sx) + "px";
            panel.style.top  = (drag.py + e.clientY - drag.sy) + "px";
        };
        const onUp = () => { drag.on = false; };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);

        const dragObs = new MutationObserver(() => {
            if (!document.body.contains(panel)) {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                dragObs.disconnect();
            }
        });
        dragObs.observe(document.body, { childList: true, subtree: true });

        header.addEventListener("mousedown", e => {
            if (e.target.closest('.lt-hclose')) return;
            drag.on = true; drag.sx = e.clientX; drag.sy = e.clientY;
            const r = panel.getBoundingClientRect();
            drag.px = r.left; drag.py = r.top;
            panel.style.transform = "none";
            panel.style.left = drag.px + "px";
            panel.style.top  = drag.py + "px";
            e.preventDefault();
        });

        const content = document.createElement("div");
        content.className = "lt-content";
        content.appendChild(contentEl);
        panel.appendChild(content);

        if (footerEl) {
            const footer = document.createElement("div");
            footer.className = "lt-footer";
            footer.appendChild(footerEl);
            panel.appendChild(footer);
        }

        const clickOut = e => {
            if (!panel.contains(e.target)) {
                panel.remove();
                document.removeEventListener("mousedown", clickOut);
            }
        };
        setTimeout(() => document.addEventListener("mousedown", clickOut), 0);

        document.body.appendChild(panel);

        // 可选 onClose 回调（向后兼容：现有调用均不传 options，行为不变）
        if (options && typeof options.onClose === "function") {
            const _origRemove = panel.remove.bind(panel);
            panel.remove = function () {
                if (!panel.__ltClosed) { panel.__ltClosed = true; options.onClose(); }
                _origRemove();
            };
        }

        return panel;
    }

    // ──────────────────────────────────────────
    // 通用按鈕选单
    // ──────────────────────────────────────────
    function requestButtons(promptText, buttons, multiSelect = false) {
        return new Promise(resolve => {
            const listEl = document.createElement("div");
            listEl.className = "lt-btn-list";

            if (!buttons.length) {
                const empty = document.createElement("div");
                empty.className = "lt-empty";
                empty.textContent = promptText;
                listEl.appendChild(empty);
            }

            let selected = new Set();

            buttons.forEach(btn => {
                const el = document.createElement("button");
                el.className = "lt-list-btn";
                const textSpan = document.createElement("span");
                textSpan.style.fontFamily = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';
                textSpan.textContent = btn.text;
                const check = document.createElement("span");
                check.className = "lt-check";
                check.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="12" cy="12" r="7"/></svg>';
                el.appendChild(textSpan);
                el.appendChild(check);

                if (multiSelect) {
                    el.onclick = () => {
                        if (selected.has(btn.text)) { selected.delete(btn.text); el.classList.remove("selected"); }
                        else { selected.add(btn.text); el.classList.add("selected"); }
                    };
                } else {
                    el.onclick = () => { panel.remove(); resolve(btn.text); };
                }
                listEl.appendChild(el);
            });

            let footerEl = null;
            if (multiSelect) {
                footerEl = document.createElement("div");
                footerEl.style.cssText = "display:flex;gap:8px;width:100%;";
                const cancelBtn = document.createElement("button");
                cancelBtn.className = "lt-btn lt-btn-secondary";
                cancelBtn.textContent = t('cancel');
                cancelBtn.onclick = () => { panel.remove(); resolve([]); };
                const confirmBtn = document.createElement("button");
                confirmBtn.className = "lt-btn lt-btn-primary";
                confirmBtn.textContent = t('confirm');
                confirmBtn.onclick = () => { panel.remove(); resolve([...selected]); };
                footerEl.appendChild(cancelBtn);
                footerEl.appendChild(confirmBtn);
            }

            const panel = createPanel(promptText, listEl, footerEl);

            const onKey = e => {
                if (e.key === "Escape") {
                    panel.remove();
                    resolve(multiSelect ? [] : null);
                }
            };
            document.addEventListener("keydown", onKey);

            const keyObs = new MutationObserver(() => {
                if (!document.body.contains(panel)) {
                    document.removeEventListener("keydown", onKey);
                    keyObs.disconnect();
                }
            });
            keyObs.observe(document.body, { childList: true, subtree: true });
        });
    }

    /* ── 角色选择器 ── */
    // 默认作用于当前正在交互的角色（CurrentCharacter），否则弹出选人窗
    async function pickTarget(promptText) {
        if (typeof CurrentCharacter !== 'undefined' && CurrentCharacter &&
            (ChatRoomCharacter || []).some(function(c) { return c.MemberNumber === CurrentCharacter.MemberNumber; })) {
            return CurrentCharacter;
        }
        return await requestCharacter(promptText);
    }

    /* ── 多选角色选择器（批量操作入口） ── */
    // 返回选中的 Character 对象数组；空房间直接提示并返回 []；取消/ESC 返回 []。
    function pickTargets(promptText) {
        const targets = ChatRoomCharacter || [];
        if (!targets.length) {
            ChatRoomSendLocal(isZh() ? '房间内没有玩家' : 'No players in room');
            return Promise.resolve([]);
        }
        // 正与某人交互时预选中该角色，方便"单目标快速确认"场景
        const preSel = (typeof CurrentCharacter !== 'undefined' && CurrentCharacter) ? CurrentCharacter.MemberNumber : null;
        return new Promise(function(resolve) {
            const listEl = document.createElement('div');
            listEl.className = 'lt-btn-list';
            const selected = new Set();
            if (preSel != null) selected.add(preSel);

            targets.forEach(function(target) {
                const el = document.createElement('button');
                el.className = 'lt-list-btn' + (preSel === target.MemberNumber ? ' selected' : '');
                const textSpan = document.createElement('span');
                textSpan.style.fontFamily = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';
                textSpan.textContent = getNickname(target) + ' (#' + target.MemberNumber + ')';
                el.appendChild(textSpan);
                const check = document.createElement('span');
                check.className = 'lt-check';
                check.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="12" cy="12" r="7"/></svg>';
                el.appendChild(check);
                el.onclick = function() {
                    if (selected.has(target.MemberNumber)) { selected.delete(target.MemberNumber); el.classList.remove('selected'); }
                    else { selected.add(target.MemberNumber); el.classList.add('selected'); }
                    if (confirmBtn) confirmBtn.textContent = t('confirm') + (selected.size ? ' (' + selected.size + ')' : '');
                };
                listEl.appendChild(el);
            });

            const footerEl = document.createElement('div');
            footerEl.style.cssText = 'display:flex;gap:8px;width:100%;';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'lt-btn lt-btn-secondary';
            cancelBtn.textContent = t('cancel');
            cancelBtn.onclick = function() { panel.remove(); resolve([]); };
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'lt-btn lt-btn-primary';
            confirmBtn.textContent = t('confirm') + (selected.size ? ' (' + selected.size + ')' : '');
            confirmBtn.onclick = function() {
                panel.remove();
                resolve(targets.filter(function(t) { return selected.has(t.MemberNumber); }));
            };
            footerEl.appendChild(cancelBtn);
            footerEl.appendChild(confirmBtn);

            const panel = createPanel(promptText, listEl, footerEl);
            const onKey = function(e) { if (e.key === 'Escape') { panel.remove(); resolve([]); } };
            document.addEventListener('keydown', onKey);
            const keyObs = new MutationObserver(function() {
                if (!document.body.contains(panel)) { document.removeEventListener('keydown', onKey); keyObs.disconnect(); }
            });
            keyObs.observe(document.body, { childList: true, subtree: true });
        });
    }

    /* ── 批量执行包装：对多个目标复用单目标底层函数，统一处理空选择/部分失败 ── */
    // op(target) 为针对单个目标的底层操作（如 freetotal/fullUnlock/fullLock），保持原样不修改。
    async function batchApplyToTargets(label, targets, op) {
        if (!targets || !targets.length) {
            ChatRoomSendLocal(isZh() ? '未选择任何目标' : 'No target selected');
            return;
        }
        let ok = 0, skip = 0;
        ltToastSuppressed = true;
        try {
            targets.forEach(function(target) {
                if (!hasBCItemPermission(target)) {
                    ChatRoomSendLocal((t('noPermission') || (isZh() ? '无权限' : 'No permission')) + ' ' + getNickname(target) + '。');
                    skip++; return;
                }
                if (!(ChatRoomCharacter || []).some(function(c) { return c.MemberNumber === target.MemberNumber; })) {
                    ChatRoomSendLocal(getNickname(target) + ' ' + (t('notInRoom') || (isZh() ? '不在房间' : 'not in room')) + '！');
                    skip++; return;
                }
                try { op(target); ok++; }
                catch (e) { console.error('🐈‍⬛ [BC] ❌ batch ' + label + ' 错误:', e && e.message); skip++; }
            });
        } finally {
            ltToastSuppressed = false;
        }
        const summary = (isZh() ? (label + '完成：对 ' + ok + ' 个目标生效') : (label + ' done: applied to ' + ok + ' target(s)'))
            + (skip ? (isZh() ? '，' + skip + ' 个跳过（无权限/不在房间）' : ', ' + skip + ' skipped (no permission / not in room)') : '');
        const sumType = ok === 0 ? 'error' : (skip === 0 ? 'success' : 'info');
        ltToast(summary, sumType);
    }

    function requestCharacter(title) {
        return new Promise(resolve => {
            const targets = ChatRoomCharacter || [];
            if (!targets.length) {
                ChatRoomSendLocal('房间内没有玩家');
                resolve(null);
                return;
            }
            const listEl = document.createElement("div");
            listEl.className = "lt-btn-list";
            targets.forEach(target => {
                const el = document.createElement("button");
                el.className = "lt-list-btn";
                const isMe = target.IsPlayer && target.IsPlayer();
                const textSpan = document.createElement("span");
                textSpan.style.fontFamily = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';
                textSpan.textContent = getNickname(target) + ' (#' + target.MemberNumber + ')';
                el.appendChild(textSpan);
                if (isMe) {
                    el.style.borderColor = 'var(--lt-accent)';
                    el.style.background = 'var(--lt-surface-hover)';
                }
                el.onclick = () => { panel.remove(); resolve(target); };
                listEl.appendChild(el);
            });
            const panel = createPanel(title, listEl, null);
            const onKey = e => {
                if (e.key === "Escape") { panel.remove(); resolve(null); }
            };
            document.addEventListener("keydown", onKey);
            const keyObs = new MutationObserver(() => {
                if (!document.body.contains(panel)) {
                    document.removeEventListener("keydown", onKey);
                    keyObs.disconnect();
                }
            });
            keyObs.observe(document.body, { childList: true, subtree: true });
        });
    }

    /* ── 执行聊天命令辅助函数 ── */
    function execChatCommand(cmd) {
        try {
            if (typeof ElementValue === 'function' && typeof ChatRoomSendChat === 'function') {
                ElementValue('InputChat', cmd);
                ChatRoomSendChat();
                return;
            }
            const input = document.getElementById('InputChat');
            if (!input) { ChatRoomSendLocal('找不到聊天输入框'); return; }
            input.value = cmd;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const sendBtn = document.getElementById('ChatSend');
            if (sendBtn) { sendBtn.click(); return; }
            input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true, cancelable:true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', keyCode:13, bubbles:true, cancelable:true }));
        } catch(e) { ChatRoomSendLocal('执行命令失败: ' + e.message); }
    }

    // ─────────────────────────────────────────
    // 安全 hook 包装
    // ──────────────────────────────────────────
    function safeHookFunction(functionName, priority, callback) {
        if (!modApi) return;
        if (typeof window[functionName] === 'undefined') {
            console.warn("🐈‍⬛ [BC] ⚠️ " + functionName + " 不存在，跳过 hook");
            console.log("🐈‍⬛ [BC] [hook-skipped] " + functionName);
            return;
        }
        try { modApi.hookFunction(functionName, priority, callback); }
        catch (e) { console.error("🐈‍⬛ [BC] ❌ Hook " + functionName + " 失敗:", e.message); }
    }

    // ──────────────────────────────────────────
    // Undo 系統
    // ──────────────────────────────────────────
    const UNDO_MAX_PER_CHARACTER = 20;
    const undoHistory = {};

    function saveUndoSnapshot(target, changedByNumber) {
        const id = target?.MemberNumber;
        if (!id) return;
        const bundle = ServerAppearanceBundle(target.Appearance);
        if (!bundle?.length) return;
        if (undoHistory[id]?.length > 0) {
            const last = undoHistory[id].slice(-1)[0];
            if (JSON.stringify(last.bundle) === JSON.stringify(bundle)) return;
        }
        if (!undoHistory[id]) undoHistory[id] = [];
        undoHistory[id].push({ timestamp: Date.now(), changedBy: changedByNumber ?? null, bundle });
        if (undoHistory[id].length > UNDO_MAX_PER_CHARACTER) undoHistory[id].shift();
    }

    function scanAllCharacters() {
        if (!Array.isArray(ChatRoomCharacter)) return;
        ChatRoomCharacter.forEach(c => { if (c?.MemberNumber) saveUndoSnapshot(c, null); });
    }

    // ──────────────────────────────────────────
    // Undo 外觀预览面板
    // ──────────────────────────────────────────
    async function openUndoPanel(target) {
        const id = target?.MemberNumber;
        const history = undoHistory[id];
        if (!history?.length) { ChatRoomSendLocal(getNickname(target) + "：" + t('undoNoRecord')); return; }

        injectLtStyles();
        applyTheme();
        let canvasCharacter = null;
        try {
            canvasCharacter = CharacterCreate(target.AssetFamily, CharacterType.NPC, "LT_UndoPreview");
        } catch (e) {
            console.error("🐈‍⬛ [BC] ❌ 建立预览角色失敗:", e.message);
        }

        let currentIndex = history.length - 1;

        const topNavEl = document.createElement("div");
        topNavEl.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:10px;";
        const prevBtn = document.createElement("button");
        prevBtn.className = "lt-nav-btn";
        prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M15 18l-6-6 6-6"/></svg>' + t('undoPrev');
        prevBtn.style.flex = "1";
        const counterEl = document.createElement("div");
        counterEl.style.cssText = "flex:1;text-align:center;font-size:12px;color:var(--lt-accent);font-weight:600;white-space:nowrap;";
        const nextBtn = document.createElement("button");
        nextBtn.className = "lt-nav-btn";
        nextBtn.innerHTML = t('undoNext') + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M9 18l6-6-6-6"/></svg>';
        nextBtn.style.flex = "1";
        const metaEl = document.createElement("div");
        metaEl.className = "lt-undo-meta"; metaEl.style.marginBottom = "8px";
        const timeRow = document.createElement("div"); timeRow.className = "lt-undo-meta-row";
        const byRow   = document.createElement("div"); byRow.className   = "lt-undo-meta-row";
        metaEl.appendChild(timeRow); metaEl.appendChild(byRow);
        topNavEl.appendChild(prevBtn); topNavEl.appendChild(counterEl); topNavEl.appendChild(nextBtn);

        const canvasWrap = document.createElement("div");
        canvasWrap.style.cssText = "width:100%;display:flex;justify-content:center;align-items:center;background:var(--lt-surface);border:1px solid var(--lt-border);border-radius:12px;overflow:hidden;margin-bottom:10px;height:360px;position:relative;";
        const canvas = document.createElement("canvas");
        canvas.width = 500; canvas.height = 1000;
        canvas.style.cssText = "width:220px;height:440px;display:block;";
        canvasWrap.appendChild(canvas);

        const footerBtns = document.createElement("div");
        footerBtns.style.cssText = "width:100%;display:flex;gap:8px;";
        const applyBtn = document.createElement("button");
        applyBtn.className = "lt-btn lt-btn-primary"; applyBtn.textContent = t('undoApply'); applyBtn.style.flex = "1";
        const closeBtn = document.createElement("button");
        closeBtn.className = "lt-btn lt-btn-secondary"; closeBtn.textContent = t('close'); closeBtn.style.flex = "1";
        footerBtns.appendChild(applyBtn); footerBtns.appendChild(closeBtn);

        const contentEl = document.createElement("div");
        contentEl.appendChild(topNavEl); contentEl.appendChild(metaEl); contentEl.appendChild(canvasWrap);

        const panel = createPanel(t('undoTitle') + " — " + getNickname(target), contentEl, footerBtns);
        panel.style.width = "320px";
        closeBtn.onclick = () => panel.remove();

        function renderPreview() {
            if (!canvasCharacter) return;
            try {
                const entry = history[currentIndex];
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvasCharacter.Appearance = entry.bundle.map(b => ServerBundledItemToAppearanceItem(target.AssetFamily, b));
                CharacterRefresh(canvasCharacter);
                DrawCharacter(canvasCharacter, 40, 100, 0.85, false, ctx);
            } catch (e) { console.error("🐈‍⬛ [BC] ❌ 预览渲染失敗:", e.message); }
        }

        const renderInterval = setInterval(renderPreview, 200);
        const undoObs = new MutationObserver(() => {
            if (!document.body.contains(panel)) {
                clearInterval(renderInterval);
                try { if (canvasCharacter) CharacterDelete(canvasCharacter.ID); } catch (e) {}
                undoObs.disconnect();
            }
        });
        undoObs.observe(document.body, { childList: true, subtree: true });

        function updateMeta() {
            const entry = history[currentIndex];
            const timeStr = new Date(entry.timestamp).toLocaleString();
            const byChar  = entry.changedBy ? ChatRoomCharacter?.find(c => c.MemberNumber === entry.changedBy) : null;
            const byName  = byChar ? getNickname(byChar) : entry.changedBy ? "#" + entry.changedBy : "—";
            timeRow.innerHTML = t('undoChangedAt') + "：<span>" + timeStr + "</span>";
            byRow.innerHTML   = t('undoChangedBy') + "：<span>" + byName + "</span>";
            counterEl.textContent = (currentIndex + 1) + " / " + history.length + " " + t('undoCountUnit');
            prevBtn.disabled = currentIndex <= 0;
            nextBtn.disabled = currentIndex >= history.length - 1;
        }

        prevBtn.onclick = () => { if (currentIndex > 0) { currentIndex--; updateMeta(); renderPreview(); } };
        nextBtn.onclick = () => { if (currentIndex < history.length - 1) { currentIndex++; updateMeta(); renderPreview(); } };

        applyBtn.onclick = () => {
            if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); return; }
            const entry = history[currentIndex];
            const oldBundle = ServerAppearanceBundle(target.Appearance);
            ServerSend("ChatRoomCharacterUpdate", {
                ID: target.ID === 0 ? target.OnlineID : target.AccountName.replace("Online-", ""),
                ActivePose: target.ActivePose,
                Appearance: entry.bundle
            });
            const sizeKb = (Math.abs(JSON.stringify(oldBundle).length - JSON.stringify(entry.bundle).length) / 1024).toFixed(1);
            ChatRoomSendLocal(getNickname(target) + " " + t('undoApplyDone') + "（" + t('undoApplySize') + ": " + sizeKb + "kB）");
            chatSendCustomAction(getNickname(Player) + " 将 " + getNickname(target) + " 的外观回滚到 " + new Date(entry.timestamp).toLocaleTimeString() + " 的状态！");
            undoHistory[id].splice(currentIndex + 1);
            panel.remove();
        };

        updateMeta();
        renderPreview();
    }

    // ──────────────────────────────────────────
    // Hooks
    // ──────────────────────────────────────────
    function setupHooks() {

        // Release Maid: 绑定消息监听
        let rmHookBound = false;
        safeHookFunction("ChatRoomLoad", 0, (args, next) => {
            const result = next(args);
            if (!rmHookBound) {
                rmHookBound = true;
                try {
                    if (ServerSocket && typeof ServerSocket.on === 'function') {
                        ServerSocket.on("ChatRoomMessage", rmHandleMessage);
                        console.log("🐈‍⬛ [BC] ✅ Release Maid 讯息监听已绑定");
                    }
                } catch (e) { console.error("🐈‍⬛ [BC] ❌ Release Maid 监听绑定失败:", e.message); }
            }
            return result;
        });

        // RP 模式：攔截 Action 讯息
        safeHookFunction("ServerSend", 20, (args, next) => {
            if (!getRpMode(Player) || CurrentScreen !== "ChatRoom") return next(args);
            const [messageType, data] = args;
            if (messageType === "ChatRoomChat" && data.Type === "Action") return;
            return next(args);
        });

        // 绘制 RP 图标
        safeHookFunction("ChatRoomCharacterViewDrawOverlay", 10, (args, next) => {
            const result = next(args);
            const [C, CharX, CharY, Zoom] = args;
            if (C?.MemberNumber && CurrentScreen === "ChatRoom" &&
                (typeof CurrentCharacter === 'undefined' || CurrentCharacter === null)) {
                drawRpIcon(C, CharX, CharY, Zoom);
            }
            return result;
        });

        // 绘制 RP 按鈕 + 工具觸发按鈕
        safeHookFunction("DrawProcess", 4, (args, next) => {
            const result = next(args);
            if (typeof CurrentScreen !== 'undefined' && CurrentScreen === 'ChatRoom') {
                if (getES().rpBtnVisible === 1) {
                    DrawButton(rpBtnX, rpBtnY, rpBtnSize, rpBtnSize, '',
                        getRpMode(Player) ? "Orange" : "Gray", "", "RP模式切換");
                    drawCanvasIconOnButton('rp', rpBtnX, rpBtnY, rpBtnSize, rpBtnSize, 24);
                }
                // 绘制工具触发按钮 — 使用主题强调色 + SVG 图标
                var accent = getAccentPreset();
                DrawButton(toolBtnPos.x, toolBtnPos.y, TOOL_BTN_W, TOOL_BTN_H, '', accent.accentDark, accent.accent, null, false);
                drawCanvasIconOnButton('tool', toolBtnPos.x, toolBtnPos.y, TOOL_BTN_W, TOOL_BTN_H, 24);
            }
            return result;
        });

        // 點擊 RP 按鈕 + 工具觸发按鈕
        safeHookFunction("ChatRoomClick", 4, (args, next) => {
            if (getES().rpBtnVisible === 1 && MouseIn(rpBtnX, rpBtnY, rpBtnSize, rpBtnSize)) {
                const newRpMode = !getRpMode(Player);
                setRpMode(newRpMode);
                if (typeof ChatRoomSendLocalStyled === 'function') {
                    ChatRoomSendLocalStyled(newRpMode ? t('rpOn') : t('rpOff'), 3000);
                } else {
                    ChatRoomSendLocal(newRpMode ? t('rpOn') : t('rpOff'));
                }
                return;
            }
            if (toolBtnHit()) {
                if (toolBtnSuppressClick) { toolBtnSuppressClick = false; }
                else { toggleToolPanel(); }
                return;
            }
            return next(args);
        });

        // 工具浮动按钮命中检测（基于 MouseX/MouseY）
        function toolBtnHit() {
            const x = (typeof MouseX !== 'undefined') ? MouseX : -1;
            const y = (typeof MouseY !== 'undefined') ? MouseY : -1;
            return x >= toolBtnPos.x && x <= toolBtnPos.x + TOOL_BTN_W &&
                   y >= toolBtnPos.y && y <= toolBtnPos.y + TOOL_BTN_H;
        }

        // 工具浮动按钮拖拽（角落常显 + 位置记忆）
        safeHookFunction("MouseDown", 1, (args, next) => {
            const x = (typeof MouseX !== 'undefined') ? MouseX : args[0];
            const y = (typeof MouseY !== 'undefined') ? MouseY : args[1];
            if (CurrentScreen === 'ChatRoom' &&
                x >= toolBtnPos.x && x <= toolBtnPos.x + TOOL_BTN_W &&
                y >= toolBtnPos.y && y <= toolBtnPos.y + TOOL_BTN_H) {
                toolBtnDrag = { offX: x - toolBtnPos.x, offY: y - toolBtnPos.y, moved: false, sx: x, sy: y };
                toolBtnSuppressClick = false;
            }
            return next(args);
        });
        safeHookFunction("MouseMove", 1, (args, next) => {
            if (toolBtnDrag) {
                const x = (typeof MouseX !== 'undefined') ? MouseX : args[0];
                const y = (typeof MouseY !== 'undefined') ? MouseY : args[1];
                toolBtnPos.x = Math.max(0, x - toolBtnDrag.offX);
                toolBtnPos.y = Math.max(0, y - toolBtnDrag.offY);
                if (Math.abs(x - toolBtnDrag.sx) > 4 || Math.abs(y - toolBtnDrag.sy) > 4) toolBtnDrag.moved = true;
            }
            return next(args);
        });
        safeHookFunction("MouseUp", 1, (args, next) => {
            if (toolBtnDrag) {
                if (toolBtnDrag.moved) saveToolBtnPos();
                toolBtnSuppressClick = toolBtnDrag.moved;
                toolBtnDrag = null;
            }
            return next(args);
        });

        // 身高：开启对话框时套用
        safeHookFunction("CharacterSetCurrent", 10, (args, next) => {
            const [C] = args;
            if (heightTargetChar && heightTargetChar !== C) {
                removeHeightHijack(heightTargetChar);
                heightTargetChar = null;
            }
            const result = next(args);
            if (C?.MemberNumber) {
                heightTargetChar = C;
                applyHeightToTarget(C);
            }
            return result;
        });

        // 身高：离开对话框时还原
        safeHookFunction("DialogLeave", 10, (args, next) => {
            if (heightTargetChar) { removeHeightHijack(heightTargetChar); heightTargetChar = null; }
            return next(args);
        });

        // Undo hooks
        safeHookFunction("ChatRoomSync", -10, (args, next) => {
            const result = next(args);
            setTimeout(scanAllCharacters, 0);
            return result;
        });
        safeHookFunction("ChatRoomSyncMemberJoin", -10, (args, next) => {
            const result = next(args);
            const [data] = args;
            const newChar = ChatRoomCharacter?.find(c => c.MemberNumber === data?.Character?.MemberNumber);
            if (newChar) saveUndoSnapshot(newChar, null);
            return result;
        });
        safeHookFunction("ChatRoomCharacterItemUpdate", -10, (args, next) => {
            const result = next(args);
            const [target] = args;
            saveUndoSnapshot(target, Player.MemberNumber);
            return result;
        });
        safeHookFunction("ChatRoomSyncItem", -10, (args, next) => {
            const result = next(args);
            const [data] = args;
            const target = ChatRoomCharacter?.find(c => c.MemberNumber === data?.Item?.Target);
            if (target) saveUndoSnapshot(target, data?.Source);
            return result;
        });
        safeHookFunction("ChatRoomSyncSingle", -10, (args, next) => {
            const result = next(args);
            const [data] = args;
            const target = ChatRoomCharacter?.find(c => c.MemberNumber === data?.Character?.MemberNumber);
            if (target) saveUndoSnapshot(target, data?.SourceMemberNumber);
            return result;
        });

        // ── 反束缚：进房后快照当前拘束 ──
        safeHookFunction("ChatRoomSync", -9, (args, next) => {
            const result = next(args);
            setTimeout(() => { try { ltSnapshotRestraints(); } catch (e) {} }, 1200);
            return result;
        });

        // ── 反束缚：角色刷新时检测新拘束 ──
        safeHookFunction("CharacterRefresh", 3, (args, next) => {
            const result = next(args);
            try {
                const [C] = args;
                if (C === Player) ltAntiRestraintRefresh();
            } catch (e) { /* ignore */ }
            return result;
        });

        // ── 反束缚：记录「谁」对你使用了道具（用于瞪视表情 naming）──
        // 道具使用在 BC 中通常表现为 Activity 消息，也可能包装在 Action/Chat 里，
        // 因此统一监听这三类，只要 Dictionary 里 Source→Target 指向自己且来源是别人就记录。
        safeHookFunction("ChatRoomMessage", 3, (args, next) => {
            const result = next(args);
            try {
                const [data] = args;
                const types = { Action: 1, Activity: 1, Chat: 1 };
                if (data && types[data.Type] && Array.isArray(data.Dictionary)) {
                    let src, tgt;
                    for (const e of data.Dictionary) {
                        if (!e) continue;
                        if (e.Tag === "SourceCharacter" && typeof e.MemberNumber === "number") src = e.MemberNumber;
                        if (e.Tag === "TargetCharacter" && typeof e.MemberNumber === "number") tgt = e.MemberNumber;
                        if (typeof e.SourceCharacter === "number") src = e.SourceCharacter;
                        if (typeof e.TargetCharacter === "number") tgt = e.TargetCharacter;
                        // 兼容 ActivityDictionary 中直接以 MemberNumber 为键的对象
                        if (e.MemberNumber && typeof e.MemberNumber === "number" && e.Tag === "TargetCharacter") tgt = e.MemberNumber;
                        if (e.MemberNumber && typeof e.MemberNumber === "number" && e.Tag === "SourceCharacter") src = e.MemberNumber;
                    }
                    if (typeof tgt === "number" && tgt === Player.MemberNumber &&
                        typeof src === "number" && src !== Player.MemberNumber) {
                        ltRecordRestrainer(src);
                    }
                }
            } catch (e) { /* ignore */ }
            return result;
        });

        // ── OOC 模式：发送普通消息时自动加 ( 前缀 ──
        safeHookFunction("ChatRoomSendChat", 10, (args, next) => {
            try {
                if (getOocEnabled() && typeof ElementValue === 'function') {
                    const v = ElementValue("InputChat");
                    if (v && v.trim() && !v.startsWith("/") && !v.startsWith("*") && !v.startsWith("(")) {
                        ElementValue("InputChat", "(" + v);
                    }
                }
            } catch (e) { /* ignore */ }
            return next(args);
        });

        // ── 面板快捷键 + 拖拽兜底 ──
        // 某些 BC 构建缺 window.MouseDown（safeHookFunction 会静默跳过），浮动按钮一旦位置
        // 不可见就再也拖不回来。这里挂 Alt+T 切面板 + document 级鼠标兜底拖拽作双重保险。
        (function bindPanelHotkeyAndDragFallback() {
            document.addEventListener('keydown', function(e) {
                if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
                    var tag = e.target && e.target.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
                    e.preventDefault();
                    toggleToolPanel();
                }
            });
            var needFallback = typeof window.MouseDown === 'undefined'
                || typeof window.MouseMove === 'undefined'
                || typeof window.MouseUp === 'undefined';
            if (!needFallback) return;
            var maxX = (typeof MainCanvas !== 'undefined' && MainCanvas && MainCanvas.width) ? MainCanvas.width - TOOL_BTN_W : 1875;
            var maxY = (typeof MainCanvas !== 'undefined' && MainCanvas && MainCanvas.height) ? MainCanvas.height - TOOL_BTN_H : 1035;
            document.addEventListener('mousedown', function(e) {
                if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') return;
                var x = (typeof MouseX !== 'undefined') ? MouseX : e.clientX;
                var y = (typeof MouseY !== 'undefined') ? MouseY : e.clientY;
                if (x >= toolBtnPos.x && x <= toolBtnPos.x + TOOL_BTN_W &&
                    y >= toolBtnPos.y && y <= toolBtnPos.y + TOOL_BTN_H) {
                    toolBtnDrag = { offX: x - toolBtnPos.x, offY: y - toolBtnPos.y, moved: false, sx: x, sy: y };
                    e.preventDefault();
                }
            });
            document.addEventListener('mousemove', function(e) {
                if (!toolBtnDrag) return;
                var x = (typeof MouseX !== 'undefined') ? MouseX : e.clientX;
                var y = (typeof MouseY !== 'undefined') ? MouseY : e.clientY;
                var dx = x - toolBtnDrag.sx, dy = y - toolBtnDrag.sy;
                if (!toolBtnDrag.moved && (Math.abs(dx) + Math.abs(dy)) > 5) toolBtnDrag.moved = true;
                toolBtnPos.x = Math.max(0, Math.min(maxX, toolBtnPos.x + dx));
                toolBtnPos.y = Math.max(0, Math.min(maxY, toolBtnPos.y + dy));
                toolBtnDrag.sx = x; toolBtnDrag.sy = y;
            });
            document.addEventListener('mouseup', function() {
                if (!toolBtnDrag) return;
                if (toolBtnDrag.moved) saveToolBtnPos();
                toolBtnSuppressClick = toolBtnDrag.moved;
                toolBtnDrag = null;
            });
        })();
    }

    // ──────────────────────────────────────────
    // 指令實作
    // ──────────────────────────────────────────
    function freetotal(args) {
        const target = getPlayer(args.trim());
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); if (!ltToastSuppressed) ltToast((isZh() ? "无权限: " : "No permission: ") + getNickname(target), 'error'); return true; }
        try {
            CharacterReleaseTotal(target);
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " " + t('freetotalDone') + " " + getNickname(target) + "！");
            if (!ltToastSuppressed) ltToast((isZh() ? "已全解除 " : "Released all on ") + getNickname(target), 'success');
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ freetotal 错误:", e.message); if (!ltToastSuppressed) ltToast((isZh() ? "操作失败: " : "Failed: ") + e.message, 'error'); }
        return true;
    }

    async function free(args) {
        const target = getPlayer(args.trim());
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); if (!ltToastSuppressed) ltToast((isZh() ? "无权限: " : "No permission: ") + getNickname(target), 'error'); return true; }
        const restraints = [];
        for (const group of AssetGroup) {
            if (group.Name.startsWith("Item")) {
                const item = InventoryGet(target, group.Name);
                if (item) {
                    const lock     = item.Property?.LockedBy ? "[锁] " + item.Property.LockedBy : "";
                    const password = item.Property?.Password || item.Property?.CombinationNumber || "";
                    const itemName = item.Craft?.Name || item.Asset?.Description || item.Asset?.Name || t('unknown');
                    restraints.push({
                        text: (lock ? lock + " " : "") + itemName + " (" + group.Description + (password ? ", " + t('password') + ": " + password : "") + ")",
                        group: group.Name
                    });
                }
            }
        }
        if (!restraints.length) { ChatRoomSendLocal(getNickname(target) + " " + t('freeNoItem') + "！"); if (!ltToastSuppressed) ltToast(getNickname(target) + " " + (isZh() ? "没有可解除的束缚" : "has no restraints"), 'info'); return true; }
        const selected = await requestButtons(t('freeTitle') + " — " + getNickname(target), restraints, true);
        if (!selected.length) return true;
        try {
            selected.forEach(itemText => {
                const group = restraints.find(r => r.text === itemText)?.group;
                if (group) InventoryRemove(target, group);
            });
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " " + t('freeDone') + " " + getNickname(target) + " 的 " + selected.join("、"));
            if (!ltToastSuppressed) ltToast((isZh() ? "已解除 " : "Removed ") + selected.length + " " + (isZh() ? "件束缚 (" : "item(s) from (") + getNickname(target) + ")", 'success');
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ free 错误:", e.message); if (!ltToastSuppressed) ltToast((isZh() ? "操作失败: " : "Failed: ") + e.message, 'error'); }
        return true;
    }

    async function bcxImport(args) {
        const target = getPlayer(args.trim());
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); if (!ltToastSuppressed) ltToast((isZh() ? "无权限: " : "No permission: ") + getNickname(target), 'error'); return true; }
        let bcxCode;
        try { bcxCode = await navigator.clipboard.readText(); }
        catch (e) { ChatRoomSendLocal(t('clipboardFail')); if (!ltToastSuppressed) ltToast(t('clipboardFail'), 'error'); return true; }
        try {
            const appearance = JSON.parse(LZString.decompressFromBase64(bcxCode));
            if (!Array.isArray(appearance)) throw new Error("invalid");
            ServerAppearanceLoadFromBundle(target, target.AssetFamily, appearance, Player.MemberNumber);
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " " + t('bcxDone') + " " + getNickname(target) + "！");
            if (!ltToastSuppressed) ltToast((isZh() ? "已导入外观到 " : "Imported appearance to ") + getNickname(target), 'success');
        } catch (e) { ChatRoomSendLocal(t('bcxInvalid')); if (!ltToastSuppressed) ltToast(t('bcxInvalid'), 'error'); }
        return true;
    }

    function rpmode() {
        const newRpMode = !getRpMode(Player);
        setRpMode(newRpMode);
        ChatRoomSendLocal(newRpMode ? t('rpOn') : t('rpOff'));
        return true;
    }

    function rpbtn() {
        const s = getES();
        s.rpBtnVisible = s.rpBtnVisible !== 1 ? 1 : 0;
        saveES();
        ChatRoomSendLocal(s.rpBtnVisible === 1 ? t('rpBtnShow') : t('rpBtnHide'));
        return true;
    }

    // ──────────────────────────────────────────
    // 隐藏快捷键：长按 Shift + P 1.5 秒，切换 RP 隐身模式
    //   - stealthRp ON  → 别人看不到你头顶的 RP 图标
    //   - stealthRp OFF → 别人能看到你头顶的 RP 图标
    //   - 完全隐晦：UI 上不显示任何入口，只有开发者知道
    //   - 普通人按不出：必须 Shift + P 同时按住 1.5 秒
    // ──────────────────────────────────────────
    (function setupHiddenRpBtnShortcut() {
        let held = false;
        let timer = null;
        const HOLD_MS = 1500;
        document.addEventListener('keydown', function(e) {
            if (e.repeat) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key !== 'P' && e.key !== 'p') return;
            if (!e.shiftKey) return;
            if (held) return;
            held = true;
            timer = setTimeout(function() {
                const s = getES();
                const wasOn = getRpMode(Player);
                s.stealthRp = s.stealthRp !== 1 ? 1 : 0;
                saveES();
                // 如果之前 RP 已开，把状态迁移到新的存储方式
                if (wasOn) {
                    setRpMode(false);
                    setRpMode(true);
                }
                ChatRoomSendLocal('[BC] RP 隐身: ' + (s.stealthRp === 1 ? 'ON (别人看不到图标)' : 'OFF (别人能看到图标)'));
            }, HOLD_MS);
        });
        document.addEventListener('keyup', function(e) {
            if (e.key === 'P' || e.key === 'p' || e.key === 'Shift') {
                if (timer) { clearTimeout(timer); timer = null; }
                held = false;
            }
        });
    })();

    function fullUnlock(args) {
        const target = getPlayer(args.trim());
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); if (!ltToastSuppressed) ltToast((isZh() ? "无权限: " : "No permission: ") + getNickname(target), 'error'); return true; }
        try {
            const skipLocks = ["OwnerPadlock", "OwnerTimerPadlock", "LoversPadlock", "LoversTimerPadlock"];
            let count = 0;
            for (const a of target.Appearance) {
                if (a.Property?.LockedBy && !skipLocks.includes(a.Property.LockedBy)) {
                    InventoryUnlock(target, a); count++;
                }
            }
            if (!count) { ChatRoomSendLocal(getNickname(target) + " " + t('unlockNone') + "！"); if (!ltToastSuppressed) ltToast(getNickname(target) + " " + (isZh() ? "没有可解锁的锁" : "has no unlockable locks"), 'info'); return true; }
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " " + t('unlockDone') + " " + getNickname(target) + "！");
            if (!ltToastSuppressed) ltToast((isZh() ? "已解锁 " : "Unlocked ") + count + " " + (isZh() ? "把锁 (" : "lock(s) on (") + getNickname(target) + ")", 'success');
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ fullUnlock 错误:", e.message); if (!ltToastSuppressed) ltToast((isZh() ? "操作失败: " : "Failed: ") + e.message, 'error'); }
        return true;
    }

    async function getEverything() {
        const options = [{ text: t('geItems') }, { text: t('geMoney') }, { text: t('geSkills') }];
        const selected = await requestButtons(t('geTitle'), options, true);
        if (!selected.length) return true;
        try {
            if (selected.includes(t('geItems'))) {
                const ids = [];
                AssetFemale3DCG.forEach(group => {
                    group.Asset.forEach(item => {
                        if (item.Name && !Player.Inventory.some(inv => inv.Name === item.Name && inv.Group === group.Group) && item.InventoryID) {
                            InventoryAdd(Player, item.Name, group.Group, false);
                            ids.push(item.InventoryID);
                        }
                    });
                });
                ServerPlayerInventorySync();
                ChatRoomSendLocal(ids.length + " " + t('geItemsDone') + "！");
            }
            if (selected.includes(t('geMoney'))) {
                Player.Money = 999999; ServerPlayerSync();
                ChatRoomSendLocal(t('geMoneyDone') + "！");
            }
            if (selected.includes(t('geSkills'))) {
                ["LockPicking", "Evasion", "Willpower", "Bondage", "SelfBondage", "Dressage", "Infiltration"]
                    .forEach(skill => SkillChange(Player, skill, 10, 0, true));
                ChatRoomSendLocal(t('geSkillsDone') + "！");
            }
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ getEverything 错误:", e.message); }
        return true;
    }

    function wardrobe() {
        try { ChatRoomAppearanceLoadCharacter(Player); ChatRoomSendLocal(t('wardrobeDone')); }
        catch (e) { console.error("🐈‍⬛ [BC] ❌ wardrobe 错误:", e.message); }
        return true;
    }

    function fullLock(args) {
        const params           = args.trim().split(/\s+/);
        const targetIdentifier = params[0] || "";
        const lockName         = params[1] || "";
        const target           = getPlayer(targetIdentifier);
        if (target === Player && !targetIdentifier) { ChatRoomSendLocal(t('lockSpecify')); if (!ltToastSuppressed) ltToast(t('lockSpecify'), 'info'); return true; }
        if (!ChatRoomCharacter?.find(c => c.MemberNumber === target.MemberNumber)) {
            ChatRoomSendLocal(getNickname(target) + " " + t('notInRoom') + "！"); if (!ltToastSuppressed) ltToast(getNickname(target) + " " + (isZh() ? "不在房间" : "not in room"), 'error'); return true;
        }
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); if (!ltToastSuppressed) ltToast((isZh() ? "无权限: " : "No permission: ") + getNickname(target), 'error'); return true; }
        const itemMiscGroup = AssetGroupGet(Player.AssetFamily, "ItemMisc");
        if (!itemMiscGroup) return true;
        const validLocks = itemMiscGroup.Asset.filter(a => a.IsLock).map(a => ({ Name: a.Name, Description: a.Description || a.Name }));
        const lock = validLocks.find(l => l.Name.toLowerCase() === lockName.toLowerCase() || l.Description.toLowerCase() === lockName.toLowerCase());
        if (!lock) {
            ChatRoomSendLocal(t('lockInvalid') + "：" + lockName + "。" + t('lockAvailable') + "：" + validLocks.map(l => l.Description).join("、"));
            if (!ltToastSuppressed) ltToast((isZh() ? "无效锁类型: " : "Invalid lock: ") + lockName, 'error');
            return true;
        }
        try {
            let count = 0;
            for (const item of target.Appearance) {
                const groupName = item.Asset?.Group?.Name || "";
                if (groupName.startsWith("Item") && item.Asset?.AllowLock !== false && !item.Property?.LockedBy) {
                    InventoryLock(target, item, { Asset: AssetGet(Player.AssetFamily, "ItemMisc", lock.Name) }, Player.MemberNumber);
                    count++;
                }
            }
            if (!count) { ChatRoomSendLocal(getNickname(target) + " " + t('lockNone') + "！"); if (!ltToastSuppressed) ltToast(getNickname(target) + " " + (isZh() ? "没有可上锁的束缚" : "has no lockable restraints"), 'info'); return true; }
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " 为 " + getNickname(target) + " 的 " + count + " " + t('lockDone') + " " + lock.Description + "！");
            if (!ltToastSuppressed) ltToast((isZh() ? "已为 " : "Locked ") + count + " " + (isZh() ? "件束缚上锁 (" : "item(s) on (") + getNickname(target) + ")", 'success');
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ fullLock 错误:", e.message); if (!ltToastSuppressed) ltToast((isZh() ? "操作失败: " : "Failed: ") + e.message, 'error'); }
        return true;
    }

    function heightLockCommand() {
        const s = getES();
        s.heightLock = s.heightLock !== 1 ? 1 : 0;
        saveES();
        if (s.heightLock === 1) {
            if (heightTargetChar) {
                applyHeightLock(heightTargetChar);
            }
        } else {
            if (heightTargetChar) {
                removeHeightHijack(heightTargetChar);
            }
        }
        ChatRoomSendLocal(s.heightLock === 1 ? t('heightLockOn') : t('heightLockOff'));
        return true;
    }

    async function undoCommand(args) {
        await openUndoPanel(getPlayer(args.trim()));
        return true;
    }

    function themeCommand() {
        var order = ['light', 'dark', 'system'];
        var idx = order.indexOf(currentTheme.mode);
        if (idx < 0) idx = 1;
        var next = order[(idx + 1) % order.length];
        setThemeMode(next);
        ChatRoomSendLocal('主题：' + (next === 'light' ? '日间' : next === 'dark' ? '夜间' : '跟随系统'));
        return true;
    }

    // ──────────────────────────────────────────
    // Release Maid (自动解绑女仆)
    // ──────────────────────────────────────────
    const RM_DEFAULT_TRIGGER = ["救我", "救救", "幫我", "帮我", "help"];
    const RM_DEFAULT_UNLOCK  = ["開鎖", "开锁", "解鎖", "解锁", "unlock"];

    function loadRmCustomWords(key) {
        try {
            var s = localStorage.getItem(key);
            if (s) { var arr = JSON.parse(s); if (Array.isArray(arr)) return arr; }
        } catch (_) {}
        return [];
    }
    function saveRmCustomWords(key, words) {
        try { localStorage.setItem(key, JSON.stringify(words)); } catch (_) {}
    }
    function getRmTriggerWords() {
        return RM_DEFAULT_TRIGGER.concat(loadRmCustomWords(STORAGE_RM_TRIGGER));
    }
    function getRmUnlockWords() {
        return RM_DEFAULT_UNLOCK.concat(loadRmCustomWords(STORAGE_RM_UNLOCK));
    }

    function rmNormalizeMessage(msg) {
        return msg
            .toLowerCase()
            .replace(/[-~.…。！!,?？]/g, "")
            .replace(/(.)\1{3,}/g, "$1$1")
            .trim();
    }

    // 提取 OOC 括号内文本（BC 口塞不会改写括号内的字符）
    function rmExtractOOC(raw) {
        const parts = [];
        const re = /[\(（]([^)）]*)[\)）]/g;
        let m;
        while ((m = re.exec(raw)) !== null) {
            if (m[1].trim()) parts.push(m[1].trim());
        }
        return parts;
    }

    function rmFindTarget(keyword) {
        if (/^\d+$/.test(keyword)) {
            const byId = ChatRoomCharacter.find(c => c.MemberNumber === parseInt(keyword));
            if (byId) return byId;
        }
        return ChatRoomCharacter.find(c =>
            (c.Nickname || "").toLowerCase() === keyword.toLowerCase() ||
            (c.Name || "").toLowerCase() === keyword.toLowerCase()
        );
    }

    function rmRescue(target, mode) {
        if (!target) return;
        if (!hasBCItemPermission(target)) return;
        try {
            let success = false;
            if (mode === "unlock") {
                const skipLocks = ["OwnerPadlock", "OwnerTimerPadlock", "LoversPadlock", "LoversTimerPadlock"];
                let count = 0;
                for (const a of target.Appearance) {
                    if (a.Property?.LockedBy && !skipLocks.includes(a.Property.LockedBy)) {
                        InventoryUnlock(target, a); count++;
                    }
                }
                success = count > 0;
                if (success) ChatRoomCharacterUpdate(target);
            } else {
                CharacterReleaseTotal(target);
                ChatRoomCharacterUpdate(target);
                success = true;
            }
            if (success) {
                const systemMessage = mode === "unlock"
                    ? getNickname(Player) + "解开了" + getNickname(target) + "的锁"
                    : getNickname(Player) + "解开了" + getNickname(target) + "的拘束";
                ServerSend("ChatRoomChat", {
                    Type: "Action",
                    Content: "CUSTOM_SYSTEM_ACTION",
                    Dictionary: [
                        { Tag: 'MISSING TEXT IN "Interface.csv": CUSTOM_SYSTEM_ACTION', Text: systemMessage }
                    ]
                });
            }
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ Release Maid 救援失敗:", e.message); }
    }

    function rmHandleMessage(data) {
        if (getES().releaseMaid !== 1) return;
        // 支持 Chat / Emote 两种消息类型
        // - Chat: 玩家输入的文字（可能被口塞改写为拟声词）
        // - Emote: 玩家输入的 *xxx* 表情 或 (xxx) full emote
        //   (xxx) full emote 是 SpeechFullEmote 格式，BC 检测到后跳过口塞改写，Content 原样传输
        if (data.Type !== "Chat" && data.Type !== "Emote") return;
        if (typeof data.Content !== "string") return;
        const raw = data.Content.trim();
        // DEBUG 临时：打印所有可能相关消息
        try {
            if (window.BC_TOOLBOX_DEBUG) {
                const dictStr = Array.isArray(data.Dictionary)
                    ? data.Dictionary.map(d => d?.Text || d?.Tag || "?").join(" | ")
                    : "(no dict)";
                console.log("[LT RM] Type=" + data.Type + " | Content=" + raw.slice(0, 60) + " | Dict=" + dictStr.slice(0, 80));
            }
        } catch (_) {}
        const msg = rmNormalizeMessage(raw);
        const senderID = data.Sender;
        // 提前过滤：玩家自己发的消息不处理（避免双触发）
        if (senderID === Player.MemberNumber) return;

        // 提取 OOC 括号内文本（BC 口塞不会改写括号内字符）
        const oocTexts = rmExtractOOC(raw).map(s => rmNormalizeMessage(s));
        // 所有需要匹配的文本（整条消息 + 各段 OOC）
        const allTexts = [msg].concat(oocTexts);
        const triggerWords = getRmTriggerWords();
        const unlockWords  = getRmUnlockWords();
        try {
            // 自救 (完全解放) — 整条消息或 OOC 内容匹配触发词
            if (allTexts.some(txt => triggerWords.some(w => txt.includes(w)))) {
                const target = ChatRoomCharacter.find(c => c.MemberNumber === senderID);
                if (target) rmRescue(target, "release");
                return;
            }
            // 自救 (只解锁)
            if (allTexts.some(txt => unlockWords.some(w => txt.includes(w)))) {
                const target = ChatRoomCharacter.find(c => c.MemberNumber === senderID);
                if (target) rmRescue(target, "unlock");
                return;
            }
            // 指定救援 (完全解放) — 整条消息或 OOC 内容
            for (const txt of allTexts) {
                if (txt.startsWith("救") || txt.startsWith("help")) {
                    const keyword = txt.replace(/^救|^help/i, "").trim();
                    if (!keyword) continue;
                    let target = rmFindTarget(keyword);
                    if (target) { rmRescue(target, "release"); return; }
                }
            }
            // 指定解锁
            for (const txt of allTexts) {
                if (txt.startsWith("解鎖") || txt.startsWith("解锁") || txt.startsWith("unlock")) {
                    const keyword = txt.replace(/^解鎖|^解锁|^unlock/i, "").trim();
                    if (!keyword) continue;
                    let target = rmFindTarget(keyword);
                    if (target) { rmRescue(target, "unlock"); return; }
                }
            }
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ Release Maid 訊息處理錯誤:", e.message); }
    }

    function releaseMaidCommand() {
        const s = getES();
        s.releaseMaid = s.releaseMaid !== 1 ? 1 : 0;
        saveES();
        ChatRoomSendLocal(s.releaseMaid === 1 ? t('rmOn') : t('rmOff'));
        return true;
    }

    function rmWordsCommand() {
        openRmWordsPanel();
        return true;
    }

    function openRmWordsPanel() {
        injectLtStyles();
        applyTheme();

        var content = document.createElement('div');
        content.className = 'lt-settings';

        function buildWordSection(storageKey, defaultWords, label, desc) {
            var section = document.createElement('div');
            section.style.marginBottom = '14px';

            var lbl = document.createElement('div');
            lbl.className = 'lt-settings-label';
            lbl.textContent = label;
            section.appendChild(lbl);

            var descEl = document.createElement('div');
            descEl.style.cssText = 'font-size:11px;color:var(--lt-text-dim);margin-bottom:8px;';
            descEl.textContent = desc;
            section.appendChild(descEl);

            // Input row
            var inputRow = document.createElement('div');
            inputRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
            var input = document.createElement('input');
            input.type = 'text';
            input.placeholder = isZh() ? '输入短语后回车或点添加' : 'Type phrase, press Enter or +';
            input.style.cssText = 'flex:1;background:var(--lt-surface);border:1px solid var(--lt-border);border-radius:8px;padding:6px 10px;color:var(--lt-text);font-size:12px;outline:none;';
            var addBtn = document.createElement('button');
            addBtn.className = 'lt-btn lt-btn-primary';
            addBtn.textContent = '+';
            addBtn.style.cssText = 'padding:4px 12px;font-size:16px;min-width:34px;';
            inputRow.appendChild(input);
            inputRow.appendChild(addBtn);
            section.appendChild(inputRow);

            // Chips container
            var chipsWrap = document.createElement('div');
            chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
            section.appendChild(chipsWrap);

            var customWords = loadRmCustomWords(storageKey);

            function renderChips() {
                chipsWrap.innerHTML = '';
                // Default words (not deletable)
                defaultWords.forEach(function(w) {
                    var chip = document.createElement('span');
                    chip.className = 'lt-rm-chip lt-rm-default';
                    chip.innerHTML = w + '<span class="lt-rm-tag">' + (isZh() ? '默认' : 'default') + '</span>';
                    chipsWrap.appendChild(chip);
                });
                // Custom words (deletable)
                customWords.forEach(function(w, idx) {
                    var chip = document.createElement('span');
                    chip.className = 'lt-rm-chip lt-rm-custom';
                    chip.innerHTML = w + '<span class="lt-rm-del" title="' + t('close') + '">×</span>';
                    chip.querySelector('.lt-rm-del').addEventListener('click', function(e) {
                        e.stopPropagation();
                        customWords.splice(idx, 1);
                        saveRmCustomWords(storageKey, customWords);
                        renderChips();
                    });
                    chipsWrap.appendChild(chip);
                });
            }

            function addWord() {
                var val = input.value.trim();
                if (!val) return;
                if (customWords.includes(val) || defaultWords.includes(val)) { input.value = ''; return; }
                customWords.push(val);
                saveRmCustomWords(storageKey, customWords);
                input.value = '';
                renderChips();
            }

            addBtn.addEventListener('click', addWord);
            input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); addWord(); } });
            renderChips();
            return section;
        }

        content.appendChild(buildWordSection(
            STORAGE_RM_TRIGGER, RM_DEFAULT_TRIGGER,
            isZh() ? '救援短语' : 'Rescue Phrases',
            isZh() ? '触发完全解除拘束（发送者本人）' : 'Triggers full release (sender)'
        ));

        var divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:var(--lt-border);margin:12px 0;';
        content.appendChild(divider);

        content.appendChild(buildWordSection(
            STORAGE_RM_UNLOCK, RM_DEFAULT_UNLOCK,
            isZh() ? '解锁短语' : 'Unlock Phrases',
            isZh() ? '只解锁，不移除束缚物品' : 'Unlocks only, does not remove items'
        ));

        // Footer
        var footerEl = document.createElement('div');
        footerEl.style.cssText = 'width:100%;display:flex;gap:8px;';
        var resetBtn = document.createElement('button');
        resetBtn.className = 'lt-btn lt-btn-secondary';
        resetBtn.textContent = isZh() ? '重置自定义' : 'Reset Custom';
        resetBtn.style.flex = '1';
        resetBtn.addEventListener('click', function() {
            saveRmCustomWords(STORAGE_RM_TRIGGER, []);
            saveRmCustomWords(STORAGE_RM_UNLOCK, []);
            ChatRoomSendLocal(isZh() ? '救援短语已重置为默认' : 'Phrases reset to defaults');
            panel.remove();
        });
        footerEl.appendChild(resetBtn);

        var panel = createPanel(isZh() ? '救援短语设置' : 'Rescue Phrase Settings', content, footerEl);
        panel.style.width = '340px';
        if (currentTheme.mode === 'light') panel.classList.add('lt-light');
    }

    function openAntiRestraintPanel() {
        injectLtStyles();
        applyTheme();

        var content = document.createElement('div');
        content.className = 'lt-settings';

        function toggleRow(label, desc, isOn, onChange) {
            var row = document.createElement('div');
            row.className = 'ltq-toggle';
            row.style.marginBottom = '4px';
            var labelWrap = document.createElement('div');
            labelWrap.className = 'ltq-toggle-label';
            var labelEl = document.createElement('span');
            labelEl.textContent = label;
            labelWrap.appendChild(labelEl);
            var sw = document.createElement('div');
            sw.className = 'ltq-switch' + (isOn ? ' on' : '');
            row.appendChild(labelWrap);
            row.appendChild(sw);
            row.addEventListener('click', function() {
                var on = !sw.classList.contains('on');
                sw.classList.toggle('on', on);
                row.classList.toggle('on', on);
                onChange(on);
            });
            var nodes = [row];
            if (desc) {
                var d = document.createElement('div');
                d.style.cssText = 'font-size:11px;color:var(--lt-text-dim);margin:-2px 0 10px;';
                d.textContent = desc;
                nodes.push(d);
            }
            return nodes;
        }

        // 1. 解除时发送瞪视表情
        toggleRow(t('arAnnounce'), t('arAnnounceDesc'), getAntiRestraintAnnounce(), function(on) { setAntiRestraintAnnounce(on); })
            .forEach(function(e) { content.appendChild(e); });

        // 2. 解除前先询问
        toggleRow(t('arConfirm'), t('arConfirmDesc'), getAntiRestraintConfirm(), function(on) { setAntiRestraintConfirm(on); })
            .forEach(function(e) { content.appendChild(e); });

        // 3. 自定义瞪视文字
        var lbl3 = document.createElement('div');
        lbl3.className = 'lt-settings-label';
        lbl3.textContent = t('arEmote');
        content.appendChild(lbl3);
        var d3 = document.createElement('div');
        d3.style.cssText = 'font-size:11px;color:var(--lt-text-dim);margin:4px 0 8px;';
        d3.textContent = t('arEmoteDesc');
        content.appendChild(d3);
        var emoteInput = document.createElement('input');
        emoteInput.type = 'text';
        emoteInput.value = getEscapeEmoteText();
        emoteInput.placeholder = 'glares at {restrainer} as the {item} falls away.';
        emoteInput.style.cssText = 'width:100%;background:var(--lt-surface);border:1px solid var(--lt-border);border-radius:8px;padding:6px 10px;color:var(--lt-text);font-size:12px;outline:none;box-sizing:border-box;';
        emoteInput.addEventListener('input', function() { setEscapeEmoteText(emoteInput.value); });
        content.appendChild(emoteInput);

        // divider
        var divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:var(--lt-border);margin:14px 0;';
        content.appendChild(divider);

        // 4. 白名单
        var lbl4 = document.createElement('div');
        lbl4.className = 'lt-settings-label';
        lbl4.textContent = t('arWhitelist');
        content.appendChild(lbl4);
        var d4 = document.createElement('div');
        d4.style.cssText = 'font-size:11px;color:var(--lt-text-dim);margin:4px 0 8px;';
        d4.textContent = t('arWhitelistDesc');
        content.appendChild(d4);

        var wlWrap = document.createElement('div');
        wlWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
        content.appendChild(wlWrap);

        var worn = [];
        try {
            worn = Player.Appearance.filter(function(i) { return LT_RESTRAINT_GROUPS.has(i.Asset.Group.Name); })
                .map(function(i) { return { group: i.Asset.Group.Name, name: (i.Asset.Description || i.Asset.Name) }; });
        } catch (e) {}

        if (!worn.length) {
            var none = document.createElement('div');
            none.style.cssText = 'font-size:11px;color:var(--lt-text-dim);';
            none.textContent = t('arNoRestraint');
            content.appendChild(none);
        }

        var wl = getAntiRestraintWhitelist();
        function renderWl() {
            wlWrap.innerHTML = '';
            worn.forEach(function(it) {
                var on = wl.includes(it.group);
                var chip = document.createElement('span');
                chip.className = 'lt-rm-chip' + (on ? ' lt-rm-default' : '');
                chip.textContent = it.name;
                chip.style.cursor = 'pointer';
                chip.title = it.group;
                chip.addEventListener('click', function() {
                    if (wl.includes(it.group)) removeAntiRestraintWhitelist(it.group);
                    else addAntiRestraintWhitelist(it.group);
                    wl = getAntiRestraintWhitelist();
                    renderWl();
                });
                wlWrap.appendChild(chip);
            });
        }
        renderWl();

        var panel = createPanel(t('arPanelTitle'), content, null);
        panel.style.width = '340px';
        if (currentTheme.mode === 'light') panel.classList.add('lt-light');
    }

    // ──────────────────────────────────────────
    // 指令入口
    // ──────────────────────────────────────────
    // ──────────────────────────────────────────
    // LSCG 命令转发（/lscg ... 走 BC 命令管道，本地执行不广播）
    // ──────────────────────────────────────────
    function ltSendLscg(cmd) {
        if (typeof window.LSCG_Loaded === 'undefined' || !window.LSCG_Loaded) {
            ChatRoomSendLocal(t('lscgMissing'));
            return;
        }
        try {
            // 走聊天输入框 + 无参 ChatRoomSendChat()，BC 才会解析 / 命令（与 execChatCommand 一致）
            if (typeof ElementValue === 'function') {
                ElementValue('InputChat', '/lscg ' + cmd);
                ChatRoomSendChat();
            } else {
                ChatRoomSendChat('/lscg ' + cmd);
            }
        }
        catch (e) { ChatRoomSendLocal(t('lscgMissing')); }
    }

    function lscgCommand(text) {
        const cmd = (text || '').trim();
        if (!cmd) { ChatRoomSendLocal(t('lscgHelp')); return true; }
        ltSendLscg(cmd);
        return true;
    }

    // ── Craft 属性：清除 / 批量编辑（移植自上游 v2.0.3）──
    // 收集对象身上所有 Item* 组的束缚物品
    function collectRestraintItems(target) {
        const items = [];
        for (const group of AssetGroup) {
            if (!group.Name.startsWith("Item")) continue;
            const item = InventoryGet(target, group.Name);
            if (item) items.push({ item, group: group.Name, groupDesc: group.Description });
        }
        return items;
    }

    async function clearAllCraft(target) {
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); return; }
        // 只列出「确实带有 craft」的束缚，供逐个选或全选
        const restraints = collectRestraintItems(target)
            .filter(r => r.item.Craft)
            .map(r => ({
                text: (r.item.Craft?.Name || r.item.Asset?.Description || r.item.Asset?.Name || t('unknown')) + " (" + r.groupDesc + ")",
                group: r.group
            }));
        if (!restraints.length) { ChatRoomSendLocal(getNickname(target) + " " + t('craftClearNone') + "！"); return; }
        const selected = await requestButtons(t('craftClearTitle') + " — " + getNickname(target), restraints, true);
        if (!selected.length) return;
        try {
            let count = 0;
            selected.forEach(itemText => {
                const group = restraints.find(r => r.text === itemText)?.group;
                if (!group) return;
                const item = InventoryGet(target, group);
                if (item?.Craft) { delete item.Craft; count++; }
            });
            if (!count) return;
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " " + t('craftClearDone') + " " + getNickname(target) + "！");
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ clearAllCraft 错误:", e.message); }
    }

    async function editCraftBatch(target) {
        if (!hasBCItemPermission(target)) { ChatRoomSendLocal(t('noPermission') + " " + getNickname(target) + "。"); return; }
        const restraints = collectRestraintItems(target).map(r => ({
            text: (r.item.Craft?.Name || r.item.Asset?.Description || r.item.Asset?.Name || t('unknown')) + " (" + r.groupDesc + ")",
            group: r.group
        }));
        if (!restraints.length) { ChatRoomSendLocal(getNickname(target) + " " + t('craftNoItem') + "！"); return; }
        const selected = await requestButtons(t('craftPickTitle') + " — " + getNickname(target), restraints, true);
        if (!selected.length) return;
        const craft = await requestCraftEdit();
        if (!craft) return;
        try {
            let count = 0;
            selected.forEach(itemText => {
                const group = restraints.find(r => r.text === itemText)?.group;
                if (!group) return;
                const item = InventoryGet(target, group);
                if (!item) return;
                const existing = item.Craft || {};
                const defaults = {
                    Color: Array.isArray(item.Color) ? item.Color.join(",") : (typeof item.Color === "string" ? item.Color : ""),
                    Lock: "",
                    Effects: {},
                    Item: item.Asset?.Name ?? "",
                };
                item.Craft = Object.assign({}, defaults, existing, {
                    Name: craft.name,
                    Description: craft.description,
                    Private: craft.private,
                    Item: item.Asset?.Name ?? existing.Item ?? "",
                    MemberName: Player.Nickname || Player.Name || "",
                    MemberNumber: Player.MemberNumber,
                });
                count++;
            });
            if (!count) return;
            ChatRoomCharacterUpdate(target);
            chatSendCustomAction(getNickname(Player) + " → " + getNickname(target) + "：" + count + " " + t('craftEditDone') + "「" + craft.name + "」");
        } catch (e) { console.error("🐈‍⬛ [BC] ❌ editCraftBatch 错误:", e.message); }
    }

    // craft 编辑表单：名称 / 描述 / 私有 → resolve({name, description, private}) 或 null
    function requestCraftEdit() {
        return new Promise(resolve => {
            let done = false;
            const wrap = document.createElement('div');
            wrap.className = 'lt-settings';

            const mkLabel = (txt) => { const l = document.createElement('div'); l.className = 'lt-settings-label'; l.textContent = txt; l.style.marginBottom = '4px'; return l; };
            const inputCss = 'width:100%;background:var(--lt-surface);border:1px solid var(--lt-border);border-radius:8px;padding:6px 10px;color:var(--lt-text);font-size:12px;outline:none;';

            wrap.appendChild(mkLabel(t('craftName')));
            const nameInput = document.createElement('input');
            nameInput.type = 'text'; nameInput.maxLength = 100; nameInput.style.cssText = inputCss + 'margin-bottom:12px;';
            wrap.appendChild(nameInput);

            wrap.appendChild(mkLabel(t('craftDesc')));
            const descInput = document.createElement('textarea');
            descInput.rows = 3; descInput.maxLength = 200; descInput.style.cssText = inputCss + 'margin-bottom:12px;resize:vertical;font-family:inherit;';
            wrap.appendChild(descInput);

            const privRow = document.createElement('label');
            privRow.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--lt-text);';
            const privCheck = document.createElement('input');
            privCheck.type = 'checkbox';
            const privText = document.createElement('span'); privText.textContent = t('craftPrivate');
            privRow.appendChild(privCheck); privRow.appendChild(privText);
            wrap.appendChild(privRow);

            const footerEl = document.createElement('div');
            footerEl.style.cssText = 'display:flex;gap:8px;width:100%;';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'lt-btn lt-btn-secondary'; cancelBtn.textContent = t('cancel'); cancelBtn.style.flex = '1';
            cancelBtn.onclick = () => { if (done) return; done = true; panel.remove(); resolve(null); };
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'lt-btn lt-btn-primary'; confirmBtn.textContent = t('confirm'); confirmBtn.style.flex = '1';
            confirmBtn.onclick = () => {
                if (done) return;
                const name = nameInput.value.trim();
                if (!name) { nameInput.focus(); return; }
                done = true; panel.remove();
                resolve({ name, description: descInput.value.trim(), private: privCheck.checked });
            };
            footerEl.appendChild(cancelBtn); footerEl.appendChild(confirmBtn);

            const panel = createPanel(t('craftEditTitle'), wrap, footerEl, {
                onClose: () => { if (!done) { done = true; resolve(null); } }
            });
            setTimeout(() => { try { nameInput.focus(); } catch (_) {} }, 0);
        });
    }

    function clearCraftCommand(args) {
        const target = getPlayer((args || '').trim());
        if (target) clearAllCraft(target);
        return true;
    }
    function editCraftCommand(args) {
        const target = getPlayer((args || '').trim());
        if (target) editCraftBatch(target);
        return true;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BCX 指令快捷触发面板（v1）
    //   通过 window.bcx.getModApi 拿到 BCX 的 ModAPI，调用 commandTrigger 查询，
    //   对选中的在场角色触发表情/姿态/场所/文本等指令。界面全部使用中文。
    // ════════════════════════════════════════════════════════════════════════
    const BCX_MOD_ID = "BC工具箱"; // 必须与 bcModSdk.registerMod 注册的 name 一致

    // 指令目录：cat 分类；cmds 指令条目。
    //   kind: none(无参) | options(固定选项) | duration(时长) | text(单段文本) | textNum(次数+文本) | custom(高级自定义)
    //   opts: [[英文值, 中文显示], ...]
    const BCX_CMD_CATALOG = [
        { cat: "表情与姿态", cmds: [
            { name: "eyes",      zh: "眼睛",     kind: "options", opts: [["open","睁开"],["close","闭上"],["up","媚眼向上"],["down","羞涩向下"]] },
            { name: "mouth",     zh: "嘴巴",     kind: "options", opts: [["close","闭上"],["open","微张"],["openwide","张大呻吟"],["tongue","吐舌"],["smile","得意微笑"]] },
            { name: "arms",      zh: "手臂",     kind: "options", opts: [["down","放松下垂"],["spread","张开"],["up","高举过头"],["back","背后"],["elbows","肘并拢背后"],["wrists","腕并拢背后"]] },
            { name: "legs",      zh: "腿",       kind: "options", opts: [["normal","站立放松"],["kneel","跪下并拢"],["kneelspread","跪开"],["close","站立并拢"]] },
            { name: "emoticon",  zh: "头顶表情", kind: "options", opts: [["none","无"],["hearts","爱心"],["sleep","睡觉"],["whisper","私语"],["afk","离开"],["question","问号"],["exclamation","感叹"],["angry","生气"],["thumbsup","好评"],["thumbsdown","差评"],["book","读书"],["hand","举手"],["eye","旁观"],["sweatdrop","汗滴"],["ear","聆听"],["rope","爱绳"],["gag","爱堵"],["lock","爱锁"],["wardrobe","衣柜"],["game","游戏"]] },
            { name: "allfours",  zh: "爬行",     kind: "none" },
        ]},
        { cat: "身体控制", cmds: [
            { name: "orgasm",    zh: "高潮控制", kind: "options", opts: [["50","设为 50%"],["80","设为 80%"],["100","触发高潮"],["forced","强制高潮"],["ruined","破坏高潮"],["stop","停止高潮"]] },
        ]},
        { cat: "场所/强制", cmds: [
            { name: "cell",        zh: "监禁",     kind: "duration", hint: "输入时长，如 30m / 2h（单人牢笼最长 60 分钟）" },
            { name: "asylum",      zh: "精神病院", kind: "duration", hint: "输入时长，如 30m / 2h" },
            { name: "keydeposit",  zh: "钥匙托管", kind: "duration", hint: "输入时长，如 30m / 2h" },
            { name: "goandwait",   zh: "去等候室", kind: "options", opts: [["public","公共房间"],["private","私人房间"]] },
            { name: "servedrinks", zh: "强制服务", kind: "none" },
            { name: "timeleft",    zh: "剩余时间", kind: "none" },
        ]},
        { cat: "文本/代码", cmds: [
            { name: "forcesay",      zh: "强制说话", kind: "text", hint: "让对方立即说出的话（不能含左括号，不能以 * ! / . 开头）" },
            { name: "say",           zh: "限定说话", kind: "text", hint: "锁死对方只能说这句话（输入 cancel 解除）" },
            { name: "typetask",      zh: "打字任务", kind: "textNum", hint: "格式：次数 文本内容（如 5 你好世界）" },
            { name: "forcetypetask", zh: "强制打字", kind: "textNum", hint: "格式：次数 文本内容" },
            { name: "action",        zh: "动作文本", kind: "text", hint: "以动作形式发送的文本" },
            { name: "garble",        zh: "乱码转换", kind: "custom", hint: "格式：等级 消息（如 2 你好），把消息转成 gag talk" },
        ]},
        { cat: "房间/工具", cmds: [
            { name: "room",            zh: "房间管理", kind: "custom", hint: "例如 locked yes / size 6 / kick Alice（需房管权限）" },
            { name: "deck",            zh: "卡牌",     kind: "custom", hint: "例如 shuffle / draw 5 / deal 2 Alice" },
            { name: "dice",            zh: "骰子",     kind: "custom", hint: "留空=掷1个6面骰；或输入 20 / 3d6" },
            { name: "colour",          zh: "颜色",     kind: "custom", hint: "格式：来源玩家 道具 目标玩家，例如 Alice arms Bob" },
            { name: "allowactivities", zh: "允许动作", kind: "custom", hint: "输入目标玩家名或编号，例如 Alice" },
        ]},
    ];

    function getBcxApi() {
        try {
            if (typeof window.bcx === "undefined" || !window.bcx.getModApi) return null;
            return window.bcx.getModApi(BCX_MOD_ID);
        } catch (e) {
            console.warn("🐈‍⬛ [BC] ⚠️ 获取 BCX API 失败:", e && e.message);
            return null;
        }
    }

    async function bcxTrigger(targetNum, cmdName, args) {
        const api = getBcxApi();
        if (!api) return { ok: false, msg: "未检测到 BCX，或本工具未注册为 Mod" };
        const tgt = (targetNum === Player.MemberNumber) ? "Player" : targetNum;
        try {
            const res = await api.sendQuery("commandTrigger", [cmdName].concat(args || []), tgt);
            return { ok: !!res, msg: res ? "已触发" : "对方拒绝或参数错误" };
        } catch (e) {
            return { ok: false, msg: "触发失败：" + (e && e.message ? e.message : "超时/对方未响应") };
        }
    }

    async function bcxGetLimits(targetNum) {
        const api = getBcxApi();
        if (!api) return null;
        try {
            const data = await api.sendQuery("conditionsGet", "commands", targetNum);
            return (data && data.limits) ? data : null;
        } catch (e) { return null; }
    }

    // 轻量模态容器（不带 clickOut，便于在主面板内嵌套参数弹窗而不误关主面板）
    function ltModal(titleText, contentEl) {
        injectLtStyles();
        applyTheme();
        const panel = document.createElement("div");
        panel.className = "lt-panel";
        if (currentTheme && currentTheme.mode === "light") panel.classList.add("lt-light");
        const header = document.createElement("div");
        header.className = "lt-header";
        const title = document.createElement("span");
        title.className = "lt-title";
        title.style.fontFamily = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji","Noto Sans TC",sans-serif';
        title.textContent = titleText;
        const close = document.createElement("button");
        close.className = "lt-hclose";
        close.innerHTML = SVG.close;
        close.onclick = function () { panel.remove(); };
        header.appendChild(title);
        header.appendChild(close);
        const content = document.createElement("div");
        content.className = "lt-content";
        content.appendChild(contentEl);
        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);

        // 拖动支持（同 createPanel）
        let drag = { on: false, sx: 0, sy: 0, px: 0, py: 0 };
        const onMove = function (e) {
            if (!drag.on) return;
            panel.style.left = (drag.px + e.clientX - drag.sx) + "px";
            panel.style.top = (drag.py + e.clientY - drag.sy) + "px";
        };
        const onUp = function () { drag.on = false; };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        const dragObs = new MutationObserver(function () {
            if (!document.body.contains(panel)) {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                dragObs.disconnect();
            }
        });
        dragObs.observe(document.body, { childList: true, subtree: true });
        header.addEventListener("mousedown", function (e) {
            if (e.target.closest('.lt-hclose')) return;
            drag.on = true; drag.sx = e.clientX; drag.sy = e.clientY;
            const r = panel.getBoundingClientRect();
            drag.px = r.left; drag.py = r.top;
            panel.style.transform = "none";
            panel.style.left = drag.px + "px";
            panel.style.top = drag.py + "px";
            e.preventDefault();
        });

        return panel;
    }

    function requestText(titleText, placeholder, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";
            const ta = document.createElement("textarea");
            ta.style.cssText = "width:100%;min-height:90px;resize:vertical;background:var(--lt-surface,rgba(255,255,255,0.04));border:1px solid var(--lt-border,rgba(255,255,255,0.08));border-radius:10px;color:var(--lt-text,#d8e6f8);padding:10px;font-family:inherit;font-size:13px;box-sizing:border-box;";
            ta.placeholder = placeholder || "";
            const errEl = document.createElement("div");
            errEl.style.cssText = "color:#ff7676;font-size:12px;min-height:14px;";
            const footer = document.createElement("div");
            footer.style.cssText = "display:flex;gap:8px;";
            const cancel = document.createElement("button");
            cancel.className = "lt-btn lt-btn-secondary";
            cancel.textContent = t("cancel");
            const ok = document.createElement("button");
            ok.className = "lt-btn lt-btn-primary";
            ok.textContent = opts.okText || t("confirm");
            footer.appendChild(cancel);
            footer.appendChild(ok);
            wrap.appendChild(ta);
            wrap.appendChild(errEl);
            wrap.appendChild(footer);
            const panel = createPanel(titleText, wrap, null);
            const finish = function (v) { panel.remove(); resolve(v); };
            cancel.onclick = function () { finish(null); };
            ok.onclick = function () {
                const v = ta.value;
                if (opts.validate) { const ve = opts.validate(v); if (ve) { errEl.textContent = ve; return; } }
                finish(v);
            };
            ta.focus();
        });
    }

    function requestSingle(titleText, placeholder, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";
            const inp = document.createElement("input");
            inp.type = "text";
            inp.style.cssText = "width:100%;background:var(--lt-surface,rgba(255,255,255,0.04));border:1px solid var(--lt-border,rgba(255,255,255,0.08));border-radius:10px;color:var(--lt-text,#d8e6f8);padding:10px;font-family:inherit;font-size:13px;box-sizing:border-box;";
            inp.placeholder = placeholder || "";
            const errEl = document.createElement("div");
            errEl.style.cssText = "color:#ff7676;font-size:12px;min-height:14px;";
            const footer = document.createElement("div");
            footer.style.cssText = "display:flex;gap:8px;";
            const cancel = document.createElement("button");
            cancel.className = "lt-btn lt-btn-secondary";
            cancel.textContent = t("cancel");
            const ok = document.createElement("button");
            ok.className = "lt-btn lt-btn-primary";
            ok.textContent = opts.okText || t("confirm");
            footer.appendChild(cancel);
            footer.appendChild(ok);
            wrap.appendChild(inp);
            wrap.appendChild(errEl);
            wrap.appendChild(footer);
            const panel = createPanel(titleText, wrap, null);
            const finish = function (v) { panel.remove(); resolve(v); };
            cancel.onclick = function () { finish(null); };
            ok.onclick = function () {
                const v = inp.value.trim();
                if (opts.validate && v) { const ve = opts.validate(v); if (ve) { errEl.textContent = ve; return; } }
                finish(v || null);
            };
            inp.focus();
        });
    }

    async function runBcxCmd(targetNum, targetName, c) {
        let args = [];
        if (c.kind === "none") {
            args = [];
        } else if (c.kind === "options") {
            const pick = await requestButtons(c.zh + " · 选择参数", c.opts.map(function (o) { return { text: o[1] }; }), false);
            if (!pick) return;
            const found = c.opts.find(function (o) { return o[1] === pick; });
            if (!found) return;
            args = [found[0]];
        } else if (c.kind === "duration") {
            const v = await requestSingle(c.zh + " · 时长", "如 30m / 2h", {
                validate: function (s) { return (/^(\d+[smhd])+$/i.test(s)) ? "" : "格式不正确，请用 数字+单位（s/m/h/d），如 30m"; }
            });
            if (!v) return;
            args = [v];
        } else if (c.kind === "text") {
            const v = await requestText(c.zh, c.hint || "", {
                validate: function (s) {
                    const t0 = s.trim();
                    if (!t0) return "内容不能为空";
                    if (t0.indexOf("(") >= 0) return "不能包含左括号 (";
                    if (/^[*!/.]/.test(t0)) return "不能以 * / ! . 开头";
                    return "";
                }
            });
            if (v == null) return;
            args = [v];
        } else if (c.kind === "textNum") {
            const v = await requestText(c.zh, c.hint || "", {
                validate: function (s) { return (/^\d+\s+/.test(s.trim())) ? "" : "格式：次数 + 空格 + 文本"; }
            });
            if (v == null) return;
            args = v.trim().split(/\s+/);
        } else if (c.kind === "custom") {
            const v = await requestSingle(c.zh, c.hint || "", {});
            if (!v) return;
            args = v.split(/\s+/);
        } else {
            return;
        }
        const r = await bcxTrigger(targetNum, c.name, args);
        if (r.ok) ChatRoomSendLocal("✅ " + c.zh + " → " + targetName + "：" + r.msg);
        else ChatRoomSendLocal("❌ " + c.zh + " → " + targetName + "：" + r.msg);
    }

    async function openBcxCommandPanel() {
        const api = getBcxApi();
        if (!api) {
            ChatRoomSendLocal("未检测到 BCX（Bondage Club Extended）。请确认你自己与对方都安装了 BCX。");
            return;
        }
        const target = await pickTarget("选择要触发 BCX 指令的目标");
        if (!target) return;
        const targetNum = target.MemberNumber;
        const targetName = getNickname(target);

        let activeCat = BCX_CMD_CATALOG[0].cat;
        let limits = null;
        const ver = (function () { try { return window.bcx.getCharacterVersion(targetNum); } catch (e) { return null; } })();
        ChatRoomSendLocal("正在读取 " + targetName + " 的 BCX 指令权限…");
        limits = await bcxGetLimits(targetNum);

        const root = document.createElement("div");
        root.style.cssText = "display:flex;flex-direction:column;gap:10px;";

        const targetBar = document.createElement("div");
        targetBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--lt-surface,rgba(255,255,255,0.04));border:1px solid var(--lt-border,rgba(255,255,255,0.06));border-radius:10px;";
        const tbLeft = document.createElement("div");
        tbLeft.innerHTML = '<span style="color:var(--lt-text-dim,#6a8ab0);font-size:12px;">目标：</span><b style="color:var(--lt-accent-light,#a0c0e8);">' + targetName + '</b>' + (ver ? ' <span style="color:var(--lt-text-dim,#6a8ab0);font-size:11px;">BCX ' + ver + '</span>' : '');
        const tbBtn = document.createElement("button");
        tbBtn.className = "lt-btn lt-btn-secondary";
        tbBtn.style.cssText = "flex:0 0 auto;padding:6px 10px;font-size:12px;";
        tbBtn.textContent = "更换目标";
        targetBar.appendChild(tbLeft);
        targetBar.appendChild(tbBtn);

        const tabRow = document.createElement("div");
        tabRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
        const grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;";

        const lastClick = {};

        function renderGrid() {
            grid.innerHTML = "";
            const group = BCX_CMD_CATALOG.find(function (g) { return g.cat === activeCat; });
            (group ? group.cmds : []).forEach(function (c) {
                const btn = document.createElement("button");
                btn.className = "lt-list-btn";
                btn.style.cssText = "flex-direction:column;align-items:flex-start;gap:2px;padding:10px;";
                const z = document.createElement("span");
                z.textContent = c.zh;
                z.style.cssText = "font-size:13px;font-weight:600;";
                const e = document.createElement("span");
                e.textContent = c.name;
                e.style.cssText = "font-size:10px;color:var(--lt-text-dim,#6a8ab0);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;";
                btn.appendChild(z);
                btn.appendChild(e);

                const lvl = (limits && limits.limits) ? limits.limits[c.name] : null;
                if (lvl === "blocked") {
                    btn.style.opacity = "0.4";
                    btn.style.pointerEvents = "none";
                    btn.title = "该指令对你已被禁止（blocked）";
                } else if (lvl === "limited") {
                    btn.style.borderColor = "rgba(255,200,0,0.5)";
                    btn.title = "需要 limited 权限";
                }

                btn.onclick = async function () {
                    const now = Date.now();
                    if (lastClick[c.name] && now - lastClick[c.name] < 500) return;
                    lastClick[c.name] = now;
                    await runBcxCmd(targetNum, targetName, c);
                };
                grid.appendChild(btn);
            });
        }
        function renderTabs() {
            tabRow.innerHTML = "";
            BCX_CMD_CATALOG.forEach(function (g) {
                const b = document.createElement("button");
                b.className = "lt-nav-btn" + (g.cat === activeCat ? " sel" : "");
                if (g.cat === activeCat) b.style.cssText = "border-color:var(--lt-accent);color:var(--lt-accent-light);";
                b.textContent = g.cat;
                b.onclick = function () { activeCat = g.cat; renderTabs(); renderGrid(); };
                tabRow.appendChild(b);
            });
        }
        tbBtn.onclick = function () { panel.remove(); openBcxCommandPanel(); };

        renderTabs();
        renderGrid();
        root.appendChild(targetBar);
        root.appendChild(tabRow);
        root.appendChild(grid);

        const panel = ltModal("BCX 指令 · " + targetName, root);
    }

    function handleBcCommand(text) {
        if (!Player.BCToolbox) initializeStorage();
        const args       = text.trim().split(/\s+/);
        const subCommand = args[0]?.toLowerCase() || "";
        const commandText = args.slice(1).join(" ");

        if (!subCommand || subCommand === "help") { ChatRoomSendLocal(t('helpText')); return true; }

        const commands = {
            freetotal,
            free,
            bcximport:     bcxImport,
            rpmode,
            rpbtn,
            fullunlock:    fullUnlock,
            geteverything: getEverything,
            wardrobe,
            fulllock:      fullLock,
            heightlock:    heightLockCommand,
            releasemaid:   releaseMaidCommand,
            rmwords:       rmWordsCommand,
            antirestraint: antiRestraintCommand,
            ooc:           oocCommand,
            lscg:          lscgCommand,
            undo:          undoCommand,
            theme:         themeCommand,
            editcraft:     editCraftCommand,
            clearcraft:    clearCraftCommand,
        };

        if (commands[subCommand]) {
            try { commands[subCommand](commandText); }
            catch (e) {
                console.error("🐈‍⬛ [BC] ❌ 命令 " + subCommand + " 执行错误:", e.message);
                ChatRoomSendLocal(t('cmdFail') + "：/bc " + subCommand);
            }
        } else {
            ChatRoomSendLocal(t('unknownCmd') + "：/bc " + subCommand);
        }
        return true;
    }

    // ──────────────────────────────────────────
    // 主初始化
    // ──────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════
    // 暖调重设计（v4.7）：注入 CSS（三档旋钮 + 暖调主题 + 动效）与 Canvas 扳手泛光动画
    // ════════════════════════════════════════════════════════════════════════
    function installWarmRedesignStyles() {
        if (document.getElementById('bct-redesign')) return;
        var s = document.createElement('style');
        s.id = 'bct-redesign';
        s.textContent = [
            /* ── 暖调主题变量（覆盖工具自带 #lt-theme-vars，!important 防主题切换被冲掉） ── */
            '#lt-quick-panel,.lt-panel{',
            '  --lt-bg:rgba(26,22,20,0.82)!important;',
            '  --lt-surface:rgba(255,240,225,0.05)!important;',
            '  --lt-surface-2:rgba(255,240,225,0.09)!important;',
            '  --lt-surface-hover:rgba(240,128,90,0.16)!important;',
            '  --lt-border:rgba(255,240,225,0.10)!important;',
            '  --lt-border-hover:rgba(240,128,90,0.50)!important;',
            '  --lt-text:#f1e9dd!important;',
            '  --lt-text-secondary:#d8cdbd!important;',
            '  --lt-text-dim:#a99e8f!important;',
            '  --lt-text-faint:#7c7264!important;',
            '  --lt-accent:#f0805a!important;',
            '  --lt-accent-dark:#b85a3c!important;',
            '  --lt-accent-light:#ff9b76!important;',
            '  --lt-accent-glow:rgba(240,128,90,0.42)!important;',
            '  --lt-header-grad:linear-gradient(102deg,#2a221d 0%,#3a2a22 58%,rgba(240,128,90,0.38) 100%)!important;',
            '  --lt-shadow:rgba(0,0,0,0.70)!important;',
            '  --lt-scrollbar:rgba(240,128,90,0.55)!important;',
            '  --lt-switch-on:#f0805a!important;',
            '  --lt-switch-glow:rgba(240,128,90,0.60)!important;',
            '}',
            /* ── 日间模式变量（.bct-light 优先级更高，覆盖上方深色变量）── */
            '#lt-quick-panel.bct-light,.lt-panel.bct-light{',
            '  --lt-bg:rgba(250,246,240,0.96)!important;',
            '  --lt-surface:rgba(0,0,0,0.03)!important;',
            '  --lt-surface-2:rgba(0,0,0,0.06)!important;',
            '  --lt-surface-hover:rgba(240,128,90,0.12)!important;',
            '  --lt-border:rgba(0,0,0,0.08)!important;',
            '  --lt-border-hover:rgba(240,128,90,0.45)!important;',
            '  --lt-text:#2e2620!important;',
            '  --lt-text-secondary:#5a5048!important;',
            '  --lt-text-dim:#8a8078!important;',
            '  --lt-text-faint:#b0a8a0!important;',
            '  --lt-accent:#f0805a!important;',
            '  --lt-accent-dark:#b85a3c!important;',
            '  --lt-accent-light:#ff9b76!important;',
            '  --lt-accent-glow:rgba(240,128,90,0.30)!important;',
            '  --lt-header-grad:linear-gradient(102deg,#f5ede4 0%,#f8e6dc 58%,rgba(240,128,90,0.25) 100%)!important;',
            '  --lt-shadow:rgba(0,0,0,0.15)!important;',
            '  --lt-scrollbar:rgba(240,128,90,0.50)!important;',
            '  --lt-switch-on:#f0805a!important;',
            '  --lt-switch-glow:rgba(240,128,90,0.50)!important;',
            '}',
            '#lt-quick-panel.bct-light .ltq-title{color:#2e2620!important;}',
            '#lt-quick-panel.bct-light .lt-mode-pop{background:linear-gradient(180deg,#faf6f0,#f0eae2)!important;border-color:rgba(240,128,90,0.35)!important;box-shadow:0 18px 44px rgba(0,0,0,0.22)!important;}',
            '#lt-quick-panel.bct-light .lt-mode-pop .lt-mode-item{color:#5a5048!important;}',
            '#lt-quick-panel.bct-light .lt-mode-pop .lt-mode-item:hover{color:#2e2620!important;background:rgba(240,128,90,0.12)!important;}',
            /* ── 面板：更大圆角 + 软 3D 浮起 ── */
            '#lt-quick-panel{',
            '  border-radius:22px!important;',
            '  background:var(--lt-bg)!important;',
            '  border:1px solid var(--lt-border)!important;',
            '  box-shadow:0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 70px -24px rgba(0,0,0,0.72)!important;',
            '}',
            /* ── 打开方式：快速「淡入 + 上滑」，不再缩放 ── */
            '#lt-quick-panel{',
            '  opacity:0!important;',
            '  transform:translateY(14px) scale(0.99)!important;',
            '  pointer-events:none!important;',
            '  transition:opacity .14s ease, transform .22s cubic-bezier(.22,1,.36,1)!important;',
            '}',
            '#lt-quick-panel.show{',
            '  opacity:1!important;',
            '  transform:translateY(0) scale(1)!important;',
            '  pointer-events:auto!important;',
            '}',
            /* ── 头部标题色（在暖渐变上更暖白） ── */
            '#lt-quick-panel .ltq-hdr .ltq-title{color:#fff8f1!important;}',
            /* ── 动作按钮：大圆角 + hover 弹簧上浮 + 珊瑚左条发光 + 按下即时缩 ── */
            '#lt-quick-panel .ltq-action{',
            '  border-radius:14px!important;',
            '  transition:transform .26s cubic-bezier(.34,1.56,.64,1), background .18s ease, border-color .18s ease, box-shadow .26s ease!important;',
            '}',
            '#lt-quick-panel .ltq-action::before{opacity:.22!important;}',
            '#lt-quick-panel .ltq-action:hover{',
            '  transform:translateY(-2px)!important;',
            '  border-color:var(--lt-accent)!important;',
            '  box-shadow:0 6px 16px -6px var(--lt-accent-glow), 0 1px 0 rgba(255,255,255,0.05) inset!important;',
            '}',
            '#lt-quick-panel .ltq-action:hover::before{opacity:.7!important;}',
            '#lt-quick-panel .ltq-action:active{transform:scale(.97)!important; transition:transform .1s ease-out!important;}',
            /* ── 开关：spring 回弹（更大白点 + overshoot） ── */
            '#lt-quick-panel .ltq-switch{transition:background .42s cubic-bezier(.34,1.56,.64,1)!important;}',
            '#lt-quick-panel .ltq-switch::after{',
            '  top:1px!important; left:1px!important; width:18px!important; height:18px!important;',
            '  transition:all .42s cubic-bezier(.34,1.56,.64,1)!important;',
            '}',
            '#lt-quick-panel .ltq-switch.on{background:var(--lt-switch-on)!important; box-shadow:inset 0 1px 2px rgba(0,0,0,0.2), 0 0 10px var(--lt-switch-glow)!important;}',
            '#lt-quick-panel .ltq-switch.on::after{left:17px!important;}',
            /* ── 开关行：开启态珊瑚左条 ── */
            '#lt-quick-panel .ltq-toggle.on{box-shadow:inset 0 1px 0 rgba(255,255,255,0.04), inset 3px 0 0 var(--lt-accent)!important;}',
            /* ── 分类折叠箭头：弹簧旋转 ── */
            '#lt-quick-panel .ltq-cat-caret{transition:transform .32s cubic-bezier(.34,1.56,.64,1)!important;}',
            /* ── 超级骰子模式药丸：非激活态补暖调底色 ── */
            '#lt-quick-panel .ltq-mode-pill:not(.c){background:var(--lt-surface-2)!important;border:1px solid var(--lt-border)!important;color:var(--lt-text-secondary)!important;}',
            '#lt-quick-panel .ltq-mode-pill.open:not(.c){border-color:var(--lt-accent)!important;}',
            /* ── 超级骰子二级弹窗：把硬编码紫色换成暖调 + 轻量弹入 ── */
            '.lt-mode-pop{',
            '  background:linear-gradient(180deg,#2a2018,#1c1612)!important;',
            '  border:1px solid var(--lt-border-hover,rgba(240,128,90,0.4))!important;',
            '  border-radius:14px!important;',
            '  box-shadow:0 18px 44px rgba(0,0,0,0.6)!important;',
            '  animation:bct-mode-in .16s cubic-bezier(.22,1,.36,1)!important;',
            '}',
            "@keyframes bct-mode-in{from{opacity:0;transform:translateY(-6px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}",
            '.lt-mode-pop .lt-mode-item{color:var(--lt-text-secondary,#d8cdbd)!important;}',
            '.lt-mode-pop .lt-mode-item:hover{background:var(--lt-surface-hover,rgba(240,128,90,0.16))!important;color:#fff!important;}',
            '.lt-mode-pop .lt-mode-item.sel{background:var(--lt-surface-hover,rgba(240,128,90,0.16))!important;color:#fff!important;box-shadow:inset 0 0 0 1px var(--lt-accent,#f0805a)!important;}',
            '.lt-mode-pop .lt-mode-item .lt-mode-sub{color:var(--lt-text-faint,#7c7264)!important;}',
            /* ── Toast：暖调圆角 + 软阴影 ── */
            '.lt-panel{border-radius:14px!important; border:1px solid var(--lt-border)!important; box-shadow:0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 70px -24px rgba(0,0,0,0.72)!important;}',
            /* ── 主题三档旋钮（替代原设置弹窗）── */
            '.bct-theme-knob{position:relative;width:78px;height:26px;background:rgba(0,0,0,0.35);border-radius:13px;border:1px solid rgba(255,255,255,0.10);box-shadow:inset 0 1px 3px rgba(0,0,0,0.4);display:flex;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
            '#lt-quick-panel.bct-light .bct-theme-knob{background:rgba(0,0,0,0.06);border-color:rgba(0,0,0,0.12);box-shadow:inset 0 1px 3px rgba(0,0,0,0.08);}',
            '.bct-theme-knob .bct-knob-seg{flex:1;display:flex;align-items:center;justify-content:center;z-index:1;padding:0;background:transparent;border:none;cursor:pointer;}',
            '.bct-theme-knob .bct-knob-seg svg{width:13px;height:13px;stroke:rgba(255,255,255,0.55);fill:none;transition:stroke .2s ease;}',
            '#lt-quick-panel.bct-light .bct-theme-knob .bct-knob-seg svg{stroke:rgba(90,80,72,0.55);}',
            '.bct-theme-knob .bct-knob-seg.active svg{stroke:#fff8f1;}',
            '#lt-quick-panel.bct-light .bct-theme-knob .bct-knob-seg.active svg{stroke:#2e2620;}',
            '.bct-theme-knob .bct-knob-thumb{position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:linear-gradient(180deg,#ff9b76,#b85a3c);box-shadow:0 2px 6px rgba(240,128,90,0.45),inset 0 1px 0 rgba(255,255,255,0.25);transition:transform .35s cubic-bezier(.34,1.56,.64,1);z-index:0;}',
            '.bct-theme-knob.pos-0 .bct-knob-thumb{transform:translateX(0);}',
            '.bct-theme-knob.pos-1 .bct-knob-thumb{transform:translateX(26px);}',
            '.bct-theme-knob.pos-2 .bct-knob-thumb{transform:translateX(52px);}',
            '.bct-theme-knob .bct-knob-seg:focus-visible{outline:none;}',
            '.bct-theme-knob .bct-knob-seg:focus-visible svg{stroke:var(--lt-accent,#f0805a)!important;}',
            '@media (prefers-reduced-motion: reduce){',
            '  #lt-quick-panel,#lt-quick-panel.show{transition:opacity .16s ease!important; transform:none!important;}',
            '  .lt-mode-pop{animation:none!important;}',
            '  #lt-quick-panel .ltq-action:hover,#lt-quick-panel .ltq-switch.on::after{transform:none!important;}',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // 原生悬浮按钮 Canvas 自定义绘制（v4.7）：spring 跟手 hover + 按下反馈 + 扳手泛光动画
    // 绘制策略：hook HTMLCanvasElement.prototype.getContext，从源头捕获绘图 context，
    // 在工具箱绘制 24×24 扳手图标（特征 M14.7%206.3）时跳过原绘制并覆盖整个暖调按钮。
    function installWarmCanvasButton() {
        var DT = 1 / 60;

        function Spring(value, tension, friction) {
            this.value = value;
            this.target = value;
            this.vel = 0;
            this.tension = tension;
            this.friction = friction;
        }
        Spring.prototype.setTarget = function (t) { this.target = t; };
        Spring.prototype.update = function (dt) {
            var force = (this.target - this.value) * this.tension;
            this.vel += force * dt;
            this.vel *= Math.max(0, 1 - this.friction * dt);
            this.value += this.vel * dt;
        };

        var hoverSpring = new Spring(0, 380, 32);
        var pressSpring = new Spring(0, 900, 38);
        var currentBtnRect = null;
        var isPointerDown = false;

        function hexToRgb(hex) {
            var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
        }

        function lerpColor(a, b, t) {
            var ca = hexToRgb(a), cb = hexToRgb(b);
            var r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
            var g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
            var bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
            return 'rgb(' + r + ',' + g + ',' + bl + ')';
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }

        function updateBtnRect(btnX, btnY, btnW, btnH) {
            currentBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        }

        function isOverBtn(mx, my) {
            if (!currentBtnRect) return false;
            return mx >= currentBtnRect.x && mx <= currentBtnRect.x + currentBtnRect.w &&
                   my >= currentBtnRect.y && my <= currentBtnRect.y + currentBtnRect.h;
        }

        function setupPointerListeners() {
            var cvs = window.MainCanvas;
            if (!cvs || cvs.__bct_pointer_listeners) return;
            cvs.__bct_pointer_listeners = true;

            function getCanvasXY(e) {
                var rect = cvs.getBoundingClientRect();
                var scaleX = cvs.width / rect.width || 1;
                var scaleY = cvs.height / rect.height || 1;
                var clientX = e.clientX, clientY = e.clientY;
                if (e.touches && e.touches.length) {
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                } else if (e.changedTouches && e.changedTouches.length) {
                    clientX = e.changedTouches[0].clientX;
                    clientY = e.changedTouches[0].clientY;
                }
                return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
            }

            function onDown(e) {
                var p = getCanvasXY(e);
                if (isOverBtn(p.x, p.y)) isPointerDown = true;
            }
            function onUp() { isPointerDown = false; }

            cvs.addEventListener('mousedown', onDown);
            window.addEventListener('mouseup', onUp);
            cvs.addEventListener('touchstart', onDown, { passive: true });
            window.addEventListener('touchend', onUp);
        }

        function drawCustomButton(ctx, btnX, btnY, btnW, btnH, hoverT, pressT) {
            ctx.save();

            roundRect(ctx, btnX, btnY, btnW, btnH, 12);
            ctx.clip();

            var btnScale = 1 - pressT * 0.06;
            if (btnScale !== 1) {
                ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
                ctx.scale(btnScale, btnScale);
                ctx.translate(-(btnX + btnW / 2), -(btnY + btnH / 2));
            }

            var grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
            grad.addColorStop(0, lerpColor('#251e1b', '#ff9b76', hoverT));
            grad.addColorStop(1, lerpColor('#15110f', '#b85a3c', hoverT));

            ctx.shadowColor = 'rgba(240,128,90,' + (0.15 + hoverT * 0.22) + ')';
            ctx.shadowBlur = 2 + hoverT * 3;
            ctx.shadowOffsetY = 1 + hoverT * 1;

            roundRect(ctx, btnX, btnY, btnW, btnH, 12);
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.shadowColor = 'transparent';
            var innerGrad = ctx.createRadialGradient(btnX + btnW / 2, btnY + btnH / 2, 2, btnX + btnW / 2, btnY + btnH / 2, btnW * 0.7);
            innerGrad.addColorStop(0, 'rgba(0,0,0,0)');
            innerGrad.addColorStop(1, 'rgba(0,0,0,' + (0.28 - hoverT * 0.22) + ')');
            ctx.fillStyle = innerGrad;
            roundRect(ctx, btnX, btnY, btnW, btnH, 12);
            ctx.fill();

            var dotX = btnX + btnW - 8;
            var dotY = btnY + btnH - 8;
            var glowR = hoverT * btnW * 1.25;
            if (glowR > 0.5) {
                var glow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, glowR);
                glow.addColorStop(0, 'rgba(255,155,118,' + (0.55 * hoverT) + ')');
                glow.addColorStop(0.45, 'rgba(240,128,90,' + (0.28 * hoverT) + ')');
                glow.addColorStop(1, 'rgba(240,128,90,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(dotX, dotY, glowR, 0, Math.PI * 2);
                ctx.fill();
            }

            roundRect(ctx, btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1, 11);
            var borderA = 0.22 + hoverT * 0.35;
            var borderR = Math.round(240 + (255 - 240) * hoverT);
            var borderG = Math.round(128 + (155 - 128) * hoverT);
            var borderB = Math.round(90 + (118 - 90) * hoverT);
            ctx.strokeStyle = 'rgba(' + borderR + ',' + borderG + ',' + borderB + ',' + borderA + ')';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            var hi = ctx.createLinearGradient(btnX, btnY + 1, btnX, btnY + 8);
            hi.addColorStop(0, 'rgba(255,255,255,' + (0.14 + hoverT * 0.08) + ')');
            hi.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hi;
            roundRect(ctx, btnX + 2, btnY + 1.5, btnW - 4, 7, 4);
            ctx.fill();

            ctx.save();
            var cx = btnX + btnW / 2, cy = btnY + btnH / 2;
            var iconScale = 1 + hoverT * 0.12 - pressT * 0.04;
            var iconRot = hoverT * 0.18;
            var iconLift = hoverT * -1.5;
            var iconOpacity = 1 - hoverT * 0.35;
            ctx.translate(cx, cy + iconLift);
            ctx.rotate(iconRot);
            ctx.scale(iconScale, iconScale);
            ctx.translate(-12, -12);

            var wrench = new Path2D('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z');

            ctx.globalAlpha = iconOpacity;
            ctx.shadowColor = 'rgba(0,0,0,' + (0.2 + pressT * 0.2) * hoverT + ')';
            ctx.shadowBlur = 3 * hoverT;
            ctx.fillStyle = lerpColor('#fff8f1', '#2e2620', hoverT);
            ctx.fill(wrench);
            ctx.globalAlpha = 1;
            ctx.shadowColor = 'transparent';

            ctx.restore();

            ctx.beginPath();
            ctx.arc(dotX, dotY, 3 + hoverT * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = '#f0805a';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.restore();
        }

        function hookDrawImage(ctx) {
            if (!ctx || typeof ctx.drawImage !== 'function' || ctx.__bct_drawImage_orig) {
                return false;
            }
            var origDrawImage = ctx.drawImage;
            ctx.__bct_drawImage_orig = origDrawImage;

            ctx.drawImage = function (img, x, y, w, h, dx, dy, dw, dh) {
                if (arguments.length === 5 && img && img.src && typeof img.src === 'string' &&
                    img.src.indexOf('M14.7%206.3') !== -1 && w === 24 && h === 24) {
                    var btnX = x - 10.5;
                    var btnY = y - 10.5;
                    var mx = window.MouseX || 0, my = window.MouseY || 0;
                    var hover = mx >= btnX && mx <= btnX + 45 && my >= btnY && my <= btnY + 45 && !window.CommonIsMobile;

                    hoverSpring.setTarget(hover ? 1 : 0);
                    pressSpring.setTarget((hover && isPointerDown) ? 1 : 0);
                    hoverSpring.update(DT);
                    pressSpring.update(DT);
                    updateBtnRect(btnX, btnY, 45, 45);
                    setupPointerListeners();

                    drawCustomButton(this, btnX, btnY, 45, 45, hoverSpring.value, pressSpring.value);
                    return;
                }
                if (arguments.length <= 5) return origDrawImage.call(this, img, x, y, w, h);
                if (arguments.length <= 9) return origDrawImage.call(this, img, x, y, w, h, dx, dy, dw, dh);
                return origDrawImage.apply(this, arguments);
            };
            return true;
        }

        if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype.getContext) {
            var proto = HTMLCanvasElement.prototype;
            var origGetContext = proto.getContext;
            proto.getContext = function (type) {
                var ctx = origGetContext.apply(this, arguments);
                if (type && String(type).indexOf('2d') !== -1 && ctx && typeof ctx.drawImage === 'function') {
                    try { hookDrawImage(ctx); } catch (e) {}
                }
                return ctx;
            };
        }

        if (window.MainCanvas && typeof window.MainCanvas.getContext === 'function') {
            try {
                var mcCtx = window.MainCanvas.getContext('2d');
                hookDrawImage(mcCtx);
            } catch (e) {}
        }
    }

    async function initialize() {
        console.log("🐈‍⬛ [BC] ⌛ 开始初始化插件...");
        await initializeModApi();
        try { await loadToastSystem(); }
        catch (e) { console.warn("🐈‍⬛ [BC] ❌ Toast system 载入失敗，備用模式運行:", e.message); }

        console.log("🐈‍⬛ [BC] ⌛ 等待玩家登入...");
        await waitFor(() => { try { return typeof Player?.MemberNumber === "number"; } catch { return false; } });

        initializeStorage();
        applyTheme();
        installWarmRedesignStyles();
        installWarmCanvasButton();
        setupHooks();

        const registerCommand = () => {
            CommandCombine([{ Tag: "bc", Description: "Execute BC工具箱 command", Action: handleBcCommand }]);
            console.log("🐈‍⬛ [BC] ✅ /bc 指令注册成功");
        };
        if (typeof CommandCombine === "function") {
            try { registerCommand(); }
            catch (e) { console.error("🐈‍⬛ [BC] ❌ 注册命令错误:", e.message); }
        } else {
            waitFor(() => typeof CommandCombine === "function").then(() => {
                try { registerCommand(); }
                catch (e) { console.error("🐈‍⬛ [BC] ❌ 延遲注册命令错误:", e.message); }
            });
        }

        waitFor(() => CurrentScreen === "ChatRoom").then(() => {
            ChatRoomSendLocal(t('loaded', { v: modversion }), 30000);
        });

        console.log("🐈‍⬛ [BC] ✅ 插件已载入 (v" + modversion + ")");
    }

    // ──────────────────────────────────────────
    // 卸载清理
    // ──────────────────────────────────────────
    function setupUnloadHandler() {
        if (modApi && typeof modApi.onUnload === 'function') {
            modApi.onUnload(() => {
                if (heightTargetChar) { removeHeightHijack(heightTargetChar); heightTargetChar = null; }
                delete window.__BCToolboxLoaded__;
                console.log("🐈‍⬛ [BC] 🗑️ 插件卸载");
            });
        }
    }

    initialize().then(() => { setupUnloadHandler(); })
    .catch(error => { console.error("🐈‍⬛ [BC] ❌ 初始化失敗:", error); });

    // 超级骰子 + 守护常驻：启动同步 + 心跳重装补丁（兼容 LSCG 重载）
    try { _superDice.enabled = getSuperDice(); _superDice.mode = getSuperDiceMode(); } catch (e) {}
    try { _guard.enabled = getGuard(); } catch (e) {}
    setInterval(function () { try { ensureMakeActivityCheckPatched(); ensureSuperDicePatched(); ensureGuardPatched(); } catch (e) {} }, 2000);

    // ── 调试 / 自动化接口（CDP 热注入验证用，普通用户无感） ──
    try {
        window.__LT_DEBUG = {
            getSuperDice: getSuperDice, setSuperDice: setSuperDice,
            getSuperDiceMode: getSuperDiceMode, setSuperDiceMode: setSuperDiceMode,
            getGuard: getGuard, setGuard: setGuard,
            ensureSuperDicePatched: ensureSuperDicePatched, ensureGuardPatched: ensureGuardPatched,
            ensureMakeActivityCheckPatched: ensureMakeActivityCheckPatched,
            showPanel: showToolPanel, hidePanel: hideToolPanel,
            _superDice: _superDice, _guard: _guard
        };
    } catch (e) {}

})();
