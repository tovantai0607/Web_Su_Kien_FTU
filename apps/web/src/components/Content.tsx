import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Crown, Flower2 } from 'lucide-react';
import { Badge, Skeleton, ErrorState } from '@ftu/ui';
import { api } from '../lib/api';
import type { Contestant } from '@ftu/shared';
export function useContent<T>(path: string) {
  return useQuery({ queryKey: ['content', path], queryFn: () => api<T>(path) });
}
export function DataState({
  query,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };
}) {
  if (query.isPending)
    return (
      <div className="skeleton-grid">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (query.isError)
    return (
      <ErrorState
        message={query.error?.message ?? 'Không thể tải nội dung.'}
        retry={() => void query.refetch()}
      />
    );
  return null;
}
export function ContestantCard({
  contestant,
  index = 0,
}: {
  contestant: Contestant;
  index?: number;
}) {
  return (
    <Link to={'/thi-sinh/' + contestant.slug} className={'contestant-card tone-' + (index % 4)}>
      <div className="portrait">
        {contestant.photo_url ? (
          <img
            src={contestant.photo_url}
            alt={contestant.display_name}
            width="420"
            height="560"
            loading="lazy"
          />
        ) : (
          <>
            <Flower2 className="portrait-flower" strokeWidth={0.5} />
            <span className="portrait-placeholder">
              {String(contestant.number ?? index + 1).padStart(2, '0')}
            </span>
            <small>Hồ sơ minh họa</small>
          </>
        )}
        <Badge>#{String(contestant.number ?? index + 1).padStart(2, '0')}</Badge>
        <span className="portrait-link">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="contestant-caption">
        <h3>{contestant.display_name}</h3>
        <p>{contestant.faculty}</p>
      </div>
    </Link>
  );
}
export function PageTitle({
  label,
  title,
  description,
}: {
  label?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="page-title">
      {label && <Badge>{label}</Badge>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
export function FloralMark() {
  return (
    <span className="floral-mark" aria-hidden="true">
      <Crown strokeWidth={1} />
    </span>
  );
}
