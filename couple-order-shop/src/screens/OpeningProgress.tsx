import { CheckIcon } from "@radix-ui/react-icons";
import { cloudEnabled } from "../lib/supabase";

export type OpeningStep = { id: string; title: string; detail: string; done: boolean; action?: () => void; cta?: string };

/**
 * The first run is the longest part of this app: choosing an identity is easy,
 * but a couple is not really open for business until they have an account, a
 * paired shop, notifications, and one wish actually sent. Each of those lived
 * on a different screen with nothing tying them together, so people stopped
 * after step one. This turns the whole thing into one visible checklist that
 * disappears the moment it is finished.
 */
export function OpeningProgress({ steps, onDismiss }: { steps: OpeningStep[]; onDismiss: () => void }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.find((step) => !step.done)!;

  return (
    <section className="opening-progress" aria-label="开张进度">
      <div className="opening-head">
        <div>
          <span>开张进度 {done}/{steps.length}</span>
          <strong>{cloudEnabled ? "再走几步，小铺就开张了" : "还差一步就开张了"}</strong>
        </div>
        <button className="opening-skip" onClick={onDismiss}>以后再说</button>
      </div>
      <ol className="opening-steps">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "is-done" : step.id === next.id ? "is-next" : ""}>
            <span className="opening-tick">{step.done ? <CheckIcon /> : null}</span>
            <div><strong>{step.title}</strong><small>{step.detail}</small></div>
          </li>
        ))}
      </ol>
      {next.action && <button className="opening-action" onClick={next.action}>{next.cta ?? next.title}</button>}
    </section>
  );
}
