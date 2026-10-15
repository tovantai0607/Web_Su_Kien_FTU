import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, ShieldCheck, Flower2, IdCard } from 'lucide-react';
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
import { registrationDrafts } from '../lib/registration-draft';
export default function Registration() {
  const edition = useContent<Edition | null>('/editions/current');
  const program = useProgram();
  const now = useServerTime(program.data?.server_time);
  const state =
    now === null ? 'UNCONFIGURED' : registrationState(program.data?.edition ?? null, now);
  const { user, loading } = useAuth();
  const [savedDraft] = useState(() => registrationDrafts.load(user?.id));
  const draftOwner = useRef(savedDraft?.ownerId ?? user?.id);
  const [step, setStep] = useState(savedDraft?.step ?? 0),
    [error, setError] = useState(''),
    [success, setSuccess] = useState<{ code: string } | null>(null),
    [files, setFiles] = useState<string[]>([]),
    [uploading, setUploading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<File | null>(null);
  const [cardPreview, setCardPreview] = useState('');
  useEffect(() => {
    if (!selectedCard) {
      setCardPreview('');
      return;
    }
    const url = URL.createObjectURL(selectedCard);
    setCardPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedCard]);
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
      ...savedDraft?.values,
      media_ids: [],
      student_card_media_id: '',
      turnstile_token: '',
    },
  });
  useEffect(() => {
    if (loading) return;
    if (draftOwner.current && draftOwner.current !== user?.id) {
      registrationDrafts.clear();
      draftOwner.current = user?.id;
      form.reset({
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
      });
      setStep(0);
      setFiles([]);
      setSelectedCard(null);
      return;
    }
    if (user?.id) draftOwner.current = user?.id;
    if (success) {
      registrationDrafts.clear();
      return;
    }
    const save = () =>
      registrationDrafts.save(form.getValues(), step, user?.id ?? draftOwner.current ?? undefined);
    save();
    const subscription = form.watch(save);
    return () => subscription.unsubscribe();
  }, [form, step, user?.id, user?.email, loading, success]);
  const uploadOwner = useRef(user?.id);
  const uploadGeneration = useRef(0);
  useEffect(() => {
    uploadGeneration.current += 1;
    if (uploadOwner.current && uploadOwner.current !== user?.id) {
      setSelectedCard(null);
      setFiles([]);
      form.setValue('student_card_media_id', '');
    }
    uploadOwner.current = user?.id;
    setUploading(false);
  }, [user?.id, form]);
  const errors = form.formState.errors;
  const onToken = useCallback((token: string) => form.setValue('turnstile_token', token), [form]);
  const upload = async (file?: File) => {
    if (!file) return;
    setError('');
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Chọn ảnh JPEG/PNG, tối đa 5 MB.');
      return;
    }
    setSelectedCard(file);
    setFiles((f) => {
      const next = [...f];
      next[3] = file.name;
      return next;
    });
    form.setValue('student_card_media_id', '');
    // Choosing locally is available before opening; no bytes leave this tab yet.
    if (!preview && (!user || state !== 'OPEN')) return;
    const generation = ++uploadGeneration.current;
    setUploading(true);
    try {
      const id = preview
        ? crypto.randomUUID()
        : (
            await api<{ id: string }>(
              '/media/upload?edition=' + edition.data?.id + '&purpose=student_card',
              {
                method: 'POST',
                body: file,
                headers: { 'Content-Type': file.type },
              },
            )
          ).id;
      if (generation === uploadGeneration.current)
        form.setValue('student_card_media_id', id, { shouldValidate: true });
    } catch (e) {
      if (generation === uploadGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === uploadGeneration.current) setUploading(false);
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
        setSelectedCard(null);
        setFiles([]);
        setSuccess(result);
        registrationDrafts.clear();
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
      <p className="registration-draft-note">
        Nội dung đang điền được giữ tạm trong tab này khi xem thể lệ hoặc đăng nhập. Ảnh cần chọn
        lại nếu tải lại trang.{' '}
        <Link className="text-link" to="/the-le">
          Xem thể lệ
        </Link>
      </p>
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
                Tài khoản cần xác minh email. Bản nháp chưa được gửi lên hệ thống và sẽ được xóa khi
                gửi thành công hoặc đăng xuất.
              </p>
              <Link
                className="text-link"
                to="/tai-khoan/dang-nhap"
                onClick={() => registrationDrafts.beginLogin()}
              >
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
                  <h2>Ảnh thẻ sinh viên</h2>
                  <p>Chỉ cần một ảnh thẻ sinh viên FTU. JPEG/PNG, tối đa 5 MB, 12 megapixel.</p>
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
                      disabled={uploading}
                      onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {cardPreview && (
                    <img
                      className="student-card-preview"
                      src={cardPreview}
                      alt="Ảnh thẻ sinh viên đã chọn trên máy"
                    />
                  )}
                  <p role="status" className="fine-print">
                    {uploading
                      ? 'Đang tải ảnh lên…'
                      : form.watch('student_card_media_id')
                        ? 'Ảnh thẻ đã sẵn sàng.'
                        : selectedCard
                          ? 'Đã chọn ảnh trên máy, chưa tải lên server.'
                          : 'Bạn có thể chọn và xem trước ảnh ngay trên máy.'}
                    {!preview &&
                      state !== 'OPEN' &&
                      ' Chỉ tải lên server trong thời gian nhận hồ sơ 07–21/03/2027.'}
                    {!preview && !user && ' Đăng nhập để gửi ảnh khi mở đơn.'}
                  </p>
                  {!preview &&
                    user &&
                    state === 'OPEN' &&
                    selectedCard &&
                    !form.watch('student_card_media_id') && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploading}
                        onClick={() => void upload(selectedCard)}
                      >
                        Tải ảnh đã chọn
                      </Button>
                    )}
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
