import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@ftu/ui';
import type { Offer } from '@ftu/shared';
import { api } from '../lib/api';
import { DataState } from './Content';
import { useAuth } from '../lib/auth';

export default function DemoTicketLinks() {
  const { user, access, accessLoading } = useAuth();
  const allowed = !!user && !!access?.is_admin && !accessLoading;
  const query = useQuery({
    queryKey: ['admin-purchase-offers', user?.id],
    queryFn: () => api<Offer[]>('/admin/purchase-offers'),
    retry: false,
    enabled: allowed,
  });
  if (!allowed) return null;
  const offers = query.data?.filter((offer) => offer.mode === 'DEMO' && offer.published) ?? [];
  return (
    <>
      <DataState query={query} />
      {!!offers.length && (
        <Card>
          <h2>Thử mua vé và bình chọn DEMO</h2>
          <p>
            Dùng thông tin và ảnh giả, không chuyển tiền. Tài khoản admin cũng cần Hoàn tất mua vé
            đúng vòng để có lượt bình chọn.
          </p>
          {offers.map((offer) => (
            <div className="purchase-actions" key={offer.id}>
              <Button asChild variant="outline">
                <Link to={'/ve/' + encodeURIComponent(offer.slug)}>
                  Mua vé DEMO — {offer.title}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={'/binh-chon?demo=1&vong=' + offer.round_id}>
                  Thử vote và xem BXH DEMO
                </Link>
              </Button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
