# Storage Security Design — 0.1.0-dev

## Risk Classification and Gate

M1-A/Memory 基础对象契约为 medium；本次仅规格、不触碰真实对象。Local 隔离和 signer 的实现属于安全边界工作，任务升级 high，要求独立安全复核。当前 Security Gate = PENDING，不以设计文字代替实施测试。

默认仅受信任宿主调用。模块不提供认证/业务 ACL；宿主必须先授权再调用 Storage。binding 必须来自受控配置，不能由外部请求挑 bucket/root/endpoint。

## Threat Model and Tests

| ID | Threat | Required control | Tests |
| --- | --- | --- | --- |
| SEC-001 | 目录穿越、编码绕过、symlink/junction 逃逸 | Key 只作逻辑键；Local digest 路径+专属 root/路径核验，拒绝受污染目录 | TEST-001, TEST-013 |
| SEC-002 | 覆盖旧数据/并发误删 | 默认条件 create，不支持不能先查再写；ifRevision 原子删除 | TEST-002, TEST-004, TEST-008 |
| SEC-003 | 越 namespace 枚举/cursor 注入 | binding 固定、cursor 作用域与字符长度校验，cursor 不是路径或权限 | TEST-005 |
| SEC-004 | 假签名/凭据与 URL 泄露 | M1 签名能力 false；未来固定 HTTPS/method/key/TTL，脱敏日志 | TEST-009, TEST-011 |
| SEC-005 | 大对象、metadata、header、无限流耗尽资源 | 写前/流式大小、全流程 deadline、Memory 总预算、Local header 上限 | TEST-002, TEST-010, TEST-011, TEST-013 |
| SEC-006 | 错误吞掉导致权限误判 | exists 只处理可靠 not-found；公开错误不含内部路径 | TEST-003, TEST-011 |
| SEC-007 | 覆盖时读到不同版本/metadata 半更新 | snapshot 与 envelope 原子发布；corruption fail-closed | TEST-003, TEST-010, TEST-013 |
| SEC-008 | SDK/依赖供应链与测试误用生产环境 | 锁定依赖、最小包、测试只创建临时 root，无云 credential 探测 | TEST-012, TEST-014 |

OWASP 指出不同编码和绝对/相对路径都可能参与目录逃逸。因此只禁止字面 `../` 不充分；本设计同时限制 key、隔离物理名字与可信根目录。[OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)

## Credentials / Provider Boundary

本次及 M1-B 不使用凭据。未来 Adapter 只能通过宿主注入凭据 provider/受控引用；不能请求用户在聊天、module.yaml、测试、日志放明文 access keys。

外部 endpoint 仅初始化白名单配置，业务 key 不能被解析成 URL。禁止默认创建公网资源、修改 bucket policy、CORS、ACL 或签名绕过路径权限。真实账户/资费/公开权限变更需新授权与验收，不通过测试顺便执行。

## Signed Grant Limitations

未来授权者负责对象用途和调用者身份；签名验证所需 headers 必须随 grant 返回。签名 URL 为可转发 bearer secret，不视为 single-use token，也不宣称上传完成、内容无害或永久私有。短 TTL 无法替代权限。M1 不开启 localhost 签名网关，不制造 file URL 成功案例。

## Resource and Logging Policy

limits 见 API；流在取消/超时/调用方停止消费后必须释放资源。静态观察日志只含 operation/result/bytes/duration 等白名单，不记录 metadata、原始 key 或 credential/URL。故障注入不允许通过 production public API 打开。

## Local-specific Safety Boundary

Local 仅用于专属、宿主控制的目录。预先植入 symlink、恶意 lock、非普通文件应拒绝；对敌对同机写入者与管理员的 TOCTOU 防护不做未验证承诺。若项目需要这类边界，升级设计，不能以当前测试 root 假设上线。

Local 高风险审查需确认：可支持 OS、文件打开/rename 原语、锁和 crash 恢复、tmp 清理范围、数据与 metadata 绑定、Path Traversal 阴性测试。设计审查和实现后测试都不可省略。

## Decision Record

- Design threat inventory: prepared by Codex（单一作者，非独立审计）。
- Security Gate: PENDING。
- M1-B：Memory 合同测试后再决定，不能提前标 PASS。
- M1-C：ST-005 独立审查后才允许 Local 实现；无审查者则保持 blocked，不自动多 Agent 或伪造审核。
- Production/cloud signing: out of scope; separate high-risk approval needed。
