import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Ticket, ArrowUpRight, ArrowLeft } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState } from '@ftu/ui';
import {
  currentSaleState,
  uuid,
  type SalesCatalog,
  type SalesEvent,
  type SalesHold,
  type SaleState,
} from '@ftu/shared';
import { api, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DataState, PageTitle } from '../components/Content';
import SeatMap from '../components/SeatMap';
import './tickets.css';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const schedule = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const labels: Record<SaleState, string> = {
  UPCOMING: 'Sắp mở bán',
  OPEN: 'Đang mở bán',
  SOLD_OUT: 'Hết ghế có thể đặt',
  CLOSED: 'Đã đóng bán',
};
function useServerTime(serverTime?: string) {
  const [, redraw] = useState(0);
  const anchor = useMemo(
    () => ({ server: serverTime ? Date.parse(serverTime) : 0, monotonic: performance.now() }),
    [serverTime],
  );
  useEffect(() => {
    const interval = setInterval(() => redraw((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  return anchor.server + performance.now() - anchor.monotonic;
}
function countdown(target: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(target) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  return `${days ? `${days} ngày ` : ''}${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function EventSchedule({ event }: { event: SalesEvent }) {
  return (
    <div className="sales-schedule">
      <p>
        <CalendarDays size={18} aria-hidden="true" />
        {schedule.format(new Date(event.starts_at))}
      </p>
      <p>
        <MapPin size={18} aria-hidden="true" />
        {event.venue}
      </p>
    </div>
  );
}
function SaleNotice({ event, now }: { event: SalesEvent; now: number }) {
  const state = currentSaleState(event, now);
  return (
    <div className="sale-notice">
      <Badge>{labels[state]}</Badge>
      {state === 'UPCOMING' && (
        <p>
          Mở bán sau <span className="sales-clock">{countdown(event.sale_open_at, now)}</span>
        </p>
      )}
      {state === 'OPEN' && (
        <p>
          Còn {event.available} ghế · Đóng bán sau{' '}
          <span className="sales-clock">{countdown(event.sale_close_at, now)}</span>
        </p>
      )}
      {state === 'SOLD_OUT' && (
        <p>Các ghế đã bán hoặc đang được giữ. Bạn có thể cập nhật để kiểm tra lại.</p>
      )}
      {state === 'CLOSED' && <p>Đã kết thúc thời gian đặt vé. Thông tin sự kiện vẫn xem được.</p>}
    </div>
  );
}
export default function Tickets() {
  const { eventSlug } = useParams();
  const query = useQuery({
    queryKey: ['sales', eventSlug ?? 'list'],
    queryFn: () =>
      api<SalesCatalog>(eventSlug ? `/events/${encodeURIComponent(eventSlug)}` : '/events'),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const now = useServerTime(query.data?.server_time);
  if (eventSlug) return <TicketDetail query={query} event={query.data?.events[0]} now={now} />;
  return (
    <div className="page-shell sales-page">
      <PageTitle
        label="Đêm hội FTUCharm"
        title="Hẹn bạn dưới ánh đèn sân khấu."
        description="Xem thông tin và sơ đồ ghế của từng đêm, kể cả khi chưa tới giờ mở bán."
      />
      <DataState query={query} />
      {query.data && !query.data.events.length && (
        <EmptyState title="Chưa có sự kiện bán vé được công bố">
          BTC sẽ cập nhật lịch, hạng vé và sơ đồ ghế tại đây.
        </EmptyState>
      )}
      <div className="ticket-layout sales-events">
        {query.data?.events.map((event) => (
          <Card key={event.id} className="ticket-card sales-event-card">
            <Ticket size={32} strokeWidth={1.2} aria-hidden="true" />
            <h2>{event.title}</h2>
            <EventSchedule event={event} />
            <SaleNotice event={event} now={now} />
            <ul className="sales-prices">
              {event.categories.map((category) => (
                <li key={category.id}>
                  <span>{category.name}</span>
                  <strong>{money.format(category.price_vnd)}</strong>
                  <small>
                    Còn {category.available}/{category.capacity} ghế
                  </small>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline">
              <Link to={`/ve/${event.slug}`}>
                Xem chi tiết <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </Button>
          </Card>
        ))}
      </div>
      {preview && (
        <p className="fine-print">
          Giá, lịch và ghế minh họa để xem thử. Bản preview không giữ ghế hoặc nhận thanh toán.
        </p>
      )}
    </div>
  );
}
function TicketDetail({
  query,
  event,
  now,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };
  event?: SalesEvent;
  now: number;
}) {
  const { user, loading } = useAuth();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [params, setParams] = useSearchParams();
  const holdId = params.get('hold');
  const request = useRef<{ signature: string; key: string } | null>(null);
  const holdQuery = useQuery({
    queryKey: ['sales-hold', holdId, user?.id],
    queryFn: () => api<SalesHold>(`/me/holds/${holdId}`),
    enabled: !preview && !!user && uuid.safeParse(holdId).success,
    refetchInterval: 5000,
  });
  const holdNow = useServerTime(holdQuery.data?.server_time);
  const hold = holdQuery.data?.event_id === event?.id ? holdQuery.data : undefined;
  const hasHold =
    !!hold && hold.status === 'PENDING_PAYMENT' && holdNow < Date.parse(hold.expires_at);
  const reserve = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error('Không tìm thấy sự kiện.');
      const seats = [...selected].sort();
      const signature = JSON.stringify({
        event: event.id,
        seats,
        previous: hold && !hasHold ? hold.id : null,
      });
      if (request.current?.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      return api<SalesHold>(`/events/${event.id}/holds`, {
        method: 'POST',
        headers: { 'Idempotency-Key': request.current.key },
        body: JSON.stringify({ seat_ids: seats }),
      });
    },
    onSuccess: (result) => {
      cache.setQueryData(['sales-hold', result.id, user?.id], result);
      setParams({ hold: result.id }, { replace: true });
      void query.refetch();
    },
    onError: () => {
      void query.refetch();
    },
  });
  const release = useMutation({
    mutationFn: () => api<SalesHold>(`/me/holds/${holdId}/release`, { method: 'POST', body: '{}' }),
    onSuccess: (result) => {
      cache.setQueryData(['sales-hold', holdId, user?.id], result);
      void query.refetch();
      setSelected([]);
    },
  });
  const state = event ? currentSaleState(event, now) : 'CLOSED';
  const selectedSeats = event?.seats.filter((seat) => selected.includes(seat.id)) ?? [];
  const total = selectedSeats.reduce(
    (sum, seat) =>
      sum +
      (event?.categories.find((category) => category.id === seat.category_id)?.price_vnd ?? 0),
    0,
  );
  const staleSelection =
    selectedSeats.some((seat) => seat.state !== 'AVAILABLE') ||
    selectedSeats.length !== selected.length;
  return (
    <div className="page-shell sales-page">
      <Link className="sales-back" to="/ve">
        <ArrowLeft size={17} aria-hidden="true" />
        Danh sách sự kiện
      </Link>
      {!event && (
        <PageTitle
          label="Vé FTUCharm"
          title="Thông tin sự kiện"
          description="Kiểm tra lịch và hạng vé đã được công bố."
        />
      )}
      <DataState query={query} />
      {event && (
        <>
          <PageTitle
            label="Vé FTUCharm"
            title={event.title}
            description="Chọn ghế theo hạng vé. Lượt giữ bắt đầu khi bạn nhận được xác nhận giữ ghế."
          />
          <div className="sales-detail-layout">
            <section className="sales-seat-section" aria-label="Thông tin và sơ đồ ghế">
              <EventSchedule event={event} />
              <SaleNotice event={event} now={now} />
              <SeatMap
                event={event}
                selected={selected}
                illustrative={preview}
                disabled={state !== 'OPEN' || hasHold || reserve.isPending}
                onSelect={(id) => {
                  setSelected((ids) =>
                    ids.includes(id) ? ids.filter((seat) => seat !== id) : [...ids, id],
                  );
                  reserve.reset();
                }}
              />
              <Button variant="ghost" onClick={() => void query.refetch()}>
                Cập nhật tình trạng ghế
              </Button>
            </section>
            <aside className="sales-summary" aria-label="Ghế đã chọn">
              <h2>Ghế của bạn</h2>
              <p>
                Tối đa {event.max_tickets} vé mỗi lượt. Giữ ghế {event.hold_ttl_seconds / 60} phút,
                không gia hạn khi tải lại.
              </p>
              {hasHold && hold ? (
                <div className="sales-hold">
                  <h3>Đã giữ {hold.quantity} ghế</h3>
                  <p>{hold.items.map((item) => item.seat_label).join(', ')}</p>
                  <p>
                    Hạn giữ còn{' '}
                    <strong className="sales-clock">{countdown(hold.expires_at, holdNow)}</strong>
                  </p>
                  <strong>{money.format(hold.total_vnd)}</strong>
                  <p>Checkout và thanh toán chưa mở trên website.</p>
                  <Button
                    variant="outline"
                    disabled={release.isPending}
                    onClick={() => release.mutate()}
                  >
                    {release.isPending ? 'Đang giải phóng…' : 'Giải phóng ghế'}
                  </Button>
                </div>
              ) : (
                <>
                  {hold && (
                    <p role="status">
                      {hold.status === 'PAID'
                        ? 'Lượt đặt đã được xác nhận.'
                        : 'Lượt giữ đã kết thúc. Vui lòng cập nhật và chọn ghế lại.'}
                    </p>
                  )}
                  <p aria-live="polite">
                    {selected.length
                      ? `${selected.length}/${event.max_tickets} ghế: ${selectedSeats.map((seat) => seat.label).join(', ')}`
                      : 'Bạn chưa chọn ghế.'}
                  </p>
                  <p className="sales-total">
                    <span>Tạm tính</span>
                    <strong>{money.format(total)}</strong>
                  </p>
                  {staleSelection && (
                    <>
                      <p role="alert">
                        Ghế vừa thay đổi trạng thái. Xóa lựa chọn và chọn ghế khác.
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSelected([]);
                          reserve.reset();
                        }}
                      >
                        Xóa lựa chọn
                      </Button>
                    </>
                  )}
                  {preview ? (
                    <>
                      <Button disabled>Giữ ghế</Button>
                      <p>Chọn thử ghế trong bản minh họa. Lượt giữ thật chưa được tạo.</p>
                    </>
                  ) : !user ? (
                    <Button asChild disabled={loading}>
                      <Link to="/tai-khoan/dang-nhap">Đăng nhập để giữ ghế</Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        !selected.length || staleSelection || state !== 'OPEN' || reserve.isPending
                      }
                      onClick={() => reserve.mutate()}
                    >
                      {reserve.isPending ? 'Đang xác nhận…' : 'Giữ ghế'}
                    </Button>
                  )}
                </>
              )}
              {(reserve.error || release.error) && (
                <ErrorState
                  message={(reserve.error ?? release.error)?.message ?? 'Không thể xử lý.'}
                />
              )}
              {holdQuery.isError && (
                <ErrorState
                  message={holdQuery.error.message}
                  retry={() => void holdQuery.refetch()}
                />
              )}
              <div className="sales-conditions">
                <h3>Điều kiện sử dụng</h3>
                <p>
                  Vé dành cho đúng sự kiện và ghế đã xác nhận. Không chuyển nhượng; hiện chưa có
                  chức năng hoàn tiền.
                </p>
                <p>Mỗi vé đúng vòng được một phiếu mỗi hạng mục bình chọn, không cần check-in.</p>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
