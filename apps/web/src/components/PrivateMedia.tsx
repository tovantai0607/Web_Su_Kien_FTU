import { useEffect, useState } from 'react';
import { Button, ErrorState } from '@ftu/ui';
import { supabase } from '../lib/api';
export default function PrivateMedia({ id }: { id: string | null }) {
  const [show, setShow] = useState(false),
    [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!show || !id) return;
    const controller = new AbortController();
    let objectUrl = '';
    void (async () => {
      try {
        const session = await supabase?.auth.getSession();
        if (!session?.data.session) throw new Error('Vui lòng đăng nhập lại để xem ảnh.');
        const response = await fetch('/api/media/' + id, {
          headers: { Authorization: 'Bearer ' + session.data.session.access_token },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok)
          throw new Error('Không thể xem ảnh. Kiểm tra quyền xét duyệt và MFA của bạn.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl('');
    };
  }, [id, show]);
  return (
    <div className="private-media">
      <strong>Xác minh sinh viên FTU</strong>
      <p>Đối chiếu thẻ sinh viên trước khi duyệt hồ sơ. Ảnh này không công khai.</p>
      {id ? (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShow(!show);
              setError('');
            }}
          >
            {show ? 'Đóng ảnh thẻ' : 'Xem ảnh thẻ sinh viên'}
          </Button>
          {show && !url && !error && <p role="status">Đang tải ảnh riêng tư…</p>}
          {show && url && <img src={url} alt="Ảnh thẻ sinh viên cung cấp để xét duyệt" />}
          {error && <ErrorState message={error} />}
        </>
      ) : (
        <p>Hồ sơ chưa có ảnh thẻ sinh viên.</p>
      )}
    </div>
  );
}
