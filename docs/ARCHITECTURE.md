# 架构导航

## 请求与数据

`app/page.tsx` 进入作品界面，客户端组件通过 `app/api/` 的路由访问业务逻辑。服务端身份由 `lib/site-user.ts` 解析，权限由后台策略和各业务存储共同核验。业务规则主要在 `lib/`，页面负责展示和交互。

`db/schema.ts` 描述表结构，`db/index.ts` 提供 Drizzle 访问。`db/binding.ts` 直接打开本地 SQLite，`db/sqlite-d1.mjs` 提供已有 SQL 和 Drizzle 查询所需的 D1 形状接口，不连接云数据库。开发依赖中的 `@cloudflare/workers-types` 只为该既有接口提供类型声明，不包含 Cloudflare 运行适配。

`drizzle/` 保留 17 份历史 SQL；本地迁移器按文件名排序、记录 SHA256，并拒绝已执行迁移被改写。迁移目录中的初始化行属于应用默认设置，不包含网站业务数据。

## 审核队列

提交和修改作品时创建审核任务。独立 `scripts/moderation-worker.mjs` 领取任务，`moderation-scheduler` 决定供应商、优先级、并发和冷却，`moderation-core` 处理请求及结果。明确的上下文超限跳过该供应商的重试并进入下一家；审核拒绝不会被当作技术故障绕过。

供应商设置由后台管理，API Key 以 `MODERATION_ENCRYPTION_KEY` 加密后存储在数据库；仓库没有预置供应商密钥或线上设置。应用和 worker 必须共用自己的数据库与加密密钥。

## 运行入口

`npm run dev`／`npm start` 使用 `scripts/run-node.mjs`，读取本仓库的 `.env.local` 并启用正式账号认证逻辑；默认关闭测试登录，监听回环地址。新数据库不自动建立示例账号或作品。

运行方式为 Node + SQLite。AI 审核通过独立的 `scripts/moderation-worker.mjs` 进程执行，与 Web 服务共享数据库和配置。
