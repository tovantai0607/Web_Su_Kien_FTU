import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ticket, Clock3, Check } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input } from '@ftu/ui';
import {
  purchaseSelectionSchema,
  type Buyer,
  type Offer,
  type Purchase,
  type PurchaseCatalog,
  type PurchaseSelection,
} from '@ftu/shared';
import { PageTitle, DataState } from '../components/Content';
import { api, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { currentTicketProducts } from '../lib/ticket-phases';
import PurchaseRecords, { EvidenceImage } from '../components/PurchaseRecords';
import './purchases.css';

export const money = (n: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
const dates = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(s));
const emptyBuyer: Buyer = {
  name: '',
  school: '',
  cohort_class: '',
  student_id: '',
  email: '',
  phone: '',
  facebook: '',
};
const labels: Record<keyof Buyer, string> = {
  name: 'Họ tên',
  school: 'Trường',
  cohort_class: 'Khóa/lớp',
  student_id: 'MSSV',
  email: 'Email',
  phone: 'Số điện thoại',
  facebook: 'Facebook',
};
const states = {
  OPEN: 'Đang mở bán',
  UPCOMING: 'Sắp mở bán',
  SOLD_OUT: 'Hết vé',
  CLOSED: 'Đã đóng bán',
};
export default function PurchaseTickets() {
  const { eventSlug } = useParams(),
    { user, access, loading, accessLoading } = useAuth();
  const demoAllowed = !!user && !!access?.is_admin && !accessLoading;
  const catalog = useQuery({
    queryKey: ['purchase-catalog', eventSlug, user?.id, demoAllowed],
    queryFn: () =>
      api<PurchaseCatalog>('/purchase-catalog' + (eventSlug ? '?slug=' + eventSlug : '')),
    refetchInterval: 15000,
    enabled: !eventSlug || (!loading && !accessLoading),
    retry: false,
  });
  const offers =
    catalog.data?.offers.filter((o) => o.mode === 'LIVE' || demoAllowed || preview) ?? [];
  const offer = offers.find((e) => e.slug === eventSlug);
  return (
    <div className="page-shell purchase-page">
      <PageTitle
        label="Vé FTUCharm 2027"
        title={offer?.title ?? 'Hẹn bạn dưới ánh đèn sân khấu.'}
        description="Chọn loại vé hoặc combo. BTC sẽ bố trí vị trí và gửi vé qua email thủ công."
      />
      {preview && (
        <p className="purchase-notice">
          Mẫu minh họa — giá và quota DEMO. Bạn có thể xem loại vé trước giờ mở bán; bản xem trước
          không nhận tiền hoặc lưu đơn.
        </p>
      )}
      <DataState query={catalog} />
      {catalog.isSuccess &&
        !eventSlug &&
        (!offers.length ? (
          <EmptyState title="BTC chưa công bố đợt vé">
            Theo dõi thông báo để biết lịch mở bán.
          </EmptyState>
        ) : (
          <div className="purchase-events">
            {offers.map((event) => (
              <Card key={event.id}>
                <Ticket size={32} />
                <Badge>{event.mode === 'DEMO' ? 'DEMO' : 'FTUCharm 2027'}</Badge>
                <h2>{event.title}</h2>
                <p>
                  {event.starts_at
                    ? dates(event.starts_at)
                    : event.event_date
                      ? new Date(event.event_date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                        }) + ' · Giờ tổ chức chờ công bố'
                      : 'Ngày tổ chức do BTC công bố'}
                </p>
                {event.total_quota != null && (
                  <p>
                    Tổng {event.total_quota} vé · Tối đa {event.early_quota} vé sớm
                  </p>
                )}
                <p>{event.venue || 'Địa điểm do BTC công bố'}</p>
                <SaleSchedule offer={event} />
                <p>
                  {event.products.length
                    ? 'Loại vé, giá và combo được công bố trong chi tiết đợt vé.'
                    : 'Giá vé, combo và phân bổ từng loại chờ BTC công bố.'}
                </p>
                <Button asChild>
                  <Link to={'/ve/' + event.slug}>Xem vé & combo</Link>
                </Button>
              </Card>
            ))}
          </div>
        ))}
      {eventSlug && (
        <Link className="text-link" to="/ve">
          <ArrowLeft size={16} /> Tất cả đợt vé
        </Link>
      )}
      {eventSlug && catalog.isSuccess && !offer && (
        <EmptyState title="Đợt vé chưa được công bố">
          <Link to="/ve">Xem các đợt đã công bố</Link>
        </EmptyState>
      )}
      {offer && (
        <>
          <SaleSchedule offer={offer} />
          {offer.total_quota != null && (
            <p className="purchase-notice">
              Tổng {offer.total_quota} vé; tối đa {offer.early_quota} vé sớm. Vé sớm còn dư chuyển
              sang vé thường cùng loại. Hết vé sẽ đóng bán sớm.
            </p>
          )}
          {!offer.checkout_enabled && (
            <p role="status">
              Chưa nhận đơn. Giá, phân bổ loại vé và QR chuyển khoản đang chờ BTC cấu hình.
            </p>
          )}
          {offer.products.length ? (
            <Checkout key={offer.id + ':' + (user?.id ?? 'guest')} offer={offer} />
          ) : (
            <section aria-label="Hạng vé dự kiến" className="purchase-products">
              {['The Intro', 'The Bridge', 'The Chorus'].map((name) => (
                <Card key={name}>
                  <Ticket aria-hidden="true" size={28} />
                  <h2>{name}</h2>
                  <Badge>Chờ cập nhật giá</Badge>
                  <p>Vé đơn, Combo 2 và Combo 3 sẽ được BTC cấu hình trước khi nhận đơn.</p>
                </Card>
              ))}
            </section>
          )}
        </>
      )}
      {user && !preview && (
        <section className="purchase-history">
          <h2>Đơn đã Hoàn tất của bạn</h2>
          <PurchaseRecords />
        </section>
      )}
    </div>
  );
}
function SaleSchedule({ offer }: { offer: Offer }) {
  if (!offer.early_open_at || !offer.early_close_at || !offer.normal_close_at) return null;
  return (
    <div className="purchase-sale-schedule" aria-label="Lịch mở bán">
      <p>
        <strong>Vé sớm:</strong> {dates(offer.early_open_at)} – {dates(offer.early_close_at)}
      </p>
      <p>
        <strong>Vé thường:</strong> {dates(offer.early_close_at)} – {dates(offer.normal_close_at)}
      </p>
      <small>Giờ Việt Nam. Có thể chuyển đợt hoặc đóng sớm khi hết vé.</small>
    </div>
  );
}
function Checkout({ offer }: { offer: Offer }) {
  const { user } = useAuth(),
    queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [buyer, setBuyer] = useState<Buyer>(emptyBuyer),
    [quantities, setQuantities] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0),
    [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [qrFailed, setQrFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [fileUrl, setFileUrl] = useState(''),
    [evidence, setEvidence] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [demoExpiresAt, setDemoExpiresAt] = useState<number | null>(null);
  const key = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const clock = useRef({ server: Date.now(), local: performance.now() });
  const activeId = params.get('don');
  const existing = useQuery({
    queryKey: ['purchase', user?.id, activeId],
    queryFn: () => api<Purchase>('/purchases/' + activeId),
    enabled: !!user && !!activeId && !preview,
    refetchInterval: 10000,
    retry: false,
  });
  useEffect(() => {
    if (existing.data && existing.data.offer_id === offer.id) {
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(existing.data.expires_at) - Date.parse(existing.data.server_time)) / 1000,
          ),
        ),
      );
      setPurchase(existing.data);
      setBuyer(existing.data.buyer);
      setEvidence(existing.data.evidence_id ?? '');
      setStep((s) => (existing.data!.status === 'COMPLETED' ? 4 : s === 3 ? 3 : 2));
    }
  }, [existing.data, offer.id]);
  useEffect(() => {
    if (previousStep.current !== step) stepHeading.current?.focus();
    previousStep.current = step;
  }, [step]);
  useEffect(() => {
    const expiresAt = purchase ? Date.parse(purchase.expires_at) : demoExpiresAt;
    if (expiresAt === null || purchase?.status === 'COMPLETED') return;
    if (purchase)
      clock.current = { server: Date.parse(purchase.server_time), local: performance.now() };
    const tick = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (expiresAt - clock.current.server - (performance.now() - clock.current.local)) / 1000,
          ),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [purchase, demoExpiresAt]);
  useEffect(() => {
    if (!file) {
      setFileUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const products = currentTicketProducts(offer);
  const lines: PurchaseSelection['lines'] = products.flatMap((product) =>
    ([1, 2, 3] as const).flatMap((bundle_size) => {
      if (!preview && product.state !== 'OPEN') return [];
      if (
        (bundle_size === 2 && product.combo2_vnd === null) ||
        (bundle_size === 3 && product.combo3_vnd === null)
      )
        return [];
      const quantity = quantities[product.id + ':' + bundle_size] ?? 0;
      return quantity > 0 ? [{ product_id: product.id, bundle_size, quantity }] : [];
    }),
  );
  const count = lines.reduce((n, l) => n + l.quantity * l.bundle_size, 0);
  const total = lines.reduce((n, l) => {
    const p = offer.products.find((p) => p.id === l.product_id)!;
    return (
      n +
      l.quantity *
        (l.bundle_size === 1
          ? p.price_vnd
          : l.bundle_size === 2
            ? (p.combo2_vnd ?? 0)
            : (p.combo3_vnd ?? 0))
    );
  }, 0);
  const editable = !purchase;
  const expired = purchase
    ? purchase.status === 'EXPIRED' || (purchase.status === 'HELD' && remaining === 0)
    : preview && demoExpiresAt !== null && remaining === 0;
  function confirmSelection() {
    setError('');
    const parsed = purchaseSelectionSchema
      .pick({ offer_id: true, lines: true })
      .safeParse({ offer_id: offer.id, lines });
    if (!parsed.success) {
      setError('Chọn loại vé hoặc combo với số lượng hợp lệ để tiếp tục.');
      return;
    }
    for (const product of offer.products) {
      const selected = lines
        .filter((line) => line.product_id === product.id)
        .reduce((n, line) => n + line.quantity * line.bundle_size, 0);
      if (selected > product.available) {
        setError(`Số vé ${product.name} đã chọn vượt số vé còn lại.`);
        return;
      }
    }
    setFieldErrors({});
    setStep(1);
  }
  async function reserve() {
    setError('');
    setFieldErrors({});
    const parsed = purchaseSelectionSchema.safeParse({ offer_id: offer.id, buyer, lines });
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path.at(-1))] = issue.message;
      setFieldErrors(fields);
      setError(parsed.error.issues[0].message);
      return;
    }
    if (preview) {
      if (demoExpiresAt === null) {
        const started = Date.now();
        clock.current = { server: started, local: performance.now() };
        setDemoExpiresAt(started + 30 * 60 * 1000);
        setRemaining(30 * 60);
      }
      setStep(2);
      return;
    }
    if (!user) {
      setError('Đăng nhập và xác minh email trước khi giữ vé.');
      return;
    }
    setBusy(true);
    try {
      const data = await api<Purchase>('/purchases', {
        method: 'POST',
        headers: { 'Idempotency-Key': key.current },
        body: JSON.stringify(parsed.data),
      });
      setRemaining(
        Math.max(0, Math.ceil((Date.parse(data.expires_at) - Date.parse(data.server_time)) / 1000)),
      );
      setPurchase(data);
      setParams({ don: data.id });
      setStep(data.status === 'COMPLETED' ? 4 : 2);
      void queryClient.invalidateQueries({ queryKey: ['purchase-catalog'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    if (!purchase || expired || (!file && !evidence)) return;
    setBusy(true);
    setError('');
    try {
      let evidenceId = evidence;
      if (!evidenceId) {
        const uploaded = await api<{ id: string }>(`/purchases/${purchase.id}/evidence`, {
          method: 'POST',
          body: file!,
          headers: { 'Content-Type': file!.type },
        });
        evidenceId = uploaded.id;
        setEvidence(evidenceId);
      }
      const saved = await api<Purchase>(`/purchases/${purchase.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ evidence_id: evidenceId }),
      });
      if (saved.status !== 'COMPLETED')
        throw new Error('Đơn chưa lưu thành công. Vui lòng thử lại.');
      setPurchase(saved);
      setStep(4);
      void queryClient.invalidateQueries({ queryKey: ['purchase-records'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-catalog'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shownCount = purchase?.quantity ?? count,
    shownTotal = purchase?.total_vnd ?? total;
  const instructions = purchase?.payment.instructions ?? 'DEMO — không chuyển tiền thật.';
  return (
    <section className="purchase-checkout" aria-label="Đặt vé">
      <ol className="purchase-steps" aria-label="Các bước mua vé">
        {['Vé & combo', 'Thông tin', 'Thanh toán', 'Minh chứng', 'Hoàn tất'].map((name, i) => (
          <li key={name} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>
      {existing.isError && <ErrorState message={(existing.error as Error).message} />}
      {error && (
        <div role="alert">
          <ErrorState message={error} />
        </div>
      )}
      {expired && step !== 4 ? (
        <Card>
          <h2>Đã hết hạn giữ vé</h2>
          <p>Vé được trả về quota. Vui lòng chọn lại; chuyển tiền sau hạn không tự cấp thêm vé.</p>
          <Button
            onClick={() => {
              setPurchase(null);
              setDemoExpiresAt(null);
              setRemaining(0);
              setParams({});
              setStep(0);
              setEvidence('');
              setFile(null);
              key.current = crypto.randomUUID();
            }}
          >
            Đặt vé lại
          </Button>
        </Card>
      ) : (
        <>
          {step === 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                confirmSelection();
              }}
            >
              <h2 ref={stepHeading} tabIndex={-1}>
                Chọn vé & combo
              </h2>
              <div className="purchase-products">
                {products.map((p) => (
                  <Card key={p.id}>
                    <Badge>
                      {p.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'} · {states[p.state]}
                    </Badge>
                    <h2>{p.name}</h2>
                    <p>
                      {money(p.price_vnd)} / vé · còn {p.available} vé
                    </p>
                    <p>
                      {dates(
                        p.tier === 'NORMAL' && offer.early_close_at
                          ? offer.early_close_at
                          : p.opens_at,
                      )}{' '}
                      – {dates(p.closes_at)}
                    </p>
                    {offer.products.filter((phase) => phase.name === p.name).length > 1 && (
                      <details className="purchase-phase-details">
                        <summary>Xem giá và lịch các đợt</summary>
                        {offer.products
                          .filter((phase) => phase.name === p.name)
                          .map((phase) => (
                            <p key={phase.id}>
                              <strong>
                                {phase.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'}:{' '}
                                {money(phase.price_vnd)} / vé
                              </strong>
                              <br />
                              {dates(
                                phase.tier === 'NORMAL' && offer.early_close_at
                                  ? offer.early_close_at
                                  : phase.opens_at,
                              )}{' '}
                              – {dates(phase.closes_at)}
                            </p>
                          ))}
                      </details>
                    )}
                    {([1, 2, 3] as const).map((size) => {
                      const price =
                        size === 1 ? p.price_vnd : size === 2 ? p.combo2_vnd : p.combo3_vnd;
                      if (price === null) return null;
                      const qkey = p.id + ':' + size,
                        value = !preview && p.state !== 'OPEN' ? 0 : (quantities[qkey] ?? 0);
                      const disabled =
                        busy ||
                        !editable ||
                        (!preview && (p.state !== 'OPEN' || !offer.checkout_enabled));
                      return (
                        <div className="purchase-option" key={size}>
                          {size > 1 && (
                            <input
                              type="checkbox"
                              aria-label={`Chọn Combo ${size} ${p.name} ${p.tier}`}
                              checked={value > 0}
                              disabled={disabled}
                              onChange={(e) => {
                                key.current = crypto.randomUUID();
                                setQuantities({ ...quantities, [qkey]: e.target.checked ? 1 : 0 });
                              }}
                            />
                          )}
                          <Field
                            label={`${size === 1 ? 'Vé đơn' : 'Combo ' + size} — ${money(price)}`}
                          >
                            <Input
                              type="number"
                              min="0"
                              max={Math.floor(p.available / size)}
                              step="1"
                              disabled={disabled}
                              value={value}
                              onChange={(e) => {
                                key.current = crypto.randomUUID();
                                setQuantities({ ...quantities, [qkey]: Number(e.target.value) });
                              }}
                              aria-label={`Số lượng ${size === 1 ? 'vé đơn' : 'Combo ' + size} ${p.name} ${p.tier}`}
                            />
                          </Field>
                        </div>
                      );
                    })}
                  </Card>
                ))}
              </div>
              <p>
                Combo 2 gồm 2 vé; Combo 3 gồm 3 vé cùng loại. BTC bố trí vị trí gần nhau. Hết vé
                sớm, cùng hạng vé sẽ chuyển sang giá vé thường theo lịch BTC cấu hình.
              </p>
              {!count && Object.values(quantities).some((q) => q > 0) && (
                <p role="status">
                  Đợt bán đã thay đổi. Kiểm tra giá hiện tại và chọn lại số lượng vé.
                </p>
              )}
              <p className="purchase-summary">
                <strong>
                  {count} vé · {money(total)}
                </strong>
              </p>
              <Button
                type="submit"
                disabled={!lines.length || (!preview && !offer.checkout_enabled)}
              >
                Xác nhận vé & combo
              </Button>
            </form>
          )}
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void reserve();
              }}
            >
              <p className="purchase-summary">
                <strong>
                  {count} vé · {money(total)}
                </strong>
              </p>
              <Card className="purchase-buyer">
                <h2 ref={stepHeading} tabIndex={-1}>
                  Thông tin người mua
                </h2>
                <div className="form-grid">
                  {(Object.keys(labels) as (keyof Buyer)[]).map((name) => (
                    <Field key={name} label={labels[name]} error={fieldErrors[name]}>
                      <Input
                        id={'buyer-' + name}
                        name={name}
                        type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
                        value={buyer[name]}
                        required
                        disabled={busy}
                        maxLength={
                          name === 'facebook'
                            ? 300
                            : name === 'email'
                              ? 254
                              : name === 'phone'
                                ? 32
                                : name === 'student_id'
                                  ? 80
                                  : 160
                        }
                        aria-invalid={!!fieldErrors[name]}
                        onChange={(e) => {
                          key.current = crypto.randomUUID();
                          setBuyer({ ...buyer, [name]: e.target.value });
                        }}
                      />
                    </Field>
                  ))}
                </div>
              </Card>
              <div className="purchase-summary">
                <p>Giữ quota 30 phút sau khi tiếp tục. Tổng vé của tài khoản không bị giới hạn.</p>
              </div>
              {!user && !preview && (
                <p>
                  <Link className="text-link" to="/tai-khoan/dang-nhap">
                    Đăng nhập để tiếp tục
                  </Link>
                </p>
              )}
              <div className="purchase-actions">
                <Button
                  type="submit"
                  disabled={
                    busy || !lines.length || (!preview && (!user || !offer.checkout_enabled))
                  }
                >
                  {busy ? 'Đang giữ vé…' : 'Xác nhận thông tin'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setStep(0);
                  }}
                >
                  Đổi vé & combo
                </Button>
              </div>
            </form>
          )}
          {(step === 2 || step === 3) && (
            <Card className="purchase-payment">
              <h2 ref={stepHeading} tabIndex={-1}>
                {step === 2 ? 'Thanh toán chuyển khoản' : 'Minh chứng chuyển khoản'}
              </h2>
              <p className="purchase-summary">
                <strong>
                  {shownCount} vé · {money(shownTotal)}
                </strong>
              </p>
              {(purchase || (preview && demoExpiresAt !== null)) && (
                <aside className="purchase-countdown" aria-label="Giới hạn thời gian thanh toán">
                  <Clock3 size={28} aria-hidden="true" />
                  <div>
                    <p>Thời gian thanh toán còn lại{preview ? ' (DEMO)' : ''}</p>
                    <strong role="timer" aria-label="Thời gian còn lại" aria-live="off">
                      {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                      {String(remaining % 60).padStart(2, '0')}
                    </strong>
                  </div>
                  <p className="purchase-countdown-help">
                    Bạn có 30 phút để chuyển khoản, gửi ảnh và Hoàn tất. Hết giờ, bạn cần đặt vé
                    lại.
                  </p>
                  {purchase && <p className="purchase-countdown-help">Mã đơn: {purchase.code}</p>}
                </aside>
              )}
              {step === 2 && (
                <>
                  <p>{instructions}</p>
                  {purchase?.payment.qr_path ? (
                    <img
                      className="purchase-qr"
                      src={purchase.payment.qr_path}
                      alt="QR tài khoản nhận tiền do BTC cấu hình"
                      onError={() => setQrFailed(true)}
                      onLoad={() => setQrFailed(false)}
                    />
                  ) : (
                    <div
                      className="purchase-demo-qr"
                      role="img"
                      aria-label="QR DEMO không dùng chuyển tiền"
                    >
                      <Ticket size={48} />
                      <strong>QR DEMO</strong>
                      <span>Không chuyển tiền thật</span>
                    </div>
                  )}
                  {qrFailed && (
                    <ErrorState message="Chưa tải được QR. Tải lại trang hoặc liên hệ BTC trước khi chuyển tiền." />
                  )}
                  <p>
                    Số tiền: <strong>{money(shownTotal)}</strong>
                  </p>
                  <p>
                    Nội dung: <strong>{purchase?.code ?? 'DEMO-FTUCHARM'}</strong>
                  </p>
                  <p>
                    Kiểm tra số tiền và nội dung trước khi gửi. Sau thanh toán, tiếp tục để gửi ảnh
                    minh chứng.
                  </p>
                  <Button
                    disabled={qrFailed}
                    onClick={() => {
                      setError('');
                      setStep(3);
                    }}
                  >
                    Tiếp tục gửi minh chứng
                  </Button>
                  {preview && (
                    <Button variant="outline" onClick={() => setStep(1)}>
                      Xem lại thông tin
                    </Button>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <p>
                    Khi Hoàn tất lưu thành công, bạn có quyền vote theo số vé cho từng hạng mục đúng
                    vòng. BTC kiểm tra và gửi email vé thủ công. Sau Hoàn tất không hủy hoặc hoàn
                    tiền.
                  </p>
                  <Field label="Ảnh minh chứng JPG/PNG (tối đa 5 MB)">
                    <Input
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png"
                      disabled={busy || !!evidence}
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        if (!picked) return;
                        if (
                          picked &&
                          (!['image/png', 'image/jpeg'].includes(picked.type) ||
                            picked.size > 5242880)
                        ) {
                          setError('Chọn ảnh JPG/PNG không quá 5 MB.');
                          e.currentTarget.value = '';
                          return;
                        }
                        setFile(picked);
                        setError('');
                      }}
                    />
                  </Field>
                  {file && !evidence && (
                    <div className="purchase-proof-actions">
                      <p>Ảnh đã chọn: {file.name}</p>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => fileInput.current?.click()}
                      >
                        Đổi ảnh minh chứng
                      </Button>
                      <p>Bạn có thể chọn lại ảnh trước khi bấm Hoàn tất.</p>
                    </div>
                  )}
                  {fileUrl && (
                    <img
                      className="purchase-proof-preview"
                      src={fileUrl}
                      alt="Ảnh minh chứng bạn đã chọn"
                    />
                  )}
                  {evidence && !fileUrl && (
                    <>
                      <p>Ảnh minh chứng đã lưu cho đơn này. Bấm Hoàn tất để ghi nhận vé.</p>
                      <EvidenceImage id={evidence} />
                    </>
                  )}
                  {preview && (
                    <p role="status">
                      Bản xem trước không gửi ảnh hoặc lưu đơn. Cần môi trường test có database để
                      thử Hoàn tất.
                    </p>
                  )}
                  <Button
                    disabled={busy || preview || (!file && !evidence)}
                    onClick={() => void complete()}
                  >
                    {busy ? 'Đang lưu…' : 'Hoàn tất'}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setStep(2)}>
                    Xem lại thanh toán
                  </Button>
                </>
              )}
            </Card>
          )}
          {step === 4 && purchase?.status === 'COMPLETED' && (
            <Card className="purchase-success">
              <Check size={40} />
              <h2 ref={stepHeading} tabIndex={-1}>
                Đã lưu đơn thành công
              </h2>
              <p>
                Mã: <strong>{purchase.code}</strong> · {purchase.quantity} vé
              </p>
              <p>
                Ảnh minh chứng và thông tin đã lưu. Bạn có {purchase.quantity} lượt vote cho mỗi
                hạng mục của vòng này. Vé được BTC gửi email thủ công.
              </p>
              <Button asChild>
                <Link
                  to={
                    '/binh-chon?' +
                    (offer.mode === 'DEMO' && !preview ? 'demo=1&' : '') +
                    'vong=' +
                    purchase.round_id
                  }
                >
                  Đến bình chọn
                </Link>
              </Button>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
