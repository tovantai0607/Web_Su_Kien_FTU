import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, ShieldCheck, Check, Clock3 } from 'lucide-react';
import { Button, Card, Badge, EmptyState, Modal, ErrorState } from '@ftu/ui';
import type { Round, Contestant, Ticket, VotingData } from '@ftu/shared';
import { PageTitle, useContent, DataState } from '../components/Content';
import { api, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Turnstile } from '../components/Turnstile';
import { AnimatedGroup } from '../components/interface/MotionSystem';
export default function Voting() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const gender = params.get('hang-muc') === 'male' ? 'male' : 'female';
  const rounds = useContent<Round[]>('/rounds');
  const [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<Contestant | null>(null),
    [ticket, setTicket] = useState(''),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  const round =
    rounds.data?.find((r) => r.id === params.get('vong')) ??
    rounds.data?.find((r) => r.kind === 'semifinal') ??
    rounds.data?.find((r) => r.kind === 'final');
  const voting = useQuery({
    queryKey: ['voting', round?.id, user?.id],
    queryFn: () => api<VotingData>('/voting/' + round!.id),
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
    queryFn: () =>
      api<
        { ticket_id: string; contestant_id: string; round_id: string; category_id: string | null }[]
      >('/me/votes'),
    enabled: !!user && !preview,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (voting.data) setOffset(Date.parse(voting.data.server_time) - Date.now());
  }, [voting.data]);
  const category = voting.data?.categories?.find((c) => c.gender === gender);
  const session = voting.data?.session;
  const hasCategories = !!voting.data?.categories?.length;
  const current = voting.data?.round ?? round;
  const openAt = hasCategories ? session?.open_at : current?.vote_open_at;
  const closeAt = hasCategories ? session?.close_at : current?.vote_close_at;
  const candidates = (voting.data?.contestants ?? []).filter((c) =>
    hasCategories
      ? !!category &&
        c.gender === gender &&
        (!session ||
          voting.data?.eligible.some(
            (e) => e.category_id === category.id && e.contestant_id === c.id,
          ))
      : c.gender === gender,
  );
  const time = now + offset;
  const isOpen =
    !!openAt &&
    !!closeAt &&
    (!hasCategories ||
      (!!category && (session?.state === 'OPEN' || session?.state === 'SCHEDULED'))) &&
    time >= Date.parse(openAt) &&
    time < Date.parse(closeAt);
  const seconds = closeAt ? Math.max(0, Math.floor((Date.parse(closeAt) - time) / 1000)) : 600;
  const eligible = (tickets.data ?? []).filter(
    (t) =>
      t.round_id === current?.id &&
      t.status === 'issued' &&
      !ownVotes.data?.some(
        (v) => v.ticket_id === t.id && (!v.category_id || v.category_id === category?.id),
      ),
  );
  const onToken = useCallback((v: string) => setToken(v), []);
  async function vote() {
    if (!selected || !current || !eligible.some((t) => t.id === ticket)) return;
    setBusy(true);
    setError('');
    try {
      await api('/votes', {
        method: 'POST',
        body: JSON.stringify({
          round_id: current.id,
          ...(category && session ? { category_id: category.id, session_id: session.id } : {}),
          contestant_id: selected.id,
          ticket_id: ticket,
          turnstile_token: token,
        }),
      });
      setSuccess(true);
      setTicket('');
      void ownVotes.refetch();
      void voting.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setToken('');
    }
  }
  return (
    <div className="page-shell">
      <PageTitle title="Bình chọn" />
      <label className="field">
        Vòng bình chọn
        <select
          className="input"
          value={round?.id ?? ''}
          onChange={(e) => {
            setParams({ ...Object.fromEntries(params), vong: e.target.value });
            setTicket('');
            setSelected(null);
            setToken('');
          }}
        >
          {rounds.data
            ?.filter((r) => ['semifinal', 'final'].includes(r.kind))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
        </select>
      </label>
      <div className="vote-categories" role="group" aria-label="Hạng mục bình chọn">
        {(['female', 'male'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={gender === value}
            onClick={() => {
              setParams({ ...Object.fromEntries(params), 'hang-muc': value });
              setTicket('');
              setSelected(null);
              setToken('');
            }}
          >
            {value === 'male' ? 'Nam được yêu thích nhất' : 'Nữ được yêu thích nhất'}
          </button>
        ))}
      </div>
      <div className="vote-status">
        <div>
          <Badge>{isOpen ? 'Bình chọn đang mở' : 'Chờ giờ bình chọn'}</Badge>
          <h2>
            {category?.name ??
              (gender === 'male' ? 'Nam được yêu thích nhất' : 'Nữ được yêu thích nhất')}
          </h2>
          <p>
            Mỗi vé Hoàn tất được bỏ một phiếu cho mỗi hạng mục đúng vòng, không cần check-in hoặc
            chờ email.
          </p>
          {voting.data?.participation && (
            <p aria-live="polite">
              {voting.data.participation.participants} tài khoản đã bình chọn ·{' '}
              {voting.data.participation.votes} phiếu đã ghi nhận
            </p>
          )}
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
      {round && <DataState query={voting} />}
      {voting.data?.demo_leaderboard && (
        <section aria-label="Bảng xếp hạng DEMO" className="vote-leaderboard">
          <Card>
            <h2>Bảng xếp hạng DEMO</h2>
            <p>Kết quả tạm của vòng thử, cập nhật mỗi 15 giây và sau khi bạn vote thành công.</p>
            <Button
              variant="outline"
              disabled={voting.isFetching}
              onClick={() => void voting.refetch()}
            >
              Cập nhật BXH
            </Button>
            {!session ? (
              <p>BTC chưa mở phiên bình chọn DEMO.</p>
            ) : voting.data.demo_leaderboard.session_id !== session.id ? (
              <p>Đang tải kết quả của phiên hiện tại.</p>
            ) : !category ? (
              <p>BTC chưa cấu hình hạng mục bình chọn DEMO.</p>
            ) : (
              <>
                <h3>{category.name}</h3>
                <ol>
                  {voting.data.demo_leaderboard.rows
                    .filter((row) => row.category_id === category.id)
                    .map((row) => (
                      <li key={row.contestant_id}>
                        Hạng {row.rank} ·{' '}
                        {voting.data?.contestants.find((person) => person.id === row.contestant_id)
                          ?.display_name ?? 'Thí sinh'}{' '}
                        — <strong>{row.votes} phiếu</strong>
                      </li>
                    ))}
                </ol>
                {!voting.data.demo_leaderboard.rows.some(
                  (row) => row.category_id === category.id,
                ) && <p>Chưa có thí sinh đủ điều kiện trong phiên DEMO.</p>}
              </>
            )}
          </Card>
        </section>
      )}
      {!current && !rounds.isPending && !rounds.isError && (
        <EmptyState title="Chưa có lượt bình chọn công khai">
          BTC sẽ mở lượt theo lịch của từng vòng. Bạn có thể khám phá các gương mặt trước khi chọn.
        </EmptyState>
      )}
      {current && !isOpen && (
        <EmptyState title="Bình chọn chưa mở hoặc đã kết thúc">
          Thời gian chính thức do BTC cấu hình; giao diện không thể tự mở bình chọn.
        </EmptyState>
      )}
      {session?.state === 'FINALIZED' && (
        <PublishedResults
          session={session.id}
          contestants={voting.data?.contestants ?? []}
          categories={voting.data?.categories ?? []}
        />
      )}
      {!user && (
        <Card>
          <h3>Đăng nhập bằng tài khoản nhận vé.</h3>
          <p>Vé phải thuộc tài khoản của bạn, đã Hoàn tất gửi minh chứng và đúng vòng bình chọn.</p>
          <Button asChild variant="outline">
            <Link to="/tai-khoan/dang-nhap">Đăng nhập</Link>
          </Button>
        </Card>
      )}
      {user && isOpen && <FieldTicket tickets={eligible} value={ticket} onChange={setTicket} />}
      {user && isOpen && (
        <>
          <DataState query={tickets} />
          <DataState query={ownVotes} />
        </>
      )}
      {user &&
        ownVotes.data?.some(
          (vote) =>
            (!vote.category_id || vote.category_id === category?.id) &&
            tickets.data?.some((t) => t.id === vote.ticket_id && t.round_id === current?.id),
        ) && (
          <p className="notice vote-recorded" role="status">
            <Check size={18} /> Bạn đã có phiếu được ghi nhận trong hạng mục này.
          </p>
        )}
      {current && !voting.isPending && !voting.isError && candidates.length === 0 && (
        <EmptyState title="Chưa công bố thí sinh cho hạng mục này" />
      )}
      <AnimatedGroup key={gender} className="contestant-grid vote-grid">
        {candidates.map((c) => (
          <Card key={c.id}>
            {c.photo_url && (
              <img
                className="vote-portrait"
                src={c.photo_url}
                alt={c.display_name}
                width="420"
                height="560"
                loading="lazy"
              />
            )}
            <Badge>#{c.number}</Badge>
            <h2>{c.display_name}</h2>
            <p>{c.faculty}</p>
            <Link className="text-link" to={`/thi-sinh/${c.slug}`}>
              Xem hồ sơ
            </Link>
            <Button
              disabled={!isOpen || !user || !eligible.some((t) => t.id === ticket)}
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
      </AnimatedGroup>
      <Modal
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
        title={success ? 'Phiếu của bạn đã được ghi nhận.' : 'Xác nhận lựa chọn'}
      >
        {success ? (
          <AnimatedGroup className="success-card vote-success">
            <Check size={40} />
            <p>Cảm ơn bạn đã đồng hành cùng FTUCHARM.</p>
            <Button onClick={() => setSelected(null)}>Hoàn tất</Button>
          </AnimatedGroup>
        ) : (
          <>
            <p>
              Bạn chọn <strong>{selected?.display_name}</strong>. Vé chỉ được bỏ một phiếu trong
              hạng mục này, bạn không thể đổi sau khi xác nhận.
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
function PublishedResults({
  session,
  contestants,
  categories,
}: {
  session: string;
  contestants: Contestant[];
  categories: { id: string; name: string }[];
}) {
  const q = useQuery({
    queryKey: ['published-results', session],
    queryFn: () =>
      api<{ category_id: string; results: { contestant_id: string; votes: number }[] }[]>(
        '/vote-results/' + session,
      ),
    retry: false,
  });
  return (
    <section aria-label="Kết quả đã công bố">
      <DataState query={q} />
      {q.data?.map((group) => (
        <Card key={group.category_id}>
          <h2>
            {categories.find((c) => c.id === group.category_id)?.name ?? 'Hạng mục bình chọn'} — Kết
            quả
          </h2>
          <ol>
            {[...group.results]
              .sort((a, b) => b.votes - a.votes || a.contestant_id.localeCompare(b.contestant_id))
              .map((r) => (
                <li key={r.contestant_id}>
                  {contestants.find((c) => c.id === r.contestant_id)?.display_name ?? 'Thí sinh'}:{' '}
                  {r.votes} phiếu
                </li>
              ))}
          </ol>
        </Card>
      ))}
      {q.isSuccess && !q.data.length && <p>BTC chưa công bố kết quả.</p>}
    </section>
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
      Vé đủ điều kiện của vòng này
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Chọn vé của bạn</option>
        {tickets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.display_code ?? t.ticket_code ?? t.seat_label}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <EmptyState title="Không có vé đủ điều kiện hoặc vé đã bình chọn">
      Hoàn tất gửi minh chứng mua vé đúng vòng để nhận lượt vote. Phiếu cũ chưa đối chiếu hạng mục
      cần BTC hỗ trợ.
    </EmptyState>
  );
}
