# LastRO V2 IWA 本地开发

Phase A 只支持本机手动安装和测试。生产 manifest 不包含 `update_manifest_url`，仓库不保存签名私钥，也不配置自动更新服务。

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

## 本地测试签名

临时测试密钥必须放在仓库外，并明确标记为 disposable test key：

```bash
rtk proxy mkdir -p /tmp/lastro-iwa-disposable-test
rtk proxy openssl genpkey -algorithm ED25519 -out /tmp/lastro-iwa-disposable-test/test-key.pem
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm sign:iwa -- --key /tmp/lastro-iwa-disposable-test/test-key.pem
```

签名脚本只接受仓库外的密钥路径，不会把密钥路径写入发行清单。不要把 `/tmp/lastro-iwa-disposable-test` 或 `release/*.swbn` 提交到 Git。
