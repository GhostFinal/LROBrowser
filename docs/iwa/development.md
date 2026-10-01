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
Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Chrome 的 Dev Mode IWA 安装需要本地 HTTPS、manifest 和 Web Bundle 文件。测试 Web Bundle ID 由临时密钥派生，不能作为未来生产身份。Direct TCP 只在支持 Direct Sockets 的 IWA 环境中启用，普通浏览器不会降级到 WebSocket 或代理连接。

点击小地图画布可在小地图旁打开原生导航窗口；传送面板的路线自动寻路在后台执行，不自动弹出导航窗口。后台寻路期间手动打开或关闭导航窗口不影响路线继续。

赏金狩猎接入原生任务列表及小地图下方的任务简报，目标和计数使用服务器 `HUNTINGLIST` 数据；普通任务仍保留原任务协议的状态、期限和目标。怪物链接按实际 `mobGID` 打开世界地图搜索。含明确 NAVI 坐标或经过任务内容核对的结构化路线可直接前往，复用地图资源和坐标预检；只有地图名时不补造坐标。收包、NPC 对话结束和打开任务窗会刷新赏金，地图已就绪时每 15 秒补充刷新，切地图暂停，退出角色清空。可运行 `node scripts/preview-quests.mjs` 生成离线原生任务预览，不连接游戏或发送实际传送包。

## 地图加载诊断

RSW、GND、GAT 下载和缓存命中均先校验文件格式、结构和长度；无效缓存会删除后重新下载，部分下载不会写入缓存。地图和模型资源的下载总时限为 60 秒，Direct TCP 的连接和无数据等待时限仍为 8 秒。世界地图传送也会先读取 RSW 中实际引用的 GND/GAT，检查失败时不发送传送请求，保留当前位置。

真正进入地图后的加载错误会在原生消息窗显示失败文件和原因。控制台保留 `[LastRO] Map load failed` 原始错误，最近一次诊断还保存于当前客户端的 `localStorage.LastROMapLoadFailure`，便于重启后追查；这里只记录资源错误，不记录账号或密码。

## 本地测试签名

运行本地打包脚本会在 `.local/keys/` 中生成并复用 disposable test key：

```bash
./scripts/build-sign-local.sh
```

脚本也接受 `LASTRO_IWA_SIGNING_KEY=/absolute/path/to/test-key.pem` 覆盖默认路径。签名脚本不会把密钥路径写入发行清单；`.local/keys/` 和 `release/*.swbn` 已加入 Git 忽略规则。
