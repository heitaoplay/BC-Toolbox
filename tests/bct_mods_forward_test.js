/**
 * /bc mods 转发官方 /mods remote 的回归测试
 * 从源文件原样抽取 remoteModsCommand 函数，放进 mock 环境验证：
 *   1. 官方命令存在 → 参数原样透传给 CommandsModsList.StartRemote
 *   2. 目标参数带 @ 前缀会被去掉（官方 StartRemote 自己做 ChatRoomGetCharacter）
 *   3. 老版本 BC 无官方命令 → 给出升级提示，不抛错、不卡死
 *   4. 官方函数内部抛错 → 被 catch，返回 true，不冒泡
 *
 * 运行：node tests/bct_mods_forward_test.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'bc-toolbox.user.js');
const src = fs.readFileSync(SRC, 'utf8');

// 原样抽取 remoteModsCommand 函数体
const start = src.indexOf('    function remoteModsCommand(args) {');
if (start < 0) throw new Error('未找到 remoteModsCommand');
let depth = 0, end = -1;
for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name); }
}

function makeEnv(opts) {
    const log = { startedWith: [], localMsgs: [], warns: [], errors: [] };
    const env = {
        CommandsModsList: opts.hasOfficial ? { StartRemote: (spec) => log.startedWith.push(spec) } : undefined,
        ChatRoomSendLocal: (m) => log.localMsgs.push(m),
        isZh: () => true,
        t: (k) => k,
        console: { warn: (m) => log.warns.push(m), error: (m) => log.errors.push(m) },
        log
    };
    const factory = new Function('CommandsModsList', 'ChatRoomSendLocal', 'isZh', 't', 'console',
        fnSrc + '\nreturn remoteModsCommand;');
    env.fn = factory(env.CommandsModsList, env.ChatRoomSendLocal, env.isZh, env.t, env.console);
    return env;
}

console.log('【1】官方命令存在 → 参数透传');
{
    const e = makeEnv({ hasOfficial: true });
    check('返回 true', e.fn('Alice') === true);
    check('StartRemote 收到 Alice', e.log.startedWith[0] === 'Alice');
    check('无错误提示', e.log.localMsgs.length === 0 && e.log.errors.length === 0);
}
{
    const e = makeEnv({ hasOfficial: true });
    e.fn('');
    check('空参数透传为空串', e.log.startedWith[0] === '');
}
{
    const e = makeEnv({ hasOfficial: true });
    e.fn('@12345');
    check('@ 前缀被去掉', e.log.startedWith[0] === '12345');
}

console.log('\n【2】老版本 BC 无官方命令 → 降级提示');
{
    const e = makeEnv({ hasOfficial: false });
    check('返回 true（不抛错）', e.fn('Alice') === true);
    check('提示升级 R131+', e.log.localMsgs.some(m => m.includes('R131')));
    check('有警告日志', e.log.warns.length > 0);
}

console.log('\n【3】官方函数内部抛错 → 被 catch');
{
    const e = makeEnv({ hasOfficial: true });
    e.log.startedWith = [];
    e.fn = new Function('CommandsModsList', 'ChatRoomSendLocal', 'isZh', 't', 'console',
        fnSrc + '\nreturn remoteModsCommand;')(
        { StartRemote: () => { throw new Error('boom'); } },
        e.ChatRoomSendLocal, e.isZh, e.t, e.console);
    check('返回 true（不冒泡）', e.fn('Alice') === true);
    check('记录了错误日志', e.log.errors.length > 0);
}

console.log(`\n========== 结论 ==========\n${fail === 0 ? '✅' : '❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
