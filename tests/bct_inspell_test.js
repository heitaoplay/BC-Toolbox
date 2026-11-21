// v3.4.9 验证：守护常驻 inSpell 从布尔标记改为时间戳窗口
// 老 bug：LSCG 收到法术后 setTimeout 1 秒才掷骰，布尔标记在原函数返回时已被 finally 清掉，
//         检定发生时永远是 false → 强制防御分支永不命中。
// 新方案：IncomingSpellCommand 设置 8 秒窗口，MakeActivityCheck 在窗口内判定 + 一次性吃掉。
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

const FN_WINDOW = extractFn(src, 'ltInSpellWindow');
console.log('已抽取 ltInSpellWindow（' + FN_WINDOW.length + ' 字符）\n');

// 从真实脚本里抠出 IncomingSpellCommand 包裹设置窗口的那段逻辑
const openIdx = src.indexOf('mm.IncomingSpellCommand = function(sender, msg) {');
const openEnd = src.indexOf('mm.IncomingSpellCommand.__guardPatched = true;', openIdx);
const wrapperSrc = src.slice(openIdx, openEnd);
console.log('已抽取 IncomingSpellCommand 包裹（' + wrapperSrc.length + ' 字符）\n');

function makeEnv() {
    const code = `
        var _guard = { inSpell: false, inSpellUntil: 0, spellDefended: false };
        var gdOn = function() { return GD_ON; };
        ${FN_WINDOW}
        var openedWindow = false;
        var origIncomingSpellCommand = function() { openedWindow = true; };
        var mm = { IncomingSpellCommand: origIncomingSpellCommand };
        ${wrapperSrc}
        return {
            windowFn: ltInSpellWindow,
            incoming: mm.IncomingSpellCommand,
            guard: _guard,
            state: function() { return { inSpell: _guard.inSpell, until: _guard.inSpellUntil, defended: _guard.spellDefended, opened: openedWindow }; },
            setGd: function(v) { gdOn = function() { return v; }; },
            advance: function(ms) { _guard.inSpellUntil = Date.now() + ms; }
        };
    `;
    return new Function('GD_ON', code)(true);
}

let pass = true;
function check(name, cond, detail) {
    console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? ' — ' + detail : ''));
    if (!cond) pass = false;
}

console.log('========== 场景 1：收到法术命令后开窗 ==========');
const e1 = makeEnv();
e1.incoming(null, { command: { name: 'spell' } });
const s1 = e1.state();
check('inSpell 标记置位', s1.inSpell === true);
check('时间戳窗口已设置(8秒)', s1.until > Date.now() && s1.until <= Date.now() + 8000);
check('防御次数重置', s1.defended === false);
check('窗口判定为有效', e1.windowFn() === true);
check('原版函数被调用', s1.opened === true);

console.log('\n========== 场景 2：1 秒后掷骰（老 bug 的延迟场景）→ 窗口仍有效 ==========');
const e2 = makeEnv();
e2.incoming(null, { command: { name: 'spell' } });
// 模拟 LSCG 的 setTimeout(1000)：直接把窗口往前推 1 秒验证仍在有效期内
const before = e2.state().until;
e2.advance(7000); // 等价于已过 1 秒（原 8000 → 现 7000 剩余）
check('延迟 1 秒后窗口仍有效', e2.windowFn() === true, '剩余窗口=' + (e2.state().until - Date.now()) + 'ms');

console.log('\n========== 场景 3：防御判定一次性消费 ==========');
const e3 = makeEnv();
e3.incoming(null, { command: { name: 'spell' } });
check('首次判定有效', e3.windowFn() === true);
e3.guard.spellDefended = true;  // 模拟 wrapper 吃掉这次检定
check('同一次法术的后续检定不再命中', e3.windowFn() === false, '防止误伤期间其他活动');

console.log('\n========== 场景 4：窗口过期后失效 ==========');
const e4 = makeEnv();
e4.incoming(null, { command: { name: 'spell' } });
e4.advance(-1000);  // 时间戳设到过去
check('过期窗口返回 false', e4.windowFn() === false);

console.log('\n========== 场景 5：pair 命令不开窗（不走防御检定）==========');
const e5 = makeEnv();
e5.incoming(null, { command: { name: 'pair' } });
check('pair 命令不设置窗口', e5.state().until === 0 && e5.windowFn() === false);

console.log('\n========== 场景 6：守护关闭时不开窗 ==========');
const e6 = makeEnv();
e6.setGd(false);
e6.incoming(null, { command: { name: 'spell' } });
check('守护关闭时窗口不开启', e6.state().until === 0 && e6.windowFn() === false);
check('原版函数仍被调用（不影响其他功能）', e6.state().opened === true);

console.log('\n========== 结论 ==========');
console.log(pass ? '✅ inSpell 时间戳窗口修复全部通过' : '❌ 存在问题');
process.exit(pass ? 0 : 1);
