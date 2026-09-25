# LastRO V2 IWA 客户端设计

状态：设计已由用户确认，可据此编写和执行 implementation plan。本文只定义 LastRO 玩家使用的开源 V2 客户端，不把它扩展成通用 RO 私服客户端。

## 目标

在独立的 `RoBrowserV2` 仓库中构建一个可签名和安装的 Isolated Web App（IWA），保留现有 V2 客户端及所有 LastRO 定制模块，使用 Direct Sockets 的 `TCPSocket` 直接连接 LastRO 登录服、角色服和地图服，并彻底移除开源版本中的 WSS 连接路径。该仓库不属于也不依赖露天商店网站项目。

客户端只把启动和执行所需的核心代码、Worker、WASM、Lua/LUB、协议配置及少量启动素材打包进 IWA。大型游戏资源在本地缓存未命中时先从 LastRO 官方站点获取，失败后再从 `clientdata.ltsd.ro` 备用资源源获取。

## 已确认的产品约束

1. 网络连接只能使用 Direct TCP；不能保留 WSS、WebSocket 或 WSS fallback。
2. 账号密码允许明文保存在用户自己的浏览器/IWA 本地存储中。
3. 一个本地账号必须绑定一个 LastRO 服务器配置。
4. 登录界面必须支持 `3转服`、`2转服` 和 `App服` 三个服务器入口。
5. `App服` 暂时只有一个不可登录的显式占位项，不能使用猜测参数连接。
6. Lua 5.1 WASM 运行时以及会被执行的 `.lua`、`.lub` 文件必须随签名 IWA 发布，不能从网络下载后执行。
7. 现有 V2 的 LastRO 协议、界面、寻路、地图、卡片典藏、自动战斗及其他适配模块必须保留。
8. IWA 不携带完整 `ro/client_re`；大型地图、纹理、Sprite、模型和音频按需下载。
9. 开源包不得包含当前私人快捷登录账号、密码、XKore 账号或私人服务器入口。
10. 首期以 Windows/Linux 桌面版 Chrome 的 IWA 能力为验收基线；Edge 只有在实机证明具备等价 IWA 与 Direct Sockets 能力后才列为支持环境。
11. 生产代码允许的远程被动资源 origin 只有 `https://game.lastro.cn` 和 `https://clientdata.ltsd.ro`；导入快照或构建产物中出现其他绝对远程 origin 必须失败，避免私人基础设施地址进入公开仓库。

## 基线与迁移策略

当前 `/run/media/parker/7A9F-F871/ROWeb/v2` 是唯一已验证可工作的 V2 行为基线。其中主客户端 `Online.js` 是约 12.7 MB 的已构建产物，LastRO 定制能力主要位于独立的 `lastro-*.mjs`、配置文件和 Worker 中。现有 `ro/src` 并不足以从零重建完整 V2。

因此首期采用“兼容性基线迁移”而不是重写：

- 将经过清理的 V2 核心快照纳入 `vendor/v2`。
- 将可维护的 IWA 壳、服务器配置、账号存储、Direct TCP、资源解析和构建逻辑放入 `src`。
- 对 `Online.js` 做少量、有测试锚点的必要修改：接入 Direct TCP、移除 WSS 路径、接入本地核心资源、清除 CSP 不兼容的动态代码执行。
- 保留独立 `lastro-*.mjs` 模块及其回归测试，不把它们重新揉回不可维护的单体补丁中。
- 后续如果恢复出完整 roBrowser 源码构建链，可以逐模块替换 vendored bundle，但这不是首期 IWA 的前置条件。

## 目标仓库结构

```text
RoBrowserV2/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  public/.well-known/manifest.webmanifest
  config/
    v2-allowlist.json
    core-asset-roots.json
  src/
    main.ts
    app-shell.ts
    styles.css
    direct-sockets.d.ts
    network/direct-tcp-socket.ts
    servers/server-profile.ts
    servers/server-profiles.ts
    accounts/account-store.ts
    accounts/account-ui.ts
    resources/resource-policy.ts
    resources/resource-resolver.ts
    runtime/client-bootstrap.ts
  .staging/v2/
    Online.js
    LastROThreadEventHandler.js
    ThreadEventHandler.js
    PathFindingWorker.js
    lastro-*.mjs
    lastro-resource-path.js
  .staging/core/
    executable-assets.json
    System/*.lua
    data/luafiles514/lua files/**/*.lua
    data/luafiles514/lua files/**/*.lub
    data/world/*.json
  test/
    *.test.ts
  scripts/
    import-v2-snapshot.mjs
    build-core-manifest.mjs
    audit-iwa-dist.mjs
    bundle-iwa.mjs
    sign-iwa.mjs
  docs/iwa/
    development.md
    release.md
    resource-sources.md
    server-profiles.md
```

`RoBrowserV2` 是独立项目，不导入、不修改也不发布露天商店网站、市场 Worker、MySQL 协议或网站 V1 iframe/POPUP 代码。

`.staging` 始终被 Git 忽略。只有在第三方许可证和再分发权得到记录后，允许公开提交的 V2 源文件才可以迁入 `vendor/v2`；无论是否提交源码，签名产物中实际包含的每个第三方文件都必须通过发布许可证门禁。

## 服务器配置模型

```ts
export type ServerAvailability = "available" | "unavailable";

export interface LastROServerProfile {
  id: "lastro-3x" | "lastro-2x" | "lastro-app";
  displayName: string;
  availability: ServerAvailability;
  unavailableReason?: string;
  loginAddress?: string;
  loginPort?: number;
  version?: number;
  langtype?: number;
  packetver?: number;
  packetKeys?: readonly [number, number, number];
  clientHash?: string;
  clientVer?: number;
  lastroNid?: number;
  resourceProfileId: "lastro-public";
}
```

### 已知服务器值

| 字段 | 3转服 | 2转服 | App服 |
| --- | --- | --- | --- |
| `id` | `lastro-3x` | `lastro-2x` | `lastro-app` |
| `availability` | `available` | `available` | `unavailable` |
| 地址 | `45.248.8.68` | `45.248.8.68` | 不设置 |
| 登录端口 | `28569` | `26569` | 不设置 |
| `version` | `45` | `45` | 不设置 |
| `langtype` | `3` | `4` | 不设置 |
| `packetver` | `20211103` | `20211103` | 不设置 |
| packet key 1 | `1205481659` | `1205481659` | 不设置 |
| packet key 2 | `453061308` | `453065404` | 不设置 |
| packet key 3 | `592073252` | `592073252` | 不设置 |
| `clientHash` | `83ba069fd7c9e7683c435cecd507b18d` | `83ba069fd7c9e7683c435cecd507b18d` | 不设置 |
| `clientVer` / `lastroNid` | `3` | `5` | 不设置 |

3转服数据来自 2026-09-25 获取的官方 `https://game.lastro.cn/ro/Online.js?70.84`：`ClientVer=3` 分支给出 `45.248.8.68:28569`，封包加密初始化给出第二个 key `453061308`。发布前仍须完成一次真实 Direct TCP 登录、选角和进图验证。

2转服沿用当前 V2 已工作配置。官方脚本的 `ClientVer=5` 服务器表使用 `langtype=3`，但当前 V2 配置使用 `langtype=4`，且另有独立的 GBK/Big5 字符集设置。首期以当前已验证的 `langtype=4` 为准，不因官方表的显示值擅自改动；如果实机出现登录或文本问题，再以抓包和回归结果修正。

App服配置固定为：

```ts
{
  id: "lastro-app",
  displayName: "App服",
  availability: "unavailable",
  unavailableReason: "App服协议参数尚未完成验证",
  resourceProfileId: "lastro-public"
}
```

App服不可被选作账号绑定目标，不能发起 socket，界面显示“尚未支持”。未来通过合法授权的抓包或二进制分析获得参数后，应单独提交一份设计和实施计划。

## Direct TCP 网络层

新增 `DirectTcpSocket` 适配现有 V2 网络管理器所期待的接口：

```ts
export interface LegacyClientSocket {
  connected: boolean;
  isZone?: boolean;
  handoffPending?: boolean;
  onComplete?: (success: boolean) => void;
  onMessage?: (buffer: ArrayBuffer) => void;
  onClose?: (error?: unknown) => void;
  send(buffer: ArrayBuffer): void;
  close(): void;
}
```

实现使用 `new TCPSocket(host, port, { noDelay: true, keepAlive: true })`，等待 `opened` 后保存 `ReadableStream` 和 `WritableStream`，启动单一读循环，并用有序 Promise 队列串行写入封包。读到的 `Uint8Array` 转成边界准确的 `ArrayBuffer` 后交给现有 `NetworkManager.receive`。

登录服返回的角色服和地图服地址继续由现有 V2 协议处理，所有阶段都通过同一个 Direct TCP factory 建立连接。角色服/地图服不是写死在 profile 中。

生产包必须满足：

- 不包含 `new WebSocket`、`wss://`、`ws://`、`socketProxy` 或 WSS bridge 配置。
- 不包含 Electron `NodeSocket` fallback。
- `TCPSocket` 不存在或权限被拒绝时，显示受支持环境说明并停止登录。
- 不提供 WSS 降级选项。
- 连接、读、写和关闭错误只触发一次终止回调，避免重复弹窗或重复重连。

IWA manifest 必须包含：

```json
{
  "permissions_policy": {
    "direct-sockets": ["self"],
    "cross-origin-isolated": ["self"]
  }
}
```

## 本地账号与登录界面

账号使用独立 IndexedDB 数据库 `lastro-iwa`，版本 `1`，object store 为 `accounts`。数据不加密：

```ts
export interface LocalAccount {
  id: string;
  serverProfileId: "lastro-3x" | "lastro-2x";
  label: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}
```

界面流程：

1. 顶部服务器选择显示 3转服、2转服和 App服。
2. App服禁用并显示原因。
3. 切换可用服务器后，只显示绑定该服务器的本地账号。
4. 用户可以添加、编辑、删除账号，也可以不保存直接输入账号密码。
5. 选择已保存账号会把账号密码填入登录表单；点击登录后再调用 V2 登录入口。
6. 登录成功时更新 `lastUsedAt`，按最近使用排序。
7. 删除服务器配置不会发生，因为三个 profile 是只读内置配置。

IWA 使用自己的独立 origin 和 IndexedDB，不读取任何外部网站的 `localStorage` 账号。本期不增加云同步、主密码、加密、跨设备同步或服务端账号存储。

## 资源解析与缓存

资源分成“签名包内可执行核心”和“可远程获取的被动数据”两类。

### 包内核心

- HTML、CSS、JS、MJS、Worker。
- Wasmoon Lua 5.1 和其 WASM。
- 客户端会执行的 `.lua`、`.lub`。
- 协议表、封包长度、LastRO 自定义模块。
- 世界地图 AMD 数据转换后的 JSON。
- 登录和错误界面所需的最小字体、图标、图片。

这些路径由 `core/executable-assets.json` 显式列出。构建时缺少任意条目立即失败，运行时也不能回退到网络。为了先保证所有现有模块可用且绝不执行远程脚本，首个版本收录受控脚本根目录中的完整执行集合：`data/luafiles514/lua files` 下现有 473 个 Lua/LUB（约 47.42 MiB）以及 `System` 下现有四个 Lua 文件（其中两份 itemInfo 合计约 28 MiB）。这仍远小于完整 `client_re`，且不会包含地图、模型、纹理或音频。后续只有在完整功能回归和资源访问报告证明某个脚本不可达后，才能通过单独提交从清单移除，不能在首期凭文件名猜测裁剪。

### 远程被动数据

典型扩展名包括 `.spr`、`.act`、`.bmp`、`.png`、`.jpg`、`.tga`、`.gat`、`.gnd`、`.rsw`、`.rsm`、`.rsm2`、`.str`、`.wav`、`.mp3`、`.ogg`。

加载顺序：

```text
IWA 包内核心
    ↓ 未命中且允许远程
现有本地持久缓存
    ↓ 未命中
https://game.lastro.cn/ro/client_re/
    ↓ 网络错误、CORS、超时、404、5xx、HTML 响应或无效内容
https://clientdata.ltsd.ro/ro/client_re/
    ↓ 失败
向客户端返回明确资源错误
```

资源路径继续使用当前 `lastro-resource-path.js` 的 GBK/EUC-KR 混合路径恢复、扩展名小写、物品图标大小写和历史 Sprite 后缀 fallback。每个根地址都要尝试同一组候选路径，不能只在 404 时 fallback；CORS 和网络错误也必须进入下一来源。

2026-09-25 的抽样表明，`game.lastro.cn/ro/client_re/...` 对已知特效资源返回 404。`clientdata.ltsd.ro` 是为本产品规划的备用资源域名，当前产品尚未上线，因此暂未配置可解析 DNS；本文不声称它现已可访问。发布前必须验证该域名的 DNS、TLS、CORS/CORP、Range/缓存响应以及至少一组已知资源。备用资源源 fallback 是正常运行路径，不应被记录成异常崩溃。

音频不再直接把第一个 URL 交给 `<audio>`。Worker 应通过统一 resolver 获取 ArrayBuffer，保证官方失败时仍能切换备用资源源并写入本地缓存。

## Lua/LUB 与 IWA 执行边界

Wasmoon Lua 5.1 可以随 IWA 发布，因为 IWA CSP 允许包内 WebAssembly。允许执行的脚本必须来自签名包，Lua 文件更新等同于客户端代码更新，需要发布新的 `.swbn` 版本。

以下行为禁止：

- 从官方站或备用资源源下载 `.lua`、`.lub` 后交给 Wasmoon 执行。
- 通过 Direct Sockets 接收脚本并执行。
- 使用 `eval`、`new Function`、字符串形式的动态 import 或远程 `<script>`。

当前 `lastro-worldmap-details.mjs` 使用 `Function('define', source)` 解析 AMD 数据，必须在构建时把 `worldData.js` 和 `mob_db.js` 转成 JSON，运行时只读取包内 JSON。当前 bundle 内 Lodash 的 `Function("return this")()` 与 template 编译器也必须通过 CSP 兼容构建、删除未使用代码或确定性的产物转换消除。生产 `dist` 的静态审计为硬门槛。

## LastRO 模块保留策略

迁移清单至少包含当前 V2 的以下独立模块及对应测试：

- 导航调试、路径寻路和快速传送目录。
- LastRO packet framing、packet length override、SECOND_CHECK。
- V1 行为迁移、自动战斗字段与补给槽。
- 世界地图名称、楼层、怪物和掉落详情。
- PVP/map state、旧 Doram 特效兼容。
- 卡片典藏协议、数据和 UI。
- 道具移动限制、改造、附魔、随机词条等适配。
- 观察模式、地面物品、购买商店和现金商店处理。
- 公会徽章请求与小地图公会标记。
- 角色外观、服装、调色板、帽子表及状态字符集适配。
- 任务面板、迷雾默认值和登录/进图兼容逻辑。

`import-v2-snapshot.mjs` 使用显式 allowlist 导入这些文件，并生成文件名、大小和 SHA-256 清单。任何 allowlist 文件缺失、额外私人配置被发现或 hash 未被评审，都应使导入失败。原始 `Online.js` 中预期存在的 WebSocket/NodeSocket 旧实现只在导入清单中记录命中数量；完成 Direct TCP patch 后，生产 staging 和 `dist` 中出现这些旧传输实现才是硬失败。

导入器与最终产物审计必须提取所有 `http://`、`https://`、`ws://` 和 `wss://` 绝对 origin。除文档、测试夹具和明确批准的 Chrome 官方文档链接外，生产运行时代码只允许上述两个 HTTPS 被动资源 origin；任何其他 origin 都按“私人或未评审基础设施”处理并阻止公开提交/发布，而不是把该地址加入公开黑名单。

## IWA 构建、签名与发布

Vite 输出到 `dist`。构建脚本随后：

1. 验证 manifest、CSP header、Direct Sockets permissions policy。
2. 验证所有包内引用都能在 `dist` 中解析。
3. 验证 executable asset 清单完整。
4. 扫描禁止的远程脚本、动态 JS 编译和 WSS 字符串。
5. 使用固定版本的 `wbn@0.0.9` 创建 `.wbn`。
6. 使用固定版本的 `wbn-sign@0.3.1` 和仓库外的 Ed25519 私钥生成 `.swbn`。
7. 输出版本、SHA-256、Web Bundle ID、文件大小和核心资源清单摘要。

私钥及口令永不提交。IWA 身份绑定签名公钥，因此正式发布前必须确定并备份唯一生产签名密钥；开发密钥签出的应用与正式密钥签出的应用被浏览器视为不同应用。

首期必须支持：

- Dev Mode Proxy 调试。
- 从本地 Signed Web Bundle 安装验证。
- 可重复的 unsigned bundle 构建。
- 使用外部私钥的手动签名流程。

自动更新清单、Chrome IWA allowlist 申请和正式托管渠道可以在首个可安装版本通过后继续完成，但 release 文档必须说明这些限制。

## 错误处理

- 不支持 `TCPSocket`：启动页阻止进入游戏并显示 Chrome/IWA 环境说明。
- App服：不创建 socket，显示 `App服协议参数尚未完成验证`。
- Direct TCP 连接失败：显示服务器名称、目标地址和端口，不显示密码。
- 资源官方源失败：静默进入备用资源源；两个源均失败时显示逻辑资源路径和已尝试来源，不显示账号数据。
- 包内核心缺失：视为构建/安装损坏，停止启动，不能从网络补代码。
- IndexedDB 不可用：允许当前会话手动登录，但禁用保存账号并显示本地存储错误。
- Lua 初始化失败或 CSP 审计失败：阻止发布，而不是在运行时回退到网络脚本。

## 测试与验收

### 自动测试

- 三个服务器 profile 的精确值和 App服禁用规则。
- 本地账号 CRUD、服务器过滤、明文往返和最近使用排序。
- `DirectTcpSocket` 的打开、分片读取、有序写入、handoff 和幂等关闭。
- `TCPSocket` 缺失/权限拒绝时没有 WebSocket fallback。
- 资源缓存命中、官方成功、官方失败、备用资源源成功、两个源失败。
- 所有路径编码候选在两个根地址上保持相同顺序。
- `.lua/.lub/.js/.mjs/.wasm` 永不进入网络 resolver。
- 世界地图 JSON 与原 AMD 数据的关键记录等价。
- 当前 V2 `lastro-*.test.mjs` 迁移并通过。
- `dist` 不含私人账号、已知私人密码模式、XKore、WSS、`eval`、`new Function` 或远程 script。
- `.wbn` 和 `.swbn` 可解析，manifest/version 与构建版本一致。

### 手工验收

1. 在支持 IWA 的 Chrome 安装签名 bundle。
2. 添加绑定 2转服的本地账号，重启应用后账号仍存在。
3. 通过 Direct TCP 完成 2转服登录、选角、进图、移动和地图切换。
4. 验证登录服到角色服、地图服的动态 handoff 都不使用 WSS。
5. 使用 3转服账号完成同样流程，确认候选配置可发布。
6. App服不可登录，且不会创建网络连接。
7. 清空资源缓存后观察一次官方优先、备用资源源 fallback；再次进入时命中本地缓存。
8. 打开角色、地图、背包、技能、任务、公会、卡片典藏、自动战斗和快速传送功能，确认没有因瘦身漏包。
9. 在 DevTools Direct Sockets 视图确认 TCP 目标与服务器返回的 handoff 地址一致。

## 发布完成标准

- `RoBrowserV2` 仓库能独立构建并生成可安装 `.swbn`。
- 生产包只有 Direct TCP 网络实现，不存在 WSS fallback。
- 2转服完整流程通过；3转服在正式发布前通过完整流程。
- App服明确禁用，不使用虚构参数。
- 本地账号绑定服务器并在 IWA 内明文持久化。
- 核心 Lua/LUB 完全来自签名包，远程资源只包含被动游戏数据。
- 当前 V2 的 LastRO 独立模块及其回归测试全部保留。
- 核心包没有完整 `client_re`，且生成可审计的包内文件和体积报告。
- 仓库不包含私人账号、密码、签名私钥或生产秘密。

## 非目标

- 不实现通用私服服务器编辑器。
- 不为普通浏览器保留网页版 WSS 模式。
- 不实现 App服逆向、协议猜测或抓包工作。
- 不实现账号加密、主密码、云同步或账号服务端存储。
- 不将完整 RO 客户端资源打入 IWA。
- 不修改或集成露天商店网站、市场 API、MySQL 数据库或网站 V1 iframe 客户端。
