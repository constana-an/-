import { BellIcon, CardStackIcon, DownloadIcon, GearIcon, LinkBreak2Icon, LockClosedIcon, PaperPlaneIcon, PersonIcon, ReaderIcon } from "@radix-ui/react-icons";
import type { User } from "@supabase/supabase-js";
import { KeyboardInput } from "../mobile";
import { formatStartedOn, relationshipDays } from "../lib/date";
import { appleAuthEnabled, cloudEnabled, membershipEnabled, phoneAuthEnabled } from "../lib/supabase";
import { displayNameFor } from "../lib/types";
import type { CoupleProfile, Identity, MembershipState } from "../lib/types";

export function OursScreen({
  identity,
  partnerName,
  onSwitchIdentity,
  push,
  onEnableNotifications,
  cloudCoupleId,
  inviteCode,
  onCopyInviteCode,
  pairingCode,
  setPairingCode,
  cloudBusy,
  onCreateSpace,
  onJoinSpace,
  profile,
  onOpenSettings,
  authUser,
  onOpenAccount,
  membership,
  onExport,
  onLeaveCouple,
  onOpenPrivacy,
}: {
  identity: Identity;
  partnerName: string;
  onSwitchIdentity: () => void;
  /** Permission alone proves nothing; only a live subscription can be pushed to. */
  push: { permission: NotificationPermission | "unsupported"; subscribed: boolean };
  onEnableNotifications: () => void;
  cloudCoupleId: string | null;
  /** The couple's real invite code; null until a space has actually been created or joined. */
  inviteCode: string | null;
  onCopyInviteCode: () => void;
  pairingCode: string;
  setPairingCode: (value: string) => void;
  cloudBusy: boolean;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  profile: CoupleProfile;
  onOpenSettings: () => void;
  authUser: User | null;
  onOpenAccount: () => void;
  membership: MembershipState;
  onExport: () => void;
  onLeaveCouple: () => void;
  onOpenPrivacy: () => void;
}) {
  const currentName = displayNameFor(profile, identity);
  const days = relationshipDays(profile.startedOn);
  const protectedAccount = Boolean(authUser && !authUser.is_anonymous);
  // Name only the providers this deployment can actually serve; the sheet
  // itself already hides the rest, and the two must not disagree.
  const signInMethods = `${["邮箱", phoneAuthEnabled ? "手机号" : null, appleAuthEnabled ? "Apple" : null]
    .filter(Boolean).join("、")}登录`;
  // Four states, because "allowed" and "will actually arrive" are different
  // things — and the gap between them is where the old copy lied.
  const pushNotice = push.permission !== "granted"
    ? { state: "去开启", detail: "点击开启 iPhone 通知" }
    : push.subscribed
      ? { state: "已开启", detail: "对方下单或回应时会推送到这台手机" }
      : cloudCoupleId
        ? { state: "未完成", detail: "还没订阅推送，点这里重试" }
        : { state: "仅本机", detail: "已允许通知；连接双人小铺后才会推送" };
  return (
    <section className="page-section ours-page">
      <div className="couple-card"><div className="large-avatar">{profile.firstName.slice(0, 1)}</div><div><span>{profile.shopName}</span><h2>{profile.firstName} & {profile.secondName}</h2><p>相爱第 {days} 天 · {formatStartedOn(profile.startedOn)}开始</p></div><div className="large-avatar partner">{profile.secondName.slice(0, 1)}</div></div>
      <button className="setting-row" onClick={onSwitchIdentity}><span className="setting-icon identity"><PersonIcon /></span><span><strong>当前身份：{currentName}</strong><small>另一台 iPhone 请登录 {partnerName}</small></span><span className="setting-state">切换</span></button>
      <button className="setting-row" onClick={onOpenAccount}><span className="setting-icon account"><LockClosedIcon /></span><span><strong>{authUser?.is_anonymous ? "升级试用账户" : authUser?.email ?? authUser?.phone ?? "登录或注册账户"}</strong><small>{protectedAccount ? "换手机后登录即可恢复双人小铺" : signInMethods}</small></span><span className={`setting-state ${protectedAccount ? "on" : ""}`}>{protectedAccount ? "已保护" : "去登录"}</span></button>
      {push.permission !== "unsupported" && (
        <button className="setting-row" onClick={onEnableNotifications}>
          <span className="setting-icon pink"><BellIcon /></span>
          <span><strong>实时消息通知</strong><small>{pushNotice.detail}</small></span>
          <span className={`setting-state ${push.subscribed ? "on" : ""}`}>{pushNotice.state}</span>
        </button>
      )}
      {inviteCode && (
        <button className="setting-row" onClick={onCopyInviteCode}><span className="setting-icon mint"><PaperPlaneIcon /></span><span><strong>邀请另一半</strong><small>情侣码 {inviteCode}</small></span><span className="setting-state">复制</span></button>
      )}
      <button className="setting-row" onClick={onOpenSettings}><span className="setting-icon gold"><GearIcon /></span><span><strong>小铺设置</strong><small>双方名字、小铺名称与开始日期</small></span><span className="setting-state">设置</span></button>
      {/* The paid tier has no payment channel yet, so during the test period the
          entitlement row would only lead back to the account sheet. */}
      {membershipEnabled && (
        <button className="setting-row" onClick={onOpenAccount}><span className="setting-icon membership"><CardStackIcon /></span><span><strong>{membership.planName}</strong><small>{membership.status === "active" ? "当前权益正常" : "会员状态需要处理"}</small></span><span className="setting-state">权益</span></button>
      )}
      <button className="setting-row" onClick={onExport}><span className="setting-icon mint"><DownloadIcon /></span><span><strong>导出数据</strong><small>下载订单、任务、回忆和纪念日的 JSON，照片只含引用路径</small></span><span className="setting-state">导出</span></button>
      <button className="setting-row" onClick={onOpenPrivacy}><span className="setting-icon identity"><ReaderIcon /></span><span><strong>隐私协议与账户安全</strong><small>查看数据用途、注销规则和操作记录</small></span><span className="setting-state">查看</span></button>
      {cloudCoupleId && <button className="setting-row danger-row" onClick={onLeaveCouple}><span className="setting-icon danger"><LinkBreak2Icon /></span><span><strong>解除配对</strong><small>仅移除当前账户，另一半的数据仍会保留</small></span><span className="setting-state">解除</span></button>}
      {cloudEnabled && !cloudCoupleId && (
        <div className="pair-card">
          <div><strong>连接两台 iPhone</strong><p>一人创建小铺，另一人输入情侣码加入</p></div>
          <button className="create-space" disabled={cloudBusy} onClick={onCreateSpace}>{cloudBusy ? "连接中…" : "创建情侣小铺"}</button>
          <span className="pair-divider">或者输入对方的情侣码</span>
          <div className="pair-input-row"><KeyboardInput value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="输入 6 位情侣码" /><button disabled={cloudBusy || pairingCode.length < 6} onClick={onJoinSpace}>加入</button></div>
        </div>
      )}
      <div className="cloud-state"><span className={`cloud-dot ${cloudCoupleId ? "online" : ""}`} /><div><strong>{cloudCoupleId ? "双人云同步已连接" : cloudEnabled ? "等待连接另一台 iPhone" : "本地体验模式"}</strong><p>{cloudCoupleId ? "两台 iPhone 的订单会实时同步" : cloudEnabled ? "创建小铺或输入情侣码后即可同步" : "添加免费 Supabase 配置后即可跨手机同步"}</p></div></div>
    </section>
  );
}
