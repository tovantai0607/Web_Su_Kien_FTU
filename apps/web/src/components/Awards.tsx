import type { Publication } from '@ftu/shared';
import { EmptyState } from '@ftu/ui';
import { useContent, DataState } from './Content';
export default function Awards() {
  const q = useContent<Publication[]>('/awards');
  return (
    <section className="section" aria-labelledby="awards-title">
      <h2 id="awards-title">Vinh danh FTUCharm 2027</h2>
      <DataState query={q} />
      {q.data?.length === 0 && (
        <EmptyState title="Kết quả chờ công bố">
          BTC dự kiến cập nhật nhà vô địch các hạng mục khoảng 23:00 ngày 23/05/2027.
        </EmptyState>
      )}
      <div className="contestant-grid">
        {q.data?.map((p) => (
          <article key={p.id} className="card">
            {p.photo_url && (
              <img
                src={p.photo_url}
                alt={`${p.award_name}: ${p.contestant?.display_name ?? ''}`}
                width="420"
                height="560"
                loading="lazy"
                style={{ width: '100%', height: 'auto' }}
              />
            )}
            <h3>{p.award_name}</h3>
            <p>{p.contestant?.display_name}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
