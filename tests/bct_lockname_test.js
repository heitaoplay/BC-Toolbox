// 从真实源文件原样抽取 parseLockArgs，验证「昵称含空格」时目标/锁名不再错位
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

const fnParse = extractFn(src, 'parseLockArgs');
if (!fnParse) throw new Error('抽取 parseLockArgs 失败');
console.log('从源文件抽取真实函数：parseLockArgs  ' + fnParse.length + ' 字符\n');
const parseLockArgs = new Function(fnParse + '; return parseLockArgs;')();

// 真实锁列表（含中文名与英文多词名）
const validLocks = [
    { Name: 'MetalPadlock',        Description: '金属挂锁' },
    { Name: 'OwnerPadlock',        Description: '主人锁' },
    { Name: 'LoversTimerPadlock',  Description: '爱人计时锁' },
    { Name: 'BestFriendPadlock',   Description: 'Best Friend Padlock' },
    { Name: 'BestFriendTimerPadlock', Description: 'Best Friend Timer Padlock' },
];

const cases = [
    {
        label: '空格昵称 + 中文锁名（用户出问题的场景）',
        args: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼 主人锁',
        want: { target: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼', lock: '主人锁', name: 'OwnerPadlock' }
    },
    {
        label: '空格昵称 + 内部锁名（UI 按钮传参）',
        args: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼 OwnerPadlock',
        want: { target: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼', lock: 'OwnerPadlock', name: 'OwnerPadlock' }
    },
    {
        label: '数字 ID + 中文锁名',
        args: '123456 金属挂锁',
        want: { target: '123456', lock: '金属挂锁', name: 'MetalPadlock' }
    },
    {
        label: '英文多词锁名（Description 含空格）',
        args: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼 Best Friend Timer Padlock',
        want: { target: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼', lock: 'Best Friend Timer Padlock', name: 'BestFriendTimerPadlock' }
    },
    {
        label: '英文多词锁名（内部名无空格）',
        args: '123456 BestFriendPadlock',
        want: { target: '123456', lock: 'BestFriendPadlock', name: 'BestFriendPadlock' }
    },
    {
        label: '错误锁名 —— 报错应显示用户输入的实际内容',
        args: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼 乱写的锁',
        want: { target: '𝐓𝐀𝐎 𝑀𝒰𝒮𝔼', lock: '乱写的锁', name: null }
    },
    {
        label: '只输锁名不输目标 —— 目标应为空以触发提示',
        args: '主人锁',
        want: { target: '', lock: '主人锁', name: 'OwnerPadlock' }
    },
];

let pass = 0;
for (const c of cases) {
    const r = parseLockArgs(c.args, validLocks);
    const ok = r.targetIdentifier === c.want.target &&
               r.lockName === c.want.lock &&
               (r.lock ? r.lock.Name : null) === c.want.name;
    console.log((ok ? '✅' : '❌') + ' ' + c.label);
    console.log('     输入: ' + c.args);
    console.log('     解析: 目标="' + r.targetIdentifier + '"  锁="' + r.lockName + '"' +
                (r.lock ? '  → ' + r.lock.Name : '  (无匹配)'));
    if (!ok) {
        console.log('     期望: 目标="' + c.want.target + '"  锁="' + c.want.lock + '"  → ' + c.want.name);
    }
    if (ok) pass++;
}

console.log('\n========== 结论 ==========');
if (pass === cases.length) {
    console.log('✅ 全部 ' + pass + '/' + cases.length + ' 通过：空格昵称不再被切成锁名');
} else {
    console.log('❌ ' + (cases.length - pass) + ' 个用例失败');
    process.exitCode = 1;
}
