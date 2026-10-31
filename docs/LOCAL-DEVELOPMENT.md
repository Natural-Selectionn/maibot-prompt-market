# 本地开发

## 环境与安装

需要 Node.js 24+ 和 npm。SQLite 使用 Node 内置 `node:sqlite`，不需要 Python 或独立数据库服务。命令均在仓库根目录运行。

```sh
npm run install:ci
```

依赖版本由 `package-lock.json` 固定。

## 开发服务

复制 `.env.example` 到 `.env.local`，按 [配置说明](CONFIGURATION.md) 填写自己的开发配置：

```sh
npm run db:migrate
npm run dev
```

默认监听 `127.0.0.1:3000`。迁移、应用和审核进程读取同一份配置；数据库相对路径以仓库根目录解析。新数据库不自动建立账号或作品，未配置自己的登录服务时可以匿名浏览。

## AI 审核进程

另开终端执行：

```sh
npm run worker
```

审核供应商由本地后台配置。网站和该进程须共用数据库与加密密钥；没有配置供应商时不会自动连接真实模型。邮箱和 OAuth 也需填写自己的服务配置。

## 本地正式构建

```sh
npm run build
npm start
```

`build` 调用 Next Webpack 构建，再把静态资源、迁移和审核运行模块放入 `.next/standalone`。`start` 从该目录启动，数据库仍指向仓库根目录的 `data/` 或显式配置路径。命令不包含上传、部署或线上迁移。

低层命令 `build:vps` 只构建；单独使用时还需 `node scripts/prepare-local-preview.mjs` 准备运行资源。

## 静态检查

```sh
npm run lint
npm run typecheck
npm run check:source
```

源码检查扫描 Git 可收录文件，检查禁止的运行文件路径及常见密钥格式，不输出命中值。它不能识别任意秘密，提交前仍需审阅暂存差异。

`npm run lint` 检查 Hooks、页面导航和未使用变量等规则。必要的浏览器初始化、异步同步或身份边界例外应在对应代码处说明原因，不为通过检查而全局关闭规则。
