# FrpcDeck 文档

FrpcDeck 是 frp 客户端 **frpc** 的可视化配置与运行管理面板。文档按使用场景组织：

| 文档 | 内容 |
| --- | --- |
| [部署指南](deployment.md) | Docker Compose、host 网络、环境变量、反向代理、升级与备份 |
| [配置说明](configuration.md) | frpc 配置覆盖范围、代理类型、插件、访问器、导入与校验 |
| [架构设计](architecture.md) | 前后端模块、数据流、进程管理、安全模型、数据目录 |
| [HTTP API](api.md) | REST 接口、认证、CSRF、SSE 日志、错误格式 |
| [本地开发](development.md) | 开发环境、目录结构、测试、贡献配置字段的方式 |
| [故障排查](troubleshooting.md) | 常见部署、连接、登录、日志与 Docker 问题 |
| [贡献指南](../CONTRIBUTING.md) | 提交 Issue / PR 的流程与代码约定 |
| [安全策略](../SECURITY.md) | 漏洞报告与安全部署建议 |
| [变更日志](../CHANGELOG.md) | 版本历史 |

界面截图位于 [`screenshots/`](screenshots/)。

## 快速导航

- 第一次使用：先读[部署指南](deployment.md)，再在面板中完成「连接配置 → 代理 → 应用更改」。
- 想确认 frpc 的某个字段在哪里填写：读[配置说明](configuration.md)。
- 想二次开发或接入自动化：读[架构设计](architecture.md)和[HTTP API](api.md)。
- 部署出问题：优先看[故障排查](troubleshooting.md)。

文档中的命令默认在项目根目录执行。需要替换的值用 `<尖括号>` 表示。
