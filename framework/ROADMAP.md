# Framework Roadmap

Roadmap 是方向和里程碑边界，不代表未实现能力已经可用。动态执行状态以 `CURRENT_STATUS.md` 为准。

## 当前优先级 — 项目标准采用

2026-09-08 用户确认首要目标是把完整项目开发流程放在 GitHub，供空目录的新项目采用。

1. **P1 — 标准采用 V0.1**：启动指南、项目模板/复制清单、完整阶段手册、Issue/PR 模板、初始化/执行/评审/交接提示词。
2. **P1.1 — 模块实施蓝图**：配置、审计、登录、权限、Storage、OSS、媒体、通知、支付的边界、任务与验收；接入新项目模板，见[模块实施方案](MODULE_ADOPTION_PLAN.md)。此项交付标准输入，具体功能代码仍按项目实施。
3. **P2 — 首个实际项目应用**：按项目需求裁剪标准，形成需求到发布的真实记录；根据使用中暴露的问题改进模板。
4. **P3 — 按需深化**：再决定具体 Module、可复用实现和自动化优先级。

下文 M0～M4 保留为原 Framework/Runtime 演进路线。M0 已完成；Storage M1-A 规格已完成；用户已恢复 Core/Memory/Local/OSS，当前 Core/Memory 已实测，Local/OSS 待独立审查和实现。新项目采用标准不以 Runtime 路线完成为前提。

## M0 — Framework Core

目标：建立小而完整的 Framework Kernel。

范围：

- Project Lifecycle 和 Module Lifecycle
- Module Standard 与 `module.yaml` Schema
- Agent Workflow、Risk Routing 和 Quality Gates
- Status / Handoff Standard
- 可复用 Module Templates
- Storage Reference Module 里程碑定义

不包含：CLI、Dependency Resolver、Preset Runtime、Marketplace 或完整 Runtime Module。

## M1 — Storage Reference Module

### Goal

用第一个真实、技术栈中立的 Infrastructure Module 验证 Module Standard，而不是追求一次支持所有 Provider。

### Boundary

```text
business → media → storage → provider adapter
```

Storage 负责通用 Object Storage 能力：

- `put`
- `get`
- `head`
- `exists`
- `delete`
- `list`
- `copy`
- `move`
- `signed-upload-url`
- `signed-download-url`
- capability negotiation for multipart and range read
- object metadata

Storage 不负责：avatar、thumbnail、image compression、video transcoding、poster、business ACL 或媒体数据库记录。

### Candidate Providers

Local filesystem、AWS S3、Cloudflare R2、Aliyun OSS、Tencent COS 和 MinIO 仅作为 Adapter 候选。M1 Spec 不承诺全部实现。

### Required Deliverables

1. 完整 `module.yaml`，通过 V0.1 Schema。
2. 完整 SPEC、ARCHITECTURE、API、SECURITY、TASKS、TESTS 和 ACCEPTANCE。
3. 明确配置来源和 audit 集成边界；M1-A 使用注入值/Observer，无已发布 config/audit 契约时不声明虚假依赖，真实模块就绪后再声明可选依赖与版本。
4. 定义 Provider capability matrix 和降级语义。
5. 选择一个最小 Reference Runtime/Profile 和至少两个测试 Adapter（可包含 fake/local）。
6. 证明 metadata、not-found、条件写与 failure mapping 的一致行为；Memory/Local 对 signed URL 明确不支持，真实签发/使用正例属于后续云 Adapter 验收。
7. 完成 medium-risk 所需 Gate 和状态交接。

### Exit Criteria

- Module Standard 未因 Storage 特例而被污染。
- 通用 API 不泄露 Provider SDK 类型。
- Required/Optional dependency 和 capability negotiation 可执行。
- 至少一个实际 Runtime Implementation 通过 Contract Tests。
- 记录 Schema、模板和 Gate 在真实模块中暴露的问题。

### Explicitly Deferred

- 全 Provider 生产级实现
- Media Module
- 跨 Module Dependency Resolver
- Marketplace packaging
- CLI generation

### M1 increments

- M1-A：Storage 规格、设计与执行任务已完成，见 [Storage SPEC](../modules/storage/SPEC.md)。
- M1-B：Node/TypeScript Core + Memory 已实现，43 项测试通过，见[实施报告](../modules/storage/STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。Local/OSS 从[独立审查包](../modules/storage/LOCAL_OSS_REVIEW_PACKAGE.md)继续。
- M1-C：Local 独立安全设计审查 → 实现 → 双 Adapter Contract Tests；全部完成才可验收 M1。
- 真实 cloud/signing、guarded move 与 multipart session 不由此隐式启用。

## M2 — Cross-module Validation

在 Storage 稳定后选择 Identity/Media 等 Module，验证高风险路由、数据所有权和上下层依赖边界。

## M3 — Presets and Dependency Resolution

基于多个真实 Module 定义 Preset、版本冲突规则、可选依赖和 Compatibility Checker。

## M4 — Generator and CLI

将已稳定协议自动化，提供 create、add-module、doctor、status、validate 和 generate-tasks 等能力。
