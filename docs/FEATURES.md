# 功能与代码索引

| 功能 | 页面／组件 | 核心逻辑与接口 |
| --- | --- | --- |
| 作品列表、筛选、分页 | `app/prompt-garden.tsx`、`components/catalog-card.tsx` | `lib/prompts.ts`、`lib/search.ts`、`lib/search-query.ts`、`lib/prompt-sort.ts`、`app/api/prompts/` |
| 人设编辑、导入导出 | `app/prompt-composer.tsx`、`app/multiple-reply-style-editor.tsx` | `lib/config-source.ts`、`lib/personality-export.ts`、`lib/prompt-request.ts` |
| 返回 MaiBot 导入 | `components/maibot-import.tsx`、`components/maibot-bridge.tsx` | `lib/maibot-bridge.ts` |
| 多文件模板与下载 | `app/prompt-detail.tsx`、`components/template-file-list.tsx` | `lib/template-catalog.ts`、`lib/download-text.ts` |
| 版本兼容 | 作品发布与详情 | `lib/version-range.mjs` |
| 点赞、收藏、讨论 | `app/community-panel.tsx`、`app/forum.css` | `lib/community.ts`、`lib/discussion.ts`、`app/api/prompts/[id]/community/` |
| 通知、作者主页 | `app/notification-center.tsx`、`app/public-profile.tsx`、`app/u/[tag]/` | `lib/notification-*.ts`、`lib/notification-store.mjs`、`lib/public-profile.ts` |
| 我的发布、作者作品分页 | `app/account-panel.tsx`、`app/public-profile.tsx`、`components/work-pagination.tsx` | `hooks/use-author-works.ts`、`app/api/prompts/` |
| OAuth、账号绑定与会话 | `app/account/`、`app/login/` | `lib/auth-*.ts`、`lib/auth-store.mjs`、`lib/oauth-*.ts`、`app/api/auth/` |
| 邮箱、密码与找回 | `app/register/`、`app/forgot-password/` | `lib/email-*`、`lib/password-*` |
| 后台、公告与审核 | `app/admin/`、`app/announcement-board.tsx` | `lib/admin-*`、`app/api/admin/`、`app/api/announcements/` |
| AI 审核与调度 | `app/admin/` | `lib/moderation-core.mjs`、`lib/moderation-queue.mjs`、`lib/moderation-scheduler.mjs`、`scripts/moderation-worker.mjs` |
| 使用统计 | `components/usage-stats.tsx` | `lib/usage-*`、`app/api/usage/` |
| 主题与界面 | `app/globals.css`、`app/catalog-layout.module.css`、`app/theme.css`、`app/maibot-scrollbars.css` | `components/theme.tsx`、`components/retro*.tsx`、`vendor/` |

桌面作品卡片简介最多三行，正文预览按可用空间展示，配置会依次补充人格、行为与表达风格。手机使用紧凑卡片，简介最多两行、正文最多三行。

我的发布与作者主页每页最多显示 10 条作品，列表在限定高度的作品区内滚动，沿用全站复古滚动条；标题、类型筛选和分页按钮保持在滚动区外。支持上一页、下一页和当前页码；切换类型回到第一页，翻页或切换类型后列表回到顶部，删除末页最后一项后返回前一页。作品列表接口支持 `limit` 参数，默认及上限为 24 条，配合 `offset` 和 `hasMore` 翻页。

人设发布要求人格、行为风格、表达风格三个必填项；完整人设 JSON 共用 65536 个 UTF-16 code units 的额度，源文件导入限制为 1 MiB。相关规则见 `lib/prompts.ts`、`lib/config-source.ts` 和 `lib/personality-export.ts`，修改后应运行对应单元与 HTTP 回归。

MaiBot 的「浏览人设市场」入口通过 URL fragment 传递 `maibot-webui-origin`、`appearance` 和 `theme`。网站在当前标签页的 sessionStorage 记住 WebUI 来源和 HTTP／HTTPS 目标地址；读取后从网址移除这三个参数。只有携带该入口参数进入的用户才看到「导入到 MaiBot」区域及相关说明，有有效目标时顶部也显示返回 WebUI 的箭头。来源状态随刷新和站内跳转保留，普通新标签页、普通分享链接和仅有历史手填地址的访问保留复制 JSON、下载等操作。

WebUI 来源与目标地址分开保存。来源地址不受支持或被用户清除时，仍可在点击导入后填写正确地址。地址编辑默认隐藏；有有效地址时先打开导入链接，随后可通过「未能打开？」确认、修改或清除地址。浏览器无法可靠确认跨站新标签页是否加载成功，因此由用户选择该恢复入口。

WebUI 来源的人设详情将导入、复制 JSON、下载 JSON 和复制链接合并为工具栏，仅导入使用主按钮样式；桌面端同行排列，复制链接靠右，窄屏按两列排列。下方显示「您会跳转到MaiBot WebUI继续，检测到地址：{目标地址}」。作者的编辑、删除操作单独排列。普通访问与提示词模板沿用原有操作区。

有效的 `light`／`dark` 会同步网站明暗模式，用户仍可手动切换；`appearance` 使用网站现有风格作为回退。人设详情的「导入到 MaiBot」在新标签页打开 `{origin}/config/bot?tab=bot#personality-import={编码后的完整 JSON}`，内容沿用现有 JSON 校验，不包含实例或主题参数。登录、预览、确认保存和手动切换由支持该协议的 MaiBot WebUI 处理。链接过长、跳转受限或旧版 WebUI 不支持时，可继续复制 JSON 或下载；此入口不提供桌面应用原生回跳。

后台保留已有的主管理员编号策略，见 `lib/admin-policy.mjs`；正式登录和测试登录分别由 `lib/auth-contract.ts` 控制。不要通过关闭正式认证或信任客户端身份头来开放后台。
