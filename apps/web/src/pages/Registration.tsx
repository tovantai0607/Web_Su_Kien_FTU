import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, ImagePlus, ShieldCheck, Flower2 } from 'lucide-react';
import { applicationSchema, type ApplicationInput, type Edition } from '@ftu/shared';
import { Button, Field, Input, Card, Badge, ErrorState } from '@ftu/ui';
import { PageTitle, useContent, DataState } from '../components/Content';
import { api, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Turnstile } from '../components/Turnstile';
export default function Registration() {
  const edition = useContent<Edition | null>('/editions/current');
  const { user } = useAuth();
  const [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [success, setSuccess] = useState<{ code: string } | null>(null),
    [files, setFiles] = useState<string[]>([]),
    [uploading, setUploading] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const top = useRef<HTMLDivElement>(null);
  const form = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      full_name: '',
      email: user?.email ?? '',
      phone: '',
      university: 'Đại học Ngoại thương',
      faculty: '',
      bio: '',
      talents: '',
      media_ids: [],
      turnstile_token: '',
    },
  });
  const errors = form.formState.errors;
  const onToken = useCallback((token: string) => form.setValue('turnstile_token', token), [form]);
  const upload = async (index: number, file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Chọn ảnh JPEG/PNG, tối đa 5 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      let id: string;
      if (preview) id = crypto.randomUUID();
      else {
        id = (
          await api<{ id: string }>('/media/upload?edition=' + edition.data?.id, {
            method: 'POST',
            body: file,
            headers: { 'Content-Type': file.type },
          })
        ).id;
      }
      const ids = [...form.getValues('media_ids')];
      ids[index] = id;
      form.setValue('media_ids', ids);
      setFiles((f) => {
        const next = [...f];
        next[index] = file.name;
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const submit = form.handleSubmit(
    async (data) => {
      setError('');
      if (preview) {
        setError('Đây là bản xem trước. Hồ sơ chưa được gửi hoặc lưu.');
        top.current?.focus();
        return;
      }
      try {
        const result = await api<{ code: string }>('/contestants/apply', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotency.current },
          body: JSON.stringify(data),
        });
        setSuccess(result);
      } catch (e) {
        setError((e as Error).message);
        top.current?.focus();
      }
    },
    () => {
      setError('Vui lòng kiểm tra các trường có thông báo lỗi và hoàn tất xác minh.');
      top.current?.focus();
    },
  );
  async function next() {
    const fields: (keyof ApplicationInput)[][] = [
      ['full_name', 'email', 'phone', 'university', 'faculty'],
      ['bio', 'talents'],
    ];
    if (await form.trigger(fields[step])) setStep((v) => v + 1);
  }
  useEffect(() => {
    if (edition.data) form.setValue('edition_id', edition.data.id);
  }, [edition.data, form]);
  if (success)
    return (
      <div className="page-shell">
        <Card className="success-card">
          <Check size={42} />
          <h1>Hồ sơ đã được tiếp nhận.</h1>
          <p>
            Mã hồ sơ: <strong>{success.code}</strong>
          </p>
          <p>Bạn sẽ nhận email xác nhận tiếp nhận. Đây chưa phải thông báo trúng tuyển.</p>
          <Button asChild>
            <Link to="/tai-khoan/ho-so">Xem trạng thái hồ sơ</Link>
          </Button>
        </Card>
      </div>
    );
  return (
    <div className="page-shell">
      <PageTitle
        label="Bắt đầu hành trình"
        title="Sẵn sàng để nở rộ?"
        description="Kể cho chúng tôi câu chuyện của bạn. Chặng đường rực rỡ bắt đầu từ đây."
      />
      <DataState query={edition} />
      <div className="registration-layout">
        <aside>
          <div className="registration-art">
            <Flower2 size={70} strokeWidth={0.5} />
            <h2>
              Be you.
              <br />
              <i>Be brilliant.</i>
            </h2>
            <p>
              Một hồ sơ.
              <br />
              Một cơ hội.
              <br />
              Một phiên bản mới.
            </p>
          </div>
          <div className="security-note">
            <ShieldCheck size={22} />
            <div>
              <strong>Hồ sơ được giữ riêng tư</strong>
              <p>Chỉ thông tin được duyệt và cho phép công bố xuất hiện trên website.</p>
            </div>
          </div>
          <Link className="text-link" to="/the-le">
            Đọc thể lệ trước khi đăng ký
          </Link>
        </aside>
        <Card className="registration-form">
          {!preview && !user ? (
            <>
              <h2>Đăng nhập để lưu hồ sơ an toàn.</h2>
              <p>Tài khoản cần xác minh email trước khi gửi đăng ký.</p>
              <Button asChild>
                <Link to="/tai-khoan/dang-nhap">Đăng nhập / tạo tài khoản</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="form-steps">
                {['Thông tin', 'Câu chuyện', 'Ảnh & xác nhận'].map((label, i) => (
                  <span key={label} className={i === step ? 'active' : i < step ? 'complete' : ''}>
                    <b>{i < step ? <Check size={14} /> : i + 1}</b>
                    {label}
                  </span>
                ))}
              </div>
              <form onSubmit={submit} noValidate>
                <div tabIndex={-1} ref={top}>
                  {error && <ErrorState message={error} />}
                </div>
                {step === 0 && (
                  <div className="form-grid">
                    <Field label="Họ và tên" error={errors.full_name?.message}>
                      <Input
                        autoComplete="name"
                        {...form.register('full_name')}
                        aria-invalid={!!errors.full_name}
                      />
                    </Field>
                    <Field label="Email đã xác minh" error={errors.email?.message}>
                      <Input
                        type="email"
                        autoComplete="email"
                        {...form.register('email')}
                        aria-invalid={!!errors.email}
                      />
                    </Field>
                    <Field label="Số điện thoại" error={errors.phone?.message}>
                      <Input
                        type="tel"
                        autoComplete="tel"
                        {...form.register('phone')}
                        aria-invalid={!!errors.phone}
                      />
                    </Field>
                    <Field label="Trường" error={errors.university?.message}>
                      <Input {...form.register('university')} />
                    </Field>
                    <Field label="Khoa / ngành học" error={errors.faculty?.message}>
                      <Input {...form.register('faculty')} />
                    </Field>
                    <div className="form-hint">
                      <Badge>Thu thập tối thiểu</Badge>
                      <p>
                        Không yêu cầu ngày sinh hay mã sinh viên khi BTC chưa xác định cần thiết.
                      </p>
                    </div>
                  </div>
                )}
                {step === 1 && (
                  <>
                    <Field
                      label="Câu chuyện của bạn"
                      hint="30–2.000 ký tự. Điều gì làm nên dấu ấn riêng của bạn?"
                      error={errors.bio?.message}
                    >
                      <textarea
                        className="input"
                        rows={6}
                        {...form.register('bio')}
                        aria-invalid={!!errors.bio}
                      />
                    </Field>
                    <Field
                      label="Tài năng & thành tích"
                      hint="Tối đa 1.000 ký tự."
                      error={errors.talents?.message}
                    >
                      <textarea className="input" rows={4} {...form.register('talents')} />
                    </Field>
                  </>
                )}
                {step === 2 && (
                  <>
                    <h2>Ba góc nhìn, một vẻ đẹp.</h2>
                    <p>
                      Ảnh JPEG/PNG, tối đa 5 MB mỗi ảnh. Tránh gửi giấy tờ tùy thân hay thông tin
                      nhạy cảm trong ảnh.
                    </p>
                    <div className="upload-grid">
                      {['Chân dung', 'Bán thân', 'Toàn thân'].map((label, i) => (
                        <label className="upload-box" key={label}>
                          <ImagePlus size={28} strokeWidth={1} />
                          <strong>{label}</strong>
                          <span>{files[i] ?? 'Chọn ảnh'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            aria-label={'Ảnh ' + label.toLowerCase()}
                            disabled={uploading || (!preview && !user)}
                            onChange={(e) => void upload(i, e.target.files?.[0])}
                          />
                        </label>
                      ))}
                    </div>
                    {errors.media_ids && (
                      <p role="alert" className="field-error">
                        {errors.media_ids.message}
                      </p>
                    )}
                    <label className="checkbox-label">
                      <input type="checkbox" {...form.register('consent')} />
                      <span>
                        Tôi đã đọc <Link to="/the-le">thể lệ</Link> và đồng ý với{' '}
                        <Link to="/quyen-rieng-tu">thông báo xử lý dữ liệu</Link>.
                      </span>
                    </label>
                    {errors.consent && (
                      <p className="field-error" role="alert">
                        {errors.consent.message}
                      </p>
                    )}
                    <Turnstile action="apply" onToken={onToken} />
                    {preview && (
                      <p className="fine-print">
                        Ảnh được chọn chỉ để thử giao diện, chưa tải lên server.
                      </p>
                    )}
                  </>
                )}
                <div className="form-navigation">
                  {step > 0 ? (
                    <Button type="button" variant="outline" onClick={() => setStep((v) => v - 1)}>
                      Quay lại
                    </Button>
                  ) : (
                    <span>Khoảng 5 phút để hoàn tất</span>
                  )}
                  {step < 2 ? (
                    <Button type="button" onClick={() => void next()}>
                      Tiếp tục <ArrowRight size={17} />
                    </Button>
                  ) : (
                    <Button disabled={form.formState.isSubmitting || uploading || !edition.data}>
                      {form.formState.isSubmitting ? 'Đang gửi…' : 'Gửi hồ sơ'}{' '}
                      <ArrowRight size={17} />
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
