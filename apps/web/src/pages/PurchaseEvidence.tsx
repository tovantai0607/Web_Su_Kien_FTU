import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState } from '@ftu/ui';
import { PageTitle } from '../components/Content';
import { EvidenceImage } from '../components/PurchaseRecords';
import { useAuth } from '../lib/auth';
import { evidenceId } from '../lib/evidence-return';
import './purchases.css';

export default function PurchaseEvidence() {
  const { id: param } = useParams();
  const id = evidenceId(param);
  const { user, loading } = useAuth();
  return (
    <div className="page-shell purchase-proof-viewer">
      <PageTitle title="Minh chứng chuyển khoản" description="Ảnh riêng tư của đơn vé." />
      {!id ? (
        <EmptyState title="Mã minh chứng không hợp lệ" />
      ) : loading ? (
        <p role="status">Đang kiểm tra đăng nhập…</p>
      ) : !user ? (
        <Card>
          <h2>Đăng nhập để xem ảnh</h2>
          <p>
            Dùng tài khoản mua vé hoặc tài khoản quản lý vé được cấp quyền. Sau đăng nhập sẽ mở đúng
            ảnh này.
          </p>
          <Button asChild>
            <Link to={'/tai-khoan/dang-nhap?minh-chung=' + id}>Đăng nhập để xem ảnh</Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <EvidenceImage key={user.id + ':' + id} id={id} initialOpen />
        </Card>
      )}
      <Link className="text-link" to="/admin/ve">
        Về danh sách khách mua vé
      </Link>
    </div>
  );
}
