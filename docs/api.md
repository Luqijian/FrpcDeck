# HTTP API

FrpcDeck 的所有接口都在 `/api` 下。除健康检查、登录和认证状态外，均需要有效的会话 Cookie。

实例相关接口通过 `X-FrpcDeck-Instance: <实例ID>` 请求头选择实例；SSE 使用 `?instance=<实例ID>`。未提供或实例已不存在时使用服务端当前实例。

## 认证与请求约定

- 首次启动自动生成随机管理员密码并打印到容器日志；登录响应包含 `mustChangePassword: true`。
- 强制改密完成前，只有认证/改密接口可用，其他受保护接口返回 `403 password-change-required`。
- 登录成功后服务端设置 `frpcdeck_session` Cookie（HttpOnly、SameSite=Lax、7 天）。
- 每个实例有独立的配置、运行状态、日志和备份；切换实例时客户端需要更新 `X-FrpcDeck-Instance` 请求头。
- 修改类请求（POST/PUT/PATCH/DELETE）必须带 `X-FrpcDeck: 1` 请求头。
- 请求带 `Origin` 时，服务端会检查其 Host 是否与当前 Host / `ALLOWED_ORIGINS` 一致。
- JSON 请求体；默认大小限制 3 MB。
- 错误响应格式：

```json
{
  "error": {
    "code": "validation-failed",
    "message": "请填写 frps 服务器地址",
    "details": {
      "issues": [
        {
          "path": "serverAddr",
          "label": "服务器地址",
          "level": "error",
          "message": "请填写 frps 服务器地址"
        }
      ]
    }
  }
}
```

## 接口列表

### 系统与认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 公开。返回应用版本、运行时长、frpc 版本 |
| GET | `/api/auth/status` | 初始化/登录/是否必须改密 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 清除会话 |
| POST | `/api/auth/credentials` | 修改用户名和密码（首次登录强制使用） |
| POST | `/api/auth/password` | 仅修改密码的兼容接口 |
| GET | `/api/instances` | 列出实例与运行摘要 |
| POST | `/api/instances` | 创建实例（`name`、可选 `config`） |
| PATCH | `/api/instances/:id` | 重命名实例 |
| DELETE | `/api/instances/:id` | 删除实例（body 需 `confirm` 为实例名或 `DELETE`） |
| POST | `/api/instances/:id/activate` | 设置默认实例 |
| GET | `/api/docs` | 文档列表与分类 |
| GET | `/api/docs/:slug` | 读取一篇 Markdown 文档 |
| GET | `/api/docs/assets/*` | 文档截图等静态资源 |
| GET | `/api/bootstrap` | 首屏数据：当前实例、实例列表、配置、设置、运行状态、版本、警告 |

登录请求：

```json
{"username":"admin","password":"initial-password-from-logs"}
```

登录响应：

```json
{
  "initialized": true,
  "username": "admin",
  "mustChangePassword": true,
  "authenticated": true,
  "user": "admin"
}
```

强制改密请求：

```json
{
  "currentPassword": "initial-password-from-logs",
  "username": "new-admin-name",
  "password": "new-password-at-least-8"
}
```

`/api/auth/setup` 已废弃，始终返回 `409 already-initialized`；首次密码由服务端生成。

### 配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/config` | 当前配置、保存时间、校验提示、生成的 TOML |
| PUT | `/api/config` | 应用完整配置；body：`{"config": {...}, "restart": true}` |
| GET | `/api/config/toml` | 返回 `text/plain` 的运行配置 |
| GET | `/api/config/download?format=toml\|json` | 下载配置 |
| POST | `/api/config/validate` | 校验草稿，返回 issues / TOML / verify 结果 |
| POST | `/api/config/import` | 解析 TOML/YAML/JSON/INI；`parseNumberRangePair` 转为批量代理 |
| PUT | `/api/config/raw` | 直接应用 TOML（可包含批量端口模板） |
| POST | `/api/config/reset` | 重置配置，body 必须 `{"confirm":"RESET"}` |

`PUT /api/config` 的返回：

```json
{
  "config": {},
  "savedAt": "2026-01-01T00:00:00.000Z",
  "issues": [],
  "verify": {"ok": true, "unavailable": false, "output": "..."},
  "apply": {"attempted": true, "ok": true, "error": ""},
  "runtime": {}
}
```

即使配置已保存，只要 frpc 启动失败，`apply.ok` 也会是 `false`，HTTP 仍返回 200。前端会展示启动错误，草稿不会被丢弃。

导入请求：

```json
{
  "filename": "frpc.toml",
  "content": "serverAddr = \"frps.example.com\"\n"
}
```

如果文件包含 `parseNumberRangePair` 端口范围，每个 range 块会变成一个批量代理；普通 `[[proxies]]` 仍然是单条代理：

```json
{
  "format": "toml",
  "config": {
    "proxies": [
      {
        "name": "Sunshine-TCP",
        "type": "tcp",
        "localIP": "192.168.50.152",
        "batch": {
          "localPorts": "47984-47990,48010",
          "remotePorts": "47984-47990,48010",
          "namePattern": "Sunshine-TCP-{localPort}"
        }
      }
    ]
  },
  "warnings": ["已识别 1 个批量端口配置，将作为单个代理展示"],
  "toml": "{{- range $_, $v := parseNumberRangePair \"47984-47990,48010\" \"47984-47990,48010\" }}\n..."
}
```

批量代理使用 `batch.localPorts`、`batch.remotePorts` 和 `batch.namePattern` 描述；`namePattern` 支持 `{localPort}` / `{remotePort}`。`PUT /api/config` 直接提交同样的对象即可保存和导出。代理数量按可视化条目计算，一个批量条目只占一个。

普通代理和批量代理共用 `proxies` 数组；`/api/runtime` 返回的是 frpc 实际展开后的运行时代理，前端会按名称模板聚合批量状态。

### 运行状态

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/runtime` | frpc 进程、代理状态、访问器（配置数）、管理接口状态 |
| POST | `/api/runtime/start` | 启动 frpc |
| POST | `/api/runtime/stop` | 停止 frpc |
| POST | `/api/runtime/restart` | 重启 frpc |
| GET | `/api/logs?limit=500` | 最近日志（最多 2000 行） |
| GET | `/api/logs/download` | 下载文本日志 |
| GET | `/api/events` | SSE：`hello` / `log` / `state` 事件 |

`/api/runtime` 返回示例：

```json
{
  "process": {
    "status": "running",
    "pid": 123,
    "connected": true,
    "connection": "online",
    "version": "0.71.1",
    "adminAvailable": true,
    "uptime": 42
  },
  "proxies": [
    {
      "name": "ssh",
      "type": "tcp",
      "status": "running",
      "local_addr": "127.0.0.1:22",
      "remote_addr": "0.0.0.0:6001",
      "err": ""
    }
  ],
  "visitors": []
}
```

### 设置与备份

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/settings` | 自动启动 / 自动重启设置 |
| PUT | `/api/settings` | 更新设置，body：`{"autoStart":true,"autoRestart":false}` |
| GET | `/api/backups` | 备份列表 |
| POST | `/api/backups` | 创建备份 |
| DELETE | `/api/backups/:id` | 删除备份 |
| GET | `/api/backups/:id/download` | 下载 JSON 备份 |
| POST | `/api/backups/:id/restore` | 恢复并应用备份 |

## SSE 日志

`GET /api/events` 返回 `text/event-stream`：

```text
retry: 3000

event: hello
data: {"logs":[...],"runtime":{...},"lastSeq":123}

event: log
data: {"seq":124,"t":"2026-01-01T00:00:00Z","level":"info","source":"stdout","text":"..."}

event: state
data: {"process":{...},"proxies":[...],"visitors":[...]}
```

- 每 20 秒发送 `: ping` 心跳。
- 代理支持 SSE；反向代理需要关闭缓冲。
- 日志流中会过滤面板自己访问 frpc 管理 API 的访问日志。

## 状态码

| 状态码 | 含义 |
| --- | --- |
| 200 | 成功 |
| 400 | 请求体/配置解析错误 |
| 401 | 未登录或会话失效 |
| 403 | 缺少 CSRF 头、来源不允许或必须先修改初始密码 |
| 404 | 资源/备份不存在 |
| 409 | 账户已自动初始化 |
| 422 | 字段校验失败、frpc 拒绝配置 |
| 429 | 登录尝试过多 |
| 500 | 内部错误（不会返回密码/令牌） |

## cURL 示例

```bash
# 登录并保存 Cookie
curl -s -c cookie.txt \
  -H 'Content-Type: application/json' \
  -H 'X-FrpcDeck: 1' \
  -d '{"username":"admin","password":"your-password"}' \
  http://127.0.0.1:8080/api/auth/login

# 读取运行状态
curl -s -b cookie.txt http://127.0.0.1:8080/api/runtime

# 应用配置
curl -s -b cookie.txt \
  -H 'Content-Type: application/json' \
  -H 'X-FrpcDeck: 1' \
  -X PUT \
  -d '{"config":{...},"restart":true}' \
  http://127.0.0.1:8080/api/config

# 跟随 SSE
curl -N -b cookie.txt http://127.0.0.1:8080/api/events
```

## 兼容性

当前 API 为 v1，路径和语义在 1.x 内保持兼容。破坏性变更会记录在 [CHANGELOG](../CHANGELOG.md) 并提升主版本。
