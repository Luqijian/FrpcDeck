# 部署指南

FrpcDeck 以单容器运行：容器内同时包含 Node 服务、前端静态资源和 frpc。推荐通过 Docker Compose 部署。

## 环境要求

- Linux 服务器（amd64 / arm64 / arm），或支持 Docker 的 NAS
- Docker 24+、Docker Compose v2
- 使用公开镜像：能访问 `ghcr.io`
- 从源码构建：额外需要能访问 Docker Hub、npm registry 和 GitHub Releases
- 建议至少 512 MB 可用内存、1 GB 可用磁盘

如果服务器访问 GitHub 较慢，可以通过 `FRP_DOWNLOAD_BASE` 构建参数替换 frp 下载源（需同时提供校验和文件）。使用公开镜像不需要构建，也不需要访问 GitHub。

## 公开镜像

FrpcDeck 提供 GHCR 公开镜像，支持 `linux/amd64` 和 `linux/arm64`：

```text
ghcr.io/luqijian/frpcdeck:latest
ghcr.io/luqijian/frpcdeck:1.0.0
ghcr.io/luqijian/frpcdeck:v1.0.0
```

镜像页面：<https://github.com/Luqijian/FrpcDeck/pkgs/container/frpcdeck>

```bash
docker pull ghcr.io/luqijian/frpcdeck:latest
```

### 直接 docker run

Linux host 网络：

```bash
docker run -d \
  --name frpcdeck \
  --restart unless-stopped \
  --network host \
  -e FRPC_WEBUI_PASSWORD='change-me' \
  -e TZ=Asia/Shanghai \
  -v "$PWD/frpcdeck-data:/data" \
  ghcr.io/luqijian/frpcdeck:latest
```

bridge 网络需要映射面板端口：

```bash
docker run -d \
  --name frpcdeck \
  --restart unless-stopped \
  -p 8080:8080 \
  --add-host host.docker.internal:host-gateway \
  -e FRPC_WEBUI_PASSWORD='change-me' \
  -e TZ=Asia/Shanghai \
  -v "$PWD/frpcdeck-data:/data" \
  ghcr.io/luqijian/frpcdeck:latest
```

> 使用预构建镜像时，`IMAGE_TAG` 控制 Compose 拉取的标签；`latest` 跟随主分支，生产环境建议固定为 `1.0.0` 或 `v1.0.0`。

## 快速开始（bridge 网络）

```bash
git clone https://github.com/Luqijian/FrpcDeck.git
cd FrpcDeck

cp .env.example .env
# 编辑 .env，至少修改 FRPC_WEBUI_PASSWORD
# 可选：IMAGE_TAG=1.0.0

docker compose pull
docker compose up -d
```

访问 `http://<服务器IP>:8080`，使用 `.env` 中设置的用户名和密码登录。

> 必须设置 `FRPC_WEBUI_PASSWORD`。Compose 文件使用了必填变量检查，密码为空时启动会直接报错。
>
> `docker compose pull` 会拉取 GHCR 镜像；如果本地已有源码构建的镜像，也可以直接 `docker compose up -d`。

从源码构建（开发或自定义 frp 版本）：

```bash
docker compose up -d --build
```

首次启动后：

1. 打开「连接配置」，填写 frps 地址、端口和 token / OIDC；
2. 打开「代理」，添加 TCP、HTTP、STCP 等规则；
3. 点击右上角「应用更改」。FrpcDeck 会：
   - 用 `frpc verify` 校验生成配置；
   - 将配置写入数据目录的 `frpc.toml`；
   - 启动或重启自己的 frpc 进程。

## Linux 推荐：host 网络

默认的 `compose.yaml` 使用 bridge 网络，只映射 8080 端口。此时容器里的 `127.0.0.1` 是容器自身，不是宿主机。

如果要代理宿主机上的服务，有两种方式：

1. 把代理的「本地地址」写成 `host.docker.internal`（compose 已配置 `host-gateway`）；
2. 使用 host 网络：

```bash
docker compose -f compose.host.yaml pull
docker compose -f compose.host.yaml up -d
```

host 网络下：

- frpc 可以直接访问宿主机的 `127.0.0.1`；
- 面板直接监听 `WEBUI_PORT`（默认 8080）；
- 不需要也不支持 `ports` 映射。

> Docker Desktop（Windows / macOS）对 host 网络支持有限，Linux 服务器和大多数 NAS 推荐使用 host 模式。

## 接入现有 frpc.toml

有两种方式：

**方式一：首次启动前放入数据目录**

```bash
mkdir -p data
cp /path/to/frpc.toml data/frpc.toml
docker compose pull
docker compose up -d
```

首次启动时，如果没有 `data/config.json`，FrpcDeck 会导入 `data/frpc.toml`，并创建一份备份到 `data/backups/`。

**方式二：登录后从面板导入**

「连接配置 → 导入配置」支持 TOML / YAML / JSON / 旧版 INI。导入会替换当前草稿，检查无误后再点击「应用更改」。

> 如果原 frpc 进程仍在运行，请先停止它，避免同名的远程端口或代理名冲突。面板启动的是独立的 frpc 进程，不会接管系统里已有的 frpc 服务。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `FRPC_WEBUI_PASSWORD` | 无 | 管理员密码。设置后由环境变量托管，面板内不能修改；每次启动同步。未设置时首次访问进入初始化向导。 |
| `FRPC_WEBUI_USERNAME` | `admin` | 管理员用户名。 |
| `IMAGE_TAG` | `latest` | Compose 使用的 GHCR 镜像标签，例如 `1.0.0`。 |
| `PORT` | `8080` | 面板监听端口（容器内）。 |
| `HOST` | `0.0.0.0` | 面板监听地址。 |
| `DATA_DIR` | `/data`（镜像内） | 配置、认证、备份、会话密钥的持久化目录。 |
| `FRPC_BIN` | `frpc` | frpc 可执行文件路径；镜像内为 `/usr/local/bin/frpc`。 |
| `COOKIE_SECURE` | `false` | 通过 HTTPS 访问时设为 `true`。 |
| `TRUST_PROXY` | `false` | 位于反向代理后时设为 `true`，以获取真实客户端 IP。 |
| `ALLOWED_ORIGINS` | 空 | 反向代理改写 Host 时允许的 Origin，逗号分隔。 |
| `TZ` | `Asia/Shanghai` | 容器时区。 |
| `LOG_LEVEL` | `info` | Node/Fastify 日志级别。 |

## 构建参数

以下参数仅在使用 `docker compose up -d --build` 从源码构建时生效。

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `FRP_VERSION` | `0.71.1` | 镜像内 frpc 版本。建议与 frps 版本保持一致。 |
| `FRP_DOWNLOAD_BASE` | GitHub Releases | frp 下载前缀，可替换为镜像站。 |
| `NODE_IMAGE` | `node:22-alpine` | 构建与运行基础镜像。 |

示例：

```bash
FRP_VERSION=0.71.1 IMAGE_TAG=local docker compose build --no-cache
IMAGE_TAG=local docker compose up -d
```

> 镜像标签由 `IMAGE_TAG` 控制；`FRP_VERSION` 只影响构建产物。固定使用公开镜像时，无需设置 `FRP_VERSION`。

## 数据、备份与升级

默认数据目录是项目下的 `./data`：

```text
data/
├─ auth.json        # 管理员密码哈希与版本
├─ config.json      # 面板内部配置模型
├─ frpc.toml        # 生成的 frpc 配置（0600）
├─ settings.json    # 自动启动/自动重启
├─ session.key      # 会话签名密钥
└─ backups/         # 最近 30 份配置备份
```

- 每次应用配置前自动备份；也可以「设置 → 备份与恢复」手动创建。
- 备份文件包含 frps token 和代理密钥，请按机密数据保护。
- 升级：

```bash
git pull
docker compose pull
docker compose up -d
```

升级到固定版本：在 `.env` 中设置 `IMAGE_TAG=1.0.0`（或新版本号），然后重新执行上面的命令。

- 数据在 `./data`，重建容器不会丢失。
- 迁移服务器时，把整个 `data/` 目录复制到新服务器即可（注意权限 0600）。

## 反向代理与 HTTPS

建议只通过 HTTPS 暴露面板。Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name frpcdeck.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 实时日志
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

Caddy：

```caddyfile
frpcdeck.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

同时设置：

```dotenv
COOKIE_SECURE=true
TRUST_PROXY=true
ALLOWED_ORIGINS=https://frpcdeck.example.com
```

反向代理必须把 `Host` 原样传递给面板，或通过 `ALLOWED_ORIGINS` 显式允许来源，否则修改类请求会被 CSRF 来源检查拒绝。

## 常见网络与 Docker 构建问题

### Docker 构建阶段 DNS 失败

部分 OpenWrt / iStoreOS 或企业内网的 Docker 构建容器无法访问外部 DNS（`EAI_AGAIN`）。改用 host 网络构建：

```bash
DOCKER_BUILDKIT=0 docker build --network host \
  -t ghcr.io/luqijian/frpcdeck:local --build-arg FRP_VERSION=0.71.1 .
IMAGE_TAG=local docker compose -f compose.host.yaml up -d --no-build --force-recreate
```

### 面板打不开

1. 确认容器状态：`docker ps --filter name=frpcdeck`
2. 查看健康检查：`docker inspect frpcdeck --format '{{.State.Health.Status}}'`
3. 本机验证：`curl http://127.0.0.1:8080/api/health`
4. 检查云防火墙 / 路由器 LAN 访问规则是否放行 8080。
5. bridge 模式下确认 `ports` 映射正确；host 模式下确认端口没有被其他程序占用。

### 本地服务无法连接

- bridge 网络：本地地址用 `host.docker.internal`，或者给容器加 `--add-host`。
- host 网络：使用真实的内网 IP 或 `127.0.0.1`。
- 如果服务在另一个容器内，把 FrpcDeck 加入同一 Docker 网络，或使用宿主机可达的地址。

## 端口与进程

| 端口 | 用途 | 是否对外 |
| --- | --- | --- |
| 8080 | FrpcDeck 面板 | 按需开放（建议只开给可信网络） |
| 7400 | frpc 管理 API（默认 127.0.0.1） | 不对外 |
| frps 端口 | frpc 主动连接 frps | 出站 |
| 代理远程端口 | 由 frps 监听，不是本机 frpc 监听 | 由 frps 负责 |

面板固定启用 frpc 的 `webServer` 管理接口来读取实时状态，因此不提供关闭开关。默认只监听 `127.0.0.1:7400` 并使用随机密码；可以在「连接配置 → 管理接口」中调整，但不要直接暴露到公网。

## 安全清单

- 设置强密码，并定期轮换；
- 面板不要直接暴露在公网；必须公网访问时使用 HTTPS 反向代理；
- 不要把 `data/` 提交到 Git；
- 限制 8080 端口的来源 IP；
- 代理的 token、secretKey、TLS 私钥都保存在 `data/`，按服务器密钥管理；
- 升级前备份 `data/`；
- 如果使用环境变量管理密码，修改密码后必须重建容器。
