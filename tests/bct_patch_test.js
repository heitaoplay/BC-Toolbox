// 从真实源文件里原样抽取 ensureSuperDicePatched 与其依赖，在 mock 环境验证幂等性
const fs = require('fs');
const src = fs.readFileSync('/Users/amoy_johnny/WorkBuddy/BC工具箱/bc-toolbox.user.js', 'utf8');

function extractFn(source, name) {
    const idx = source.indexOf('function ' + name + '(');
    if (idx < 0) throw new Error('未找到函数 ' + name);
    let depth = 0, started = false, i = idx;
    for (; i < source.length; i++) {
        const c = source[i];
        if (c === '{') { depth++; started = true; }
        else if (c === '}') { depth--; if (started && depth === 0) { i++; break; } }
    }
    return source.slice(idx, i);
}

const fnEnsure = extractFn(src, 'ensureSuperDicePatched');
const fnMake   = extractFn(src, 'ensureMakeActivityCheckPatched');
const fnLtMake = extractFn(src, 'ltMakeActivityCheck');
const fnApply  = extractFn(src, 'applySuperDiceRoll');

console.log('从源文件抽取真实函数：');
[['ensureSuperDicePatched', fnEnsure], ['ensureMakeActivityCheckPatched', fnMake],
 ['ltMakeActivityCheck', fnLtMake], ['applySuperDiceRoll', fnApply]]
    .forEach(([n, f]) => console.log('  ' + n + '  ' + f.length + ' 字符'));

function mkRoll(raw, mod) {
    return { Raw: raw, Modifier: mod, get Total() { return this.Raw + this.Modifier; }, TotalStr: '' };
}

function buildEnv(withLeashing) {
    const LSCG = {
        mods: {},
        getModule(name) { return this.mods[name] || null; }
    };
    LSCG.mods.ItemUseModule = {
        MakeActivityCheck: function () { return { AttackerRoll: mkRoll(10, 0), DefenderRoll: mkRoll(10, 0) }; },
        UnopposedActivityRoll: function () { return mkRoll(10, 0); }
    };
    LSCG.mods.HypnoModule = { GetResistRoll: function () { return 5; } };
    if (withLeashing) LSCG.mods.LeashingModule = { IncomingEscape: function () {}, Leashings: [] };
    LSCG.mods.StateModule = { BarrierState: { Active: false } };

    const code = `
        var window = { LSCG: LSCG };
        var Player = { MemberNumber: 1 };
        var LT_MAKE_PATCHED = '__ltMakePatched';
        var _superDice = { enabled: true, mode: 'A', iu: null, hy: null };
        var _guard = { enabled: false, inSpell: false, inSpellUntil: 0, spellDefended: false };
        // v3.4.9 起运行时判定改为 sdOn/sdMode（以存档为权威），mock 里用内存标志直接返回
        function sdOn() { return _superDice.enabled; }
        function gdOn() { return _guard.enabled; }
        function sdMode() { return _superDice.mode; }
        function ltInSpellWindow() { return !_guard.spellDefended && Date.now() < _guard.inSpellUntil; }
        ${fnApply}
        ${fnLtMake}
        ${fnMake}
        ${fnEnsure}
        return { ensureSuperDicePatched: ensureSuperDicePatched, _superDice: _superDice, window: window };
    `;
    return new Function('LSCG', 'mkRoll', code)(LSCG, mkRoll);
}

function hookState(env) {
    const iu = env.window.LSCG.mods.ItemUseModule;
    const hy = env.window.LSCG.mods.HypnoModule;
    const lm = env.window.LSCG.mods.LeashingModule;
    return {
        Make:      iu.MakeActivityCheck.__ltMakePatched ? 'patched' : 'raw',
        Unopposed: iu.UnopposedActivityRoll.__superDicePatched ? 'patched' : 'raw',
        GetResist: hy.GetResistRoll.__superDicePatched ? 'patched' : 'raw',
        Escape:    lm ? (lm.IncomingEscape.__ltSuperDiceEscapePatched ? 'patched' : 'raw') : 'no-module'
    };
}

// 检测套娃：包裹 N 层时，一次业务调用会递归 N 层。用「调用链深度」间接测量。
function measureDepth(env) {
    let depth = 0;
    const origLog = [];
    // 计数法：临时给最终原始函数打桩，统计它被调了几次（正确实现应恰好 1 次）
    return depth;
}

function runCase(label, withLeashing, times) {
    const env = buildEnv(withLeashing);
    const iu = env.window.LSCG.mods.ItemUseModule;
    const hy = env.window.LSCG.mods.HypnoModule;
    const lm = env.window.LSCG.mods.LeashingModule;

    // 最直接的判定：每次包裹都会把函数替换成新的 wrapper 引用。
    // 统计心跳过程中引用被换了几次 —— 正确幂等应恰好 1 次，套娃则每轮 +1。
    let refChanges = 0;
    let lastRef = iu.UnopposedActivityRoll;
    let err = null;
    for (let i = 0; i < times; i++) {
        try { env.ensureSuperDicePatched(); } catch (e) { err = e; break; }
        if (iu.UnopposedActivityRoll !== lastRef) { refChanges++; lastRef = iu.UnopposedActivityRoll; }
    }
    const st = hookState(env);

    let callOk = true, callErr = '';
    try {
        const r = iu.UnopposedActivityRoll.call(iu, env.window.Player);
        if (!r) callOk = false;
    } catch (e) { callOk = false; callErr = e.message; }

    console.log(`\n【${label}】心跳 ${times} 次`);
    console.log('  hook:', JSON.stringify(st));
    console.log('  函数被替换次数:', refChanges, refChanges === 1 ? '✅ 只包裹 1 层，幂等正确' : `❌ 包裹了 ${refChanges} 层（每 2 秒 +1 → 最终栈溢出）`);
    console.log('  调用:', callOk ? '✅ 正常' : '❌ ' + callErr);
    if (err) console.log('  心跳异常:', err.message);
    return refChanges === 1 && callOk && !err;
}

console.log('\n========== 幂等性验证 ==========');
const a = runCase('有 LeashingModule', true, 500);
const b = runCase('缺 LeashingModule（老版 LSCG）', false, 500);

console.log('\n========== LSCG 重载后应重新接管 ==========');
const env = buildEnv(true);
env.ensureSuperDicePatched();
const before = hookState(env);
env.window.LSCG.mods.ItemUseModule = {
    MakeActivityCheck: function () { return { AttackerRoll: mkRoll(10, 0), DefenderRoll: mkRoll(10, 0) }; },
    UnopposedActivityRoll: function () { return mkRoll(10, 0); }
};
env.ensureSuperDicePatched();
const after = hookState(env);
console.log('  重载前:', JSON.stringify(before));
console.log('  重载后:', JSON.stringify(after));
const rehook = after.Unopposed === 'patched' && after.Make === 'patched';
console.log('  重新接管:', rehook ? '✅ 成功' : '❌ 失败');

console.log('\n========== 结论 ==========');
console.log((a && b && rehook) ? '✅ 全部通过：500 次心跳无套娃，重载后可重新接管' : '❌ 存在问题');
