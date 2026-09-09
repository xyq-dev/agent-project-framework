【执行工具：Cursor｜模型：Grok 4.6 High Fast】

调度状态（2026-09-08）：本 M1-B 任务包已由当前 Codex 完成，未调用 Cursor；以下是原始执行边界参考，不应据此重新覆盖实现。当前进度见 ../STORAGE_M1_B_IMPLEMENTATION_REPORT.md；Local/OSS 从 ../LOCAL_OSS_REVIEW_PACKAGE.md 的独立审查开始。新项目采用标准仍从根 START_HERE.md 进入。

执行 `agent-project-framework` 的 M1-B，仅 ST-001～ST-004（TypeScript Core + Memory Adapter），不用重新架构分析。

## Workspace and Branch

- 工作目录：你本机 `xyq-dev/agent-project-framework` 的真实 checkout 根目录；先用 `git rev-parse --show-toplevel` 与 `git remote -v` 核验，不假定是其它项目路径。
- 规格分支：`feat/storage-spec-v0.1`；起点需包含本提示词及通过记录，基线 M0 commit 为 `32f0072e386a6d0763e0a40b2584a159f3957be9`。
- 开始先只读 `git status --short --branch`、`git log -1`。分支不存在或版本不符先报告；不得 reset、强切或覆盖 dirty worktree。
- 基于已核对的规格分支新建/复用 `feat/storage-memory-v0.1` 实施；已有同名分支先检查其祖先/内容，不直接覆盖。

## Required Reading

`AGENTS.md`、`PROJECT_CONTEXT.md`、`CURRENT_STATUS.md`、`.agent-project/` 四个 YAML；`modules/storage/` 的 module.yaml、SPEC、ARCHITECTURE、DATA_MODEL、API、SECURITY、TASKS、TESTS、ACCEPTANCE、STATUS、REVIEW。

确认 Module 是 TASKS_READY，Spec/Architecture 与 Tasks readiness 已通过；如仍是 DRAFT 或记录矛盾，只报告，不能凭本提示词绕过。

## Goal and Allowed Changes

- 仅按 ST-001..004 实现已定 Contract，不重写 API 或设计其它模块。
- 允许新增 `modules/storage/implementations/typescript/` 下私有 package/lock/tsconfig/src/test。
- 允许更新该模块的 STATUS、TESTS、ACCEPTANCE、REVIEW 和 `module.yaml` 支持证据，以及根 CURRENT_STATUS 与 `.agent-project/workflow.yaml` 动态进度。
- 第一个 Profile：Node 24.x、TypeScript strict ESM，Node built-in tests；具体依赖版本锁定到包内，不改根工具链。
- config/audit 不存在：使用宿主配置和 Observer 端口，禁止创建空依赖包或虚构版本。

## Fixed Decisions

1. 默认 overwrite=false，原子条件不支持则报错，禁止先 exists 后 put。
2. exists 只把可靠 not-found 转 false；permission/timeout 保留错误。
3. 同 key revision 每次写不同，get body/info 固定同 snapshot。
4. Memory 有每对象和总 bytes/object-count 预算，失败保留旧值。
5. copy 同 binding，保留用户 metadata；list 有界、cursor 不越作用域。
6. move、signed URL、multipart=false，早期拒绝且不消费输入、不创建假 URL。
7. 写入未知结果不自动重试，Observer 失败不改变完成结果，日志不含 key/秘密。

## Forbidden Changes

不实现 Local/S3/R2/OSS/COS/MinIO Adapter、签名服务、multipart、move 正例；不改 Framework Schema、AGENTS 或共享标准；不写任何业务 UI/Media/DB/Migration；不访问生产、Secrets、云账户或收费服务。

发现契约不可执行，报告具体文件/规则/反例，不自行扩大范围。Local ST-005..007 是独立高风险阶段，不能提前执行。

## Git / Build Authority

- Commit：YES，仅本次已验证变更，原子 commit，提交前列出范围。
- Push：NO；用户另行授权前不推送任何远端分支。
- 写 main / merge / force-push：NO。
- Pack / publish / deploy / Tag / Release：NO。允许本地 `build` 作为验证，不生成发布包。
- 保留所有无关 dirty changes；禁止破坏性清理。

## Required Verification

1. `node modules/storage/validation/validate-spec.cjs`（仅静态检查）；必须理解它不证明 Runtime 工作。
2. 在 reference package 建立并执行：`typecheck`、`build`、`test`、`test:contract`、`test:failure`、`test:security`。
3. Memory 覆盖 TEST-001..012/014；Local TEST-013 明确 NOT_RUN，不创建空测试冒充。
4. 使用真实并发竞争、流失败和发布后响应丢失注入；mutation 不自动重试。
5. `git diff --check`；核对仅允许文件、无 secrets、无公用 Schema 变更。
6. 不因为测试命令缺失就写 PASS；阻塞或失败记录实际输出。

## Final Report

输出 `STORAGE_M1_B_IMPLEMENTATION_REPORT`，包含工作目录、Branch、Previous/New HEAD、Created/Modified、完成/未完成 Task IDs、每项命令/结果、Memory capability 列表、Gate 决策、风险/限制/下一步；确认 Commit/Push/Local/Cloud/CLI/Release/Tag/Pack 各自 YES/NO。

通过 M1-B 只代表 Memory 增量有证据；Local 未完成时不能宣布整个 M1 完成或 Module RELEASED。返回报告后再由 Codex 做有针对性的 Review，不让两个工具重复分析。
