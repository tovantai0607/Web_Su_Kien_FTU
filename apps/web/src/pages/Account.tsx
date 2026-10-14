import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { Button, Card, Field, Input, Badge, ErrorState, EmptyState } from '@ftu/ui';
import { PageTitle, DataState } from '../components/Content';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import AuthForm from '../components/AuthForm';
import AccountSecurity from '../components/AccountSecurity';
import OAuthCallback from '../components/OAuthCallback';
import type { Contestant } from '@ftu/shared';
function Profile() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const q = useQuery({
    queryKey: ['my-applications', user?.id],
    queryFn: () =>
      api<
        {
          id: string;
          code: string;
          full_name: string;
          status: string;
          note: string | null;
          contestants: Pick<
            Contestant,
            'faculty' | 'bio' | 'talents' | 'cohort' | 'class_name' | 'height_cm' | 'gender'
          >;
        }[]
      >('/me/application'),
  });
  const notifications = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => api<{ id: string; title: string; body: string }[]>('/me/notifications'),
  });
  const [editing, setEditing] = useState<string | null>(null),
    [bio, setBio] = useState(''),
    [faculty, setFaculty] = useState(''),
    [talents, setTalents] = useState('');
  const [details, setDetails] = useState({ cohort: '', class_name: '', height_cm: '', gender: '' });
  const labels: Record<string, string> = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Không đủ điều kiện',
    needs_changes: 'Cần bổ sung',
  };
  return (
    <div className="page-shell">
      <PageTitle title="Tài khoản" description={user?.email} />
      <div className="account-grid">
        <div>
          <DataState query={q} />
          {q.data?.length === 0 && (
            <EmptyState title="Chưa có hồ sơ đăng ký">
              <Link to="/dang-ky">Bắt đầu đăng ký</Link>
            </EmptyState>
          )}
          {q.data?.map((a) => (
            <Card key={a.id}>
              <Badge>{labels[a.status]}</Badge>
              <h2>{a.full_name}</h2>
              <p>
                Mã hồ sơ: <strong>{a.code}</strong>
              </p>
              {a.note && <p className="notice">{a.note}</p>}
              {a.status === 'needs_changes' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(a.id);
                      setBio(a.contestants.bio);
                      setFaculty(a.contestants.faculty);
                      setTalents(a.contestants.talents);
                      setDetails({
                        cohort: a.contestants.cohort ?? '',
                        class_name: a.contestants.class_name ?? '',
                        height_cm: String(a.contestants.height_cm ?? ''),
                        gender: a.contestants.gender ?? '',
                      });
                    }}
                  >
                    Bổ sung hồ sơ
                  </Button>
                  {editing === a.id && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await api('/me/application/' + a.id, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              bio,
                              faculty,
                              talents,
                              ...details,
                              height_cm: Number(details.height_cm),
                            }),
                          });
                          setEditing(null);
                          void q.refetch();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Field label="Khoa">
                        <Input value={faculty} onChange={(e) => setFaculty(e.target.value)} />
                      </Field>
                      <Field label="Khóa">
                        <Input
                          required
                          value={details.cohort}
                          onChange={(e) => setDetails((d) => ({ ...d, cohort: e.target.value }))}
                        />
                      </Field>
                      <Field label="Lớp">
                        <Input
                          required
                          value={details.class_name}
                          onChange={(e) =>
                            setDetails((d) => ({ ...d, class_name: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Chiều cao (cm)">
                        <Input
                          required
                          type="number"
                          min="100"
                          max="250"
                          step="0.1"
                          value={details.height_cm}
                          onChange={(e) => setDetails((d) => ({ ...d, height_cm: e.target.value }))}
                        />
                      </Field>
                      <Field label="Hạng mục dự thi">
                        <select
                          required
                          className="input"
                          value={details.gender}
                          onChange={(e) => setDetails((d) => ({ ...d, gender: e.target.value }))}
                        >
                          <option value="">Chọn hạng mục</option>
                          <option value="male">Nam</option>
                          <option value="female">Nữ</option>
                        </select>
                      </Field>
                      <Field label="Giới thiệu">
                        <textarea
                          className="input"
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                        />
                      </Field>
                      <Field label="Tài năng">
                        <textarea
                          className="input"
                          value={talents}
                          onChange={(e) => setTalents(e.target.value)}
                        />
                      </Field>
                      <Button>Gửi bổ sung</Button>
                    </form>
                  )}
                </>
              )}
            </Card>
          ))}
          <h2>Thông báo từ ban tổ chức</h2>
          <DataState query={notifications} />
          {notifications.data?.map((n) => (
            <Card key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </Card>
          ))}
        </div>
        <aside>
          {error && <ErrorState message={error} />}
          <AccountSecurity />
        </aside>
      </div>
    </div>
  );
}
export default function Account() {
  const { user, loading, recovery } = useAuth();
  const { pathname } = useLocation();
  if (pathname.endsWith('oauth-callback')) return <OAuthCallback />;
  if (loading) return <div className="page-shell">Đang kiểm tra phiên…</div>;
  if (
    recovery ||
    pathname.endsWith('dat-lai-mat-khau') ||
    pathname.endsWith('dang-nhap') ||
    pathname.endsWith('dang-ky') ||
    pathname.endsWith('quen-mat-khau')
  )
    return <AuthForm />;
  return user ? <Profile /> : <AuthForm />;
}
