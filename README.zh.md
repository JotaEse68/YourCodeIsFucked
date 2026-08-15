# YCF — YourCodeIsFucked

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · **中文**

YCF 是一个开源命令行工具，用于安全地理解、审计和改进代码项目。它发现可衡量的问题并说明下一步。

## 从这里开始

```bash
npm install -g @jotaese68/ycf-cli
cd my-project
ycf init
ycf audit
ycf unfuck --dry-run
```

在 `ycf init` 中选择语言和说明级别。如需易懂说明，请选择 `中文` 和 `guided`。

## 如何理解结果

- **AUTO**：YCF 可以通过检查点和验证来应用更改。
- **SAFE REFACTOR**：存在可行改进；修改前请先检查意图。
- **REPORT-ONLY**：YCF 解释问题，但不会修改任何内容。
- **ARCHITECTURAL**：涉及敏感区域，需要人工决定。

使用 `ycf cleanup --dry-run` 查看安全更改。只有在阅读计划后才使用 `ycf cleanup --yes`；YCF 会创建 Git 检查点，并在验证失败时恢复项目。

## 保护与当前状态

YCF 不会自动修改身份验证、支付、公共 API、数据库架构、外部集成或动态回调。当前版本支持 JS/TS/React 和 PHP/WordPress 诊断、安全清理，以及通过 `ycf release` 进行发布准备检查。

此仓库会在每次变更及每周运行这些检查。依赖项安全公告检查是只读的：它可以阻止不安全的发布，但绝不会自动更新软件包。
