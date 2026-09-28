# 2026-09-26 登录黑屏、皮肤和复兴模式调查

## 新日志复核：逻辑名称不等于请求 URL

读取新附件 `6f0dabf2-43c0-46b1-86a6-2c34e131c618/已粘贴的文本.txt` 全文（5685 行，195829 bytes），不记录其开发客户端 token。第 589 行已为 RENEWAL，第 844 行选择 WinLogin。55 个不同失败资源中，22 个含韩文逻辑名称：20 个 `select_character_ver3` 图片、2 个 `renewalparty` 职业图标。旧 `ResourceResolutionError.message` 只打印原始 path，Worker 只传递 message，因此附件没有这些资源的实际 URL/HTTP 状态，不能据此认定该次运行发送了韩文 URL。

复核时 5173 服务提供的 loader/handler 与当前 staging 字节一致；loader 包含全路径转换。将上述 22 个逻辑路径交给当前 resolver，全部生成 `蜡历牢磐其捞胶` 路径，无韩文候选；逐一请求官方 port 80，22 个转换后的路径均返回 404 HTML。此结果证明当前官方这些具体路径不可用，不证明所有素材缺失，也不证明附件运行时加载了哪个历史 loader。

本轮最小修复保留共享转换逻辑，修改 resolver 的错误信息：明确标记 logical path，附带实际 resolution attempts 的 URL 和原因。增加生成 Worker 回归测试，覆盖全部 22 个失败纹理在主/备用源的 TCP GET 请求行及错误回传；测试先因丢失 URL 失败，再通过。不会为了隐藏韩文而改写包内清单或缓存键，也不会把 Lua/LUB 改为远程资源。

附件第 3872 行的 `36/41` 超时等待五组 navigation 数据；前文失败名为 `_krpri.lub`，这是另一个包内资源/配置问题，不是韩文路径转换问题。该日志仍有 Vite client WebSocket CSP 错误，亦不能用它解释这 22 个官方 404。

本轮已重生成 Worker、core 清单和 dist；聚焦测试 33/33 通过，lint、typecheck、build、audit:iwa、diff --check 通过。完整测试 168 通过、3 失败：`core-assets.test.ts` baseline counts、`module-inventory.test.ts` baseline test existence、`v2-regression-runner.test.ts` baseline execution，均因外部 ROWeb 基线缺失。未签名、部署或登录真实账号，未完成真实 IWA 画面验收。Dev Proxy 关闭并重新打开 IWA 可加载新 Worker；Signed Bundle 仍需按下文流程重打本地测试包。

## 后续修正：所有远程资源使用发布文件名

用户指出编码规则应覆盖所有资源后，已将下文初次修复的“登录目录别名候选”替换为共享 resolver 的全路径转换。所有远程被动资源的每一级目录和文件名都按 EUC-KR/CP949 字节 → GBK 名称转换；不再请求韩文 URL，也不再把已有中文名称反向转换为韩文。ASCII、包内清单路径、已有缓存逻辑键保持不变。完整策略见 `resource-sources.md`。

新增在线证据：`data/sprite/인간족/몸통/남/초보자_남.spr`、女性对应 `.act`、`data/wav/버튼소리.wav` 均为 404；转换后的 `牢埃练/个烹/巢/檬焊磊_巢.spr`（183563 bytes）、`牢埃练/个烹/咯/檬焊磊_咯.act`（48276 bytes）和 `滚瓢家府.wav`（66950 bytes）均为 200。测试覆盖纹理、SPR/ACT、模型、GND/GAT/RSW、音频、混合中文/韩文名称和备用源，并实际执行生成的 Worker 检查 TCP 请求路径。这验证统一路径规则，不代表逐一下载了全部游戏素材。

本轮重新生成 Worker、core 清单与 dist 后，lint、typecheck、build、audit:iwa、diff --check 通过；完整测试 151 通过、3 失败，仍为下文列出的三个外部基线 ENOENT。没有签名、部署或真实账号登录。

## 证据与原因

完整 Console 附件已读取（6958 个逻辑行，含重复异步调用栈）。两张 `/tmp/codex-clipboard-*.png` 附件在本次环境中不存在；没有声称已查看截图。没有使用真实账号登录。

入口是 `public/.well-known/manifest.webmanifest` 的 `start_url: /` → `index.html` → `src/main.ts` → `bootstrapV2Client()` → `/runtime/Online.js`。bootstrap 在动态导入前注入 ROConfig、Direct TCP factory 和包内清单。原版运行时继续执行 `GameEngine.init → Thread.init → Renderer.init → loadFiles → Client.init([])`。参考页面同样加载 Online.js，但先加载自己的配置；只读取了参考配置的非敏感启动字段。

日志第 19 行证明 WebGL2 renderer 成功，第 1068 行已进入 `LoginEngine.init`，第 1319 行选择 `WinLoginV2`。没有证据表明初始化被某个未捕获异常中止。最早直接影响画面的失败是第 24 行 `bgi_temp.bmp` 解析失败；第 2134/2405 行是 `bg_login.tga` 加载失败；第 4043 行之后是全部 12 块登录背景失败。

原版 `GameEngine.loadFiles` 设置 `DB.onProgress → Background.setPercent`。`DB.init` 统计四组完成回调：地图音乐表、地图名称表、消息表（TXT 后继续 CSV）、资源别名表；字体另行异步读取。失败也调用完成回调，因此 100% 不是全部图片成功。`DB.onReady → CLIENT_FILES_ALIAS → loadClientInfo → ScrollBar/Cursor.init → GameEngine.reload → onReload → LoginEngine.init`；日志证明这条后续路径执行了。参考页的相对资源源、缓存和加载时长不同，未看到进度界面不能证明它没有该流程。

黑背景和透明登录框的共同原因是资源路径：`DB.INTERFACE_PATH` 是 `data/texture/유저인터페이스/`，官方已发布文件却在 `data/texture/蜡历牢磐其捞胶/`。旧 resolver 只修复单字节乱码和部分 CJK→韩文，不生成这个目录别名。部分错误路径返回 HTTP 200 HTML，resolver 拒绝内容后直接跳到备用源，未继续同源候选。备用源当前 DNS 不可用，不能补足缺失资源。

此外，参考配置设置 `forceLegacyLoginSkin: true`；IWA 没有该值，以 `packetver=20211103` 自动选择 WinLoginV2。官方源的新版 `bt_start_normal.bmp` 返回 404；参考使用的旧版 `win_login.bmp` 和 `btn_connect*.bmp` 均有效。修复恢复该显式皮肤选择，不修改封包版本，也没有用额外背景覆盖初始化问题。

原版 input 和 button 是透明样式，图形由 `ui-image` / data-background 加载。`createWinLogin → GUIComponent._prepare → installLastROLogin` 将账号面板作为原版 `#WinLogin` 内的子节点，定位在 `left: calc(100% + 12px)`。它随原版 host 挂载/移除，不替代登录框。恢复旧版皮肤时，旧版 `#WinLogin input` 的绝对定位会影响面板输入框；局部覆盖恢复正常排布。选择账号继续填充 `.user/.pass`，不会主动触发 `.connect`。

`Configs.get` 优先级为当前 server → 全局 ROConfig → 调用方默认值，不读取 localStorage 或 IndexedDB 的 renewal 值。原先两层都缺少 renewal，`LoginEngine` 使用默认 false，输出 PRE-RENEWAL；`PacketStructure` 更早在模块初始化时快照 `Configs.get("renewal") || false`。修复在导入前设置全局和当前 server 的 `renewal: true`，按本次明确的复兴后目标生效。`packetver=20211103`、资源根 `client_re` 和复兴开关是不同配置，未推断或变更封包参数。App服现按用户提供的参数开放；真实服务器握手兼容性尚未验证。

日志中的 `client:802` 与本地 Vite `dist/client/client.mjs` 的 WebSocket 构造代码位置一致，URL 携带 Vite HMR token，并使用 isolated-app 主机名拼接 ws 地址。这是开发 HMR 注入，不是游戏网络。日志后续仍进入原版登录，所以它不是上述资源失败的原因。工作区在本次开始前已有关闭 HMR、移除 client 注入以及改用 link 样式表的修改，本次保留并验证，没有放宽 CSP。

原来的“Direct TCP 已就绪”只取决于 API 能力布尔值，不表示 opened 完成或已连接游戏服务器。现已改为“Direct TCP API 可用；尚未连接游戏服务器”。游戏连接仍由原版点击登录流程调用 Direct TCP factory。

## 本次改动

- `src/resources/resource-resolver.ts`：增加已验证的界面目录候选，与原有文件名解码候选组合；HTML 错误页继续同源候选。
- `src/runtime/client-config.ts`：导入前设置 renewal，恢复 forceLegacyLoginSkin。
- `src/runtime/lastro-account-login.mjs`：隔离旧版输入框样式影响，准确描述 TCP 能力状态。
- `test/resource-resolver.test.ts`：HTML/404 后取得正确登录资源并缓存。
- `test/login-config.test.ts`：运行实际 Configs/登录皮肤选择源码，验证模块初始化前和 server 选择后的模式、皮肤及封包版本。
- `test/lastro-account-login.test.ts`：运行实际旧版模板和 CSS，验证面板样式、隔离 IndexedDB 账号填充、无自动登录及随 host 移除。

其余既有未提交修改保留。重新生成了本仓库 `generated` 的 Worker、账号模块和 501 项包内清单，以及 `dist`；未修改外部基线、未提交生成物、未生产签名或部署。

## 验证和限制

- 回归测试先复现资源解析失败、renewal=false 和面板 input 的 absolute 定位，修复后通过。
- 在线只读请求确认：启动背景、旧版登录底图、保存开关、登录/退出/注册按钮三个状态和 12 块登录背景均返回有效 BMP。示例 `win_login.bmp` 为 100856 bytes；`t_硅版1-1.bmp` 为 196664 bytes。请求使用现有被动资源 transport 所用的官方 port 80，另对关键路径比较了 HTTPS 响应。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm audit:iwa`、`git diff --check` 通过。
- 完整 `pnpm test`：137 通过、3 失败（27 个测试文件）。失败为 `core-assets.test.ts` 的外部基线数量校验、`module-inventory.test.ts` 的外部测试文件存在性校验、`v2-regression-runner.test.ts` 的外部原版回归执行，均为 `/run/media/parker/7A9F-F871/ROWeb` 不存在导致 ENOENT，未跳过或删除这些校验。
- 新启动 Vite 的 HTML、main/config 模块和浏览器 `Accept: text/css` 样式响应没有 HMR client 引用。普通 fetch 不带 CSS Accept 时 Vite 会按模块返回 CSS 注入代码，这不是 link 的实际请求方式。
- 生产审计允许 origin 仅两个指定源，禁止模式结果为空，包内清单已包含更新后的可执行 Worker/模块。
- Playwright 找不到 `/opt/google/chrome/chrome`；可连接的浏览器只有无 IWA 的内嵌浏览器。因此未完成真实 IWA 截图、画面几何位置、Direct Sockets 权限和游戏登录验收。Node HTTP 资源检查及自动测试不等于真实 IWA 验收。

## 本地启动与打包

本次已更新 `generated` 和 `dist`。Dev Mode Proxy 使用同一安装端口重新启动 Vite，然后重新打开 IWA；不能把普通 localhost 页面当作 IWA：

```bash
cd /home/parker/Development/RO/RoBrowserV2
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm dev --port 5173 --strictPort
```

若该端口被旧实例占用，先在原终端停止旧实例。`--strictPort` 防止自动切换后安装仍指向旧端口。

以后再次修改资源或账号模块，可使用当前仓库已有的 core 快照重建，无需写入外部基线（这不是从空目录导入基线的替代流程）：

```bash
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH node scripts/patch-resource-worker.mjs
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH node scripts/import-core-assets.mjs \
  --client-root /home/parker/Development/RO/RoBrowserV2/generated/core \
  --ro-source-root /home/parker/Development/RO/RoBrowserV2/generated/core \
  --runtime /home/parker/Development/RO/RoBrowserV2/generated/runtime/Online.js \
  --output /home/parker/Development/RO/RoBrowserV2/generated/core
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm build
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm audit:iwa
```

Signed Bundle 安装不会自动读取 dist。本次没有重新签名；使用原来的 disposable test key 生成本地测试包：

```bash
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm bundle:iwa
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm sign:iwa -- --key /home/parker/Development/RO/RoBrowserV2/.local/keys/lastro-v2-disposable-test-key.pem
```

仅在该 key 确实是原测试安装使用的密钥时使用上述路径；不创建新身份替代现有身份。产物路径以命令输出为准，在 Chrome IWA 开发安装页手动安装。优先更新原测试安装，不直接卸载，因为卸载可能清除账号和缓存；若同版本替换被拒绝，需按本地测试发布流程递增 manifest 版本再重建。当前旧 `release/*.swbn` 不能当成本次新包。

最小实机检查：看到原版背景和旧版框、面板在右侧且输入框正常；Console 显示 RENEWAL；选择自有账号仅填充原版输入框。无需为了确认画面点击登录。完整游戏连接、选角和进图仍由用户另行验收。
