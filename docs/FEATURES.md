# 功能与代码索引

| 功能 | 页面／组件 | 核心逻辑与接口 |
| --- | --- | --- |
| 作品列表、筛选、分页 | `app/prompt-garden.tsx` | `lib/prompts.ts`、`lib/search.ts`、`lib/search-query.ts`、`lib/prompt-sort.ts`、`app/api/prompts/` |
| 人设编辑、导入导出 | `app/prompt-composer.tsx`、`app/multiple-reply-style-editor.tsx` | `lib/config-source.ts`、`lib/personality-export.ts`、`lib/prompt-request.ts` |
| 多文件模板与下载 | `app/prompt-detail.tsx`、`components/template-file-list.tsx` | `lib/template-catalog.ts`、`lib/download-text.ts` |
| 版本兼容 | 作品发布与详情 | `lib/version-range.mjs` |
| 点赞、收藏、讨论 | `app/community-panel.tsx`、`app/forum.css` | `lib/community.ts`、`lib/discussion.ts`、`app/api/prompts/[id]/community/` |
| 通知、作者主页 | `app/notification-center.tsx`、`app/public-profile.tsx`、`app/u/[tag]/` | `lib/notification-*.ts`、`lib/notification-store.mjs`、`lib/public-profile.ts` |
| OAuth、账号绑定与会话 | `app/account/`、`app/login/` | `lib/auth-*.ts`、`lib/auth-store.mjs`、`lib/oauth-*.ts`、`app/api/auth/` |
| 邮箱、密码与找回 | `app/register/`、`app/forgot-password/` | `lib/email-*`、`lib/password-*` |
| 后台、公告与审核 | `app/admin/`、`app/announcement-board.tsx` | `lib/admin-*`、`app/api/admin/`、`app/api/announcements/` |
| AI 审核与调度 | `app/admin/` | `lib/moderation-core.mjs`、`lib/moderation-queue.mjs`、`lib/moderation-scheduler.mjs`、`scripts/moderation-worker.mjs` |
| 使用统计 | `components/usage-stats.tsx` | `lib/usage-*`、`app/api/usage/` |
| 主题与界面 | `app/globals.css`、`app/theme.css`、`app/maibot-scrollbars.css` | `components/theme.tsx`、`components/retro*.tsx`、`vendor/` |

人设发布要求人格、行为风格、表达风格三个必填项；完整人设 JSON 共用 65536 个 UTF-16 code units 的额度，源文件导入限制为 1 MiB。相关规则见 `lib/prompts.ts`、`lib/config-source.ts` 和 `lib/personality-export.ts`，修改后应运行对应单元与 HTTP 回归。

后台保留已有的主管理员编号策略，见 `lib/admin-policy.mjs`；正式登录和测试登录分别由 `lib/auth-contract.ts` 控制。不要通过关闭正式认证或信任客户端身份头来开放后台。
