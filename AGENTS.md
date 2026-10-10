# NBA 项目协作约定

## 当前 AWS 配置（2026-10-10 用户更新）

- 当前产品是视频＋NBA 数据→带数据图形和中文语音解说的 MP4→Web 播放/下载。新输入通过注册素材 ID 接入，不限定两段样片；接口与真实验证见 `docs/AI_FILM_GUIDE.md`。
- 当前验证只检查功能、数据、时间和产物，按用户指令不做布局优化或手机端检查。解说语义仍待独立人工复核。

- 当前赛事工作使用 `nba` / `us-east-1`；所有区域 API 显式指定 `--profile nba --region us-east-1`。`nba-sso` 仅用于登录和承担 source_profile，不用于业务操作。
- 目标项目 `414702114718`，工作角色 `NBAHackathonParticipantRole`；已通过 STS 核验。禁止回退到 `default` 或未经明确切换使用个人项目。
- 用户已授权开始付费模型调用；采用小样本、显式输出上限、无自动重试并记录实际 usage/费用。该授权不扩大为云部署、训练或平台评测。
- 赛事指南指定的 `global.anthropic.claude-sonnet-4-6` 已通过真实调用核验；它从 us-east-1 入口进行 Global 路由，不代表推理完全位于单一区域。
- 现有应用已接入赛事 Bedrock，默认候选 Sonnet 4.6、可配置 Qwen3-VL；已通过一次真实网页 SDK 调用。接入说明见 `docs/BEDROCK_INTEGRATION.md`。MCP 配置仍未迁移，不得将网页接入当作 AWS MCP 已接入。

## 历史个人项目配置（保留，不适用于当前赛事调用）

- 本项目使用用户个人 AWS 项目，AWS Experience 为全新 AWS Experience。
- AWS CLI profile 固定为 `aws-personal`；普通 AWS CLI 操作显式传入 `--profile aws-personal --region us-east-2`。
- 当前不使用 Team11，不使用现有 `default` 凭证作为回退。
- 区域资源使用 `us-east-2`。仅 Agent Toolkit 安装和技能目录服务按官方要求访问 `us-east-1`；这不授权在该区域部署业务资源。
- AWS MCP 的 `AWS_MCP_PROXY_PROFILES` 只配置 `aws-personal`。
- 遵循用户提供的全局协作规则；部署、发布、删除和产生云资源的操作需要对应的明确授权。Toolkit 设置本身不授权部署示例应用。
- 官方规则与本项目约定冲突时，以本项目约定和用户当前明确指令为准。

## AWS 官方全新 Experience 规则（仅个人项目适用）

来源：https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/rules/aws-starter-rules.md
读取日期：2026-10-08

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- Before starting a task, check whether a relevant AWS skill is available. Load the skill with retrieve_skill and prefer its guidance over general knowledge.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion
<!-- END AWS Agent Toolkit rules -->
