# 模块选择与实施方案 V0.1

本方案服务于“新项目按 GitHub 标准流程开发”的目标。本次落地模块实施蓝图、任务入口和采用校验；具体项目选定能力后，再形成该项目的契约、代码、测试和验收记录。

## 1. 交付分层

| 层次 | 产物 | 完成含义 |
| --- | --- | --- |
| 本标准仓库 | 9 类能力蓝图、选择清单、任务模板和验证 | 新项目知道如何选择、设计、实现和验收 |
| 新项目的模块设计 | 实际需求、Module 契约、技术选择和有边界任务 | 所需设计门禁通过后才进入实现 |
| 新项目的功能代码 | 实际适配器、业务集成和测试 | 通过本项目验收；不能仅凭蓝图标记完成 |
| 可复用 Runtime | 经不同项目验证的实现与版本 | 有证据后再回收到标准仓库，单独发布 |

蓝图放在 `playbooks/modules/`，不伪造 `modules/<name>/module.yaml`、可安装包或依赖版本。蓝图目录不是 Runtime 清单；现有 Storage 规格保留，M1-B/C 调度仍暂停。

## 2. 九类能力与边界

| ID | 能力与蓝图 | 核心边界 | 实施风险 |
| --- | --- | --- | --- |
| config | [配置](../playbooks/modules/config.md) | 配置来源、校验、环境隔离；秘密值交凭据系统 | medium；凭据管理/轮换另评 high |
| audit | [审计](../playbooks/modules/audit.md) | 可追踪事件、记录策略、查询与保留 | high |
| identity | [登录身份](../playbooks/modules/identity.md) | 身份验证与会话；用户资料和业务角色单独归属 | high |
| authorization | [权限](../playbooks/modules/authorization.md) | 主体/资源/动作授权；业务规则由项目声明 | high |
| storage | [通用存储](../playbooks/modules/storage.md) | 对象读写、元数据、错误和能力协商 | medium；本地目录/云权限另评 high |
| oss | [阿里云 OSS 适配](../playbooks/modules/oss.md) | 实现存储契约与受限签名；独立适配层 | high |
| media | [媒体](../playbooks/modules/media.md) | 媒体记录、上传状态、处理任务与授权 | high |
| notification | [通知](../playbooks/modules/notification.md) | 消息意图、渠道投递、去重与状态 | medium；认证码/敏感通知另评 high |
| payment | [支付退款](../playbooks/modules/payment.md) | 支付事实、退款、回调与对账；订单定价归业务 | critical |

机器可读入口为 [catalog.yaml](../playbooks/modules/catalog.yaml)。项目特有能力仍由项目自己的需求决定，不为未确认需求预建空模块。

## 3. 实施批次与依赖判断

| 批次 | 工作 | 出口 |
| --- | --- | --- |
| A：需求和基础能力 | 选用/延后/N/A；明确配置、审计和外部服务边界 | 能力选择、来源、owner、风险与项目任务明确 |
| B：首个纵向场景 | 根据需求实现登录/权限或存储/OSS，完成一条真实业务链 | 正常、越权、失败、恢复均有证据 |
| C：相关扩展 | 媒体、通知等实际需要的能力 | 与已用模块集成，不破坏现有行为 |
| D：交易能力 | 有商业需求时单独设计支付、退款与对账 | critical 所需审查、测试和恢复证据齐全 |

这些批次是排期建议，不是所有项目的强制安装顺序：

- 权限需要可信主体，可由身份服务或宿主提供，不强制使用自研登录模块。
- OSS 适配遵循 Storage 契约；Media 使用 Storage 和项目授权接口，不反向把媒体规则塞入存储。
- Notification 接受宿主提供的收件目标，避免反向依赖登录。若验证码是登录前置，应把通知的必要子集提前，或使用既有身份服务。
- Audit 接收受限事件和配置；不因查询权限又让写事件路径依赖整个 Authorization 实现。
- 配置值、时钟、身份、日志等端口可以由现有项目提供。只有采用实际 Module 包时，才填写真实依赖版本和 capability ID。
- Payment 需要订单/金额/交易主体契约，由项目提供；不依赖 Media，不用通知成功作为支付成功条件。

## 4. 从蓝图到 Cursor 任务

1. 在 `docs/PROJECT_PLAN.md` 填写每项能力的采用决定、来源、负责人和所需验证。
2. 用 [模块方案提示词](../agent-prompts/MODULE_PLAN.md) 将选中蓝图转成项目自己的设计。已有库/平台能满足需求时优先适配，记录版本和约束。
3. 需要独立可复用 Module 时，按 `templates/module/` 填写完整契约；只是项目内的小能力时，把边界和证据放在相应专题，不强制拆包。
4. 形成 `规格 → 实现 → 测试 → Review → 验收` 任务链；每项写路径、分支、前置依赖、允许/禁止范围、测试和 Git 授权。
5. Codex 完成所需分析后，Cursor 只执行已定任务。审查按风险分配角色；蓝图存在不代表 Spec/Architecture/Security Gate 已通过。
6. 通过验收后才把实际支持写回模块元数据。只有多个项目的真实证据支持时，才决定提取公共 Runtime。

## 5. 首个验证场景示例

示例采用“登录后上传私有文件”，用于验证标准能产生清晰任务；它不是所有项目的必选功能，也不是本次已部署的应用。

| 任务 | 范围 | 可观察验收 |
| --- | --- | --- |
| EX-001 | 需求、主体/文件归属、状态、测试环境和技术选择 | owner 确认范围；高风险设计有明确评审入口 |
| EX-002 | 复用或接入身份服务、会话和资源授权 | 登录可用；退出/过期后的新请求拒绝；甲不能操作乙的资源 |
| EX-003 | 配置和存储契约，选定 OSS 测试适配器 | 写入、读取、删除、错误映射可验证；旧对象保护符合契约 |
| EX-004 | 服务端授权后签发上传许可，校验完成结果 | 过期、越界、越权和声明不符被拒绝；不把客户端“成功”当作验收依据 |
| EX-005 | 项目集成与独立安全复核 | 正常流程、重放/并发、异常恢复、日志脱敏都有结果；权限结论含未覆盖项 |

OSS 签名许可在有效期内通常仍可使用；退出会话不应被描述为自动撤销已发出的 URL。项目需要即时撤销时，必须另行设计服务端读取或可撤销授权方式并验证。[OSS 预签名 URL 官方说明](https://www.alibabacloud.com/help/en/oss/user-guide/upload-files-using-presigned-urls)

需要真实 OSS 验证时，由具体项目任务确定专属测试资源、命名空间、凭据来源与清理范围；本标准整理不接入现有生产 Bucket。

## 6. 完成定义与交付记录

每个实际模块必须有需求/任务/测试/验收映射，正例、边界、异常、权限与恢复证据；输出当前版本、兼容性、未支持能力、数据变更和真实 Git 状态。功能代码由 Cursor 落地，Codex 做必要评审。

本次标准包的验收：9 个目录项均有实质蓝图；所有引用在源仓库和初始化后的目标中存在；新项目仍从 12 个 pending 阶段、空 selected_modules 和 NOT_RUN 开始；不改变原 Module Schema 或 Runtime Gate。

验证对象：基于下述 main 的本次标准变更；最终提交由交付 PR 的 head SHA 绑定。环境：Node 24.19.0、js-yaml 4.1.1、Ajv 8.20.0；依赖由本次验证环境提供并通过 NODE_PATH 解析，不新增项目依赖或锁文件。

| 标准采用检查 | 结果 |
| --- | --- |
| YAML/JSON 语法及 Issue 元数据 | PASS |
| 标准仓库的链接与当前契约 | PASS |
| 复制清单展开与含特殊字符的参数渲染 | PASS；46 个目标文件 |
| 新项目初始状态、契约及相对链接 | PASS；12 个 pending、空 selected_modules |
| 源与目标蓝图目录、引用及未评估状态 | PASS；9 类蓝图 |
| 缺失蓝图、伪造 Runtime 完成的拒绝检查 | PASS；2 个用例 |
| 缺失源、重复目标、路径越界、Git 元数据的拒绝检查 | PASS；4 个用例 |
| 继承完成状态、残留参数的拒绝检查 | PASS；2 个用例 |
| Agent 提示词执行标签 | PASS |

`node validation/validate-standard.cjs` 汇总：STANDARD_CHECKS=9；NEGATIVE_FIXTURES=8；BOOTSTRAP_FILES=46；STANDARD_VALIDATION=PASS。

`node modules/storage/validation/validate-spec.cjs`：PASS。10 组静态检查涵盖 YAML、Schema、语义/路径、Schema 阴性、语义阴性、14 项需求/测试/验收映射、能力 ID、状态与任务进出条件、文档引用、spec-only 与 Cursor 范围；10 个阴性 fixture 均按预期拒绝。STATIC_VALIDATION=PASS，RUNTIME_TESTS=NOT_RUN。

本次为文档与采用契约增量的实现者复核：模块边界、依赖说明、任务顺序、复制路径和现有契约检查未发现本范围内阻塞；不是独立的项目安全审查。登录/权限/媒体/云凭证/支付的设计条件写入蓝图，各项目仍须重新取得相应证据。

未完成事项：真实项目初始化与端到端使用、各模块功能代码、业务/云集成测试、独立项目安全审查、部署与生产验收均 NOT_RUN。内存中的采用模拟只证明标准文件能正确带入；不代表示例应用已经开发或运行。高风险蓝图内容为设计输入，不作为已审安全实现发布。

实施基线 main：`d31de78217bae3d567a321b98b04a8a7965718a1`。来源分支 `docs/module-adoption-plan-v0.1`，来源提交 `563b3ae626cc9d05b039411b46da41f39ff02264`，已按用户要求经 [PR #2](https://github.com/xyq-dev/agent-project-framework/pull/2) 合并到 main；合并提交 `0e8563b09b7449576d050ceac4007f75218de543`。远端 71 个文件和关键正文与已验证快照一致；本次同步合并交接记录，不包含实际项目或 Runtime 实施。
