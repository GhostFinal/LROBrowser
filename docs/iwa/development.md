# LastRO V2 IWA 本地开发

Phase A 只支持本机手动安装和测试。生产 manifest 不包含 `update_manifest_url`，仓库不跟踪签名私钥，也不配置自动更新服务。

源码和运行资源边界：`vendor/v2/` 管理 `Online.js`、Worker、LastRO `*.mjs` 模块及其回归测试；`vendor/core/` 管理 Lua/LUB、WASM、启动数据和字体。`generated/` 仅由 `pnpm prepare:runtime` 生成 patched runtime、Worker 和资源清单，属于可删除的构建中间目录，不是源代码来源。外部 `ROWeb` 目录不参与默认命令。

在 Linux 上运行：

```bash
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm install
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm build
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm dev
```

在 PowerShell 中，将 `rtk proxy env PATH=... pnpm` 替换为本机 Node 24 的 `pnpm` 命令即可。开发服务器或手动静态服务器必须发送以下响应头：

```text
Content-Security-Policy: 使用 scripts/iwa-security.mjs 中的完整策略
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Windows 下可在仓库目录运行 `node scripts/local-server-control.mjs start`，独立后台服务固定使用 `http://127.0.0.1:5173`。重复启动会复用同一服务，关闭终端不会停止它。用 `node scripts/local-server-control.mjs status` 查看状态，用 `node scripts/local-server-control.mjs stop` 关闭；准备客户端资源期间请等待准备完成再停止。日志在 `.local/local-server/server.log`。

该后台入口直接使用 Node 24 和仓库已有 Vite。游戏继续从原有 Chrome IWA 开发安装入口打开；普通 localhost 页面仅用于检查服务。启动时只在资源缺失或源文件更新后重新生成，更新期间的资源请求会返回明确的暂不可用状态，避免把页面 HTML 当作 JS 或 JSON。

本地开发使用 Chrome 的 Dev Mode Proxy 加载上述 HTTP 服务；签名包安装另需 manifest 和 Web Bundle 文件。测试 Web Bundle ID 由临时密钥派生，不能作为未来生产身份。Direct TCP 只在支持 Direct Sockets 的 IWA 环境中启用，普通浏览器不会降级到 WebSocket 或代理连接。

安全边界与已知服务端限制见 [客户端安全审查](security-review.md)。开发服务器和发布包使用同一份 CSP/Trusted Types 策略；开发代理不能用于证明客户端未被修改。

游戏客户端的登录调试面板、地图调试参数和导航调试接口固定关闭，不通过 URL 或服务器配置重新开启。IWA 页面抑制 Ctrl/Meta+Shift+I/J/C、Ctrl/Meta+U 和浏览器右键菜单；F12 只取消浏览器默认动作，继续交给游戏展开技能栏，游戏右键处理也保留。普通 localhost 开发页面不安装快捷键拦截，控制台仍保留必要错误诊断。[IWA 自身禁止扩展内容注入](https://developer.chrome.com/docs/iwa/introduction#work-with-extensions)，此隔离由浏览器提供；浏览器提供的开发者工具不能靠页面快捷键绝对封禁。

点击小地图画布可在小地图旁打开原生导航窗口；传送面板的路线自动寻路在后台执行，不自动弹出导航窗口。后台寻路期间手动打开或关闭导航窗口不影响路线继续。

技能栏 F12 先更新实际行高再保存行数，避免窗口快照读取旧高度并覆盖新行数。重新打开时以原生行数为准，保留收起的 0 行状态；旧窗口像素高度不能重新展开技能栏。回归测试连接实际快捷键分发、聊天焦点、偏好保存和窗口恢复流程。

背景音乐的加载、解码失败会恢复可重试状态；关闭音乐时仍保留当前曲名，重新开启后正常加载。换图或停止会取消旧播放请求，迟到的资源回调和解码结果不会重新播放旧曲。音乐不受动作音效的过期丢弃规则影响，回归覆盖原生资源缓存、换图顺序和浏览器音频解锁。

赏金狩猎接入原生任务列表及小地图下方的任务简报，目标和计数使用服务器 `HUNTINGLIST` 数据；普通任务仍保留原任务协议的状态、期限和目标。怪物链接按实际 `mobGID` 打开世界地图搜索。含明确 NAVI 坐标或经过任务内容核对的结构化路线可直接前往，复用地图资源和坐标预检；只有地图名时不补造坐标。收包、NPC 对话结束和打开任务窗会刷新赏金，地图已就绪时每 15 秒补充刷新，切地图暂停，退出角色清空。可运行 `node scripts/preview-quests.mjs` 生成离线原生任务预览，不连接游戏或发送实际传送包。

## 地图加载诊断

选角后初始化 Lua 数据库时，`startLua()` 的五个 Lua 实例统一读取包内 `/core/wasm/liblua5.1.wasm`。此前严格 CSP 拒绝原生内嵌 `data:` WASM 的 fetch，导致数据库没有就绪并停在“请稍候”；当前已收缩资源策略，仍保留实际启动入口使用包内文件的修复。内嵌常量保留给资源导入工具提取使用。更新运行时后需核对实际 `startLua` 入口，不能只检查 Lua 库默认地址或 WASM 文件能否下载。

RSW、GND、GAT 下载和缓存命中均先校验文件格式、结构和长度；无效缓存会删除后重新下载，部分下载不会写入缓存。资源恢复原有主站公开 GET 的 Direct TCP HTTP 通道与备用 HTTPS，总时限为 60 秒；RSM2 与 RSM 使用相同模型加载流程。游戏 Direct TCP 使用原有连接逻辑，不附加本轮安全改造的 15 秒超时或报文/队列上限。世界地图传送也会先读取 RSW 中实际引用的 GND/GAT，检查失败时不发送传送请求，保留当前位置。

本轮严格 DOM 白名单曾误拦截卡片典藏的正常 `aside`/`footer` 标签，导致 MapEngine 在注册状态、物品、快捷栏处理器前退出。当前已撤回白名单并恢复基本注入防护。修复后须彻底关闭并重开 IWA，不能只返回选角，因为旧页面保留了初始化失败时的状态。

真正进入地图后的加载错误会在原生消息窗显示失败文件和原因。控制台保留 `[LastRO] Map load failed` 原始错误，最近一次诊断还保存于当前客户端的 `localStorage.LastROMapLoadFailure`，便于重启后追查；这里只记录资源错误，不记录账号或密码。

## 物品名称与附魔

物品名称通过中央 `DB.getItemName` 区分普通卡片与附魔。附魔逐项追加到名称末尾，例如 `天龙之翼 [名弓2] [名弓2]`；重复附魔保留各自等级，不生成卡片用的 Double/Triple。名称尾缀省略 Lv 标记，物品数据表与附魔悬浮说明仍保留原名。新版附魔根据附魔注册表标记，兼容源表中鉴定前后名称拼写不一致的条目。

随机词条数量通过同一物品名称入口显示为 `[5词条]`，仅计非零词条 ID；保留原有隐藏数量的物品详情行为。生成结束执行实际名称函数，核对 0、1、5 个词条和隐藏行为；后续补丁恢复英文或丢掉数量显示会使构建失败。`node scripts/audit-localization.mjs --check-dist` 还会核对生成与发布目录中的两份运行时，避免只检查内存补丁或中文字符串。

## 装备动画回归

装备渲染补丁由 `scripts/lastro-equipment-animation.mjs` 和 `scripts/lastro-costume-loop.mjs` 随原生 runtime 一起生成。一次角色绘制固定使用同一动作、时刻和身体挂点，全部部件绘制结束后再切换下一个动作。身体、披肩、武器和盾牌保留步伐同步；头饰使用自身 ACT 延时，避免骑乘或移动速度改变特效播放速度。

对于站立和当前动作共享同一组图层、且动作内挂点固定的无声循环头饰，使用独立的角色与资源时钟，跨移动和攻击保持连续；当前动作仍决定挂点和镜像。姿势不同、带音效帧、静态或不符合条件的资源走原有动作逻辑，不按装备名称强行套用动画。更新原生 runtime 后运行装备动画、循环、资源加载和目录映射相关测试；补丁锚点变化必须明确失败，不能静默丢失修复。

`scripts/lastro-equipment-view.mjs` 同时修正旧装备目录使用的职业和武器枚举别名，沿用当前已有的数字 ID，不翻译资源文件名。目录检查覆盖现有头饰、披肩、武器类型、职业及坐骑映射；这类结构检查不等于逐件远程 SPR/ACT 的游戏内视觉验收。

## 本地测试签名

运行本地打包脚本会在 `.local/keys/` 中生成并复用 disposable test key：

```bash
./scripts/build-sign-local.sh
```

脚本也接受 `LASTRO_IWA_SIGNING_KEY=/absolute/path/to/test-key.pem` 覆盖默认路径。签名脚本不会把密钥路径写入发行清单；`.local/keys/` 和 `release/*.swbn` 已加入 Git 忽略规则。
