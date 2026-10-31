# Node 运行配置

把根目录 `.env.example` 复制为 `.env.local`。默认 Node 启动器读取该文件；操作系统已经设置的环境变量优先。配置和数据库均被 Git 忽略。

| 变量 | 用途与默认值 |
| --- | --- |
| `AUTH_URL` | 登录的规范来源；本地为 `http://127.0.0.1:3000`。自己的公网实例须显式使用自己的 HTTPS 域名 |
| `MAIBOT_PUBLIC_ORIGIN` | 反向代理后的公开来源；与 `AUTH_URL` 保持一致 |
| `MAIBOT_DATABASE_PATH` | SQLite 路径，默认 `data/maibot.sqlite`，相对仓库根目录解析 |
| `HOSTNAME`、`PORT` | 默认 `127.0.0.1`、`3000`；改端口时同步修改两个来源变量 |
| `MAIBOT_ALLOW_TEST_LOGIN` | 默认关闭；仅隔离演示或测试中启用 |
| `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | 自己的 GitHub OAuth 应用；两项均填写后启用 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 自己的 Google OAuth 应用；两项均填写后启用 |
| `RESEND_API_KEY`、`RESEND_FROM` | 自己的邮件服务密钥与已验证发件人 |
| `EMAIL_AUTH_SECRET` | 邮箱验证码及密码流程的秘密，至少 32 个字符 |
| `MODERATION_ENCRYPTION_KEY` | 审核供应商密钥的加密密钥，64 个十六进制字符 |
| `MODERATION_LOCAL_ENDPOINT` | 可选的本地审核端点允许项；未配置时不开放本地端点 |

`MAIBOT_RUNTIME=vps` 由默认启动器设置，表示 Node／SQLite 和正式身份逻辑，与是否真的运行在 VPS 无关。

两家 OAuth 回调分别为 `AUTH_URL` 加 `/api/auth/callback/github` 和 `/api/auth/callback/google`。邮箱注册、找回和绑定需要邮件三项配置。

可分别运行以下命令生成两份互不相同的本地秘密，再写入自己的 `.env.local`：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

持久化数据库必须同时保管其加密配置；更换审核加密密钥后，旧供应商密钥需要重新录入。仓库不包含可直接复用的运行密钥。

## 初始管理员

先通过配置好的登录方式创建自己的账号。查看个人中心编号后，明确指定自己的开发数据库，执行现有 `scripts/bootstrap-admin.mjs <账号编号>`。例如 PowerShell：

```powershell
$env:MAIBOT_DATABASE_PATH = (Resolve-Path data/maibot.sqlite).Path
node scripts/bootstrap-admin.mjs 2
```

脚本只在没有活跃管理员时授予首个管理员。现有主管理员策略固定为编号 2，见 `lib/admin-policy.mjs`；初始化自己的实例时应确认账号顺序，不能假定任意账号都能管理全部设置。后续管理员由后台授权。
