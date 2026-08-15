# BC工具箱（BC Toolbox）

BC 多功能工具箱油猴脚本。在原 **Liko - Tool**（作者 Liko / Likolisu）基础上继续开发与维护，由 **TAO MUSE** 增补功能并持续迭代。

> 原作者 Liko 开发了优秀的原始版本，在此致谢。本项目已更名为「BC工具箱」并持续迭代。

## 功能一览

- 角色选择器：快速选中房间内角色并批量执行操作
- 外观导入/回滚、衣柜、自由编辑束缚订制属性
- 全解锁 / 全锁 / 选择性解束缚
- 反束缚：自动解除他人施加的拘束，支持自定义瞪视文案（公屏动作）
- 身高锁：强制身高为标准值
- 自动解绑女仆（监听求救/解锁消息）
- BCX 指令快捷触发面板：选中在场角色后便捷触发表情/姿态/场所/文本等 BCX 指令
- LSCG 唤醒 / 催眠唤醒
- 画布 RP 按钮、RP 模式、OOC 模式、超级骰子等
- UI 面板支持拖拽排序与主题自定义

## 安装

### 方式一：Loader 模式（推荐，仓库推送即时生效）

安装下面这个很小的 Loader 脚本。它每次进入游戏时都会从 Git 仓库**实时拉取最新版**主脚本并执行，因此只要你往仓库推送新版本，玩家下次刷新页面就能立即生效，不需要等油猴的定时更新。

**安装链接：** https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox-loader.user.js

> 该 Loader 自带 `@updateURL` / `@downloadURL`，油猴会保持 Loader 自身为最新；
> 而真正的功能代码（`bc-toolbox.user.js`）由 Loader 在每次页面加载时动态拉取。

### 方式二：直接安装（传统方式，依赖油猴自动更新）

如果你更习惯传统安装，也可以直接安装主脚本。油猴会按 `@updateURL` / `@downloadURL` 检测 `@version` 变化并自动更新。

**安装链接：** https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox.user.js

### 方式三：CDN 镜像

若 GitHub raw 访问不稳定，Loader 内部会自动回退到 jsDelivr 镜像；直接安装模式也可以使用：

https://cdn.jsdelivr.net/gh/heitaoplay/BC-Toolbox@main/bc-toolbox.user.js

### 手动安装

1. 下载仓库中的 `bc-toolbox-loader.user.js`（推荐）或 `bc-toolbox.user.js`
2. 将文件拖入 Tampermonkey 管理面板完成安装

## 聊天命令

在游戏中输入 `/bc help` 查看全部命令，常用示例：

- `/bc free [目标]` —— 选择移除束缚
- `/bc freetotal [目标]` —— 移除所有束缚
- `/bc fullunlock [目标]` —— 移除所有锁
- `/bc fulllock [目标] [锁名]` —— 添加锁
- `/bc undo [目标]` —— 外观回滚
- `/bc heightlock` —— 锁定身高为标准值
- `/bc releasemaid` —— 自动解绑女仆
- `/bc antirestraint` —— 切换反束缚
- `/bc ooc` —— 切换 OOC 模式
- `/bc theme` —— 打开主题设置

## 仓库说明

- 主分支：`main`
- 脚本文件：`bc-toolbox.user.js`
- 自动更新机制：脚本头部 `@updateURL` / `@downloadURL` 指向本仓库 raw 文件，推送即生效
