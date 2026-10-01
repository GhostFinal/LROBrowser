# LRO助手集成（0.4.17）

本模块由加藤惠开发维护，集成于LRO 进阶客户端。版本保留在源码与诊断中，游戏界面不展示版本号。基于上游 f7f36ab0f8762c59ab5415ccd0e494f0a70b724b。

## 集成范围

客户端启动器按服务器 profile 初始化助手，数据存储于自身 IndexedDB。使用原生 GUIComponent、Common 按钮样式、纹理、光标、窗口焦点和滚动条。没有用户脚本加载或远程执行代码。

包含商店记录/搜索/购物清单/店铺标记与引导、当前目标、伤害统计、物品百科与地图、赏金入口、装备对比、物品总览、队伍血条、首领提示、手动物品搬运、自己时装显示、卡册与装备搭配切换。动作类功能调用客户端原生流程；各模块可独立开关。头像预览使用客户端已有功能，不重复提供助手预览。关于窗口保留署名及游戏内邮件反馈，不显示打赏或项目主页。

近期交互修复包括中文 IME 输入节点保留、隐藏元素不被按钮样式重新显示、系统/游戏双光标冲突、空白处浏览器右键菜单、标题栏随内容滚动，以及同名店/同栏位记录对应。

## 源码与维护

`src/assistant/lro-assistant-standard.mjs` 从既有助手标准版适配而来，已纳入仓库，可直接作为模块源码维护，构建无需原插件 TXT 或作者本机转换脚本。原始来源哈希保留在文件头。`scripts/patch-lro-assistant.mjs` 在构建时为固定的客户端 runtime 提供模块、封包订阅与原生组件桥；关键挂载点变化会使构建失败。生成物仍位于 generated/dist，不纳入提交。

## 网站市场：合并前需确认的限制

正式包代码只读请求 https://ltsd.ro/api/v1/market/search，沿用客户端统一 CSP，构建审计仅增加市场 API origin；不转发游戏账号、密码或会话。市场支持物品名/词条/店名、多词包含匹配、相关度和购物清单置顶。

**当前已验证的使用方式是本地 IWA 开发代理。网站尚未针对正式 IWA origin 配置跨域放行，不能把源码直连描述为正式签名包中已经可用。** 为复现本地行为，提供 `scripts/lro-local/serve-client.mjs` 与固定目的地只读查询服务，仅监听 127.0.0.1。它在开发服务响应中替换市场查询入口，保持生产模块不变。此服务不参与游戏 TCP 通信，不进入正式包，也不是通用 HTTP 代理。

本地验证：先完成构建，再运行 `node scripts/lro-local/serve-client.mjs`，在 Chrome 的 IWA 开发代理安装中使用输出的 localhost 地址。需要保持该进程运行。可用环境变量 LRO_TEST_PORT 调整端口。

维护者应在发布前决定正式市场接入方式（作者批准的 CORS 或正式受控服务），并完成游戏内验收；本 PR 不自动部署、签名或合并。

## 验证

使用仓库固定 Node/pnpm 环境执行 `pnpm lint`、`pnpm typecheck`、`pnpm prepare:runtime`、`pnpm test:assistant`、`pnpm build`。

针对助手的检查：

```sh
node --test test/lro-assistant.node.mjs test/lro-market-api.node.mjs
pnpm exec vitest run test/lro-assistant-integration.test.ts test/lro-navigation-audit.test.ts
node --test scripts/lro-local/local-market.test.mjs
node --input-type=module -e 'import {auditDist} from "./scripts/audit-iwa-dist.mjs"; await auditDist("dist", "release/lro-assistant-audit.json")'
```

已有 Chrome 离线 UI 验证使用真实 GUIComponent/Common/ScrollBar 和模拟游戏数据；不等于实服全模块验证。还需验收换角色、商店数据和词条、目标怪物资料、队友施法、移动/导航、卡册/装备切换及正式包市场跨域行为。静态怪物参考资料的来源和 GPL-3.0-or-later 许可见 lro-monster-reference.md，维护者需审阅整体许可兼容性。

不包含账号、浏览器配置、个人记录、生产私钥或本机运行环境。

## 0.4.17 上游同步

已合并上游 PR #3（a91ac3c），保留账号加密存储模块、启动检查、界面/移动/动画修复及资源完整性审计。助手补丁在上游补丁全部完成后接入；本地市场服务沿用客户端统一响应头。导航测试使用真实资源哈希和运行时别名验证，不放宽上游审计。正式包市场跨域仍待维护者确认。

同时保留后续 f7f36ab 的发布压缩后资源摘要更新，未覆盖维护者的发布修复。世界地图接口改接新版原生资料加载与传送回调，沿用资源预检与地图/账号状态检查。
