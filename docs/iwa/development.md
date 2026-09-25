# LastRO V2 IWA 本地开发

Phase A 只支持本机手动安装和测试。生产 manifest 不包含 `update_manifest_url`，仓库不跟踪签名私钥，也不配置自动更新服务。

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

运行本地打包脚本会在 `.local/keys/` 中生成并复用 disposable test key：

```bash
./scripts/build-sign-local.sh
```

脚本也接受 `LASTRO_IWA_SIGNING_KEY=/absolute/path/to/test-key.pem` 覆盖默认路径。签名脚本不会把密钥路径写入发行清单；`.local/keys/` 和 `release/*.swbn` 已加入 Git 忽略规则。
