# 麦麦提示词库

面向 [MaiBot（麦麦）](https://github.com/Mai-with-u/MaiBot) 的人设配置与提示词模板分享网站。支持发布、检索、导入导出、作品讨论、账号管理和人工／AI 审核。

使用 **Next.js + React + TypeScript + SQLite + Drizzle**，支持 Windows、macOS 和 Linux，无需额外托管插件或服务器账号。

## 功能

- **人设配置**：人格、行为、表达风格与群聊／私聊提示；备用表达风格、概率设置；从 TOML／JSON 导入，导出人设 JSON 或 TOML。
- **提示词模板**：多文件作品、模板类型与语言、变量提示、复制和下载、版本兼容区间。
- **发现与互动**：关键词搜索、标签联想、排序与分页、点赞、收藏、使用统计、讨论区、回复及通知、公开作者主页。
- **账号**：GitHub／Google OAuth、邮箱注册与密码登录、找回密码、身份绑定、昵称和个人中心。
- **后台**：账号与作品审核、公告、作品编辑、权限管理及审计记录；AI 审核支持供应商优先级、并发、限频、重试、回退和上下文超限切换。
- **界面**：明暗主题、响应式布局、复古窗口与滚动条样式。

功能与代码对应关系见 [功能索引](docs/FEATURES.md)。

## 本地运行

需要 **Node.js 24 或更高版本**和 npm。先安装依赖，将 `.env.example` 复制为 `.env.local`：

```sh
npm run install:ci
npm run db:migrate
npm run dev
```

默认地址为 `http://127.0.0.1:3000`。新数据库为空，未填写外部服务配置时可匿名浏览；登录和发布需要配置自己的 OAuth 或邮箱服务。AI 审核需要另开终端运行 `npm run worker`。

运行本地正式构建：

```sh
npm run build
npm start
```

源码检查：

```sh
npm run lint
npm run typecheck
npm run check:source
```

详见 [开发说明](docs/LOCAL-DEVELOPMENT.md) 和 [配置说明](docs/CONFIGURATION.md)。

## 目录

| 目录 | 内容 |
| --- | --- |
| `app/` | 页面、交互组件、CSS 与 API 路由 |
| `components/`、`hooks/` | 共用界面组件和 Hooks |
| `lib/` | 作品、搜索、身份、讨论、通知和审核逻辑 |
| `db/`、`drizzle/` | 表结构、SQLite／D1 适配与历史迁移 |
| `scripts/` | 安装、构建、本地启动、迁移与审核 worker |
| `public/`、`vendor/` | 静态资源、第三方样式与许可证 |
| `docs/` | 功能索引、架构、配置和贡献说明 |

见 [架构说明](docs/ARCHITECTURE.md) 与 [贡献说明](CONTRIBUTING.md)。

## 许可

项目自有代码采用 [GNU GPL v3](LICENSE)（`GPL-3.0-only`）。第三方代码、字体和样式的来源及许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
