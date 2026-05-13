# 业务根因诊断器（飞书多维表格插件）

在多维表中沿「关联记录」向上追溯链路，并结合目标条件定位卡点。产品说明与审核规范见 [`docs/项目说明-业务根因诊断器.md`](docs/项目说明-业务根因诊断器.md)。

## 开发

```bash
npm install
npm run dev
```

本地开发使用 **Hash 路由**（`#/…`），与飞书插件审核要求一致。

## 构建与提审

```bash
npm run build
```

- `vite.config.ts` 已设置 `base: './'`（静态资源相对路径）。
- `package.json` 已设置 `"output": "dist"`；`.gitignore` 已取消忽略 `dist`，便于提交构建产物供审核静态部署。

## 技术栈

React、TypeScript、Vite、`@lark-base-open/js-sdk`、Ant Design、`reactflow`。
