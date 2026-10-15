import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, ImagePlus, ShieldCheck, Flower2, IdCard } from 'lucide-react';
import {
  applicationSchema,
  registrationState,
  type ApplicationInput,
  type Edition,
} from '@ftu/shared';
import { Button, Field, Input, Card, Badge, ErrorState } from '@ftu/ui';
import { PageTitle, useContent, DataState } from '../components/Content';
import { api, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Turnstile } from '../components/Turnstile';
import { useProgram, useServerTime } from '../lib/program';
export default function Registration() {
  const edition = useContent<Edition | null>('/editions/current');
  const program = useProgram();
  const now = useServerTime(program.data?.server_time);
  const state =
    now === null ? 'UNCONFIGURED' : registrationState(program.data?.edition ?? null, now);
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
      faculty: '',
      cohort: '',
      class_name: '',
      bio: '',
      talents: '',
      media_ids: [],
      student_card_media_id: '',
      turnstile_token: '',
    },
  });
  const errors = form.formState.errors;
  const onToken = useCallback((token: string) => form.setValue('turnstile_token', token), [form]);
  const upload = async (index: number, file?: File) => {
    if (!file) return;
    if (!preview && (!user || state !== 'OPEN')) {
      setError('Đăng nhập và chờ đến thời gian nhận hồ sơ để tải ảnh.');
      return;
    }
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
          await api<{ id: string }>(
            '/media/upload?edition=' +
              edition.data?.id +
              '&purpose=' +
              (index === 3 ? 'student_card' : 'portfolio'),
            {
              method: 'POST',
              body: file,
              headers: { 'Content-Type': file.type },
            },
          )
        ).id;
      }
      if (index === 3) form.setValue('student_card_media_id', id, { shouldValidate: true });
      else {
        const ids = [...form.getValues('media_ids')];
        ids[index] = id;
        form.setValue('media_ids', ids, { shouldValidate: true });
      }
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
      if (!user || state !== 'OPEN') {
        setError('Chỉ nhận hồ sơ của tài khoản đã đăng nhập trong thời gian 07–21/03/2027.');
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
      ['full_name', 'email', 'phone', 'faculty', 'cohort', 'class_name', 'height_cm', 'gender'],
      ['bio', 'talents'],
    ];
    if (await form.trigger(fields[step])) setStep((v) => v + 1);
  }
  useEffect(() => {
    if (edition.data) form.setValue('edition_id', edition.data.id);
  }, [edition.data, form]);
  useEffect(() => {
    if (user?.email) form.setValue('email', user.email);
  }, [user?.email, form]);
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
      <PageTitle title="Đăng ký dự thi" description="Dành cho sinh viên Đại học Ngoại thương." />
      <DataState query={edition} />
      <div className="registration-layout">
        <aside>
          <div className="registration-art">
            <Flower2 size={70} strokeWidth={0.5} />
            <h2>Hồ sơ dự thi</h2>
          </div>
          <div className="security-note">
            <ShieldCheck size={22} />
            <div>
              <strong>Hồ sơ được giữ riêng tư</strong>
              <p>Chỉ thông tin được duyệt và cho phép công bố xuất hiện trên website.</p>
            </div>
          </div>
          <Link className="text-link" to="/the-le">
            Xem thể lệ
          </Link>
        </aside>
        <Card className="registration-form">
          {!preview && state !== 'OPEN' && (
            <div className="notice registration-notice" role="status">
              <h2>{state === 'CLOSED' ? 'Đã đóng đăng ký dự thi' : 'Chưa mở đăng ký dự thi'}</h2>
              <p>
                Nhận hồ sơ từ 07/03 đến hết 21/03/2027, theo giờ Việt Nam. Bạn có thể xem form và
                chuẩn bị thông tin; ảnh và hồ sơ chỉ được gửi trong thời gian nhận đăng ký.
              </p>
              {state === 'UNCONFIGURED' && <DataState query={program} />}
            </div>
          )}
          {!preview && !user && (
            <div className="registration-signin">
              <h2>Đăng nhập để gửi hồ sơ.</h2>
              <p>
                Tài khoản cần xác minh email. Thông tin đang nhập chỉ giữ trên trang này, chưa được
                gửi hoặc lưu.
              </p>
              <Link className="text-link" to="/tai-khoan/dang-nhap">
                Đăng nhập / tạo tài khoản
              </Link>
            </div>
          )}
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
                <div className="form-grid form-panel">
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
                  <Field label="Khoa / ngành học" error={errors.faculty?.message}>
                    <Input {...form.register('faculty')} />
                  </Field>
                  <Field label="Khóa" error={errors.cohort?.message}>
                    <Input {...form.register('cohort')} placeholder="Ví dụ: K63" />
                  </Field>
                  <Field label="Lớp" error={errors.class_name?.message}>
                    <Input {...form.register('class_name')} />
                  </Field>
                  <Field label="Chiều cao (cm)" error={errors.height_cm?.message}>
                    <Input
                      type="number"
                      min="100"
                      max="250"
                      step="0.1"
                      {...form.register('height_cm', { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="Hạng mục dự thi" error={errors.gender?.message}>
                    <select className="input" {...form.register('gender')}>
                      <option value="">Chọn hạng mục</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                    </select>
                  </Field>
                  <div className="form-hint">
                    <Badge>Sinh viên FTU</Badge>
                    <p>Chuẩn bị ảnh thẻ sinh viên để BTC xác minh tư cách tham gia ở bước cuối.</p>
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
                  <h2>Ảnh hồ sơ</h2>
                  <p>Ba ảnh hồ sơ và một ảnh thẻ sinh viên FTU. JPEG/PNG, tối đa 5 MB mỗi ảnh.</p>
                  <div className="upload-grid">
                    {['Chân dung', 'Bán thân', 'Toàn thân'].map((label, i) => (
                      <label className={'upload-box' + (files[i] ? ' has-file' : '')} key={label}>
                        <ImagePlus size={28} strokeWidth={1} />
                        <strong>{label}</strong>
                        <span>{files[i] ?? 'Chọn ảnh'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          aria-label={'Ảnh ' + label.toLowerCase()}
                          disabled={uploading || (!preview && (!user || state !== 'OPEN'))}
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
                  <label
                    className={'upload-box student-card-upload' + (files[3] ? ' has-file' : '')}
                  >
                    <IdCard size={35} strokeWidth={1} />
                    <strong>Ảnh thẻ sinh viên FTU</strong>
                    <span>{files[3] ?? 'Chọn ảnh mặt thẻ có họ tên và thông tin trường'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      aria-label="Ảnh thẻ sinh viên FTU"
                      aria-describedby="student-card-hint student-card-error"
                      aria-invalid={!!errors.student_card_media_id}
                      disabled={uploading || (!preview && (!user || state !== 'OPEN'))}
                      onChange={(e) => void upload(3, e.target.files?.[0])}
                    />
                  </label>
                  <p id="student-card-hint" className="fine-print">
                    Ảnh thẻ chỉ dùng để xác minh sinh viên FTU, được giữ riêng tư và không xuất hiện
                    trên trang thí sinh. Có thể che thông tin không cần thiết; giữ rõ họ tên, tên
                    trường và mã sinh viên.
                  </p>
                  <p
                    id="student-card-error"
                    className="field-error"
                    role={errors.student_card_media_id ? 'alert' : undefined}
                  >
                    {errors.student_card_media_id?.message}
                  </p>
                  {uploading && (
                    <p className="upload-progress" role="status">
                      Đang xử lý ảnh…
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
                  {(preview || (!!user && state === 'OPEN')) && (
                    <Turnstile action="apply" onToken={onToken} />
                  )}
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
                  <Button
                    disabled={
                      form.formState.isSubmitting ||
                      uploading ||
                      !edition.data ||
                      (!preview && (!user || state !== 'OPEN'))
                    }
                  >
                    {form.formState.isSubmitting ? 'Đang gửi…' : 'Gửi hồ sơ'}{' '}
                    <ArrowRight size={17} />
                  </Button>
                )}
              </div>
            </form>
          </>
        </Card>
      </div>
    </div>
  );
}
