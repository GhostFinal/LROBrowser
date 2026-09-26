# 2026-09-26 远程资源启动修复与手工验收

本次修复接在 `02dbfc9` 的 `skipIntro: true` 之后。未改变服务器参数、账号管理或 Direct TCP 实现。

## 已修复的启动链

`GameEngine.loadFiles → Client.init([]) → Worker CLIENT_INIT → 原生 Background/DBManager/登录界面`。

- 跳过本地 GRF picker、旧 quota API 和旧文件系统初始化。
- `Client.getFile/loadFile → Worker se.get/load → se.getHTTP` 使用打包的 `resolvePassiveResource()`。保留原生资源解析器和回调契约。
- 被动资源按 IndexedDB、官方源、备用源顺序读取；TXT/XML/CSV/字体等使用统一扩展名策略，音频也先取得 bytes。
- 可执行文件只从包内清单解析，缺失时返回错误，绝不回退远程。Worker、resolver bundle 和清单由本地签名流程一起生成；必要 patch 锚点或 Worker 缺失时构建失败。
- 无 `TCPSocket` 的页面在导入 V2 前显示 IWA 打开说明。WebGL 等同步启动异常会移除原生 loading 遮罩，让已有错误提示可见。

## 实机反馈的准确边界

用户提供的结果来自 `http://127.0.0.1:5173`，`typeof TCPSocket === 'undefined'`、WebGL2 为 false、Worker 请求为空。V2 的 `Context.checkSupport()` 位于 `Thread.init()` 前；WebGL2 检查抛错解释了该页面没有 Worker 或远程请求。这个结果不能代表已安装 IWA 内的能力检查。

## 在线资源抽查

未携带账号或 Cookie；对 `mp3nametable.txt` 额外使用 disposable IWA 的 Origin 重测了响应头。

| URL / 文件 | 结果 | 原生调用原因 |
| --- | --- | --- |
| `https://game.lastro.cn/ro/client_re/data/mp3nametable.txt` | 200，未返回 `Access-Control-Allow-Origin`；IWA 通过 `game.lastro.cn:80` 的 Direct TCP HTTP/1.1 读取 | `DB.init()` 读取地图音乐表 |
| `https://game.lastro.cn/ro/client_re/data/mapnametable.txt` | 200 | `DB.init()` 读取地图名称 |
| `https://game.lastro.cn/ro/client_re/data/msgstringtable.txt` | 200 | `DB.init()` 读取界面字符串 |
| `https://game.lastro.cn/ro/client_re/data/texture/%EC%9C%A0%EC%A0%80%EC%9D%B8%ED%84%B0%ED%8E%98%EC%9D%B4%EC%8A%A4/bgi_temp.bmp` | 404 | `Background.setImage("bgi_temp.bmp")`；失败回调允许继续启动 |
| `https://clientdata.ltsd.ro/ro/client_re/data/mp3nametable.txt` | DNS `ENOTFOUND` | 官方源失败后的备用源 |

官方缺少 CORS 许可与备用源未解析是外部限制。客户端不再依赖浏览器 Fetch 读取官方源，而是通过受限 Direct TCP HTTP/1.1 transport 读取 port 80；未修改远端服务，未增加代理、任意 origin 或远程 executable fallback。启动代码不需要目录索引，也没有猜测索引 URL。

## Chrome 手工验证

1. 当前 5173 Vite 实例已核对全部 20 个 runtime URL：200、JavaScript MIME、内容 SHA-256 与包内清单一致；清单为 JSON，共 500 项。此次无需重启 Vite，关闭旧窗口后重新打开或刷新 IWA 即可。若自行重启，保持安装时使用的端口，避免 Vite 自动切换端口。
2. Dev Mode Proxy 已指向当前 5173 时无需删除或重新安装。若安装指向其他端口，先让 Vite 使用原端口，或在 Chrome 的 IWA 开发安装界面使用正确地址重新安装。不要把普通 localhost 标签页作为游戏入口。
3. signed bundle 使用本仓库 `release/lastro-v2.swbn` 重新手动安装；当前版本未增加且无自动更新，旧包不会自行变成新包。Chrome 若拒绝替换同版本，再移除旧测试安装并重新安装；卸载可能清除该 IWA 保存的账号和缓存，先自行保留所需信息。
4. 从 Chrome 应用入口启动 LastRO IWA。Console 检查 `location.origin` 应为 `isolated-app://...`、`typeof TCPSocket` 应为 `function`，并检查 `!!document.createElement('canvas').getContext('webgl2')`。若仍为 false，检查真实 Chrome 的图形加速设置及 `chrome://gpu`，客户端无法绕过 WebGL2 要求。
5. 应跳过 “Drop GRF / data files here” 和 “START NOW”，进入原生资源加载流程；在资源可读取的前提下出现带账号管理、2转/3转切换及 App服禁用项的原生登录界面。
6. Console 的三个阶段标记依次为 `waiting for resource worker`、`resource worker ready; initializing renderer`、`initializing remote client resources`。只有第一条时检查 Worker 错误；到第二条但没有第三条时检查 Renderer/WebGL；到第三条时检查资源请求。
7. Network/DevTools 检查 `LastROThreadEventHandler.js`、`ThreadEventHandler.js`、`lastro-resource-loader.js`、`core/executable-assets.json` 的状态与 MIME。被动资源只应由 Direct TCP 连接到上述两个源的 port 80，包内 Lua/WASM 请求不应发往远程。开启 Preserve log，检查 Direct Sockets 权限、DNS、连接超时、HTTP 404、CSP 及 `Unable to resolve passive resource` 错误。

真实 Chrome IWA 的登录、选角和进图尚未验收；备用源行为由确定性测试覆盖，未声称其公网已可用。

## 本地候选包

- 验证：22 个 test files / 120 个 tests、typecheck、lint、build、audit、签名和 `git diff --check` 通过。
- disposable Web Bundle ID：`z76ba7i7gn6g4nrctphwbtfbppzzc5zit75ivm63mfddmew3og5aaaic`，不能作为生产身份。
- SHA-256：`d69af5e80d9ec8a747f87cc74aa2ce531d343b36f5b5510daeca42f6bb9f74c8`。
- 测试密钥在被 Git 忽略的 `.local/keys/`；生成物与 `.codegraph/` 不提交。
- 已有构建限制：world-data 转换仍需按既有脚本准备；本次只保证资源 Worker patch 的重复生成，不宣称从完全空 staging 一步重建所有历史产物。
