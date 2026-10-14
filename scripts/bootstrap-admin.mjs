import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

// No credential is accepted in a command-line argument or printed to stdout.
const values = { ...process.env };
for (const file of ['apps/api/.dev.vars', '.env.local']) {
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !values[m[1]]) values[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
try {
  const args = process.argv.slice(2);
  const project = args[args.indexOf('--project-ref') + 1];
  if (
    !args.includes('--project-ref') ||
    !args.includes('--staging') ||
    !/^[a-z0-9]{20}$/.test(project ?? '')
  )
    throw new Error('Dùng --staging --project-ref <ref> để xác định rõ database thử nghiệm.');
  const url = values.SUPABASE_URL ?? values.VITE_SUPABASE_URL;
  if (url !== `https://${project}.supabase.co`)
    throw new Error('Project ref không khớp SUPABASE_URL.');
  if (!values.SUPABASE_SECRET_KEY)
    throw new Error('Thiếu SUPABASE_SECRET_KEY trong cấu hình riêng của backend.');
  const email = values.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Thiếu ADMIN_EMAIL trong cấu hình riêng.');
  const admin = createClient(url, values.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let user;
  for (let page = 1; page <= 1000; page++) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error('Không thể đọc tài khoản bằng quyền quản trị dịch vụ.');
    user = result.data.users.find((u) => u.email?.toLowerCase() === email);
    if (user || result.data.users.length < 1000) break;
  }
  if (!user?.email_confirmed_at || !user.identities?.some((i) => i.provider === 'google'))
    throw new Error(
      'Email admin cần đăng nhập Google thành công trước; không tạo tài khoản giả hoặc bỏ xác minh.',
    );
  const roles = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'SUPER_ADMIN');
  if (roles.error) throw new Error('Không thể đọc quyền; kiểm tra migrations.');
  if (roles.data.length) {
    console.log('Tài khoản đã có SUPER_ADMIN. Không đổi mật khẩu.');
    process.exit(0);
  }
  const folder = resolve(process.env.LOCALAPPDATA ?? process.env.USERPROFILE ?? '.', 'FTUCHARM');
  const path = join(folder, `admin-${project}.secret`);
  await mkdir(folder, { recursive: true });
  let credentials;
  try {
    credentials = JSON.parse(await readFile(path, 'utf8'));
    if (
      credentials.user_id !== user.id ||
      credentials.project !== project ||
      credentials.email !== email
    )
      throw new Error('Tệp bàn giao thuộc tài khoản khác; không ghi đè.');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    credentials = {
      project,
      user_id: user.id,
      email,
      password: randomBytes(18).toString('base64url'),
      admin_url: 'http://127.0.0.1:5173/admin/cau-hinh',
    };
    await writeFile(path, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
  }
  if (process.platform === 'win32')
    execFileSync(
      'icacls',
      [
        path,
        '/inheritance:r',
        '/grant:r',
        `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(F)`,
        'SYSTEM:(F)',
      ],
      { stdio: 'ignore' },
    );
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password: credentials.password,
  });
  if (updated.error)
    throw new Error('Không thể thiết lập mật khẩu; tệp bàn giao đã được giữ để retry.');
  const granted = await admin.rpc('bootstrap_admin_role', { p_user: user.id });
  if (granted.error)
    throw new Error(
      'Chưa cấp được quyền admin; không gửi lại mật khẩu và không tạo user khác. Kiểm tra migrations rồi retry.',
    );
  console.log('Đã cấp SUPER_ADMIN. MFA là tùy chọn trong trang tài khoản.');
  console.log(`Tệp bàn giao riêng: ${path}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Bootstrap thất bại.');
  process.exitCode = 1;
}
