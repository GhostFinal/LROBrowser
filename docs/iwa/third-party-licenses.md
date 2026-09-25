# 第三方许可证门禁

核查日期：2026-09-25。状态：**本机私有测试不阻塞；再分发许可尚未确认**。

此次只读核查在以下基线目录递归查找 LICENSE、LICENCE、COPYING、COPYRIGHT、NOTICE、AUTHORS 及其常见后缀文件，均未找到：

- `/run/media/parker/7A9F-F871/ROWeb/v2`
- `/run/media/parker/7A9F-F871/ROWeb/ro/src`
- `/run/media/parker/7A9F-F871/ROWeb/ro/client_re/System`
- `/run/media/parker/7A9F-F871/ROWeb/ro/client_re/data/luafiles514/lua files`

这不等于断言这些文件没有许可，而是当前提供的基线中没有足以完成发布门禁的可核验材料。`Online.js` 内检测到 MIT 与 GPL 文字标记，但尚未验证对应组件、版本、版权声明、完整许可条款以及组合产物的源码提供义务，不能据此批准完整 bundle。

| 类别 | 来源 | 当前证据与状态 |
| --- | --- | --- |
| V2 主 bundle 与 Worker | `v2/Online.js`、三个 Worker 文件 | 仅定位文件；上游版本、完整许可与再分发条件待核验 |
| LastRO 定制模块及资源路径工具 | `v2/lastro-*.mjs`、`lastro-resource-path.js` | 定位到 13 个生产模块；作者、授权范围与继承许可待核验 |
| 世界地图和怪物数据 | `ro/src/DB/worldData.js`、`ro/src/DB/Mobs/mob_db.js` | 未导入；未发现覆盖数据的独立再分发证据 |
| 游戏 Lua/LUB | `client_re/System` 和 `data/luafiles514/lua files` | 未导入；未发现覆盖脚本的独立再分发证据 |
| Lua/WASM 运行时 | 尚未进入 Task 7 定位步骤 | 组件、版本、许可证与打包方式均待核验 |

用户在后续指令中明确允许暂不处理分发许可，继续本机运行和调用。因此 Phase A 的本机私有导入、构建和测试签名不再因许可证据缺失而阻塞，第三方文件仍只进入被 Git 忽略的 staging 和本机构建产物。此授权不包含公开源码、上传 bundle 或部署。

将来分发前再为上述类别提供或定位可核验的许可证/授权材料，明确覆盖的文件或版本，以及源码提交和签名 bundle 再分发的条件。不得把“可以公开下载”“本地已能运行”或局部库的许可标记视为完整授权。
