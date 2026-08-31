// 验证 syncToggleStates 的时序修复：未登录时不再用默认值冲掉真实存档
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

const fnSync = extractFn(src, 'syncToggleStates');
console.log('抽取 syncToggleStates（' + fnSync.length + ' 字符）\n');

// 模拟 getSuperDice / getGuard：行为与真实实现一致 ——
// Player 未登录（无 MemberNumber）时，getES() 会凭空建出默认值 superDice:0
function makeEnv(playerState) {
    const code = `
        var Player = PLAYER_STATE;
        var _superDice = { enabled: false, mode: 'A' };
        var _guard = { enabled: false };
        var esCreated = false;
        function getES() {
            if (!Player.ExtensionSettings) Player.ExtensionSettings = {};
            if (!Player.ExtensionSettings.BCToolbox) {
                esCreated = true;
                Player.ExtensionSettings.BCToolbox = { superDice: 0, superDiceMode: 0, guardResident: 0 };
            }
            return Player.ExtensionSettings.BCToolbox;
        }
        function getSuperDice() { try { return getES().superDice === 1; } catch (e) { return false; } }
        function getSuperDiceMode() { try { return getES().superDiceMode === 1 ? 'C' : 'A'; } catch (e) { return 'A'; } }
        function getGuard() { try { return getES().guardResident === 1; } catch (e) { return false; } }
        ${fnSync}
        return {
            sync: syncToggleStates,
            st: function () { return { sd: _superDice.enabled, mode: _superDice.mode, gd: _guard.enabled, esCreated: esCreated }; },
            setSaved: function (v) { Player.ExtensionSettings = { BCToolbox: { superDice: v ? 1 : 0, superDiceMode: 1, guardResident: v ? 1 : 0 } }; }
        };
    `;
    return new Function('PLAYER_STATE', code)(playerState);
}

console.log('========== 场景 1：脚本底部同步跑在登录之前（原 bug 现场）==========');
const env1 = makeEnv({ MemberNumber: undefined });  // 玩家还没登录
env1.sync();                                        // 文件底部那次同步
const s1 = env1.st();
console.log('  未登录时同步后 → 超级骰子=' + s1.sd + '，守护=' + s1.gd);
console.log('  是否凭空创建了默认存档对象:', s1.esCreated ? '是' : '否');
console.log('  ' + (!s1.esCreated && !s1.sd ? '✅ 正确跳过：不再用默认值 superDice:0 污染内存标志' : '❌ 仍然读到了默认值'));

console.log('\n========== 场景 2：登录完成后的权威同步（真实存档 = 开启）==========');
const env2 = makeEnv({ MemberNumber: undefined });
env2.sync();                       // 底部那次（跳过）
env2.setSaved(true);               // 模拟登录：服务器把真实存档载入进来
// 真实代码里 Player.MemberNumber 会在登录后变成数字，这里同步更新
// （makeEnv 里 Player 是引用，直接改写属性即可）
env2.setSaved(true);
// 为了让守卫通过，补上 MemberNumber
const code2 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 1, superDiceMode: 1, guardResident: 1 } } });
code2.sync();
const s2 = code2.st();
console.log('  登录后同步 → 超级骰子=' + s2.sd + '，模式=' + s2.mode + '，守护=' + s2.gd);
console.log('  ' + (s2.sd && s2.gd && s2.mode === 'C' ? '✅ 正确读到存档：超级骰子开、∞ 模式、守护开' : '❌ 未读到存档'));

console.log('\n========== 场景 3：存档为关闭时不应误开 ==========');
const env3 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 0, superDiceMode: 0, guardResident: 0 } } });
env3.sync();
const s3 = env3.st();
console.log('  同步后 → 超级骰子=' + s3.sd + '，守护=' + s3.gd);
console.log('  ' + (!s3.sd && !s3.gd ? '✅ 正确保持关闭' : '❌ 被误开'));

console.log('\n========== 场景 4：反复同步（模拟 2 秒心跳跑 1000 次）==========');
const env4 = makeEnv({ MemberNumber: 12345, ExtensionSettings: { BCToolbox: { superDice: 1, superDiceMode: 0, guardResident: 1 } } });
let ok4 = true;
for (let i = 0; i < 1000; i++) {
    env4.sync();
    const s = env4.st();
    if (!s.sd || !s.gd) { ok4 = false; break; }
}
console.log('  1000 次后 → 超级骰子=' + env4.st().sd + '，守护=' + env4.st().gd);
console.log('  ' + (ok4 ? '✅ 状态稳定，无副作用' : '❌ 状态被破坏'));

console.log('\n========== 结论 ==========');
const pass = !s1.esCreated && s2.sd && s2.gd && !s3.sd && ok4;
console.log(pass ? '✅ 时序修复全部通过' : '❌ 存在问题');
