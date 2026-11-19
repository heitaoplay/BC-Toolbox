// 从真实源文件抽取「远程插件查询」核心函数，用 mock 环境验证协议交互
// 覆盖：发查询格式、收回复汇总、拒绝/失败/超时状态、XSS 转义、偏好开关
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

// 抽取依赖的常量与函数
const consts = src.match(/const REMOTE_MODS_TIMEOUT_MS = \d+;/)[0];
const fnLocal = extractFn(src, 'remoteModsGetLocal');
const fnOnMsg = extractFn(src, 'remoteModsOnMessage');
const fnEscape = extractFn(src, 'remoteModsEscape');
const fnBuildList = extractFn(src, 'remoteModsBuildListHtml');
const fnUpdateProgress = extractFn(src, 'remoteModsUpdateProgress');
const fnFinalize = extractFn(src, 'remoteModsFinalize');

// ── mock 环境 ──
let sent = [];                 // 记录 ServerSend 调用
let Player = { MemberNumber: 100, Name: 'TAO', OnlineSettings: { RespondRemoteModListQueries: true } };
let ChatRoomCharacter = [
    { MemberNumber: 100, Name: 'TAO', Nickname: 'TAO' },
    { MemberNumber: 200, Name: 'Alice', Nickname: 'Alice', OnlineSharedSettings: { GameVersion: 'R134' } },
    { MemberNumber: 300, Name: 'Bob', Nickname: 'Bob', OnlineSharedSettings: { GameVersion: 'R133' } },
];
const bcModSdk = { getModsInfo: () => [
    { name: 'BC工具箱', version: '3.4.6', repository: 'https://github.com/heitaoplay/BC-Toolbox' },
    { name: 'TestMod', version: '1.0' },
] };
function ServerSend(type, data) { sent.push({ type, data }); }
function getNickname(c) { return c.Nickname || c.Name; }
function ChatRoomSendLocal(msg) { localMsgs.push(msg); }
let localMsgs = [];
function clearTimeout() {}
function setTimeout() { return 1; }
// 面板 mock
function makeRoot() {
    const body = { innerHTML: '' };
    const progress = { textContent: '' };
    return {
        isConnected: true,
        querySelector: (sel) => sel === '.bct-rmods-body' ? body : (sel === '.bct-rmods-progress' ? progress : null),
        _body: body, _progress: progress,
    };
}
let remoteModsActive = null;

// 组装可执行的函数集合
const factory = new Function(
    'bcModSdk', 'Player', 'ServerSend', 'getNickname', 'ChatRoomSendLocal', 'ChatRoomCharacter',
    'setTimeout', 'clearTimeout',
    `${consts}\nlet remoteModsActive = null;\n` +
    `${fnLocal}\n${fnOnMsg}\n${fnEscape}\n${fnBuildList}\n${fnUpdateProgress}\n${fnFinalize}\n` +
    'return { remoteModsGetLocal, remoteModsOnMessage, remoteModsEscape, remoteModsBuildListHtml, remoteModsFinalize, ' +
    'getActive: () => remoteModsActive, setActive: (v) => { remoteModsActive = v; } };'
);
const M = factory(bcModSdk, Player, ServerSend, getNickname, ChatRoomSendLocal, ChatRoomCharacter, setTimeout, clearTimeout);

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('  ✅ ' + label); }
    else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
}

console.log('从源文件抽取真实函数：REMOTE_MODS 模块\n');

// 1. 本地插件列表
console.log('【1】本地插件列表');
const local = M.remoteModsGetLocal();
check('返回 2 个 mod', local.length === 2, '实际 ' + local.length);
check('按名称排序（BC工具箱 在前）', local[0].name === 'BC工具箱', local[0].name);

// 2. 收到别人的查询 → 自动回复
console.log('\n【2】收到查询请求 → 自动回复');
sent = [];
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsQuery', Sender: 200,
    Dictionary: [{ Tag: 'ModSdkModsQueryPayload', RequestId: 'REQ-1' }]
});
check('发送了 1 条回复', sent.length === 1, '实际 ' + sent.length);
if (sent[0]) {
    const d = sent[0].data;
    check('回复 Content = ModSdkModsReply', d.Content === 'ModSdkModsReply', d.Content);
    check('回复 Type = Hidden', d.Type === 'Hidden', d.Type);
    check('Target = 查询者(200)', d.Target === 200, String(d.Target));
    const p = d.Dictionary[0];
    check('回传相同 RequestId', p.RequestId === 'REQ-1', p.RequestId);
    check('Status = ok', p.Status === 'ok', p.Status);
    check('ModsJson 含 BC工具箱', JSON.parse(p.ModsJson).some(m => m.name === 'BC工具箱'));
}

// 3. 偏好关闭 → 拒绝
console.log('\n【3】对方偏好关闭 → 拒绝回复');
Player.OnlineSettings.RespondRemoteModListQueries = false;
sent = [];
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsQuery', Sender: 200,
    Dictionary: [{ Tag: 'ModSdkModsQueryPayload', RequestId: 'REQ-2' }]
});
check('仍回复 1 条', sent.length === 1);
check('Status = declined', sent[0] && sent[0].data.Dictionary[0].Status === 'declined', sent[0] && sent[0].data.Dictionary[0].Status);
Player.OnlineSettings.RespondRemoteModListQueries = true;

// 4. 自己发的查询不处理（防自回环）
console.log('\n【4】忽略自己发的查询');
sent = [];
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsQuery', Sender: 100,
    Dictionary: [{ Tag: 'ModSdkModsQueryPayload', RequestId: 'REQ-SELF' }]
});
check('不产生回复', sent.length === 0, '实际 ' + sent.length);

// 5. 收到回复 → 汇总到 active
console.log('\n【5】收到回复 → 汇总');
const root = makeRoot();
M.setActive({ requestId: 'REQ-A', pending: new Set([200, 300]), results: new Map(), rootEl: root, total: 2, finalized: false, timeoutId: null });
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsReply', Sender: 200,
    Dictionary: [{ Tag: 'ModSdkModsReplyPayload', RequestId: 'REQ-A', Status: 'ok',
        ModsJson: JSON.stringify([{ name: 'AliceMod', version: '2.0' }]) }]
});
let active = M.getActive();
check('Alice 从 pending 移除', !active.pending.has(200));
check('Alice 结果 = ok', active.results.get(200).status === 'ok');
check('Alice mod 名正确', active.results.get(200).mods[0].name === 'AliceMod');

// 6. RequestId 不匹配 → 忽略（防止旧查询串台）
console.log('\n【6】RequestId 不匹配 → 忽略');
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsReply', Sender: 300,
    Dictionary: [{ Tag: 'ModSdkModsReplyPayload', RequestId: 'WRONG-ID', Status: 'ok', ModsJson: '[]' }]
});
active = M.getActive();
check('Bob 仍在 pending（未误收）', active.pending.has(300));
check('Bob 无结果', !active.results.has(300));

// 7. 拒绝状态：最后一人回复后 pending 清空 → 自动 finalize → active 置空
console.log('\n【7】对方拒绝 → 自动收尾并渲染');
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsReply', Sender: 300,
    Dictionary: [{ Tag: 'ModSdkModsReplyPayload', RequestId: 'REQ-A', Status: 'declined' }]
});
check('pending 清空后 active 自动置空（已收尾）', M.getActive() === null);
check('面板渲染含 Alice', root._body.innerHTML.includes('Alice'));
check('面板渲染含 Bob', root._body.innerHTML.includes('Bob'));
check('面板渲染 Alice 的插件 AliceMod', root._body.innerHTML.includes('AliceMod'));
check('面板渲染 Bob「拒绝提供」', root._body.innerHTML.includes('拒绝提供'));

// 8. 超时 → 未完成者标 timeout + 面板渲染
console.log('\n【8】超时 → 标 timeout 并渲染面板');
const root2 = makeRoot();
M.setActive({ requestId: 'REQ-B', pending: new Set([300]), results: new Map(), rootEl: root2, total: 1, finalized: false, timeoutId: null });
M.remoteModsFinalize();
check('active 被清空', M.getActive() === null);
check('面板渲染含 Bob', root2._body.innerHTML.includes('Bob'));
check('面板渲染含「无响应」', root2._body.innerHTML.includes('无响应'));

// 9. XSS 转义
console.log('\n【9】XSS 转义');
check('<script> 被转义', M.remoteModsEscape('<script>alert(1)</script>').includes('&lt;script&gt;'));
check('引号被转义', M.remoteModsEscape('a"b').includes('&quot;'));
const evilHtml = M.remoteModsBuildListHtml([{ name: '<img src=x onerror=alert(1)>', version: '1.0' }]);
check('恶意 mod 名在列表里被转义', evilHtml.includes('&lt;img') && !evilHtml.includes('<img'));

// 10. 非 Hidden 消息忽略
console.log('\n【10】普通 Chat 消息不干扰');
sent = [];
M.remoteModsOnMessage({ Type: 'Chat', Content: 'ModSdkModsQuery', Sender: 200 });
check('普通消息被忽略', sent.length === 0);

// 11. BC 原生已有 CommandsModsList → 不重复回复（避免双重回复）
console.log('\n【11】BC 原生命令存在 → 交给原生，不重复回复');
globalThis.CommandsModsList = { ProcessHiddenRemote: function () {} };
sent = [];
M.remoteModsOnMessage({
    Type: 'Hidden', Content: 'ModSdkModsQuery', Sender: 200,
    Dictionary: [{ Tag: 'ModSdkModsQueryPayload', RequestId: 'REQ-NATIVE' }]
});
check('原生存在时不产生我方回复', sent.length === 0, '实际 ' + sent.length);
delete globalThis.CommandsModsList;

console.log('\n========== 结论 ==========');
console.log(`${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
else console.log('✅ 远程插件查询协议全部验证通过');
