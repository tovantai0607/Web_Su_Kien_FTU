import { Link } from 'react-router-dom';
import { PageTitle } from '../components/Content';
import PurchaseRecords from '../components/PurchaseRecords';
import DemoTicketLinks from '../components/DemoTicketLinks';
import './purchases.css';

export default function PurchaseCustomers() {
  return (
    <div className="page-shell purchase-admin">
      <nav aria-label="Điều hướng quản trị" className="admin-action-bar">
        <Link className="admin-action-link" to="/admin">
          Tổng quan quản trị
        </Link>
        <Link className="admin-action-link" to="/admin?muc=purchase-data">
          Cấu hình hạng vé và combo
        </Link>
        <a
          className="admin-action-link"
          href="https://supabase.com/dashboard/project/ifgtyslifgegwcguysbb/editor"
          target="_blank"
          rel="noreferrer"
        >
          Database Supabase
        </a>
      </nav>
      <PageTitle
        label="Ban tổ chức"
        title="Khách đã mua vé"
        description="Danh sách thông tin người mua, loại vé, số lượng, combo và ảnh minh chứng đã lưu."
      />
      <p>
        Danh sách gồm đơn đã Hoàn tất gửi thông tin và minh chứng. BTC đối chiếu tiền và gửi vé qua
        email thủ công.
      </p>
      <PurchaseRecords admin />
      <DemoTicketLinks />
    </div>
  );
}
