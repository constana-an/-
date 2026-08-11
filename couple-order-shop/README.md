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
2. 在 SQL Editor 中**按顺序**执行：
   1. `supabase/schema.sql`
   2. `supabase/migrations/20260811013000_place_couple_order.sql`
   3. `supabase/migrations/20260811030000_couple_profile.sql`
   4. `supabase/migrations/20260811060000_commercial_foundation.sql`
   5. `supabase/migrations/20260811120000_timezone_refund_and_retention.sql`
3. 复制 `.env.example` 为 `.env.local`，填写项目 URL 和 anon key。
4. 生成一对 VAPID 密钥，把公钥填入 `VITE_WEB_PUSH_PUBLIC_KEY`。
5. 将 `supabase/functions/notify-partner` 部署为 Edge Function，并设置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`。
6. 重新构建并部署到 HTTPS 地址；两台 iPhone 均用 Safari 打开，选择“添加到主屏幕”，再在“我们”页开启通知。

第一台手机点击“创建情侣小铺”得到六位情侣码，第二台手机输入该码即可加入。

### 运维

- `public.prune_operational_data()` 清理限流、审计与错误日志。装了 `pg_cron` 的项目会自动每天 04:17 执行；免费项目没有 `pg_cron` 时，请定期手动执行一次，或用外部定时任务调用。
- 限流表还会在每次调用时顺带清掉当前用户一天前的窗口，因此即使没有定时任务也不会无限增长。

## 甜心币经济

- 新用户初始 8 枚甜心币；甜心币是**双人共用的一个钱包**。
- 任务奖励**按人计算，两个人各领各的**：每人每天最多 4 枚、每周额外最多 14 枚，两人合计即每天 8 枚、每周 28 枚。
- 一个人全勤一周约 42 枚，双方合计上限约 84 枚；正常（非全勤）参与一周通常落在 30–50 枚。
- 食物兑换为 28–78 枚；服务为 48–118 枚；约会为 60–188 枚；限定券为 120–360 枚。
- 限定券每对情侣**永久只能使用一次**，已用过的会在小铺里置灰。
- 订单被婉拒会**原路退回**甜心币；只有收到订单的一方可以接单、婉拒或推进状态。
- 任务与签到的日期周期以 `Asia/Shanghai` 为准（见 `src/lib/date.ts` 与 `public.app_today()`），前后端使用同一套周期键。

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

`npm test` 依次执行运行时完整性检查、日期逻辑单测（分别在美东与北京时区各跑一遍）、Sites worker 测试和 Playwright 交互测试。也可以单独运行：

```bash
npm run check:runtime
npm run test:logic
npm run build
npm run test:sites
npm run test:runtime
```
