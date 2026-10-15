import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import AdminSettings from './AdminSettings';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Heart,
  ShieldCheck,
  Ticket,
  Mail,
  Flower2,
  Check,
  Settings,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Input,
  Field,
  Modal,
  ErrorState,
  Pagination,
  EmptyState,
} from '@ftu/ui';
import { PageTitle, DataState } from '../components/Content';
import { api, preview } from '../lib/api';
import { roles } from '@ftu/shared';
import { useAuth } from '../lib/auth';
import PrivateMedia from '../components/PrivateMedia';
import AdminOverview from '../components/AdminOverview';
import PurchaseAdmin from '../components/PurchaseAdmin';
import DemoTicketLinks from '../components/DemoTicketLinks';
import PurchaseCustomers from './PurchaseCustomers';
import PublicationAdmin from '../components/PublicationAdmin';
type Row = Record<string, unknown>;
const tabs = [
  ['overview', 'Tổng quan', LayoutDashboard],
  ['applications', 'Hồ sơ đăng ký', Users],
  ['contestant-profiles', 'Thông tin thí sinh', Users],
  ['editions', 'Mùa thi', Flower2],
  ['rounds', 'Vòng thi & vote', Heart],
  ['timeline', 'Timeline', CalendarDays],
  ['sponsors', 'Nhà tài trợ', ShieldCheck],
  ['tickets', 'Vé cũ (lịch sử)', Ticket],
  ['purchase-data', 'Bán vé theo bổ sung', Ticket],
  ['publications', 'Ảnh và vinh danh', Users],
  ['emails', 'Email', Mail],
  ['audit', 'Lịch sử', Settings],
  ['roles', 'Phân quyền', ShieldCheck],
] as const;
const defaults: Record<string, Row> = {
  'contestant-profiles': {
    display_name: '',
    number: null,
    cohort: '',
    class_name: '',
    height_cm: 0,
    gender: '',
  },
  editions: {
    title: '',
    slug: '',
    theme: '',
    year: 2027,
    registration_open_at: null,
    registration_close_at: null,
    published: false,
  },
  rounds: {
    edition_id: '',
    title: '',
    kind: 'preliminary',
    position: 0,
    cutoff: 50,
    published: false,
    vote_open_at: null,
    vote_close_at: null,
  },
  timeline: {
    edition_id: '',
    title: '',
    description: '',
    position: 0,
    starts_at: null,
    ends_at: null,
    published: false,
  },
  sponsors: {
    edition_id: '',
    name: '',
    tier: 'partner',
    url: 'https://',
    logo_url: '',
    published: false,
  },
};
export default function Admin() {
  const { user, loading, access, accessLoading, accessError, refreshAccess } = useAuth();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some(([value]) => value === params.get('muc')) ? params.get('muc')! : 'overview';
  const [page, setPage] = useState(1),
    [status, setStatus] = useState('pending'),
    [editing, setEditing] = useState<Row | null>(null),
    [values, setValues] = useState<Row>({}),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<Row | null>(null),
    [note, setNote] = useState(''),
    [reviewStatus, setReviewStatus] = useState('approved'),
    [token, setToken] = useState(''),
    [publishId, setPublishId] = useState(''),
    [ids, setIds] = useState('');
  const q = useQuery({
    queryKey: ['admin', tab, page, status, user?.id],
    queryFn: () =>
      api<unknown>(
        '/admin/' +
          (tab === 'tickets' ? 'overview' : tab) +
          (tab === 'applications' ? `?page=${page - 1}&status=${status}` : ''),
      ),
    enabled:
      !!user &&
      !preview &&
      !!access?.is_admin &&
      pathname !== '/admin/cau-hinh' &&
      pathname !== '/admin/ve' &&
      tab !== 'purchase-data' &&
      tab !== 'publications',
    retry: false,
  });
  if (loading || accessLoading)
    return (
      <div className="page-shell" role="status">
        Đang kiểm tra quyền quản trị…
      </div>
    );
  if (user && !preview && accessError)
    return (
      <div className="page-shell">
        <ErrorState message={accessError} />
        <Button onClick={refreshAccess}>Thử lại</Button>
      </div>
    );
  if (user && !preview && access && !access.is_admin)
    return (
      <div className="page-shell">
        <EmptyState title="Trang này chưa được tìm thấy." />
      </div>
    );
  if (!user || preview || !access?.is_admin)
    return (
      <div className="page-shell narrow">
        <PageTitle
          label="Dành cho ban tổ chức"
          title="Quản trị an toàn."
          description="Chỉ tài khoản được cấp quyền admin mới có thể truy cập."
        />
        <Card>
          <ShieldCheck size={42} strokeWidth={1} />
          <p>
            {preview
              ? 'Bản xem trước không truy cập hồ sơ riêng tư hoặc cho phép thao tác quản trị.'
              : 'Đăng nhập bằng tài khoản được cấp quyền admin để tiếp tục.'}
          </p>
          <Button asChild>
            <Link to={user ? '/tai-khoan/ho-so#bao-mat' : '/tai-khoan/dang-nhap'}>
              Mở tài khoản
            </Link>
          </Button>
        </Card>
      </div>
    );
  if (pathname === '/admin/cau-hinh') return <AdminSettings />;
  if (pathname === '/admin/ve') return <PurchaseCustomers />;
  const collection =
    tab === 'applications'
      ? ((q.data as { items: Row[]; total: number } | undefined)?.items ?? [])
      : Array.isArray(q.data)
        ? (q.data as Row[])
        : [];
  const summary = q.data as
    { applications?: number; votes?: number; checked_in?: number } | undefined;
  function edit(row?: Row) {
    setEditing(row ?? {});
    const source = row ?? defaults[tab];
    setValues(
      Object.fromEntries(Object.keys(defaults[tab]).map((k) => [k, source[k] ?? defaults[tab][k]])),
    );
    setError('');
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('/admin/' + tab + (editing?.id ? '/' + editing.id : ''), {
        method: editing?.id ? 'PATCH' : 'POST',
        body: JSON.stringify(values),
      });
      setEditing(null);
      setMessage('Đã lưu thay đổi.');
      void q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<Row>(path, { method: 'POST', body: JSON.stringify(body) });
      setMessage(
        result.token
          ? 'Vé đã cấp. Lưu mã duy nhất và gửi riêng cho người nhận: ' + result.token
          : 'Thao tác đã hoàn tất.',
      );
      void q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-layout">
      <aside className="admin-nav">
        <h2>FTUCHARM Studio</h2>
        <p>Ban tổ chức</p>
        <Link className="text-link" to="/admin/cau-hinh">
          Cấu hình vote và vé
        </Link>
        <Link className="text-link" to="/admin/ve">
          Khách đã mua vé
        </Link>
        {tabs.map(([value, label, Icon]) => (
          <button
            key={value}
            className={value === tab ? 'active' : ''}
            aria-current={value === tab ? 'page' : undefined}
            onClick={() => {
              setParams(value === 'overview' ? {} : { muc: value });
              setPage(1);
              setMessage('');
              setError('');
            }}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </aside>
      <div className="admin-main">
        <PageTitle
          title={tabs.find((t) => t[0] === tab)?.[1] ?? ''}
          description="Thay đổi được xác minh quyền tại server và ghi vào lịch sử."
        />
        {error && <ErrorState message={error} />}
        <p role="status" className={message ? 'notice admin-notification' : 'sr-only'}>
          {message}
        </p>
        {tab !== 'purchase-data' && tab !== 'publications' && <DataState query={q} />}
        {tab === 'overview' && q.isSuccess && <AdminOverview summary={summary} />}
        {tab === 'overview' && <DemoTicketLinks />}
        {tab === 'purchase-data' && <PurchaseAdmin />}
        {tab === 'publications' && <PublicationAdmin />}
        {defaults[tab] && tab !== 'contestant-profiles' && (
          <Button onClick={() => edit()}>Thêm mới</Button>
        )}
        {tab === 'roles' && (
          <RoleManagement busy={busy} onSave={(body) => void action('/admin/roles', body)} />
        )}
        {tab === 'applications' && (
          <label className="field">
            Trạng thái
            <select
              className="input"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {[
                ['pending', 'Chờ duyệt'],
                ['needs_changes', 'Cần bổ sung'],
                ['approved', 'Đã duyệt'],
                ['rejected', 'Từ chối'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {collection?.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thông tin</th>
                  <th>Trạng thái / chi tiết</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {collection.map((row) => (
                  <tr key={String(row.id)}>
                    <td>
                      <strong>
                        {String(
                          row.display_name ??
                            row.full_name ??
                            row.title ??
                            row.name ??
                            row.action ??
                            row.template ??
                            row.id,
                        )}
                      </strong>
                      <small>{String(row.code ?? row.slug ?? row.created_at ?? '')}</small>
                    </td>
                    <td>
                      <Badge>
                        {String(
                          row.status ?? row.kind ?? (row.published ? 'Đã công bố' : 'Bản nháp'),
                        )}
                      </Badge>
                      {row.note ? <p>{String(row.note)}</p> : null}
                    </td>
                    <td>
                      {defaults[tab] && (
                        <Button size="small" variant="outline" onClick={() => edit(row)}>
                          Chỉnh sửa
                        </Button>
                      )}
                      {tab === 'applications' && (
                        <Button
                          size="small"
                          variant="outline"
                          onClick={() => {
                            setReview(row);
                            setNote('');
                          }}
                        >
                          Xét duyệt
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : q.isSuccess && tab !== 'overview' && tab !== 'tickets' ? (
          <EmptyState title="Chưa có dữ liệu trong mục này" />
        ) : null}
        {tab === 'applications' && (
          <Pagination
            page={page}
            pages={Math.ceil(((q.data as { total: number } | undefined)?.total ?? 0) / 25)}
            onChange={setPage}
          />
        )}
        {tab === 'rounds' && (
          <Card>
            <h2>Công bố thí sinh qua vòng</h2>
            <p>
              Chỉ nhận hồ sơ đã duyệt, thuộc đúng mùa và không vượt cutoff. Danh sách không thể đổi
              sau khi có phiếu.
            </p>
            <Field label="ID vòng thi">
              <Input value={publishId} onChange={(e) => setPublishId(e.target.value)} />
            </Field>
            <Field label="ID thí sinh qua vòng (mỗi dòng một ID)">
              <textarea
                className="input"
                rows={4}
                value={ids}
                onChange={(e) => setIds(e.target.value)}
              />
            </Field>
            <Button
              disabled={busy}
              onClick={() => {
                if (window.confirm('Công bố danh sách đã chọn cho vòng thi này?'))
                  void action('/admin/rounds/' + publishId + '/publish', {
                    contestant_ids: ids.split(/\s+/).filter(Boolean),
                  });
              }}
            >
              Công bố danh sách
            </Button>
            <div className="profile-actions">
              <Button
                variant="outline"
                disabled={busy || !publishId}
                onClick={() =>
                  void action('/admin/rounds/' + publishId + '/prepare-categories', {})
                }
              >
                Chuẩn bị hạng mục nam / nữ
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/cau-hinh">Đặt lịch bình chọn</Link>
              </Button>
              <p className="fine-print">
                Chỉ mở sau khi danh sách chung kết đã công bố và vé đã check-in. Thời gian do
                database quyết định.
              </p>
            </div>
          </Card>
        )}
        {tab === 'tickets' && (
          <>
            <Card>
              <h2>Check-in vé</h2>
              <Field label="Mã vé nhận từ QR">
                <Input value={token} onChange={(e) => setToken(e.target.value)} />
              </Field>
              <Button
                disabled={busy || !token}
                onClick={() => void action('/admin/checkin', { token })}
              >
                <Check size={18} /> Xác nhận check-in
              </Button>
            </Card>
            <IssueTicket busy={busy} onIssue={(body) => void action('/admin/tickets', body)} />
          </>
        )}
        <Modal
          open={editing !== null}
          onOpenChange={(v) => {
            if (!v) setEditing(null);
          }}
          title={editing?.id ? 'Chỉnh sửa nội dung' : 'Thêm nội dung'}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="form-grid">
              {Object.entries(values).map(([key, value]) => (
                <Field
                  key={key}
                  label={
                    (
                      {
                        display_name: 'Tên thí sinh',
                        number: 'SBD',
                        cohort: 'Khóa',
                        class_name: 'Lớp',
                        height_cm: 'Chiều cao (cm)',
                        gender: 'Hạng mục',
                        title: 'Tiêu đề',
                        slug: 'Đường dẫn',
                        theme: 'Chủ đề',
                        year: 'Năm',
                        edition_id: 'ID mùa thi',
                        position: 'Thứ tự',
                        cutoff: 'Số lượng qua vòng',
                        published: 'Công bố',
                        vote_open_at: 'Mở vote (UTC)',
                        vote_close_at: 'Đóng vote (UTC)',
                        body: 'Nội dung',
                        name: 'Tên',
                        logo_url: 'Logo (/images/sponsors/ten-logo.webp)',
                        url: 'Website nhà tài trợ',
                        description: 'Mô tả',
                      } as Record<string, string>
                    )[key] ?? key
                  }
                >
                  {key === 'gender' ? (
                    <select
                      className="input"
                      value={String(value)}
                      onChange={(e) => setValues((v) => ({ ...v, gender: e.target.value }))}
                    >
                      <option value="">Chọn hạng mục</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                    </select>
                  ) : typeof value === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
                    />
                  ) : ['body', 'description', 'excerpt'].includes(key) ? (
                    <textarea
                      className="input"
                      value={String(value ?? '')}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      type={typeof value === 'number' || key === 'number' ? 'number' : 'text'}
                      step={key === 'height_cm' ? '0.1' : undefined}
                      value={String(value ?? '')}
                      placeholder={key.endsWith('_at') ? '2026-12-20T12:00:00Z' : undefined}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [key]:
                            key === 'number'
                              ? e.target.value === ''
                                ? null
                                : Number(e.target.value)
                              : typeof value === 'number'
                                ? Number(e.target.value)
                                : key.endsWith('_at') && e.target.value === ''
                                  ? null
                                  : e.target.value,
                        }))
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            {error && <ErrorState message={error} />}
            <Button disabled={busy}>Lưu thay đổi</Button>
          </form>
        </Modal>
        <Modal
          open={!!review}
          onOpenChange={(v) => {
            if (!v) setReview(null);
          }}
          title="Xét duyệt hồ sơ"
        >
          <h3>{String(review?.full_name ?? '')}</h3>
          <p>{String(review?.email ?? '')}</p>
          <p>{String((review?.contestants as Row)?.bio ?? '')}</p>
          <p>
            Khóa: {String((review?.contestants as Row)?.cohort ?? 'Chưa cập nhật')} · Lớp:{' '}
            {String((review?.contestants as Row)?.class_name ?? 'Chưa cập nhật')}
          </p>
          <p>
            Chiều cao: {String((review?.contestants as Row)?.height_cm ?? 'Chưa cập nhật')} cm ·
            Hạng mục:{' '}
            {(review?.contestants as Row)?.gender === 'male'
              ? 'Nam'
              : (review?.contestants as Row)?.gender === 'female'
                ? 'Nữ'
                : 'Chưa cập nhật'}
          </p>
          {review && (
            <PrivateMedia
              key={String(review.id)}
              id={
                typeof review.student_card_media_id === 'string'
                  ? review.student_card_media_id
                  : null
              }
            />
          )}
          <Field label="Kết quả">
            <select
              className="input"
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value)}
            >
              <option value="approved">Được duyệt</option>
              <option value="needs_changes">Cần bổ sung</option>
              <option value="rejected">Không đủ điều kiện</option>
            </select>
          </Field>
          <Field label="Nội dung gửi thí sinh">
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <ErrorState message={error} />}
          <Button
            disabled={busy || note.length < 5}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/admin/applications/' + review!.id + '/review', {
                  method: 'PATCH',
                  body: JSON.stringify({ status: reviewStatus, note }),
                });
                setReview(null);
                void q.refetch();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Lưu kết quả & gửi thông báo
          </Button>
        </Modal>
      </div>
    </div>
  );
}
function RoleManagement({ busy, onSave }: { busy: boolean; onSave: (body: unknown) => void }) {
  const [userId, setUserId] = useState(''),
    [role, setRole] = useState<string>('CONTENT_EDITOR');
  return (
    <Card>
      <h2>Quyền theo vai trò</h2>
      <p>Chỉ SUPER_ADMIN được cấp hoặc thu hồi quyền. Không thể xóa admin cuối cùng.</p>
      <Field label="ID tài khoản">
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} />
      </Field>
      <Field label="Vai trò">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Button
        disabled={busy || !userId}
        onClick={() => {
          if (window.confirm('Cấp vai trò đã chọn cho tài khoản này?'))
            onSave({ user_id: userId, role, enabled: true });
        }}
      >
        Cấp quyền
      </Button>
      <Button
        variant="outline"
        disabled={busy || !userId}
        onClick={() => {
          if (window.confirm('Thu hồi vai trò đã chọn?'))
            onSave({ user_id: userId, role, enabled: false });
        }}
      >
        Thu hồi quyền
      </Button>
    </Card>
  );
}
function IssueTicket({ busy, onIssue }: { busy: boolean; onIssue: (data: unknown) => void }) {
  const [userId, setUserId] = useState(''),
    [roundId, setRoundId] = useState(''),
    [seat, setSeat] = useState('');
  return (
    <Card>
      <h2>Cấp vé đã xác nhận</h2>
      <p>
        BTC chỉ cấp sau khi kiểm tra thanh toán hoặc quyền tham dự bên ngoài. Không có thanh toán tự
        động trong phiên bản này.
      </p>
      <Field label="ID tài khoản người nhận">
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} />
      </Field>
      <Field label="ID vòng thi">
        <Input value={roundId} onChange={(e) => setRoundId(e.target.value)} />
      </Field>
      <Field label="Ghế">
        <Input value={seat} onChange={(e) => setSeat(e.target.value)} />
      </Field>
      <Button
        disabled={busy}
        onClick={() => onIssue({ user_id: userId, round_id: roundId, seat_label: seat })}
      >
        Cấp vé
      </Button>
    </Card>
  );
}
