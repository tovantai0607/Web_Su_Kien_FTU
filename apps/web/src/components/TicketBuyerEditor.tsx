import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorState, Field, Input } from '@ftu/ui';
import type { Buyer, PurchaseLine } from '@ftu/shared';
import { api } from '../lib/api';
import { DataState } from './Content';

type CodeRecord = {
  code: string;
  ticket_id: string;
  revision: number;
  buyer: Buyer;
  evidence_id: string | null;
  line: PurchaseLine;
};
const labels: Record<keyof Buyer, string> = {
  name: 'Họ tên',
  school: 'Trường',
  cohort_class: 'Khóa/lớp',
  student_id: 'MSSV',
  email: 'Email liên hệ',
  phone: 'Số điện thoại',
  facebook: 'Facebook',
};
export default function TicketBuyerEditor({
  purchaseId,
  onClose,
}: {
  purchaseId: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['ticket-buyer-editor', purchaseId],
    queryFn: () => api<CodeRecord[]>(`/admin/sheets/purchases/${purchaseId}/ticket-groups`),
    retry: false,
  });
  const [selected, setSelected] = useState<CodeRecord[]>([]),
    [buyer, setBuyer] = useState<Buyer | null>(null),
    [clearProof, setClearProof] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const groups = new Map<string, CodeRecord[]>();
  q.data?.forEach((row) => {
    const key =
      row.line.bundle_size === 1 ? row.code : row.line.product_id + ':' + row.line.bundle_size;
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  const clearing =
    buyer !== null &&
    Object.values(buyer).every((v) => !v.trim()) &&
    (clearProof || !selected[0]?.evidence_id);
  async function save() {
    if (!buyer || !selected.length) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/sheets/purchases/${purchaseId}/ticket-group`, {
        method: 'POST',
        body: JSON.stringify({
          operation_id: crypto.randomUUID(),
          expected_revision: selected[0].revision,
          codes: selected.map((r) => r.code),
          ticket_ids: selected.map((r) => r.ticket_id),
          buyer,
          evidence_id: clearProof ? null : selected[0].evidence_id,
        }),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['purchase-records'] }),
        client.invalidateQueries({ queryKey: ['ticket-buyer-editor', purchaseId] }),
        client.invalidateQueries({ queryKey: ['purchase-statistics'] }),
        client.invalidateQueries({ queryKey: ['purchase-catalog'] }),
      ]);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h3>Sửa thông tin vé</h3>
      <p>
        Mã vé được giữ nguyên. Thông tin liên hệ và minh chứng dùng chung trong đơn; xóa sạch một
        dòng chỉ trả vé hoặc nhóm combo đó về kho. Vé đã vote không được bán lại.
      </p>
      <DataState query={q} />
      {Array.from(groups.entries()).map(([key, rows]) => (
        <Button
          key={key}
          variant="outline"
          disabled={busy}
          onClick={() => {
            setSelected(rows);
            setBuyer({ ...rows[0].buyer });
            setClearProof(false);
            setError('');
          }}
        >
          {rows.map((r) => r.code).join(', ')} · {rows[0].line.name}
        </Button>
      ))}
      {buyer && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p>Mã giữ nguyên: {selected.map((r) => r.code).join(', ')}</p>
          {(Object.keys(labels) as (keyof Buyer)[]).map((key) => (
            <Field key={key} label={labels[key]}>
              <Input
                id={'edit-' + purchaseId + '-' + key}
                type={key === 'email' ? 'email' : 'text'}
                value={buyer[key]}
                disabled={busy}
                onChange={(e) => setBuyer({ ...buyer, [key]: e.target.value })}
              />
            </Field>
          ))}
          <label className="purchase-config-check">
            <input
              type="checkbox"
              checked={clearProof}
              disabled={busy}
              onChange={(e) => setClearProof(e.target.checked)}
            />{' '}
            Xóa minh chứng hiện tại
          </label>
          <p role="status">
            {clearing
              ? 'Lưu sẽ thu hồi quyền của người mua cũ và trả nhóm mã trên về kho để bán lại.'
              : 'Được để trống từng trường; email liên hệ không đổi tài khoản sở hữu.'}
          </p>
          {error && <ErrorState message={error} />}
          <Button type="submit" disabled={busy}>
            {busy ? 'Đang lưu…' : clearing ? 'Làm sạch và trả vé về kho' : 'Lưu thay đổi'}
          </Button>
        </form>
      )}
      <Button variant="outline" disabled={busy} onClick={onClose}>
        Đóng chỉnh sửa
      </Button>
    </Card>
  );
}
