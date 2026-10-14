import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input, ErrorState, EmptyState } from '@ftu/ui';
import {
  fromVietnamTime,
  toVietnamTime,
  saleSettingsSchema,
  votingSettingsSchema,
  type AdminSettings as Settings,
} from '@ftu/shared';
import { api } from '../lib/api';
import { PageTitle, DataState } from '../components/Content';
import './admin-settings.css';

type Round = Settings['rounds'][number];
type Event = Settings['events'][number];
function useServerClock(iso: string) {
  const anchor = useMemo(() => ({ time: Date.parse(iso), mono: performance.now() }), [iso]);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return anchor.time + performance.now() - anchor.mono;
}
export default function AdminSettings() {
  const query = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<Settings>('/admin/settings'),
    retry: false,
  });
  const [edition, setEdition] = useState(''),
    [roundId, setRound] = useState(''),
    [eventId, setEvent] = useState('');
  const [section, setSection] = useState<'vote' | 'sales'>('vote'),
    [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const leave = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const link =
        e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank') return;
      const url = new URL(link.href);
      if (
        url.origin === location.origin &&
        url.pathname !== location.pathname &&
        !window.confirm('Bạn có thay đổi chưa lưu. Rời trang và bỏ thay đổi?')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty]);
  function change(action: () => void) {
    if (!dirty || window.confirm('Bỏ các thay đổi chưa lưu?')) {
      setDirty(false);
      setFeedback('');
      action();
    }
  }
  const data = query.data;
  const editionId = data?.editions.find((e) => e.id === edition)?.id ?? data?.editions[0]?.id;
  const rounds = data?.rounds.filter((r) => r.edition_id === editionId) ?? [];
  const events = data?.events.filter((e) => e.edition_id === editionId) ?? [];
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0],
    event = events.find((e) => e.id === eventId) ?? events[0];
  return (
    <div className="page-shell admin-settings">
      <Link className="text-link" to="/admin">
        Về tổng quan quản trị
      </Link>
      <Link className="text-link" to="/admin/ve">
        Khách đã mua vé
      </Link>
      <PageTitle
        title="Cấu hình vote và vé"
        description="Thời gian theo giờ Việt Nam (UTC+7). Mọi thay đổi được ghi vào lịch sử quản trị."
      />
      <DataState query={query} />
      <p role="status">{feedback}</p>
      {data && (
        <>
          <Field label="Mùa thi">
            <select
              className="input"
              value={editionId ?? ''}
              onChange={(e) => change(() => setEdition(e.target.value))}
            >
              {data.editions.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.title.includes(String(e.year)) ? e.title : `${e.title} (${e.year})`}
                </option>
              ))}
            </select>
          </Field>
          <div className="admin-settings-switch" role="group" aria-label="Phần cấu hình">
            <Button
              variant={section === 'vote' ? 'primary' : 'outline'}
              aria-pressed={section === 'vote'}
              onClick={() => change(() => setSection('vote'))}
            >
              Lịch bình chọn
            </Button>
            <Button
              variant={section === 'sales' ? 'primary' : 'outline'}
              aria-pressed={section === 'sales'}
              onClick={() => change(() => setSection('sales'))}
            >
              Đợt bán vé
            </Button>
          </div>
          {dirty && (
            <p role="status" className="notice">
              Có thay đổi chưa lưu.
            </p>
          )}
          {section === 'vote' ? (
            round ? (
              <>
                <Field label="Vòng bình chọn">
                  <select
                    className="input"
                    value={round.id}
                    onChange={(e) => change(() => setRound(e.target.value))}
                  >
                    {rounds.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <VoteForm
                  key={round.id + ':' + round.vote_close_at}
                  round={round}
                  serverTime={data.server_time}
                  onDirty={setDirty}
                  onSaved={() => {
                    setFeedback('Đã lưu lịch bình chọn.');
                    void query.refetch();
                  }}
                />
              </>
            ) : (
              <EmptyState title="Chưa có vòng chung kết">
                Tạo và công bố vòng thi trong phần Vòng thi &amp; vote.
              </EmptyState>
            )
          ) : event ? (
            <>
              <Field label="Sự kiện bán vé">
                <select
                  className="input"
                  value={event.id}
                  onChange={(e) => change(() => setEvent(e.target.value))}
                >
                  {events.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </Field>
              <SaleForm
                key={event.id + ':' + event.sales_revision}
                event={event}
                onDirty={setDirty}
                onSaved={() => {
                  setFeedback('Đã lưu đợt bán và giá vé.');
                  void query.refetch();
                }}
              />
            </>
          ) : (
            <EmptyState title="Chưa có sự kiện bán vé">
              Cần cấu hình sự kiện, hai hạng vé và sơ đồ ghế trước khi đặt lịch bán.
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
function VoteForm({
  round,
  serverTime,
  onDirty,
  onSaved,
}: {
  round: Round;
  serverTime: string;
  onDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(toVietnamTime(round.vote_open_at)),
    [close, setClose] = useState(toVietnamTime(round.vote_close_at)),
    [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const now = useServerClock(serverTime);
  const started = !!round.vote_open_at && Date.parse(round.vote_open_at) <= now;
  const closed =
    round.session_state === 'CLOSED' ||
    round.session_state === 'FINALIZED' ||
    (!!round.vote_close_at && Date.parse(round.vote_close_at) <= now);
  async function save(immediate = false) {
    if (busy) return;
    setError('');
    setMessage('');
    try {
      if (started && !reason.trim()) throw new Error('Nhập lý do thay đổi giờ đóng.');
      const input = votingSettingsSchema.parse({
        open_at: started ? round.vote_open_at : fromVietnamTime(open),
        close_at: immediate ? new Date(now).toISOString() : fromVietnamTime(close),
        reason,
      });
      setBusy(true);
      await api(`/admin/rounds/${round.id}/voting-settings`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      onDirty(false);
      setMessage('Đã lưu lịch bình chọn.');
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error && e.name !== 'ZodError' ? e.message : 'Kiểm tra giờ mở và giờ đóng.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2>Lịch bình chọn</h2>
      <p>
        {closed
          ? 'Đã kết thúc. Không thể mở lại phiên này.'
          : started
            ? 'Đang bình chọn. Chỉ được chỉnh giờ đóng.'
            : round.vote_open_at
              ? 'Đã đặt lịch.'
              : 'Chưa đặt lịch.'}
      </p>
      {!round.published && (
        <p className="notice">
          Công bố mùa thi, vòng chung kết và danh sách hợp lệ trước khi đặt lịch.
        </p>
      )}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void save();
        }}
        aria-busy={busy}
      >
        <div className="admin-settings-grid">
          <Field label="Giờ mở vote">
            <Input
              type="datetime-local"
              required
              value={open}
              disabled={busy || closed || started}
              onChange={(e) => {
                setOpen(e.target.value);
                onDirty(true);
              }}
            />
          </Field>
          <Field label="Giờ đóng vote">
            <Input
              type="datetime-local"
              required
              value={close}
              disabled={busy || closed}
              onChange={(e) => {
                setClose(e.target.value);
                onDirty(true);
              }}
            />
          </Field>
        </div>
        <Field
          label="Lý do thay đổi"
          hint={started ? 'Bắt buộc khi gia hạn hoặc đóng sớm.' : 'Có thể ghi chú cho lịch mới.'}
        >
          <textarea
            className="input"
            rows={3}
            maxLength={1000}
            value={reason}
            disabled={busy || closed}
            onChange={(e) => {
              setReason(e.target.value);
              onDirty(true);
            }}
          />
        </Field>
        {error && <ErrorState message={error} />}
        <p role="status">{message}</p>
        <div className="admin-settings-actions">
          <Button disabled={busy || closed || !round.published}>
            {busy ? 'Đang lưu…' : 'Lưu lịch bình chọn'}
          </Button>
          {started && !closed && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Đóng bình chọn ngay? Phiếu đã ghi nhận được giữ nguyên.'))
                  void save(true);
              }}
            >
              Đóng vote ngay
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
function SaleForm({
  event,
  onDirty,
  onSaved,
}: {
  event: Event;
  onDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [early, setEarly] = useState(event.phases.some((p) => p.kind === 'EARLY'));
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      ['EARLY', 'REGULAR'].map((kind) => {
        const p = event.phases.find((p) => p.kind === kind);
        return [
          kind,
          {
            open: toVietnamTime(p?.open_at),
            close: toVietnamTime(p?.close_at),
            prices: Object.fromEntries(
              event.categories.map((c) => [
                c.id,
                String(p?.prices.find((x) => x.category_id === c.id)?.price_vnd ?? c.price_vnd),
              ]),
            ),
          },
        ];
      }),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  function update(kind: string, field: 'open' | 'close', value: string) {
    setValues((v) => ({ ...v, [kind]: { ...v[kind], [field]: value } }));
    onDirty(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setMessage('');
    try {
      const phases = (early ? ['EARLY', 'REGULAR'] : ['REGULAR']).map((kind) => ({
        kind,
        open_at: fromVietnamTime(values[kind].open),
        close_at: fromVietnamTime(values[kind].close),
        prices: event.categories.map((c) => {
          const value = values[kind].prices[c.id];
          if (!value.trim()) throw new Error('Nhập giá cho từng hạng vé.');
          return { category_id: c.id, price_vnd: Number(value) };
        }),
      }));
      const result = saleSettingsSchema.safeParse({ revision: event.sales_revision, phases });
      if (!result.success) throw new Error(result.error.issues[0].message);
      setBusy(true);
      await api(`/admin/events/${event.id}/sale-settings`, {
        method: 'PUT',
        body: JSON.stringify(result.data),
      });
      onDirty(false);
      setMessage('Đã lưu đợt bán và giá vé.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu cấu hình.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2>Đợt bán vé</h2>
      <p>Giá mới áp dụng cho lượt giữ ghế mới. Đơn còn hạn và đơn đã thanh toán giữ nguyên giá.</p>
      {event.categories.length !== 2 && (
        <p className="notice">Cấu hình đủ hai hạng vé trước khi lưu.</p>
      )}
      {!event.published && (
        <p className="notice">Sự kiện chưa công bố. Lưu cấu hình không tự mở bán cho khách.</p>
      )}
      <form onSubmit={(e) => void save(e)} aria-busy={busy}>
        <label className="admin-settings-check">
          <input
            type="checkbox"
            checked={early}
            disabled={busy}
            onChange={(e) => {
              setEarly(e.target.checked);
              onDirty(true);
            }}
          />{' '}
          Bật đợt bán sớm
        </label>
        {(early ? ['EARLY', 'REGULAR'] : ['REGULAR']).map((kind) => (
          <fieldset key={kind} disabled={busy}>
            <legend>{kind === 'EARLY' ? 'Bán sớm' : 'Bán thường'}</legend>
            <div className="admin-settings-grid">
              <Field label="Giờ mở bán">
                <Input
                  type="datetime-local"
                  required
                  value={values[kind].open}
                  onChange={(e) => update(kind, 'open', e.target.value)}
                />
              </Field>
              <Field label="Giờ đóng bán">
                <Input
                  type="datetime-local"
                  required
                  value={values[kind].close}
                  onChange={(e) => update(kind, 'close', e.target.value)}
                />
              </Field>
              {event.categories.map((c) => (
                <Field key={c.id} label={`Giá ${c.name} (VND)`}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    max={Number.MAX_SAFE_INTEGER}
                    required
                    value={values[kind].prices[c.id]}
                    onChange={(e) => {
                      setValues((v) => ({
                        ...v,
                        [kind]: {
                          ...v[kind],
                          prices: { ...v[kind].prices, [c.id]: e.target.value },
                        },
                      }));
                      onDirty(true);
                    }}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        ))}
        {error && <ErrorState message={error} />}
        <p role="status">{message}</p>
        <Button disabled={busy || event.categories.length !== 2}>
          {busy ? 'Đang lưu…' : 'Lưu đợt bán và giá vé'}
        </Button>
      </form>
    </Card>
  );
}
