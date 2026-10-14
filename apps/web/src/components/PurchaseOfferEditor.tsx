import { useRef, useState } from 'react';
import type { z } from 'zod';
import { Button, Field, Input } from '@ftu/ui';
import { offerConfigSchema } from '@ftu/shared';

type Configuration = z.infer<typeof offerConfigSchema>;
type ProductConfiguration = Configuration['products'][number];

function vietnamTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(Date.parse(value) + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function withOffset(value: string) {
  return value ? `${value}:00+07:00` : '';
}

export default function PurchaseOfferEditor({
  value,
  onChange,
  onSave,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => Promise<void>;
  busy: boolean;
}) {
  // Parent only supplies configs created locally or normalized from the authenticated API.
  const config = JSON.parse(value) as Configuration;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const summary = useRef<HTMLDivElement>(null);
  function update(patch: Partial<Configuration>) {
    onChange(JSON.stringify({ ...config, ...patch }));
    setErrors({});
  }
  function product(index: number, patch: Partial<ProductConfiguration>) {
    update({ products: config.products.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  }
  function addProducts() {
    const products = config.products.slice();
    for (const name of ['The Intro', 'The Bridge', 'The Chorus']) {
      for (const tier of ['EARLY', 'NORMAL'] as const) {
        if (products.some((p) => p.name === name && p.tier === tier)) continue;
        products.push({
          id: crypto.randomUUID(),
          name,
          tier,
          quota: 0,
          price_vnd: 100000,
          combo2_vnd: null,
          combo3_vnd: null,
          opens_at: '',
          closes_at: '',
          enabled: false,
        });
      }
    }
    update({ products });
  }
  async function submit() {
    const result = offerConfigSchema.safeParse(config);
    const nextErrors: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        nextErrors[path] ??= issue.message;
      }
    }
    if (config.mode === 'LIVE' && config.published) {
      if (!config.qr_path) nextErrors.qr_path = 'Thêm ảnh QR nhận tiền trước khi công bố LIVE.';
      if (!config.payment_instructions.trim())
        nextErrors.payment_instructions = 'Nhập hướng dẫn chuyển khoản trước khi công bố LIVE.';
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setErrors({});
    await onSave();
  }
  const money = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : v);
  return (
    <form
      className="purchase-config-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {Object.keys(errors).length > 0 && (
        <div className="error-state" role="alert" tabIndex={-1} ref={summary}>
          Kiểm tra các trường được đánh dấu bên dưới. Cấu hình chưa được lưu.
        </div>
      )}
      <p>
        Giá dùng VND; lịch nhập theo giờ Việt Nam (UTC+7). Giá mới chỉ áp dụng đơn mới, đơn đang giữ
        giữ nguyên giá.
      </p>
      <fieldset disabled={busy} className="purchase-config-section">
        <legend>Thông tin đợt bán</legend>
        <div className="purchase-config-grid">
          <Field label="Tên đợt bán" error={errors.title}>
            <Input value={config.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Đường dẫn đợt bán" error={errors.slug} hint="Ví dụ: chung-ket-2027">
            <Input value={config.slug} onChange={(e) => update({ slug: e.target.value })} />
          </Field>
          <Field label="Địa điểm" error={errors.venue}>
            <Input value={config.venue} onChange={(e) => update({ venue: e.target.value })} />
          </Field>
          <Field label="Giờ tổ chức (nếu đã chốt)" error={errors.starts_at}>
            <Input
              type="datetime-local"
              value={vietnamTime(config.starts_at)}
              onChange={(e) => update({ starts_at: withOffset(e.target.value) || null })}
            />
          </Field>
          <Field label="Chế độ đợt bán" error={errors.mode}>
            <select
              className="input"
              value={config.mode}
              onChange={(e) => update({ mode: e.target.value as Configuration['mode'] })}
            >
              <option value="LIVE">LIVE — nhận tiền thật</option>
              <option value="DEMO">DEMO — không chuyển tiền</option>
            </select>
          </Field>
          <Field
            label="Ảnh QR nhận tiền"
            error={errors.qr_path}
            hint="Ảnh đã có trên web, ví dụ /images/qr-ngan-hang.png. DEMO không cần QR thật."
          >
            <Input
              value={config.qr_path ?? ''}
              onChange={(e) => update({ qr_path: e.target.value.trim() || null })}
            />
          </Field>
        </div>
        <Field label="Hướng dẫn chuyển khoản" error={errors.payment_instructions}>
          <textarea
            className="input"
            rows={3}
            value={config.payment_instructions}
            onChange={(e) => update({ payment_instructions: e.target.value })}
          />
        </Field>
        <label className="purchase-config-check">
          <input
            type="checkbox"
            checked={config.published}
            onChange={(e) => update({ published: e.target.checked })}
          />
          Công bố đợt bán (mùa và vòng cũng phải được công bố)
        </label>
        <details>
          <summary>Mùa và vòng thi</summary>
          <p>Giữ nguyên mùa/vòng của đợt đang sử dụng. Không lấy vòng thuộc mùa khác.</p>
          <div className="purchase-config-grid">
            <Field label="ID mùa thi" error={errors.edition_id}>
              <Input
                value={config.edition_id}
                onChange={(e) => update({ edition_id: e.target.value })}
              />
            </Field>
            <Field label="ID vòng thi" error={errors.round_id}>
              <Input
                value={config.round_id}
                onChange={(e) => update({ round_id: e.target.value })}
              />
            </Field>
          </div>
        </details>
      </fieldset>
      <fieldset disabled={busy} className="purchase-config-section">
        <legend>Hạng vé, giá và số lượng</legend>
        <p>
          Giá tạm 100.000đ/vé. Quota tính theo số vé, gồm cả vé trong combo. Để trống giá combo để
          tắt; giá combo là tổng tiền cho 2 hoặc 3 vé.
        </p>
        <Button type="button" variant="outline" onClick={addProducts}>
          Thêm các hạng vé còn thiếu
        </Button>
        {config.products.length === 0 && (
          <p>Chưa có hạng vé. Thêm hạng rồi điền lịch và quota trước khi bán.</p>
        )}
        {config.products.map((p, index) => {
          const path = `products.${index}.`;
          return (
            <fieldset key={p.id} className="purchase-config-product">
              <legend>
                {p.name} · {p.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'}
              </legend>
              <div className="purchase-config-grid">
                <Field label="Tên hạng vé" error={errors[path + 'name']}>
                  <Input
                    value={p.name}
                    onChange={(e) => product(index, { name: e.target.value })}
                  />
                </Field>
                <Field label="Đợt vé" error={errors[path + 'tier']}>
                  <select
                    className="input"
                    value={p.tier}
                    onChange={(e) =>
                      product(index, { tier: e.target.value as ProductConfiguration['tier'] })
                    }
                  >
                    <option value="EARLY">Vé sớm</option>
                    <option value="NORMAL">Vé thường</option>
                  </select>
                </Field>
                {(['price_vnd', 'combo2_vnd', 'combo3_vnd', 'quota'] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      {
                        price_vnd: 'Giá vé đơn (VND)',
                        combo2_vnd: 'Giá Combo 2 (VND)',
                        combo3_vnd: 'Giá Combo 3 (VND)',
                        quota: 'Quota (số vé)',
                      }[key]
                    }
                    error={errors[path + key]}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={key === 'quota' ? 0 : 1}
                      max={2147483647}
                      value={money(p[key])}
                      onChange={(e) =>
                        product(index, {
                          [key]:
                            (key === 'combo2_vnd' || key === 'combo3_vnd') && e.target.value === ''
                              ? null
                              : e.target.valueAsNumber,
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label="Mở bán (giờ Việt Nam)" error={errors[path + 'opens_at']}>
                  <Input
                    type="datetime-local"
                    value={vietnamTime(p.opens_at)}
                    onChange={(e) => product(index, { opens_at: withOffset(e.target.value) })}
                  />
                </Field>
                <Field label="Đóng bán (giờ Việt Nam)" error={errors[path + 'closes_at']}>
                  <Input
                    type="datetime-local"
                    value={vietnamTime(p.closes_at)}
                    onChange={(e) => product(index, { closes_at: withOffset(e.target.value) })}
                  />
                </Field>
              </div>
              <label className="purchase-config-check">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => product(index, { enabled: e.target.checked })}
                />
                Cho phép bán hạng vé này
              </label>
              <p>Tắt bán giữ lại lịch sử và đơn đã tạo; không xóa hạng vé.</p>
            </fieldset>
          );
        })}
      </fieldset>
      <Button type="submit" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Lưu cấu hình vé'}
      </Button>
    </form>
  );
}
