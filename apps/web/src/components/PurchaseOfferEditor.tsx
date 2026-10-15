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
    const next = { ...config, ...patch };
    if (next.total_quota != null)
      next.products = next.products.map((p) => ({
        ...p,
        opens_at: next.early_open_at ?? '',
        closes_at: (p.tier === 'EARLY' ? next.early_close_at : next.normal_close_at) ?? '',
      }));
    onChange(JSON.stringify(next));
    setErrors({});
  }
  function enablePhases() {
    const early = config.products.filter((p) => p.tier === 'EARLY');
    const normal = config.products.filter((p) => p.tier === 'NORMAL');
    update({
      total_quota: config.products.reduce((sum, p) => sum + p.quota, 0) || 700,
      early_quota: early.reduce((sum, p) => sum + p.quota, 0),
      early_open_at: early[0]?.opens_at ?? '',
      early_close_at: early[0]?.closes_at ?? '',
      normal_close_at: normal[0]?.closes_at ?? '',
    });
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
          price_vnd: 0,
          combo2_vnd: null,
          combo3_vnd: null,
          opens_at: config.early_open_at ?? '',
          closes_at: (tier === 'EARLY' ? config.early_close_at : config.normal_close_at) ?? '',
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
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setErrors({});
    await onSave();
  }
  const money = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : v);
  const groups = Array.from(new Set(config.products.map((p) => p.name))).map((name) => ({
    name,
    products: config.products.flatMap((p, index) => (p.name === name ? [{ p, index }] : [])),
  }));
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
        <fieldset className="purchase-config-section">
          <legend>Số lượng và lịch từng đợt</legend>
          {config.total_quota == null ? (
            <>
              <p>
                Đợt này đang dùng lịch riêng ở từng loại vé. Bật lịch chung để vé sớm và vé thường
                tự chuyển trong cùng một hạng.
              </p>
              <Button type="button" variant="outline" onClick={enablePhases}>
                Thiết lập hai đợt bán chung
              </Button>
            </>
          ) : (
            <>
              <p>
                Tổng {config.total_quota} vé. Admin chỉnh số vé sớm và lịch ở đây, phân bổ số vé và
                giá từng hạng bên dưới. Vé sớm còn dư chuyển sang vé thường cùng loại.
              </p>
              <div className="purchase-config-grid">
                <Field label="Số vé bán sớm" error={errors.early_quota}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={config.total_quota}
                    step={1}
                    value={config.early_quota ?? ''}
                    onChange={(e) => update({ early_quota: e.target.valueAsNumber })}
                  />
                </Field>
                <Field label="Mở vé sớm (giờ Việt Nam)" error={errors.early_open_at}>
                  <Input
                    type="datetime-local"
                    value={vietnamTime(config.early_open_at ?? null)}
                    onChange={(e) => update({ early_open_at: withOffset(e.target.value) })}
                  />
                </Field>
                <Field label="Kết thúc vé sớm / bắt đầu vé thường" error={errors.early_close_at}>
                  <Input
                    type="datetime-local"
                    value={vietnamTime(config.early_close_at ?? null)}
                    onChange={(e) => update({ early_close_at: withOffset(e.target.value) })}
                  />
                </Field>
                <Field label="Đóng vé thường (giờ Việt Nam)" error={errors.normal_close_at}>
                  <Input
                    type="datetime-local"
                    value={vietnamTime(config.normal_close_at ?? null)}
                    onChange={(e) => update({ normal_close_at: withOffset(e.target.value) })}
                  />
                </Field>
              </div>
              <p>
                Vé thường mở khi đợt sớm kết thúc hoặc vé sớm đã bán hết. Đơn đang giữ vẫn có đủ
                thời hạn 30 phút và giữ nguyên giá.
              </p>
              <p>
                Quota đang phân bổ: vé sớm{' '}
                {config.products.filter((p) => p.tier === 'EARLY').reduce((s, p) => s + p.quota, 0)}{' '}
                / {config.early_quota}; vé thường{' '}
                {config.products
                  .filter((p) => p.tier === 'NORMAL')
                  .reduce((s, p) => s + p.quota, 0)}{' '}
                / {config.total_quota - (config.early_quota ?? 0)}.
              </p>
            </>
          )}
        </fieldset>
        {config.mode === 'LIVE' && !config.qr_path && (
          <p className="notice">
            Có thể công bố thông tin chương trình. Chưa nhận đơn đến khi có giá, phân bổ quota và QR
            thật.
          </p>
        )}
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
          Mỗi hạng vé có hai đợt giá bên cạnh nhau. Số lượng tính theo số vé, gồm cả vé trong combo.
          Để trống giá combo để tắt; giá combo là tổng tiền cho 2 hoặc 3 vé.
        </p>
        <Button type="button" variant="outline" onClick={addProducts}>
          Thêm các hạng vé còn thiếu
        </Button>
        {config.products.length === 0 && (
          <p>Chưa có hạng vé. Thêm hạng rồi điền lịch và quota trước khi bán.</p>
        )}
        {errors.products && <p role="alert">{errors.products}</p>}
        {groups.map((group) => (
          <fieldset key={group.products[0].p.id} className="purchase-config-product">
            <legend>{group.name}</legend>
            <Field
              label="Tên hạng vé"
              error={group.products
                .map(({ index }) => errors[`products.${index}.name`])
                .find(Boolean)}
            >
              <Input
                value={group.name}
                onChange={(e) =>
                  update({
                    products: config.products.map((p) =>
                      p.name === group.name ? { ...p, name: e.target.value } : p,
                    ),
                  })
                }
              />
            </Field>
            <div className="purchase-config-phases">
              {group.products.map(({ p, index }) => {
                const path = `products.${index}.`;
                return (
                  <fieldset key={p.id} className="purchase-config-product">
                    <legend>{p.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'}</legend>
                    <div className="purchase-config-grid">
                      {(['price_vnd', 'combo2_vnd', 'combo3_vnd', 'quota'] as const).map((key) => (
                        <Field
                          key={key}
                          label={
                            {
                              price_vnd: 'Giá vé đơn (VND)',
                              combo2_vnd: 'Giá Combo 2 (VND)',
                              combo3_vnd: 'Giá Combo 3 (VND)',
                              quota: 'Số lượng vé',
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
                                  (key === 'combo2_vnd' || key === 'combo3_vnd') &&
                                  e.target.value === ''
                                    ? null
                                    : e.target.valueAsNumber,
                              })
                            }
                          />
                        </Field>
                      ))}
                      {config.total_quota == null && (
                        <>
                          <Field label="Mở bán (giờ Việt Nam)" error={errors[path + 'opens_at']}>
                            <Input
                              type="datetime-local"
                              value={vietnamTime(p.opens_at)}
                              onChange={(e) =>
                                product(index, { opens_at: withOffset(e.target.value) })
                              }
                            />
                          </Field>
                          <Field label="Đóng bán (giờ Việt Nam)" error={errors[path + 'closes_at']}>
                            <Input
                              type="datetime-local"
                              value={vietnamTime(p.closes_at)}
                              onChange={(e) =>
                                product(index, { closes_at: withOffset(e.target.value) })
                              }
                            />
                          </Field>
                        </>
                      )}
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
            </div>
          </fieldset>
        ))}
      </fieldset>
      <Button type="submit" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Lưu cấu hình vé'}
      </Button>
    </form>
  );
}
