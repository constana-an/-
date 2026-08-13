export function authErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确";
  if (lower.includes("already registered") || lower.includes("already been registered")) return "这个邮箱已经注册过了";
  if (lower.includes("password")) return "密码至少需要 6 位";
  if (lower.includes("rate limit")) return "操作太频繁，请稍后再试";
  if (lower.includes("phone provider")) return "手机号登录尚未配置短信服务";
  if (lower.includes("provider is not enabled")) return "该登录方式尚未配置";
  return "操作失败，请稍后再试";
}

/** Maps the exceptions raised by `place_couple_order` to shop copy. */
export function orderErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient balance")) return "甜心币不够啦";
  if (lower.includes("limited item already used")) return "这张限定券已经用过了";
  if (lower.includes("rate limit")) return "点得太快啦，休息一下再点";
  if (lower.includes("not paired")) return "还没有连接双人小铺";
  if (lower.includes("invalid item")) return "这个心愿暂时下架了";
  return "下单失败，请稍后再试";
}

/** Maps the exceptions raised by `update_order_status` to order-list copy. */
export function orderStatusErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not the recipient")) return "只有收到订单的一方可以接单或婉拒";
  if (lower.includes("invalid transition")) return "订单状态已变化，请刷新后再试";
  if (lower.includes("rate limit")) return "操作太频繁，请稍后再试";
  return "订单更新失败，请稍后再试";
}

/** Maps the exceptions raised by `claim_couple_task` / `daily_checkin`. */
export function rewardErrorMessage(message: string, duplicateCopy: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("unique")) return duplicateCopy;
  if (lower.includes("requirement not met: photo")) return "先去「回忆」上传一张本周的照片再来领";
  if (lower.includes("requirement not met: date-done")) return "先完成一份对方点的「去约会」心愿再来领";
  if (lower.includes("requirement not met")) return "先完成一份对方点的心愿再来领";
  if (lower.includes("rate limit")) return "操作太频繁，请稍后再试";
  if (lower.includes("not paired")) return "还没有连接双人小铺";
  return "操作失败，请稍后再试";
}
