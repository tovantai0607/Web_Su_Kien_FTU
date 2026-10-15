import { service, type Env } from './security';
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function emailTemplate(template: string, payload: Record<string, string>) {
  const titles: Record<string, string> = {
    received: 'Hồ sơ của bạn đã được tiếp nhận',
    approved: 'Hồ sơ của bạn đã được duyệt',
    rejected: 'Thông tin xét duyệt hồ sơ',
    needs_changes: 'Vui lòng bổ sung hồ sơ',
    reminder: 'Lịch hẹn trên hành trình FTUCHARM',
  };
  const title = titles[template] ?? 'Thông báo từ FTUCHARM';
  return {
    subject: `FTUCHARM • ${title}`,
    html: `<div style="background:#fff9fb;padding:36px;font:16px Arial;color:#2f2930"><div style="max-width:540px;margin:auto;background:white;padding:32px;border-radius:16px"><p style="color:#913b59">FTUCHARM • Duyên dáng Ngoại thương</p><h1 style="font:32px Georgia">${title}</h1><p>Mã hồ sơ: <strong>${escapeHtml(payload.code ?? '')}</strong></p><p>${template === 'received' ? 'Chúng tôi đã lưu hồ sơ của bạn. Đây là xác nhận tiếp nhận, chưa phải thông báo trúng tuyển.' : escapeHtml(payload.note ?? 'Vui lòng xem thông tin trong tài khoản của bạn.')}</p><p>Cảm ơn bạn đã sẵn sàng kể câu chuyện của chính mình.</p></div></div>`,
  };
}
export async function sendOutbox(env: Env) {
  if (env.EMAIL_DELIVERY_ENABLED === 'false') return;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  const db = service(env);
  const { data: jobs, error } = await db.rpc('claim_emails');
  if (error || !jobs) return;
  for (const job of jobs) {
    try {
      const email = emailTemplate(job.template, job.payload);
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': job.id,
        },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: job.to_email, ...email }),
      });
      if (!result.ok) throw new Error('Provider unavailable');
      await db.from('email_outbox').update({ status: 'sent', locked_at: null }).eq('id', job.id);
    } catch {
      await db
        .from('email_outbox')
        .update({
          status: job.attempts >= 6 ? 'failed' : 'pending',
          locked_at: null,
          next_attempt_at: new Date(
            Date.now() + Math.min(3600, 2 ** job.attempts * 30) * 1000,
          ).toISOString(),
        })
        .eq('id', job.id);
    }
  }
}
