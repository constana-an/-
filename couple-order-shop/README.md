# 情侣点单小铺

面向两台 iPhone 的免费可安装 PWA。没有云配置时会进入本地体验模式；接入 Supabase 免费项目后，可使用情侣码配对、实时同步订单并发送 Web Push。

首次打开时选择“大宝”或“二宝”身份；身份只保存在当前 iPhone，后续会自动进入。订单发送者、接收者、实时状态和云端昵称会跟随当前身份，“我们”页可随时切换。

## 本地运行

```bash
npm install
npm run dev
```

## 免费双人同步

1. 创建 Supabase 免费项目。**不需要**开启 Anonymous Sign-ins：创建和加入双人小铺都要求正式账户，换手机后才能凭账户恢复数据。
2. 应用数据库迁移（见下面「数据库迁移」）：

   ```bash
   npx supabase link --project-ref <你的项目 ref>
   npx supabase db push
   ```
3. 复制 `.env.example` 为 `.env.local`，填写项目 URL 和 anon key。
4. 生成一对 VAPID 密钥，把公钥填入 `VITE_WEB_PUSH_PUBLIC_KEY`。
5. 将 `supabase/functions/notify-partner` 部署为 Edge Function，并设置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`。
6. 重新构建并部署到 HTTPS 地址；两台 iPhone 均用 Safari 打开，选择“添加到主屏幕”，再在“我们”页开启通知。

### 数据库迁移

`supabase/migrations/` 是唯一的数据库真相来源，文件名即执行顺序。**每个迁移都必须可以重复执行**——`npm run check:migrations` 会在每次 `npm test` 时静态检查这一点（策略必须先 `drop policy if exists`、建表必须 `if not exists`、加列必须有守卫、`create function` 必须是 `or replace` 或先 drop）。这条规则的意义是：任何一个只能在空库上跑通的语句，都会让第一次重跑在中途炸掉，把 schema 停在改了一半的状态。

| 场景 | 做法 |
| --- | --- |
| 新项目 | `npx supabase link --project-ref <ref>` 然后 `npx supabase db push` |
| 已有项目、之前手工执行过 | 先 `npx supabase migration repair --status applied <每个已执行的版本号>`，再 `db push` 只跑剩下的 |
| 不想用 CLI | 按文件名顺序把 `supabase/migrations/*.sql` 逐个贴进 SQL Editor；因为都可重复执行，重复贴一次也不会坏 |
| 新增迁移 | `npx supabase migration new <名字>`，写完跑 `npm run check:migrations` |

各步的作用，以及**没执行**时会看到什么：

| 迁移 | 作用 | 未执行的症状 |
| --- | --- | --- |
| `20260811000000_initial_schema.sql` | 表、RLS、配对与下单基础 | 什么都用不了 |
| `20260811013000_place_couple_order.sql`<br>`20260811030000_couple_profile.sql` | 下单与资料 RPC | 下单、改资料失败 |
| `20260811060000_commercial_foundation.sql` | 账户、回忆、纪念日、审计、限流 | 登录后功能大面积缺失 |
| `20260811120000_timezone_refund_and_retention.sql` | 统一时区、婉拒退款、关闭订单直写 | 周期键前后端不一致；订单可被绕过 RPC 直写 |
| `20260811150000_personal_wallets.sql` | 每人一个钱包 | 双方共用一个余额 |
| `20260811210000_manage_memories_and_anniversaries.sql` | 双方共管纪念日；回忆可改（含缺失的 `update` 授权） | 另一半点「管理」静默失败；改文字报 permission denied |
| `20260812010000_verified_tasks.sql` | `completed_at`；三个任务服务端校验 | 合照/订单/约会任务可空手领取 |
| `20260812030000_custom_wishes.sql` | 自定义心愿表；分类写进订单行 | 点自定义心愿报「这个心愿暂时下架了」 |
| `20260812060000_push_hygiene.sql` | `push_subscriptions` 表授权 | 退出登录删不掉订阅，手机继续收到那对情侣的推送 |
| `20260812080000_cancel_order.sql` | 撤回订单、婉拒理由；`update_order_status` 换三参数版（**旧两参数版会被 drop**，否则调用歧义） | 撤回按钮报错 |
| `20260812100000_pairing_bonus.sql` | 配对完成时双方各 20 币（8 + 20 = 28，当天就能点第一份） | 新情侣要攒三四天才能下第一单 |
| `20260812120000_partner_presence.sql` | `get_partner_status()` 只读窗口（不含余额）、自写心愿上限 30、把 `custom_menu_items`／`task_claims`／`daily_checkins` 加进 realtime publication | 看不到对方状态；自写心愿无上限；**对方新写的心愿要刷新才出现**（订阅一直没生效） |

> 订单表在 `20260811120000` 就已经收口：直接写 `orders` 的策略被删除，`insert/update/delete` 授权也已从 `anon`、`authenticated` 收回，所有下单与状态流转只能走 `place_couple_order` / `update_order_status` 两个 SECURITY DEFINER 函数。

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | 云同步必填 | 留空即进入本地体验模式，不加载 Supabase 客户端。 |
| `VITE_WEB_PUSH_PUBLIC_KEY` | 推送必填 | VAPID 公钥，缺失时通知仍可开启，但不会注册后台推送订阅。 |
| `VITE_AUTH_PHONE_ENABLED` | 否，默认 `0` | 置 `1` 才显示手机号登录入口，需先在 Supabase 配置短信服务商。 |
| `VITE_AUTH_APPLE_ENABLED` | 否，默认 `0` | 置 `1` 才显示 Apple 登录入口，需先配置 Apple Developer 凭据。 |
| `VITE_MEMBERSHIP_ENABLED` | 否，默认 `0` | 置 `1` 才显示会员权益入口；支付通道接通前保持关闭。 |

三个开关都要求云配置存在，未接通的登录方式与会员入口会整块隐藏，而不是显示后失败。

### 发版

改动应用外壳（HTML、图标、`public/` 资源）后，请提升 `public/sw.js` 里的 `CACHE` 版本号；`activate` 会删除所有其它版本的缓存，这是已添加到主屏幕的设备拿到新版本的唯一途径。

第一台手机点击“创建情侣小铺”得到六位情侣码，第二台手机输入该码即可加入。

### 运维

- `public.prune_operational_data()` 清理限流、审计与错误日志。装了 `pg_cron` 的项目会自动每天 04:17 执行；免费项目没有 `pg_cron` 时，请定期手动执行一次，或用外部定时任务调用。
- 限流表还会在每次调用时顺带清掉当前用户一天前的窗口，因此即使没有定时任务也不会无限增长。

## 甜心币经济

- **每个人有自己的钱包**：甜心币属于个人，另一半不能花你的币。云端存在 `profiles.coin_balance`，本地模式存在 `couple-shop-coins:<身份>`。
- 双方各自从 8 枚开始。任务、签到的奖励只进入**领取者本人**的钱包；两个人各领各的，互不影响。
- 每人每天最多 8 枚、每周额外最多 29 枚，全勤一周 85 枚；正常（非全勤）参与一周通常落在 30–50 枚。
- 食物兑换为 28–78 枚；服务为 48–118 枚；约会为 60–188 枚；限定券为 120–360 枚。
- 限定券每对情侣**永久只能使用一次**（不区分谁点的），已用过的会在小铺里置灰。
- **自定义心愿**：除限定券外的三个分类都可以写自己的心愿，价格 8–400 甜心币，两个人都能改、都能下架。价格由服务端从 `custom_menu_items` 读取，客户端报的价不作数。限定券保持固定名录——自己发的「永久只能用一次」没人能替你守住。下架不影响已经点过的订单：订单行自带名字、价格和分类。
- 下单从**下单人自己**的钱包扣币；被婉拒时原路退回给下单人，收单方的余额不受影响。只有收到订单的一方可以接单、婉拒或推进状态。
- 每个人只能看到自己的余额；`profiles` 的 RLS 只放行 `user_id = auth.uid()`。
- 任务页会显示**对方这周**：连续签到、本周攒了多少任务币、今天有没有来。走 `get_partner_status()` 这个只读函数，**不含也不能含余额**；本地模式直接读另一个身份的存储，行为一致。
- 回忆页有**里程碑**：相爱 100/365/520/1000 天、完成 1/10/50/100 个心愿、连续签到 7/30/100 天。跨过时庆祝一次，每人各记各的。
- 自己写的心愿每对情侣最多 30 个。
- 任务与签到的日期周期以 `Asia/Shanghai` 为准（见 `src/lib/date.ts` 与 `public.app_today()`），前后端使用同一套周期键。
- **三个任务要真的做过才能领**：「记录一张本周合照」需要本人本周上传过照片；「认真完成一份订单」需要本人本周完成过一份对方点的心愿；「完成一次用心约会」还要求那份心愿属于「去约会」分类。判断以 `orders.completed_at` 为准，由 `update_order_status` 打戳。其余五个任务（早安晚安、夸奖、分享心情、专心陪伴、一起散步）数据里无从佐证，继续按自觉领取。
- 校验同时存在于客户端（按钮显示「待完成」并说明缺什么）和 `claim_couple_task`（真正发币的一方）。本地体验模式没有相册，合照任务在本地模式不做校验。

## 目录结构

- `src/Prototype.tsx` — 应用编排：状态、云同步、各种底部弹层。
- `src/screens/` — 五个主页面与 `MenuArt`。
- `src/lib/` — 纯逻辑：日期与周期键、菜单与任务目录、本地存储、错误文案、Supabase 懒加载。
- `src/mobile/` — 受保护的手机运行时，除非明确要求改运行时，否则不要改动。
- `docs/design/` — 设计对比截图与视觉验收记录。

## 验证

```bash
npm test
```

`npm test` 依次执行运行时完整性检查、迁移可重放检查、日期逻辑单测（分别在美东与北京时区各跑一遍）、RLS 策略与授权检查、Sites worker 测试和 Playwright 交互测试。也可以单独运行：

```bash
npm run check:runtime
npm run check:migrations
npm run test:logic
npm run test:sql
npm run build
npm run test:sites
npm run test:runtime
```

另有一套**需要凭据、不进 `npm test`** 的真实云端集成测试，覆盖双账户配对、RLS 隔离、订单状态机与退款、任务真实性校验、纪念日双方共管、推送订阅隔离和 Edge Function 可达性：

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:cloud
```

它会用 service role 自建三个一次性账号（两位伴侣 + 一个局外人）、跑完后删除，并在开始前给钱包充值——新账号只有 8 币，而最便宜的心愿要 28 币。**只指向测试项目**：过程中会真实写入订单、回忆和纪念日。缺少任一环境变量时整组自动跳过并提示。

`npm run test:sql` 不连数据库：它按文件名顺序重放 `supabase/migrations/` 的全部迁移，算出最终的策略与授权，确保写路径没有被悄悄放开、也没有只加策略却漏掉表授权（Postgres 先查表授权再查 RLS，漏掉就会直接 permission denied）。
