# 2转服本地人工验收

状态：待在本机 Chrome IWA Dev Mode 中执行。

记录字段：

- 日期：
- 操作系统：
- Chrome 版本：
- 安装方式：Chrome IWA Dev Mode，本地 signed `.swbn`
- Web Bundle ID：从 `release/release-manifest.json` 填写
- Bundle SHA-256：从 `release/release-manifest.json` 填写
- 测试账号：只记录服务器 profile 和结果，不把密码写入仓库

验收项：

- [ ] 新增账号，绑定 `lastro-2x`
- [ ] 重启 IWA 后账号仍在 IndexedDB
- [ ] 登录成功
- [ ] 角色选择成功
- [ ] 进入地图
- [ ] 移动和地图切换成功
- [ ] 背包、技能、任务、公会、卡片典藏加载成功
- [ ] 自动战斗和快速传送成功
- [ ] 清理并重新填充被动资源缓存成功
- [ ] DevTools/网络记录确认连接使用 Direct TCP，未出现 WebSocket、WSS 或 proxy
- [ ] App服显示 `App服协议参数尚未完成验证`，不会发起 `TCPSocket`

失败项、时间戳和相关日志：

```text
在这里记录，不要写入真实密码、私钥或私人基础设施地址。
```
