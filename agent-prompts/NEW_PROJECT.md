【执行工具：Codex｜模型：GPT-5.6 Terra｜推理等级：高】

按 GitHub 标准仓库 `xyq-dev/agent-project-framework` 初始化当前新项目的开发流程。当前目标是建立项目自己的标准文件、需求记录和下一步任务。

## 工作位置与输入

- 标准来源：`https://github.com/xyq-dev/agent-project-framework`，固定一个包含 START_HERE 与 BOOTSTRAP_MANIFEST 的已核对 commit；记录完整 SHA。
- 目标目录：当前用户指定的新项目根目录。目录可以为空；不默认使用 APF 或其它业务项目路径。
- 核对当前目录、现有文件、Git 状态、branch 和 origin；标准来源与目标必须区分。
- 从当前任务获取项目名称、目标、主要用户、首版范围与约束。只询问缺失且会实质影响初始化或需求结果的信息；已知内容不重复询问。

## 执行

1. 读取标准来源的 START_HERE.md、templates/project/BOOTSTRAP_MANIFEST.yaml 和 framework/PROJECT_PLAYBOOK.md。
2. 目标已有 AGENTS/状态时先读取；按照清单复制共享规范及项目模板，已存在文件逐项比较合并，保留原项目内容。
3. 填写清单参数并记录真实源 SHA。对 YAML 使用安全的结构化赋值；目标仓库未知时留空，不能把标准仓库设成业务项目 origin。
4. 完成后读取目标 AGENTS、PROJECT_CONTEXT、CURRENT_STATUS、四个配置及 docs/PROJECT_PLAN.md；阶段与证据从新项目事实开始。
5. 在 PROJECT_PLAN 中填写已知需求、范围、验收、阶段裁剪和能力选择。依据 framework/MODULE_ADOPTION_PLAN.md 与 playbooks/modules/catalog.yaml 选择蓝图；未知项保持待定，项目 Gate 不因复制蓝图而通过。需要进一步设计时使用 agent-prompts/MODULE_PLAN.md。
6. 更新 CURRENT_STATUS 的初始化结果与下一步。需求/架构有实质缺口时先补方案；输入已齐时给 Cursor 第一项原子任务，写明路径、分支、范围、测试和权限。

## 边界与 Git

- 只初始化标准与需求文档，不重做已有项目架构，不实现业务代码或 Storage 示例，不预建无内容模块。
- 有 Git 历史时从核对后的基线使用 `docs/project-bootstrap` 专题分支；已有同名分支先检查，不重置。
- 空目录尚无 Git 时，可在用户已要求初始化 Git 仓库的任务中建立本地仓库；否则记录 Git 尚未初始化。
- 本提示词不额外授予 commit/push/main/pack/deploy 权限；沿用用户对当前初始化任务的授权。无授权的远端创建、发布或配置变更不执行。

## 验证与报告

核对清单源/目标、重复路径、必读文件、YAML/JSON、相对链接和未替换参数；确认没有 APF 项目进度、预选 Runtime 或虚假测试结果。

输出 `PROJECT_BOOTSTRAP_REPORT`：目录、source SHA、目标仓库/branch、已写文件、初始化检查结果、已知需求/待确认项、下一任务、实际 commit/push/pack/deploy 结果。初始化 PASS 只表示标准已落到目标项目，业务门禁保持真实状态。
