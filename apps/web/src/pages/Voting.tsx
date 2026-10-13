import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, ShieldCheck, Check, Clock3 } from 'lucide-react';
import { Button, Card, Badge, EmptyState, Modal, ErrorState } from '@ftu/ui';
import type { Round, Contestant, Ticket } from '@ftu/shared';
import { PageTitle, useContent, DataState } from '../components/Content';
import { api, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Turnstile } from '../components/Turnstile';
export default function Voting() {
  const { user } = useAuth();
  const rounds = useContent<Round[]>('/rounds');
  const [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<Contestant | null>(null),
    [ticket, setTicket] = useState(''),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  const round = rounds.data?.find((r) => r.kind === 'final');
  const voting = useQuery({
    queryKey: ['voting', round?.id],
    queryFn: () =>
      api<{ round: Round; contestants: Contestant[]; server_time: string }>('/voting/' + round!.id),
    enabled: !!round,
    refetchInterval: 15000,
  });
  const tickets = useQuery({
    queryKey: ['tickets', user?.id],
    queryFn: () => api<Ticket[]>('/me/tickets'),
    enabled: !!user && !preview,
  });
  const ownVotes = useQuery({
    queryKey: ['votes', user?.id],
    queryFn: () => api<{ ticket_id: string; contestant_id: string }[]>('/me/votes'),
    enabled: !!user && !preview,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (voting.data) setOffset(Date.parse(voting.data.server_time) - Date.now());
  }, [voting.data]);
  const current = voting.data?.round ?? round;
  const time = now + offset;
  const isOpen =
    !!current?.vote_open_at &&
    !!current.vote_close_at &&
    time >= Date.parse(current.vote_open_at) &&
    time < Date.parse(current.vote_close_at);
  const seconds = current?.vote_close_at
    ? Math.max(0, Math.floor((Date.parse(current.vote_close_at) - time) / 1000))
    : 600;
  const eligible = (tickets.data ?? []).filter(
    (t) =>
      t.round_id === current?.id &&
      t.checked_in_at &&
      t.status === 'issued' &&
      !ownVotes.data?.some((v) => v.ticket_id === t.id),
  );
  const onToken = useCallback((v: string) => setToken(v), []);
  async function vote() {
    if (!selected || !current) return;
    setBusy(true);
    setError('');
    try {
      await api('/votes', {
        method: 'POST',
        body: JSON.stringify({
          round_id: current.id,
          contestant_id: selected.id,
          ticket_id: ticket,
          turnstile_token: token,
        }),
      });
      setSuccess(true);
      void ownVotes.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setToken('');
    }
  }
  return (
    <div className="page-shell">
      <PageTitle
        label="Bình chọn đêm chung kết"
        title="Một phiếu. Một dấu ấn."
        description="Dành sự yêu mến cho vẻ đẹp chạm đến bạn."
      />
      <div className="vote-status">
        <div>
          <Badge>{isOpen ? 'Bình chọn đang mở' : 'Chờ khoảnh khắc chung kết'}</Badge>
          <h2>{current?.title ?? 'Khán giả yêu thích'}</h2>
          <p>Mỗi vé đã check-in được bỏ một phiếu trong lượt bình chọn.</p>
        </div>
        <div className="vote-clock">
          <Clock3 size={25} />
          <strong>
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </strong>
          <small>{isOpen ? 'Thời gian còn lại' : 'Thời lượng mỗi lượt'}</small>
        </div>
      </div>
      <div className="security-note">
        <ShieldCheck size={24} />
        <p>
          Thời gian và điều kiện bình chọn được xác minh bởi server. Phiếu đã xác nhận không thể
          đổi.
        </p>
      </div>
      <DataState query={rounds} />
      {!current && !rounds.isPending && !rounds.isError && (
        <EmptyState title="Chưa có lượt bình chọn công khai">
          BTC sẽ mở lượt tại đêm chung kết. Bạn có thể khám phá các gương mặt trước khi chọn.
        </EmptyState>
      )}
      {current && !isOpen && (
        <EmptyState title="Bình chọn chưa mở hoặc đã kết thúc">
          Thời gian chính thức do BTC cấu hình; giao diện không thể tự mở bình chọn.
        </EmptyState>
      )}
      {!user && (
        <Card>
          <h3>Đăng nhập bằng tài khoản nhận vé.</h3>
          <p>Vé phải thuộc tài khoản của bạn và đã được nhân viên check-in.</p>
          <Button asChild variant="outline">
            <Link to="/tai-khoan/dang-nhap">Đăng nhập</Link>
          </Button>
        </Card>
      )}
      {user && isOpen && <FieldTicket tickets={eligible} value={ticket} onChange={setTicket} />}
      <div className="contestant-grid vote-grid">
        {voting.data?.contestants.map((c) => (
          <Card key={c.id}>
            <Badge>#{c.number}</Badge>
            <h2>{c.display_name}</h2>
            <p>{c.faculty}</p>
            <Button
              disabled={!isOpen || !user || !ticket}
              onClick={() => {
                setSelected(c);
                setSuccess(false);
                setError('');
              }}
            >
              <Heart size={18} /> Chọn thí sinh
            </Button>
          </Card>
        ))}
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
        title={success ? 'Phiếu của bạn đã được ghi nhận.' : 'Xác nhận lựa chọn'}
      >
        {success ? (
          <div className="success-card">
            <Check size={40} />
            <p>Cảm ơn bạn đã đồng hành cùng FTUCharm.</p>
            <Button onClick={() => setSelected(null)}>Hoàn tất</Button>
          </div>
        ) : (
          <>
            <p>
              Bạn chọn <strong>{selected?.display_name}</strong>. Vé chỉ được bỏ một phiếu trong
              lượt này, bạn không thể đổi sau khi xác nhận.
            </p>
            <Turnstile key={selected?.id} action="vote" onToken={onToken} />
            {error && <ErrorState message={error} />}
            <Button disabled={busy || !token || !isOpen} onClick={() => void vote()}>
              {busy ? 'Đang ghi nhận…' : 'Xác nhận bình chọn'}
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
function FieldTicket({
  tickets,
  value,
  onChange,
}: {
  tickets: Ticket[];
  value: string;
  onChange: (v: string) => void;
}) {
  return tickets.length ? (
    <label className="field">
      Vé đã check-in
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Chọn vé của bạn</option>
        {tickets.map((t) => (
          <option key={t.id} value={t.id}>
            Ghế {t.seat_label}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <EmptyState title="Không có vé đủ điều kiện hoặc vé đã bình chọn">
      Kiểm tra trạng thái check-in và liên hệ nhân viên nếu cần hỗ trợ.
    </EmptyState>
  );
}
