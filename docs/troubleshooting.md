# 故障排查

## 面板相关

### 面板打不开

1. 容器是否在运行：

```bash
docker ps --filter name=frpcdeck
docker logs --tail 100 frpcdeck
```

2. 健康检查：

```bash
docker inspect frpcdeck --format '{{.State.Health.Status}}'
curl http://127.0.0.1:8080/api/health
```

3. 从另一台机器测试 `http://<服务器IP>:8080`。如果本机可以、局域网不行，检查防火墙 / 安全组是否放行 8080。
4. host 网络模式请确认 8080 未被其他程序占用：`netstat -ltnp | grep 8080`。
5. bridge 模式请确认 compose 的 `ports` 映射存在，并且没有改成其他宿主端口。

### 登录提示尝试次数过多

登录失败按 IP 限流：10 分钟内 8 次失败后封禁 10 分钟。等待封禁结束，或重启容器清除内存中的限流记录（不会影响密码）。

### 忘记密码

- 使用环境变量管理密码（推荐）：修改 `.env` 中的 `FRPC_WEBUI_PASSWORD`，执行：

```bash
docker compose -f compose.host.yaml up -d --no-build --force-recreate
```

- 未使用环境变量：停止容器，删除 `data/auth.json`，启动后会重新进入初始化向导。代理配置不会丢失。

### 修改密码后旧会话仍有效 / 不生效

- `FRPC_WEBUI_PASSWORD` 存在时，UI 不能修改密码；环境变量会在每次启动时覆盖。
- 修改 `.env` 后必须重建容器（不是只 `restart`，因为环境变量在创建容器时注入）。

### HTTPS 下登录后立刻掉线

确认：

```dotenv
COOKIE_SECURE=true
TRUST_PROXY=true
```

并确保反向代理传递了 `X-Forwarded-Proto: https`。

### 反向代理后出现 403 Origin / CSRF 错误

面板要求修改请求带 `X-FrpcDeck: 1`，并校验 `Origin` 与 `Host` 一致。反向代理应保留原始 `Host`；如果改写了 Host，请设置 `ALLOWED_ORIGINS=https://your-panel.example.com`。

## frpc 相关

### 面板显示 frpc 二进制未找到

- 官方镜像内置 `/usr/local/bin/frpc`，正常不会缺失；
- 本地运行需设置 `FRPC_BIN`；
- 确认文件有可执行权限。

### frpc 启动后立即退出

打开「运行日志」查看最后错误，常见原因：

- frps 地址或端口错误；
- token 不匹配；
- `loginFailExit = true` 且首次登录失败；
- webServer 管理端口被占用；
- 配置中的证书、插件路径不可访问；
- frps 版本与 frpc 不兼容。

可以暂时关闭 `loginFailExit` 让 frpc 持续重连，再从日志观察。

### 代理显示「同步中」或管理接口不可访问

- frpc 进程可能仍在启动，等待几秒；
- frpc 的 `webServer.addr/port/user/password` 被修改后需要应用配置并重启；
- 检查 `webServer.port` 是否与其他程序冲突；
- 如果日志正常但管理接口不可访问，确认地址没有被改成容器不可达的接口；面板默认访问 `127.0.0.1:<port>`。

### 本地服务无法连接

- bridge 网络下 `127.0.0.1` 指容器自身。把本地地址改为 `host.docker.internal`。
- host 网络下使用真实的宿主机地址。
- 服务在另一个容器中时，确保两个容器在同一 Docker 网络，或填写宿主机可达地址。
- 检查宿主防火墙是否允许 frpc 访问目标端口。

### HTTP 代理无法访问

- 域名必须解析到 frps 服务器；
- frps 必须配置 `vhostHTTPPort`；
- 自定义域名或子域名要与 frps 的 `subdomainHost` 匹配；
- 检查 frps 的防火墙和端口映射。

### STCP/XTCP 访问器连不上

- 服务端代理与访问器的 `secretKey` 必须一致；
- `serverName` 是服务端代理名，不是访问器名；
- `serverUser` 需与服务端 frpc 的 `user` 匹配；
- XTCP 受 NAT 类型影响，失败时可配置 `fallbackTo` 回退到 STCP；
- 两边 frpc/frps 版本应兼容。

### 远程端口填 0 后找不到实际端口

保存并启动后，代理列表会读取 frpc 实时状态，显示 `remote_addr` 中的实际端口。也可以在 frps 日志或 dashboard 中查看。

### 想迁移现有 frpc

1. 导出/复制原 `frpc.toml`；
2. 停止原 frpc 进程，避免代理名/端口冲突；
3. 在「连接配置 → 导入配置」导入；
4. 检查未知字段警告和校验结果；
5. 应用配置。

## Docker 与构建

### 构建时报 `EAI_AGAIN`

Docker 构建容器无法解析 DNS。改用 host 网络：

```bash
DOCKER_BUILDKIT=0 docker build --network host \
  -t frpcdeck:0.71.1 --build-arg FRP_VERSION=0.71.1 .
docker compose -f compose.host.yaml up -d --no-build --force-recreate
```

### frp 下载失败

构建需要访问 GitHub Releases。可替换下载源：

```bash
docker build \
  --build-arg FRP_VERSION=0.71.1 \
  --build-arg FRP_DOWNLOAD_BASE=https://your-mirror/frp/releases/download \
  -t frpcdeck:0.71.1 .
```

镜像站需要同时提供 `frp_<version>_linux_<arch>.tar.gz` 和 `frp_sha256_checksums.txt`。

### `permission denied` 写 `/data`

- 使用镜像自带的 entrypoint 时会自动 `chown` 数据目录；
- 如果自行覆盖了 entrypoint 或用 `--user` 启动，需要保证数据目录对容器内 uid 1000 可写；
- Windows 挂载目录请通过 Docker Desktop 的文件共享配置检查权限。

### 数据会丢吗

数据保存在挂载的 `./data`。重建容器、升级镜像不会删除数据。删除 compose 的卷或手动 `rm -rf data` 才会丢失。

## 日志

### 日志页面为空

- frpc 尚未启动；
- frpc 已配置为写文件，且文件路径不可写；
- 浏览器 SSE 被反向代理缓冲：配置 `proxy_buffering off`；
- 日志缓冲区被清空。

### 日志中有大量 frpc 管理 API 访问记录

FrpcDeck 会过滤自身每 4 秒访问 `/api/status` 的访问日志。若仍看到，请确认运行的是当前版本。

### 下载日志包含敏感信息

日志可能包含 frps 地址、代理名、证书路径等。分享日志前请先脱敏。

## 批量端口

### 导入后为什么只显示一个代理

每个 `parseNumberRangePair` 块在面板中就是一个批量代理，不会展开成多行。展开后的代理只在 frpc 运行时出现，面板会聚合显示“批量 N”和运行状态。

### 批量代理怎么修改

点击批量代理行即可编辑：本地/远程端口范围、名称模板、公共传输选项都在同一个编辑器里。修改保存后点击「应用更改」，导出时会重新生成 range 块。

### 提示端口数量不一致

本地端口范围与远程端口范围必须展开为相同数量。例如 `8000-8010` 是 11 个端口，不能与 `9000-9005`（6 个）配对。

### 提示名称模板必须包含 {localPort} 或 {remotePort}

批量名称必须随端口变化，否则会生成重复代理名。例如使用 `my-service-{localPort}`。

### 批量代理状态显示等待/异常

面板会按该批次生成的所有代理聚合状态：全部运行才是“运行中”，部分运行是“等待中”，任一条启动失败是“异常”。可打开运行日志查看具体生成的代理。

### 旧版的模板模式配置怎么办

升级到 1.2.0+ 后，启动时会尝试把旧 `rawTemplate` 转换为批量代理模型。如果转换失败，面板会提示；重新导入原始 `frpc.toml` 即可。

### 任意 Go template 都支持吗

目前只识别 `parseNumberRangePair` 端口范围模式。`if`、自定义函数、复杂变量等模板会返回错误，不会进入单独模式；请改用面板的批量端口编辑器，或使用 frpc 原生配置管理。

## 性能与资源

- 面板常驻内存约 80–150 MB，取决于日志量；
- frpc 自身内存取决于代理数量和流量；
- 构建镜像需要约 1 GB 临时磁盘；
- 日志环形缓冲最多 2000 行，不会无限增长；
- 备份默认最多 30 份。

如果设备内存较小，建议使用 host 网络、减少代理数量，并把 `log.to` 设为文件而非保留大量 stdout 缓冲。

## 仍然无法解决？

请提交 Issue，并附上：

- FrpcDeck 版本、frpc 版本、部署方式；
- 操作系统 / 架构 / Docker 版本；
- 已脱敏的日志；
- 复现步骤；
- 相关配置（务必删除 token、secretKey、域名中的敏感部分）。

安全问题请走 [SECURITY.md](../SECURITY.md) 中的私下报告流程。
