import { Card } from '@ftu/ui';
import { Users, Heart, Ticket } from 'lucide-react';

export default function AdminOverview({
  summary,
}: {
  summary: { applications?: number; votes?: number; checked_in?: number } | undefined;
}) {
  const metrics = [
    { label: 'Hồ sơ', value: summary?.applications, Icon: Users },
    { label: 'Phiếu bầu', value: summary?.votes, Icon: Heart },
    { label: 'Vé check-in', value: summary?.checked_in, Icon: Ticket },
  ];
  const max = Math.max(1, ...metrics.map((metric) => metric.value ?? 0));
  return (
    <>
      <div className="stat-grid">
        {metrics.map(({ label, value, Icon }) => (
          <Card key={label}>
            <Icon size={23} strokeWidth={1.3} />
            <span>{label}</span>
            <strong>{value === undefined ? '—' : value.toLocaleString('vi-VN')}</strong>
          </Card>
        ))}
      </div>
      <Card className="overview-chart">
        <h2>Hoạt động cuộc thi</h2>
        <p>Số lượng hiện tại</p>
        <dl>
          {metrics.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="metric-track" aria-hidden="true">
                  <span style={{ width: `${((value ?? 0) / max) * 100}%` }} />
                </span>
                <strong>
                  {value === undefined ? 'Chưa có dữ liệu' : value.toLocaleString('vi-VN')}
                </strong>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
