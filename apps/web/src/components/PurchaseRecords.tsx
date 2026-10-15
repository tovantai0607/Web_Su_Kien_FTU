import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState } from '@ftu/ui';
import type { Buyer, Purchase } from '@ftu/shared';
import { api, supabase } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DataState } from './Content';

export type PurchaseRow = Pick<
  Purchase,
  | 'id'
  | 'code'
  | 'buyer'
  | 'lines'
  | 'quantity'
  | 'total_vnd'
  | 'status'
  | 'evidence_id'
  | 'completed_at'
  | 'round_id'
>;
const buyerLabels: Record<keyof Buyer, string> = {
  name: 'Họ tên',
  school: 'Trường',
  cohort_class: 'Khóa/lớp',
  student_id: 'MSSV',
  email: 'Email',
  phone: 'Số điện thoại',
  facebook: 'Facebook',
};
export default function PurchaseRecords({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth(),
    [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ['purchase-records', admin, user?.id, page],
    queryFn: async () => {
      if (admin)
        return api<{ rows: PurchaseRow[]; count: number }>('/admin/purchases?page=' + page);
      const rows = (await api<PurchaseRow[]>('/me/purchases')).filter(
        (r) => r.status === 'COMPLETED',
      );
      return { rows, count: rows.length };
    },
    enabled: !!user,
    retry: false,
  });
  return (
    <>
      <DataState query={q} />
      {q.isSuccess && !q.data.rows.length && (
        <EmptyState title="Chưa có đơn Hoàn tất">
          Thông tin xuất hiện sau khi lưu ảnh và Hoàn tất thành công.
        </EmptyState>
      )}
      {!!q.data?.rows.length && (
        <>
          {admin && (
            <div className="purchase-actions">
              <Button variant="outline" onClick={() => downloadRecords(q.data.rows)}>
                Tải dữ liệu trang này (CSV)
              </Button>
              <Button variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>
                {q.isFetching ? 'Đang tải…' : 'Tải lại danh sách'}
              </Button>
              <p role="status">
                {q.data.count} đơn đã Hoàn tất · trang {page + 1}
              </p>
            </div>
          )}
          <div
            className="purchase-records"
            role="region"
            tabIndex={0}
            aria-label="Dữ liệu vé đã Hoàn tất"
          >
            <table>
              <caption className="sr-only">
                Dữ liệu vé theo mẫu bổ sung. Ảnh minh chứng riêng tư.
              </caption>
              <thead>
                <tr>
                  {[
                    'Mã đơn',
                    'Thông tin',
                    'Minh chứng chuyển khoản',
                    'Loại vé',
                    'Số lượng',
                    'Combo',
                  ].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>
                      {(Object.keys(buyerLabels) as (keyof Buyer)[]).map((key) => (
                        <div key={key}>
                          <strong>{buyerLabels[key]}:</strong> {r.buyer[key]}
                        </div>
                      ))}
                    </td>
                    <td>{r.evidence_id ? <EvidenceImage id={r.evidence_id} /> : 'Chưa có ảnh'}</td>
                    <td>
                      {r.lines.map((l) => (
                        <div key={l.product_id + ':' + l.bundle_size}>
                          {l.name} · {l.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'}
                        </div>
                      ))}
                    </td>
                    <td>{r.quantity}</td>
                    <td>
                      {r.lines.map((l) => (
                        <div key={l.product_id + ':' + l.bundle_size}>
                          {l.bundle_size === 1
                            ? `Đơn: ${l.quantity}`
                            : `Combo ${l.bundle_size}: ${l.quantity}`}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && (
            <div>
              <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
                Trang trước
              </Button>
              <span>
                {' '}
                Trang {page + 1} · {q.data.count} đơn{' '}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 50 >= q.data.count}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
export function EvidenceImage({ id }: { id: string }) {
  const [show, setShow] = useState(false),
    [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!show) return;
    const abort = new AbortController();
    let imageUrl = '';
    void (async () => {
      try {
        const session = await supabase?.auth.getSession();
        const response = await fetch('/api/purchase-evidence/' + id, {
          headers: { Authorization: 'Bearer ' + session?.data.session?.access_token },
          signal: abort.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Không tải được ảnh; kiểm tra quyền và thử lại.');
        const blob = await response.blob();
        if (abort.signal.aborted) return;
        imageUrl = URL.createObjectURL(blob);
        setUrl(imageUrl);
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => {
      abort.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setUrl('');
    };
  }, [id, show]);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setShow(!show);
          setError('');
        }}
      >
        {show ? 'Đóng ảnh' : 'Xem minh chứng'}
      </Button>
      {show && !url && !error && <p role="status">Đang tải ảnh…</p>}
      {show && url && <img src={url} alt="Minh chứng chuyển khoản của đơn vé" />}
      {error && <ErrorState message={error} />}
    </>
  );
}
export function downloadRecords(rows: PurchaseRow[]) {
  // Neutralize spreadsheet formula injection in every cell, including user-entered PII.
  const cell = (s: unknown) =>
    '"' +
    String(s ?? '')
      .replace(/^[\s]*[=+\-@]/, (v) => "'" + v)
      .replaceAll('"', '""') +
    '"';
  const header = ['Mã đơn', 'Thông tin', 'Minh chứng chuyển khoản', 'Loại vé', 'Số lượng', 'Combo'];
  const csv =
    '\uFEFF' +
    [
      header,
      ...rows.map((r) => [
        r.code,
        Object.values(r.buyer).join(' | '),
        r.evidence_id,
        r.lines.map((l) => l.name + ' ' + l.tier).join(' | '),
        r.quantity,
        r.lines
          .map((l) => (l.bundle_size === 1 ? 'Đơn' : 'Combo ' + l.bundle_size) + ': ' + l.quantity)
          .join(' | '),
      ]),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ftucharm-ve.csv';
  a.click();
  URL.revokeObjectURL(url);
}
