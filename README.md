# BC工具箱（BC Toolbox）

BC 多功能工具箱油猴脚本。在原 **Liko - Tool**（作者 Liko / Likolisu）基础上继续开发与维护，现由 **heitaoplay** 接手。

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

### 方式一：直接安装（推荐，支持自动更新）

已安装 Tampermonkey 或 Violentmonkey 后，点击下面的安装链接即可：

**安装链接：** https://raw.githubusercontent.com/heitaoplay/BC-Toolbox/main/bc-toolbox.user.js

> 该链接直接指向 Git 仓库中的脚本文件。脚本头部已配置 `@updateURL` 与 `@downloadURL` 指向同一地址，
> 因此当你在 Git 仓库推送新版本后，油猴会在检测到版本号（`@version`）变化时**自动更新**，无需手动重装。

### 方式二：CDN 镜像（更稳定）

若 GitHub raw 访问不稳定，可使用 jsDelivr 镜像安装，同样跟随仓库自动更新：

https://cdn.jsdelivr.net/gh/heitaoplay/BC-Toolbox@main/bc-toolbox.user.js

### 手动安装

1. 下载仓库中的 `bc-toolbox.user.js`
2. 用编辑器打开，确认头部 `@updateURL` / `@downloadURL` 指向本仓库 raw 地址
3. 将文件拖入 Tampermonkey 管理面板完成安装

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
