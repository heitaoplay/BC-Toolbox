# BC工具箱 移植报告

完成时间：2026-08-31 13:30
源位置：`/Users/amoy_johnny/WorkBuddy/2026-06-03-14-48-07/_active/BC-Toolbox`
目标位置：`/Users/amoy_johnny/WorkBuddy/BC工具箱`
结果：**122 个文件，逐文件 SHA256 零差异，git 仓库完好可用**

---

## 一、移植范围

### 为什么不能用 `git clone`

源目录里有 **7 个从未提交到 git 的文件**，都是实打实的工作成果。用 clone 会直接丢失：

| 文件 | 大小 | 用途 |
|---|---|---|
| `bct-live-inject.js` | 27.9 KB | 实机热注入脚本（Chrome CDP 调试用） |
| `BC-Toolbox-redesign.html` | 25.2 KB | UI 重设计稿 |
| `docs/bc-toolbox-ui-redesign-proposal.md` | 14.8 KB | UI 重设计方案文档 |
| `BCX_Toolbox_指令快捷触发方案.md` | 14.4 KB | 指令触发设计方案 |
| `BCX_房间工具功能说明.md` | 10.0 KB | 房间工具功能说明 |
| `工具箱团队技术提升方案.md` | 6.6 KB | 技术提升方案 |
| `bct-inject-targeted.js` | 1.3 KB | 定向注入脚本 |

所以本次采用**整目录字节级复制**，而不是 clone。

### 实际移植的 12 个业务文件（1.5 MB）

| 文件 | 大小 | 说明 |
|---|---|---|
| `bc-toolbox.user.js` | ~285 KB | **主脚本**，移植时 v3.4.1（已于本次修复后升至 v3.4.2），全部功能逻辑 |
| `bct-live-inject.js` | 27.9 KB | 实机热注入调试 |
| `BC-Toolbox-redesign.html` | 25.2 KB | UI 重设计稿 |
| `docs/bc-toolbox-ui-redesign-proposal.md` | 14.8 KB | 重设计方案 |
| `BCX_Toolbox_指令快捷触发方案.md` | 14.4 KB | 指令方案 |
| `BCX_房间工具功能说明.md` | 10.0 KB | 功能说明 |
| `工具箱团队技术提升方案.md` | 6.6 KB | 技术方案 |
| `README.md` | 3.0 KB | 项目说明 |
| `bc-toolbox-loader.user.js` | 2.2 KB | Loader（从 GitHub 拉取最新版） |
| `bct-inject-targeted.js` | 1.3 KB | 定向注入 |
| `icon.png` | 181 B | 脚本图标（64×64 PNG，已验证有效） |

外加 `.git/` 目录：1.5 MB，含 20 次完整提交历史。

### 依赖情况（重要）

**没有本地依赖。** 项目是纯 Tampermonkey 用户脚本，无 `package.json`、无 `node_modules`、不需要 npm install。运行时依赖全部走 CDN 远程加载：

- `bcmodsdk.js` — ModSDK（BC 插件注册框架，让脚本能接入游戏）
- `BC_toast_system.user.js` — 提示条组件
- `Noto Sans TC` — 思源黑体（Google Fonts）
- `likorp.png` — 浮动按钮图标

这几项每次运行脚本时联网拉取，**不在仓库里，因此不在本次移植范围内**。后果：断网环境下脚本会缺 SDK 而失效。如果需要离线可用，可以另做「依赖本地固化」（见第三节）。

### 未纳入移植的

- **浏览器内的运行时状态**：面板位置、主题选择、折叠状态等存在浏览器 localStorage 里，跟着浏览器走，不属于文件，无法随目录迁移。换电脑或清缓存会重置为默认。
- 源目录本身：**保持原样未动**，本次是复制不是移动。

---

## 二、执行流程与校验结果

### 做法

一步 `rsync -aE`（`-a` 保留权限/时间戳/符号链接，`-E` 保留 macOS 扩展属性），比 `cp -R` 更可靠。

```bash
SRC="/Users/amoy_johnny/WorkBuddy/2026-06-03-14-48-07/_active/BC-Toolbox"
DST="/Users/amoy_johnny/WorkBuddy/BC工具箱"

rsync -aE --stats "$SRC/" "$DST/"
```

### 四道校验，全过

**1. 逐文件哈希比对** — 源端与目标端各生成 122 条 SHA256 清单，`diff` 零差异。

**2. 未跟踪文件到位** — 上表 7 个高危文件逐一确认存在且字节数正确。

**3. git 仓库完整性**

```
git fsck --full     → 无报错，对象库完好
分支               → main，追踪 origin/main
远程               → git@github.com:heitaoplay/BC-Toolbox.git
提交数             → 20（本地与远程一致）
HEAD               → 51d8850 (v3.4.1)，与源端、与 GitHub 远程三方一致
git status         → 同样 7 个 untracked，与源端状态完全相同
```

**4. 功能性抽检**

- 4 个 JS 文件 `node --check` 语法全部正常（281 KB 主脚本无损坏）
- 版本号一致：`@version 3.4.1` 与代码内 `modversion = "3.4.1"` 对得上
- `git ls-remote origin` 连通成功，远程 HEAD 同为 `51d8850`

---

## 三、后续可选动作

1. **依赖本地固化**（断网可用）：把 `bcmodsdk.js` 和 `BC_toast_system.user.js` 下载到 `vendor/` 目录，脚本头部 `@require` 改成本地路径。改动脚本行为，**需要你确认再做**。

2. **7 个未跟踪文件入库**：目前它们没有任何版本保护，误删无法恢复。建议 `git add` 后提交。同样等你点头。

3. **加 `.gitignore`**：现在仓库没有 ignore 规则，`node_modules`、编辑器配置之类容易被误提交。

4. **源目录处置**：源位置文件仍在，两个目录内容完全相同。确认新位置工作正常后，可自行决定是否清理源目录（我没动它）。

---

## 四、一句话结论

122 个文件零差异落位，git 历史、远程追踪、未提交的工作成果全部保留，脚本语法与版本号校验通过。新目录可直接接力开发，也可直接推送到 GitHub。
