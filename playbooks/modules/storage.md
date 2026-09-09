# 通用存储实施蓝图

通用设计输入，采用项目的 Runtime/Gate 仍需自行验证。对象契约基础风险 medium；本地文件系统、真实云权限/签名增量按 high 处理。见 [实施方案](../../framework/MODULE_ADOPTION_PLAN.md)。

## 采用前确认

确认对象类型、大小、数量、读写方式、保留与删除需求、是否允许覆盖、并发语义和实际 Provider。定义命名空间及对象键规则；权限策略由宿主提供。

## 最小范围与契约

- 先覆盖 put/get/head/exists/delete/list、元数据、有界输入、明确错误和 capability discovery。
- 覆盖默认关闭；声明条件写时必须有真实原子语义，不能先 exists 再 put 伪装。
- 读取内容与元数据来自同一对象版本；不存在与权限失败分别表示。
- 内存、分页、流、超时与取消有边界；写入响应丢失时报告结果未知，不自动重复变更。
- signed URL、copy、range、multipart 等按项目需要和适配器实际证据选择；不支持时明确拒绝。
- 存储模块不拥有媒体业务记录、用户资料、业务 ACL 或 Bucket/IAM 管理。

可参考 [APF Storage 规格快照](https://github.com/xyq-dev/agent-project-framework/blob/d31de78217bae3d567a321b98b04a8a7965718a1/modules/storage/SPEC.md)。该历史快照只有规格。APF 后续新增了 [Storage 私有参考实现及测试报告](https://github.com/xyq-dev/agent-project-framework/blob/feat/storage-runtime-v0.1/modules/storage/STORAGE_M1_B_IMPLEMENTATION_REPORT.md)，Local 与 OSS 初始 profile 也已有代码和本地测试；独立代码复核已完成并保存消息；正式 Gate 与真实 OSS 待完成。采用模板不会复制 Runtime 或继承该报告的项目 Gate；选择代码时应固定实际使用的 commit。

## 实施任务

| ID | 交付 | 验收 |
| --- | --- | --- |
| STG-001 | 实际对象契约与能力矩阵 | 不支持项和错误行为可测试 |
| STG-002 | 校验/错误/端口与适配器接口 | 通用契约不暴露 Provider SDK 类型 |
| STG-003 | 项目选定适配器 | 在真实条件下验证声明能力 |
| STG-004 | 共享契约与故障测试 | 所有实际适配器执行同一核心用例 |

## 必须验证

空对象、大小超限、非法键、元数据边界、并发覆盖/条件冲突、缺失/拒绝访问、分页作用域、取消、流失败、响应丢失和旧值保护。测试用 fake/Memory 可以辅助注入故障，但不能替代真实云适配验收。

## 完成条件

实际支持有证据，API 与 Provider 差异清楚。是否需要 Memory 或 Local 由项目验证需求决定；采用开发标准不要求先完成 APF M1-B/C。
