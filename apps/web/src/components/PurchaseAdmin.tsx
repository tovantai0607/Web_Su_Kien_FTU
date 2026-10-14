import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorState, Field, Input } from '@ftu/ui';
import { offerConfigSchema, type Offer } from '@ftu/shared';
import { api } from '../lib/api';
import { DataState } from './Content';
import PurchaseRecords from './PurchaseRecords';
import PurchaseOfferEditor from './PurchaseOfferEditor';
import '../pages/purchases.css';

export default function PurchaseAdmin() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-purchase-offers'],
    queryFn: () => api<Offer[]>('/admin/purchase-offers'),
    retry: false,
  });
  const [config, setConfig] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const input = offerConfigSchema.safeParse(JSON.parse(config));
      if (!input.success) throw new Error(input.error.issues[0].message);
      await api('/admin/purchase-offers', { method: 'POST', body: JSON.stringify(input.data) });
      setMessage('Đã lưu cấu hình. Giá mới chỉ áp dụng đơn mới; đơn đang giữ giữ nguyên giá.');
      void q.refetch();
      void queryClient.invalidateQueries({ queryKey: ['purchase-catalog'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function blank() {
    setConfig(
      JSON.stringify(
        {
          id: crypto.randomUUID(),
          edition_id: '',
          round_id: '',
          slug: 'ban-ket-2027',
          title: 'Đêm bán kết',
          venue: '',
          starts_at: null,
          mode: 'DEMO',
          published: false,
          payment_instructions: 'DEMO — không chuyển tiền thật.',
          qr_path: null,
          products: ['The Intro', 'The Bridge', 'The Chorus'].flatMap((name) =>
            ['EARLY', 'NORMAL'].map((tier) => ({
              id: crypto.randomUUID(),
              name,
              tier,
              quota: 0,
              price_vnd: 100000,
              combo2_vnd: null,
              combo3_vnd: null,
              opens_at: '',
              closes_at: '',
              enabled: false,
            })),
          ),
        },
        null,
        2,
      ),
    );
  }
  return (
    <section className="purchase-admin">
      <Card>
        <h2>Cấu hình loại vé và combo</h2>
        <p>
          Chọn đợt bán để đổi giá, combo, quota và lịch bằng form. Mẫu DEMO không nhận tiền thật.
          Quyền lưu do backend kiểm tra theo tài khoản quản trị; thông số thật do BTC xác nhận.
        </p>
        <DataState query={q} />
        <Button variant="outline" onClick={blank}>
          Tạo mẫu cấu hình DEMO
        </Button>
        <ul>
          {q.data?.map((o) => (
            <li key={o.id}>
              <Button
                variant="outline"
                onClick={() => {
                  const {
                    id,
                    edition_id,
                    round_id,
                    slug,
                    title,
                    venue,
                    starts_at,
                    mode,
                    published,
                    payment_instructions,
                    qr_path,
                    products,
                  } = o;
                  setConfig(
                    JSON.stringify(
                      {
                        id,
                        edition_id,
                        round_id,
                        slug,
                        title,
                        venue,
                        starts_at,
                        mode,
                        published,
                        payment_instructions,
                        qr_path,
                        products: products.map(
                          ({
                            id,
                            name,
                            tier,
                            quota,
                            price_vnd,
                            combo2_vnd,
                            combo3_vnd,
                            opens_at,
                            closes_at,
                            enabled,
                          }) => ({
                            id,
                            name,
                            tier,
                            quota,
                            price_vnd,
                            combo2_vnd,
                            combo3_vnd,
                            opens_at,
                            closes_at,
                            enabled,
                          }),
                        ),
                      },
                      null,
                      2,
                    ),
                  );
                }}
              >
                {o.title} · {o.mode} · {o.published ? 'Đã công bố' : 'Nháp'}
              </Button>
            </li>
          ))}
        </ul>
        {config && (
          <PurchaseOfferEditor
            key={JSON.parse(config).id}
            value={config}
            onChange={setConfig}
            onSave={save}
            busy={busy}
          />
        )}
        {error && <ErrorState message={error} />}
        <p role="status">{message}</p>
      </Card>
      <Card>
        <h2>Dữ liệu Hoàn tất để BTC gửi vé thủ công</h2>
        <p>
          Hoàn tất cấp quyền vote, không tự xác nhận đã nhận tiền. Nhóm theo mã đơn và combo để bố
          trí các vé gần nhau.
        </p>
        <PurchaseRecords admin />
      </Card>
      <PurchaseStatistics />
      <VoteSessionControls />
    </section>
  );
}
function PurchaseStatistics() {
  const q = useQuery({
    queryKey: ['purchase-statistics'],
    queryFn: () =>
      api<{
        completed_orders: number;
        ticket_quantity: number;
        requested_amount_vnd: number;
        groups: {
          round_id: string;
          name: string;
          tier: string;
          bundle_size: number;
          bundle_quantity: number;
          ticket_quantity: number;
        }[];
      }>('/admin/purchase-statistics'),
    retry: false,
  });
  return (
    <Card>
      <h2>Thống kê theo loại và combo</h2>
      <DataState query={q} />
      {q.data && (
        <>
          <p>
            {q.data.completed_orders} đơn Hoàn tất · {q.data.ticket_quantity} vé. Tổng tiền theo
            đơn: {new Intl.NumberFormat('vi-VN').format(q.data.requested_amount_vnd)} VND, cần BTC
            đối chiếu thực nhận.
          </p>
          <ul>
            {q.data.groups.map((g) => (
              <li key={g.round_id + g.name + g.tier + g.bundle_size}>
                {g.name} · {g.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'} ·{' '}
                {g.bundle_size === 1 ? 'Đơn' : 'Combo ' + g.bundle_size}: {g.bundle_quantity} phần,{' '}
                {g.ticket_quantity} vé · vòng {g.round_id}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
function VoteSessionControls() {
  const [session, setSession] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(name: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/vote-sessions/${session}/${name}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMessage('Đã thực hiện: ' + name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2>Chốt và công bố kết quả vote</h2>
      <p>
        Đặt lịch trong Cấu hình vote và vé. SUPER_ADMIN đóng sớm phiên đang mở kèm lý do;
        VOTE_MANAGER chốt/công bố. Phiên đã đóng không được mở lại. Phiếu đã ghi được giữ nguyên.
      </p>
      <Field label="ID phiên vote">
        <Input value={session} onChange={(e) => setSession(e.target.value)} />
      </Field>
      <Field label="Lý do đóng sớm">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {(['close', 'finalize', 'publish'] as const).map((name, i) => (
        <Button
          key={name}
          variant="outline"
          disabled={busy || !session || (name === 'close' && !reason.trim())}
          onClick={() => void action(name)}
        >
          {['Đóng sớm phiên', 'Chốt kết quả', 'Công bố'][i]}
        </Button>
      ))}
      {error && <ErrorState message={error} />}
      <p role="status">{message}</p>
      <LegacyVoteReview />
    </Card>
  );
}
function LegacyVoteReview() {
  const q = useQuery({
    queryKey: ['legacy-vote-review'],
    queryFn: () =>
      api<{ id: string; round_id: string; ticket_id: string; contestant_id: string }[]>(
        '/admin/legacy-votes',
      ),
    retry: false,
  });
  const [vote, setVote] = useState(''),
    [category, setCategory] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function classify() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/legacy-votes/${vote}/classify`, {
        method: 'POST',
        body: JSON.stringify({ category_id: category }),
      });
      setMessage('Đã đối chiếu hạng mục; lịch sử phiếu giữ nguyên.');
      void q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Đối chiếu phiếu cũ</h3>
      <p>
        Vé có phiếu chưa xác định hạng mục tiếp tục bị chặn. BTC đối chiếu thực tế trước khi gán,
        không tự suy đoán hoặc xóa phiếu.
      </p>
      <DataState query={q} />
      <ul>
        {q.data?.map((v) => (
          <li key={v.id}>
            <Button variant="outline" onClick={() => setVote(v.id)}>
              Phiếu {v.id} · vòng {v.round_id} · thí sinh {v.contestant_id}
            </Button>
          </li>
        ))}
      </ul>
      <Field label="ID phiếu đã đối chiếu">
        <Input value={vote} onChange={(e) => setVote(e.target.value)} />
      </Field>
      <Field label="ID hạng mục đúng vòng">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} />
      </Field>
      <Button disabled={busy || !vote || !category} onClick={() => void classify()}>
        Gán hạng mục cho phiếu cũ
      </Button>
      {error && <ErrorState message={error} />}
      <p role="status">{message}</p>
    </section>
  );
}
