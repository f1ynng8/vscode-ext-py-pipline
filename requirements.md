# Pipeline Visualizer — VS Code 插件

## 功能概述

读取 `.pipline` (YAML) 配置文件，在 VS Code Webview 中以**自上而下的 DAG 图**可视化展示数据处理流水线，支持点击执行脚本、打开文件、高亮追溯依赖链。

## .pipline 配置格式

```yaml
name: pipeline_name
description: "流水线描述"
globals:
  work_dir: "/absolute/path/to/workdir"   # 脚本执行工作目录，相对路径基于此拼接
  python_venv: "/path/to/.venv"           # Python 虚拟环境路径
assets:
  raw_data:                    # 数据资产 ID
    path: raw/data.csv         # 相对路径自动拼接 work_dir；绝对路径不拼接
    type: source_data          # source_data = 静态输入文件（绿色虚线框）
  processed_data:
    path: dst/output.csv
    desc: "处理后的数据"
    generated_by:              # 生成此资产的脚本
      script: code/process.py
      inputs:                  # 脚本依赖的上游资产 ID
        - raw_data
```

## 功能清单

| 功能 | 说明 |
|------|------|
| **可视化渲染** | 自上而下树状布局，数据资产（蓝色圆角矩形）和脚本节点（青绿色药丸形）交替排列 |
| **源数据区分** | `type: source_data` 的资产用绿色虚线框显示 |
| **同级居中** | 共享同一父节点的子节点以父节点为中心水平居中排列 |
| **SVG 连线** | 贝塞尔曲线箭头连接 资产→脚本→资产 |
| **点击打开文件** | 点击数据资产路径或脚本文件名，在 VS Code 编辑器中打开对应文件 |
| **点击执行脚本** | 点击脚本节点的 ▶ 按钮，在终端中执行 `python3 <script>`；复用已有终端，自动激活 venv |
| **点击高亮（资产）** | 点击数据资产，递归回溯全部上游链路（脚本+输入资产）直到源数据，全部高亮（洋红色） |
| **点击高亮（脚本）** | 点击脚本节点，高亮其输入资产 + 输出资产 + 连接箭头 |
| **刷新** | 点击刷新按钮重新读取 `.pipline` 文件并重绘画布 |
| **右键菜单** | `.pipline` 文件的资源管理器和编辑器右键菜单中有 "Pipeline: Open Pipeline View" |

## 项目结构

```
/opt/app/src/py-pipline/vscode-ext/
├── package.json            # 插件清单（命令、菜单、激活事件）
├── tsconfig.json
├── src/
│   ├── extension.ts        # 入口：注册 pipeline.open / pipeline.openActive 命令
│   ├── pipelineParser.ts   # YAML 解析、路径拼接、依赖深度计算
│   └── webviewProvider.ts  # Webview 面板：生成 HTML、处理消息（runScript/openFile/refresh）
├── media/
│   ├── main.js             # 画布渲染：DOM 布局、SVG 连线、事件委托高亮
│   └── style.css           # VS Code 主题适配样式（--vscode-* CSS 变量）
└── .vscodeignore
```

## 构建与安装

```bash
cd /opt/app/src/py-pipline/vscode-ext
npm install
npm run compile                              # tsc 编译
npx vsce package --allow-missing-repository  # 生成 .vsix
code --install-extension pipeline-visualizer-*.vsix
```

## 技术要点

- **数据传递**：JSON 嵌入 `<script>` 标签，转义 `</` 为 `<\/` 防止 HTML 解析截断
- **事件处理**：全局 `document.addEventListener('click', ...)` + `closest()` 事件委托，避免 stopPropagation 冲突
- **终端复用**：查找名为 `Pipeline Runner` 的已有终端，无则新建；执行前检查 `$VIRTUAL_ENV` 是否匹配目标 venv
- **路径拼接**：`path.isAbsolute()` 判断，绝对路径不拼接，相对路径拼接 `globals.work_dir`
