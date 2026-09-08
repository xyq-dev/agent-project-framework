# Storage Tasks — 0.1.0-dev

## Execution Boundary

M1-A = 本次规格任务。ST-001..007 是**后续**实现/验收工作单，未执行。执行者开工前需读取 AGENTS、项目与模块 STATUS，不要再次重做已通过的架构分析；发现契约不可实现则停下并报告具体矛盾。

默认只在专题分支工作，保留既有 dirty changes；commit 需任务授权，push/main/Release/Tag/npm 发布/云部署不因本文件而获得授权。

## Task Graph

| ID | Goal | Depends on | Owner role | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| ST-000 | M1-A 完整契约和静态验证 | M0 | Codex analyst/architect | medium | complete |
| ST-001 | 建立隔离 Runtime 测试工作包 | ST-000 design gates | Cursor implementer | medium | pending |
| ST-002 | 公共类型、校验、错误、capability facade | ST-001 | Cursor implementer | medium | pending |
| ST-003 | Memory primitive 与条件语义 | ST-002 | Cursor implementer | medium | pending |
| ST-004 | Copy、分页、故障测试及 Memory review | ST-003 | Cursor implementer; Codex reviewer | medium | pending |
| ST-005 | Local 路径/锁/恢复设计独立安全审查 | ST-004 | independent security reviewer | high | pending |
| ST-006 | Local Reference Adapter | ST-005 PASS | Cursor implementer | high | blocked |
| ST-007 | 双 Adapter 验收、M1 Gate 决策 | ST-006 | tester + independent reviewer/acceptor | high | blocked |

无循环依赖。config/audit 不作为虚假 prerequisite；它们不在当前 module dependency graph 内。

## ST-001 — Reference runtime setup

- Inputs：已通过的 SPEC/ARCHITECTURE/TASKS，API、TESTS、现有 schema。
- Goal：只在 `modules/storage/implementations/typescript/` 建立私有、不发布的 package、tsconfig、src/test 和锁文件；名字可用 `@agent-project-framework/storage-reference`，`private: true`。
- Profile：Node 24.x，TypeScript strict ESM；执行时核对、锁定 TypeScript 版本，使用 Node 内置测试 runner。不得建立整个 Monorepo、全局工具或根 package.json。
- Required scripts：`typecheck`（tsc --noEmit）、`build`（tsc）、`test`、`test:contract`、`test:failure`、`test:security`，编译后的测试明确列出/由 Node 发现，禁止空 suite 返回成功。
- Out of scope：Local/云 SDK、UI、Media、CLI、任何 release workflow。
- Verification：安装/版本/锁文件 provenance 记录；typecheck/build 成功；至少 1 个真实校验测试，TEST-014 / AC-014。
- Gate：Spec+Architecture entry passed，task readiness passed；实施出口仍需真实 changes/tests，不能用入场批准代替完成。

## ST-002 — Core contract

- Allowed：reference `src/` 的 types、validation、error、capabilities、configuration/observer；无磁盘或网络访问。
- 实现 API 的 Key/Prefix/metadata/limits、ByteSource/OperationOptions、StorageError；facade 早期检测 unsupported，取消/超时要考虑流返回后的生命周期。
- Core 接受注入配置和 Adapter，不读取 process.env/.env/单例，默认 Observer no-op；输出不可改内部 state。
- Tests：TEST-001, TEST-008, TEST-009, TEST-010, TEST-012；阴性用例证明 body 未被消费，AC-001/008/009/010/012。
- Out of scope：自研 signer、假 file URL、multipart session、config/audit 包。

## ST-003 — Memory adapter

- Allowed：Memory adapter + shared Contract Test factory；先做 put/get/head/exists/delete/conditions，再接 façade。
- 写入 staging 原子发布；读 immutable snapshot；同 key 条件测试并发执行，不能 mock 掉竞争本身。空对象、长度不符、超限/取消、metadata replacement 必须真实验证。
- Memory 总已存与 in-flight 预算都限制；失败不能驱逐旧对象或污染其它 namespace。
- Tests：TEST-002/003/004/008/010/011/012；覆盖 AC-002/003/004/008/010/011/012。
- Out of scope：磁盘、网络、全局持久化、自动重试 mutation。

## ST-004 — Memory completion and handoff

- 实现有界 list 与 cursor 作用域校验、同 binding copy；移动/签名/multipart 始终 false。
- Fault adapter 为测试注入 permissions/timeout/commit-then-response-loss；证明 exists 和 error/outcome 不失真。
- 同一 shared factory 预留 Local 的调用入口，但不得先创建空 Local 代码或伪造通过。
- Commands：ST-001 的全部 scripts；TEST-001..012/014（CASE scope=memory），Local TEST-013 明确 NOT_RUN。
- AC：AC-001..012/014，缺一项即 ST-004 未完成；契约检查不等于这些行为测试。
- 产出：Memory review evidence、命令结果、执行环境、失败列表；更新 Module/项目 STATUS，未来把已验证 `memory` 与 `typescript-node` 支持写入 manifest。
- 不得把整个 M1 标为 ACCEPTED/RELEASED；Local 仍未实现，Security/Acceptance 全模块 Gate 仍待定。

## ST-005 — Independent Local design review

- 输入：[架构 Local 章节](ARCHITECTURE.md)、[安全模型](SECURITY.md)、运行环境计划、Memory 证据。
- reviewer 不得是设计/实现的唯一作者；推荐 Codex 高风险路线，人工/独立审查结果留痕，不要求自动多 Agent。
- 确认 Linux 文件系统假设、原子 envelope、root lock、同 key lock、symlink/TOCTOU边界、清理与 crash recovery；不能用 shared/untrusted root 测试替代设计。
- 验收：每个 SEC-001/002/003/005/007 与 TEST-013 控制有明确通过/修改意见，无未接受 high/critical finding；决定 PASS 才解锁 ST-006。
- 允许修改 Local 设计、TESTS 和 STATUS；不允许实现安全绕过、增加权限或接触既有数据。此任务不是实现后 Security Gate PASS。

## ST-006 — Local implementation

- 前置：ST-005 PASS + 用户对该增量的授权；执行路径限定 reference `src/adapters/local/` 及对应测试。
- 按已审 Local profile 实现单 envelope、专属 root、独占 writer lock、锁内条件变更、snapshot read、校验与 staging 清理。
- Tests：全部 shared cases + TEST-013（进程 crash/restart、symlink、临时残留、损坏、锁竞争），实测环境 Linux/Node 24；其它 OS 不得据此宣称已支持。
- 不自动修改 root 权限、清理 stale lock、扫描删除用户文件，无法证明归属即停止。
- 通过 Integration/Test 后交独立 reviewer 做 Security Gate，不由实现者自验收。

## ST-007 — M1 reference acceptance

- 核对两种 adapter 使用同一 suite；Memory+Local 对核心能力/metadata/conditions/error mapping 一致，能力 false 有阴性证据。
- 签名正例/真正 multipart/云 Provider 仍 DEFERRED；M1 只接受支持能力中的契约，不假装验证云兼容。
- Required Gates：Implementation/Test/Security/Acceptance；若计划 release，另经 Release Gate 且须另获授权。
- 当前不创建 Tag/Release、不 npm publish、不 auto merge main；只形成可审核制品/commit、兼容说明、恢复限制与 handoff。
- 成果：AC-001..014 的 Runtime 证据、解决 Kernel feedback 的建议；未通过项明确 owner 和解除条件。

## Cursor Start Point

下一次只执行 ST-001..004；完整提示词见 [agents/CURSOR_IMPLEMENTATION.md](agents/CURSOR_IMPLEMENTATION.md)。不要把 ST-005..007 或未来云接入一并展开。
