// v3.4.9 验证：存档为唯一权威，运行时判定不再依赖内存标志
// 核心场景：重新登录后存档=开、内存标志=关（老 bug 现场），sdOn/gdOn 仍必须判定为开
const fs = require('fs');
const src = fs.readFileSync('/Users/amoy_johnny/WorkBuddy/BC工具箱/bc-toolbox.user.js', 'utf8');

function extractFn(source, name) {
    const idx = source.indexOf('function ' + name + '(');
    if (idx < 0) throw new Error('未找到 ' + name);
    let depth = 0, started = false, i = idx;
    for (; i < source.length; i++) {
        const c = source[i];
        if (c === '{') { depth++; started = true; }
        else if (c === '}') { depth--; if (started && depth === 0) { i++; break; } }
    }
    return source.slice(idx, i);
}

// 从真实脚本抽取被测函数（保证测的是线上代码）
const FN = {
    peekES: extractFn(src, 'peekES'),
    sdOn: extractFn(src, 'sdOn'),
    gdOn: extractFn(src, 'gdOn'),
    sdMode: extractFn(src, 'sdMode'),
    sync: extractFn(src, 'syncToggleStates')
};
console.log('已抽取真实函数: ' + Object.keys(FN).join(', ') + '\n');

function makeEnv(playerState) {
    const code = `
        var Player = PLAYER_STATE;
        var _superDice = { enabled: false, mode: 'A' };
        var _guard = { enabled: false };
        ${FN.peekES}
        ${FN.sdOn}
        ${FN.gdOn}
        ${FN.sdMode}
        ${FN.sync}
        return {
            peekES: peekES, sdOn: sdOn, gdOn: gdOn, sdMode: sdMode, sync: syncToggleStates,
            setMem: function(sd, gd, mode) { _superDice.enabled = sd; _superDice.mode = mode || 'A'; _guard.enabled = gd; },
            mem: function() { return { sd: _superDice.enabled, gd: _guard.enabled, mode: _superDice.mode }; },
            setSaved: function(sd, gd, mode) { Player.ExtensionSettings = { BCToolbox: { superDice: sd, guardResident: gd, superDiceMode: mode } }; }
        };
    `;
    return new Function('PLAYER_STATE', code)(playerState);
}

let pass = true;
function check(name, cond, detail) {
    console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? ' — ' + detail : ''));
    if (!cond) pass = false;
}

console.log('========== 场景 1：登录未完成，存档对象不存在 → 只读不造假 ==========');
const e1 = makeEnv({ MemberNumber: undefined });
check('peekES 返回 null', e1.peekES() === null);
e1.sync();
check('同步后内存标志不被假值污染', e1.mem().sd === false && e1.mem().gd === false);
check('未生成默认存档对象', e1.peekES() === null);

console.log('\n========== 场景 2：老 bug 现场（存档开 / 内存关）→ 功能仍生效 ==========');
const e2 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 1, guardResident: 1, superDiceMode: 1 } } });
e2.setMem(false, false, 'A');  // 模拟内存标志滞留为关
check('sdOn() 以存档为准判定为开', e2.sdOn() === true, '内存标志=' + e2.mem().sd);
check('gdOn() 以存档为准判定为开', e2.gdOn() === true, '内存标志=' + e2.mem().gd);
check('模式以存档为准 = C(∞)', e2.sdMode() === 'C');
e2.sync();
check('心跳同步后内存标志被纠正为开', e2.mem().sd === true && e2.mem().gd === true);

console.log('\n========== 场景 3：存档关 / 内存开 → 功能必须关闭（不能误开）==========');
const e3 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 0, guardResident: 0, superDiceMode: 0 } } });
e3.setMem(true, true, 'C');
check('sdOn() 判定为关', e3.sdOn() === false);
check('gdOn() 判定为关', e3.gdOn() === false);
check('模式 = A(智能)', e3.sdMode() === 'A');

console.log('\n========== 场景 4：切换开关立即生效 ==========');
const e4 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 0, guardResident: 0, superDiceMode: 0 } } });
e4.setSaved(1, 0, 1);
check('开启后 sdOn 立即为开', e4.sdOn() === true && e4.sdMode() === 'C');
e4.setSaved(0, 0, 0);
check('关闭后 sdOn 立即为关', e4.sdOn() === false);

console.log('\n========== 场景 5：1000 次心跳稳定性 ==========');
const e5 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 1, guardResident: 1, superDiceMode: 0 } } });
let stable = true;
for (let i = 0; i < 1000; i++) { e5.sync(); if (!e5.sdOn() || !e5.gdOn()) { stable = false; break; } }
check('1000 次同步后状态稳定', stable);

console.log('\n========== 结论 ==========');
console.log(pass ? '✅ v3.4.9 存档权威修复全部通过' : '❌ 存在问题');
process.exit(pass ? 0 : 1);
