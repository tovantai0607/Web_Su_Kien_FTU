import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Publication, PublicationAdmin as Data } from '@ftu/shared';
import { Button, Card, EmptyState, ErrorState, Field, Input } from '@ftu/ui';
import { api, supabase } from '../lib/api';
import { DataState } from './Content';

function DraftPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false,
      objectUrl = '';
    void (async () => {
      const session = await supabase?.auth.getSession();
      const response = await fetch(path, {
        headers: session?.data.session
          ? { Authorization: `Bearer ${session.data.session.access_token}` }
          : {},
      });
      if (!response.ok || cancelled) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (cancelled) URL.revokeObjectURL(objectUrl);
      else setUrl(objectUrl);
    })().catch(() => setUrl(''));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt="Ảnh xem trước trước khi công bố"
      width="210"
      height="280"
      style={{ objectFit: 'contain' }}
    />
  ) : (
    <p>Ảnh chưa tải được.</p>
  );
}
export default function PublicationAdmin() {
  const q = useQuery({
    queryKey: ['publications-admin'],
    queryFn: () => api<Data>('/admin/publications'),
    retry: false,
  });
  const [draft, setDraft] = useState<Publication | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  function blank(round: boolean) {
    setMessage('');
    setError('');
    setDraft({
      id: crypto.randomUUID(),
      edition_id: q.data?.editions[0]?.id ?? '',
      contestant_id: '',
      round_id: round ? (q.data?.rounds[0]?.id ?? null) : null,
      award_name: '',
      photo_url: null,
      published: false,
    });
  }
  async function save(published: boolean) {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/publications', {
        method: 'POST',
        body: JSON.stringify({ ...draft, published }),
      });
      setDraft({ ...draft, published });
      setMessage(published ? 'Đã công bố.' : 'Đã lưu bản nháp.');
      await q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ photo_url: string }>('/admin/public-images', {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      setDraft({ ...draft, photo_url: result.photo_url });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="purchase-admin">
      <h2>Ảnh theo vòng và nhà vô địch 2027</h2>
      <p>
        Ảnh bán kết dự kiến 10–11/04. Nhà vô địch dự kiến 23:00 ngày 23/05. BTC xem trước rồi bấm
        công bố; không tự lấy người thắng từ số vote.
      </p>
      <DataState query={q} />
      <p role="status">{message}</p>
      {error && <ErrorState message={error} />}
      <div className="filter-row">
        <Button variant="outline" onClick={() => blank(true)}>
          Thêm ảnh theo vòng
        </Button>
        <Button variant="outline" onClick={() => blank(false)}>
          Thêm nhà vô địch
        </Button>
      </div>
      {!q.data?.contestants.length && q.isSuccess && (
        <EmptyState title="Chưa có thí sinh chính thức">
          Duyệt và công bố hồ sơ, cấu hình danh sách qua vòng trước khi cập nhật ảnh.
        </EmptyState>
      )}
      <ul>
        {q.data?.publications.map((p) => (
          <li key={p.id}>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(p);
                setMessage('');
                setError('');
              }}
            >
              {p.round_id ? q.data?.rounds.find((r) => r.id === p.round_id)?.title : p.award_name} ·{' '}
              {q.data?.contestants.find((c) => c.id === p.contestant_id)?.display_name} ·{' '}
              {p.published ? 'Đã công bố' : 'Nháp'}
            </Button>
          </li>
        ))}
      </ul>
      {draft && (
        <Card>
          <h3>{draft.round_id ? 'Ảnh thí sinh theo vòng' : 'Nhà vô địch hạng mục'}</h3>
          {draft.round_id && (
            <Field label="Vòng thi">
              <select
                className="input"
                value={draft.round_id}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, round_id: e.target.value })}
              >
                {q.data?.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!draft.round_id && (
            <Field label="Hạng mục vinh danh">
              <Input
                value={draft.award_name}
                maxLength={160}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, award_name: e.target.value })}
              />
            </Field>
          )}
          <Field label="Thí sinh">
            <select
              className="input"
              value={draft.contestant_id}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, contestant_id: e.target.value })}
            >
              <option value="">Chọn thí sinh đã công bố</option>
              {q.data?.contestants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tải ảnh JPG/PNG" hint="Tối đa 5 MB, 12 megapixel.">
            <Input
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </Field>
          <Field label="Đường dẫn ảnh đã duyệt">
            <Input
              value={draft.photo_url ?? ''}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, photo_url: e.target.value || null })}
            />
          </Field>
          {draft.photo_url && <DraftPhoto key={draft.photo_url} path={draft.photo_url} />}
          <div className="filter-row">
            <Button variant="outline" disabled={busy} onClick={() => void save(false)}>
              Lưu bản nháp
            </Button>
            <Button disabled={busy || !draft.photo_url} onClick={() => void save(true)}>
              {busy ? 'Đang lưu…' : 'Công bố'}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
