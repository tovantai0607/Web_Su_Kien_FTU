import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input, ErrorState, EmptyState } from '@ftu/ui';
import {
  fromVietnamTime,
  toVietnamTime,
  votingSettingsSchema,
  type AdminSettings as Settings,
} from '@ftu/shared';
import { api } from '../lib/api';
import { PageTitle, DataState } from '../components/Content';
import './admin-settings.css';
import PurchaseAdmin from '../components/PurchaseAdmin';

type Round = Settings['rounds'][number];
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
    [roundId, setRound] = useState('');
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
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
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
              <EmptyState title="Chưa có vòng thi">
                Tạo và công bố vòng thi trong phần Vòng thi &amp; vote.
              </EmptyState>
            )
          ) : (
            <PurchaseAdmin />
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
        <p className="notice">Công bố mùa thi, vòng thi và danh sách hợp lệ trước khi đặt lịch.</p>
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
