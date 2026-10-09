# Agent Toolkit for AWS 设置记录

设置日期：2026-10-08

## 结果

- AWS CLI 旧版 `2.35.11` 已通过 Windows Installer 卸载，退出码为 0；旧版程序 `D:\AWS\aws.exe` 和旧版产品注册项均已不存在。
- 新版 AWS CLI `2.37.10` 已安装并验证可运行。
- 新版位置：`C:\Users\24048\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe`。
- 在刷新后的环境中，`aws` 命令解析到上述新版。
- 本次使用用户个人 AWS 项目，AWS Experience 为全新 AWS Experience；不使用 Team11。
- 命名 profile：`aws-personal`；个人项目区域：`us-east-2`。
- 浏览器登录成功；STS 身份验证成功，项目关联的 AWS 账号尾号为 `7824`。
- 原有 `default` 配置内容和 `credentials` 文件均经比对确认保持不变。

## Toolkit、技能和 MCP

官方安装命令成功退出：

```powershell
aws configure agent-toolkit --yes --region us-east-1 --profile aws-personal
```

`us-east-1` 是 Agent Toolkit 服务区域，和本项目业务资源区域 `us-east-2` 分开使用。

- Codex 已安装 24 个默认 AWS 技能，位于 `C:\Users\24048\.agents\skills`。
- `list-available-skills` 成功返回 114 个远端技能条目。
- 按 Codex 的实际 MCP 配置启动代理完成 `initialize` 和 `tools/list`，成功返回 8 个工具。
- MCP 代理初次启动依赖已下载，检查版本为 `mcp-proxy-for-aws 1.7.0`。
- 所有本次生成的 `aws-mcp` 配置都只绑定 `AWS_MCP_PROXY_PROFILES=aws-personal`。
- 安装器生成的 command、args、timeout 和 transport 保持原样，仅追加 profile 环境变量；OpenCode 按其 schema 使用 `environment` 字段。
- 对存在安装前备份的配置做了结构比对，原有设置保持不变。AWS 安装器调用 Codex CLI 后省略的 3 个其他 MCP 显式选项已按安装前值补回。

安装器自动配置了以下客户端：Codex、Claude Code、Cline、Cursor、Gemini CLI、Kiro、OpenCode、Windsurf。OpenClaw 和 Pi 只安装了技能，安装器不提供它们的自动 MCP 设置；本次未为这两个客户端进行额外手动集成。

本项目正在使用 Codex，其规则写入 `AGENTS.md`，包含完整的官方全新 AWS Experience 规则，以及本项目个人 profile、区域和授权边界。

## 下一步

重启 Codex 并打开新会话，以加载新增 MCP、技能和项目规则。可以先输入：

> 使用 aws-personal 检查我的个人 AWS 项目连接，确认选定区域为 us-east-2；先只读检查，不创建资源。

新终端中可手动核验：

```powershell
aws --version
aws sts get-caller-identity --profile aws-personal --region us-east-2
aws agent-toolkit list-available-skills --profile aws-personal --region us-east-1
```

按官方设置说明，凭证有效期为 12 小时，可在 90 天内续期而无需重新通过浏览器认证。需要重新登录时：

```powershell
aws login --profile aws-personal --region us-east-2
```

以后切换其他 AWS 项目时，先使用新的命名 profile 登录，再将名称加入 MCP 的 `AWS_MCP_PROXY_PROFILES` 空格分隔列表，并重启客户端。本次列表只有 `aws-personal`。

本次完成的是工具和连接设置，未部署云资源，也未进行 Bedrock 模型调用验证。

## 配置与备份

- AWS CLI 配置：`C:\Users\24048\.aws\config`
- Codex MCP 配置：`C:\Users\24048\.codex\config.toml`
- Codex 项目规则：`C:\Users\24048\Desktop\NBA\AGENTS.md`
- 安装前配置与安装器生成配置的备份：`C:\Users\24048\.aws\codex-toolkit-backups\20261008`
- 本地检查材料和卸载日志：`C:\Users\24048\AppData\Local\Temp\codex-aws-toolkit-setup`

备份保留在用户配置目录中，未复制到项目文档中；本记录不包含密钥或登录令牌。

## 官方来源

- [用户指定的设置说明](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md)
- [AWS 设置排障说明](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup-troubleshooting.md)
- [全新 AWS Experience 规则](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/rules/aws-starter-rules.md)
- [Agent Toolkit CLI 指南](https://docs.aws.amazon.com/agent-toolkit/latest/userguide/aws-cli.html)
- [Codex MCP 配置](https://developers.openai.com/codex/mcp)
