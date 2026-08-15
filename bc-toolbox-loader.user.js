// ==UserScript==
// @name         BC工具箱 Loader
// @name:zh      BC工具箱 Loader
// @namespace    https://github.com/heitaoplay/BC-Toolbox
// @version      1.0.0
// @description  从 GitHub 仓库实时拉取并执行最新版 BC工具箱。仓库推送后，刷新页面即可自动生效。
// @author       heitaoplay
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @icon         https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/icon.png
// @grant        none
// @require      https://awdrrawd.github.io/liko-Plugin-Repository/Plugins/expand/bcmodsdk.js
// @require      https://awdrrawd.github.io/liko-Plugin-Repository/Plugins/expand/BC_toast_system.user.js
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @updateURL    https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox-loader.user.js
// @downloadURL  https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox-loader.user.js
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    if (window.__BCToolboxLoaderLoaded__) return;
    window.__BCToolboxLoaderLoaded__ = true;

    const RAW_URL    = 'https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox.user.js';
    const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/heitaoplay/BC-Toolbox@main/bc-toolbox.user.js';

    function fetchScript(url) {
        return fetch(url, { cache: 'no-store' }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        });
    }

    function runCode(code) {
        var el = document.createElement('script');
        el.textContent = code;
        document.head.appendChild(el);
        el.remove();
    }

    fetchScript(RAW_URL + '?t=' + Date.now())
        .then(runCode)
        .catch(function (err) {
            console.warn('[BC工具箱 Loader] GitHub raw 拉取失败，尝试 CDN 镜像:', err);
            return fetchScript(FALLBACK_URL + '?t=' + Date.now()).then(runCode);
        })
        .catch(function (err) {
            console.error('[BC工具箱 Loader] 无法加载 BC工具箱:', err);
        });
})();
