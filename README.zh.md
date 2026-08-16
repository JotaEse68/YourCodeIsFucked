# YCF — YourCodeIsFucked

> **你的代码乱成一团。我们来收拾它。**
>
> **Your code is fucked. Let's unfuck it.**

<details>
<summary>以其他语言阅读</summary>

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md)
</details>

## 用你想用的任何工具。

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · 你自己的双手

```text
                 快速构建
                    ↓
            YCF — 质量层
                    ↓
              交付干净代码
```

**我们不检测 AI 代码。我们检测糟糕代码。**

YCF 是免费开源的命令行工具，用于理解代码库、发现可衡量的工程问题、安全清理已确认的残留、规划改进，并验证没有东西被弄坏。它适合 vibe coder、使用 AI 辅助开发的工程师，以及发布前需要质量门禁的团队。

Vibe coding 很有趣。事后清理并不有趣。

## 从这里开始

```bash
npx ycf-unfuck audit
npm install -g ycf-unfuck
cd my-project
ycf audit
ycf map
ycf unfuck --dry-run
```

只有审阅计划后才使用 `--yes`。YCF 会创建 Git 检查点、验证结果；如果验证失败则回滚。

## YCF 目前能做什么

- `ycf audit`：不修改代码地审计，并按所选语言和说明级别解释风险。
- `ycf map`：生成入口点和本地模块连接的架构图。
- `ycf ai-residue`：寻找开发和 AI 残留，不删除署名信息。
- `ycf cleanup --yes`：借助 Git 安全机制清理解析器确认的调试残留和部分未使用导入。
- `ycf unfuck --dry-run`：展示当前安全流程：审计、检查点、清理、验证和报告。
- `ycf refactor`：生成受监督的重构计划，而不是偷偷改写架构。
- `ycf verify` 与 `ycf release`：运行检查并生成发布就绪报告。

YCF 提供 JavaScript、TypeScript、React、PHP 和 WordPress 的确定性诊断。不会仅因看不到直接调用，就把 hooks、filters、shortcodes、REST、AJAX、cron 或 WooCommerce 当作死代码。

## 代码库里的恶魔

`DeadCode`、`CopyPaste`、`GodComponent`、`MysteryHelper`、`FinalFinalV3`、`TODOFromHell` 和 `DependencyNobodyUses`：有趣的名字，背后是需要真实证据的问题。每项发现都应说明文件、风险、安全操作以及仍需人工决定的部分。

> “能跑”不是文档。生产环境不是测试框架。

## 玩笑之下是严肃工程

- `ycf audit` 从不修改源代码。
- 安全清理要求干净的 Git worktree、检查点和明确的 `--yes`。
- 身份验证、支付、公开 API、数据库模式和动态回调绝不会被自动修改。
- 许可证、版权和必要署名会得到保护。

## 我为什么做它

我用 AI 更快地构建东西。它确实有效。持续了一阵子。

后来我打开项目：重复的 helper、几个月前的“临时”补丁、名为 `final-final-v3` 的目录，还有大到快要申请集体谈判的组件。

一切都能运行。大概吧。但要向别人解释、无压力地审查，或把它当成专业作品交付，完全是另一回事。

最烦人的部分？这是我自己的烂摊子。

我想保留速度，而不是在别人看到代码前偷偷清理犯罪现场。所以我做了 YCF：不是为了假装代码由人类写成，而是让它无论由谁编写，都清晰、可维护、可验证并且可以交付。

## 先是 CLI，然后是 Skills 和智能体。

YCF 的核心是确定性的：映射、度量、Git 保护、报告和验证。它被设计为与 Codex、Claude Code 及其他智能体协作。Skills、更丰富的影响分析和本地可视化 cockpit 属于路线图，不会在这里假装已经发布。

`ycf init` 可选择语言和解释级别。默认是英语，也支持西班牙语、葡萄牙语、法语、德语、意大利语、阿拉伯语和中文。

```bash
ycf audit --language zh --audience guided
ycf audit --audience professional
```

## 贡献与安全

YCF 以 Apache-2.0 开源。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

由 [Jota Santos](https://www.jsantos.pro/) 创建。
