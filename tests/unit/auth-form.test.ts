// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthForm from '../../apps/web/src/components/AuthForm';

const state = vi.hoisted(() => ({
  recovery: false,
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    resend: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    mfa: { listFactors: vi.fn(), challengeAndVerify: vi.fn() },
  },
}));
vi.mock('../../apps/web/src/lib/api', () => ({ preview: false, supabase: { auth: state.auth } }));
vi.mock('../../apps/web/src/lib/auth', () => ({
  useAuth: () => ({ recovery: state.recovery, error: '' }),
}));
vi.mock('../../apps/web/src/components/Turnstile', () => ({
  Turnstile: ({ onToken }: { onToken: (v: string) => void }) =>
    React.createElement(
      'button',
      { type: 'button', onClick: () => onToken('local-test-token') },
      'Xác minh thử',
    ),
}));
function open(path = '/tai-khoan/dang-nhap') {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/tai-khoan/ho-so',
          element: React.createElement('h1', null, 'Hồ sơ riêng'),
        }),
        React.createElement(Route, { path: '*', element: React.createElement(AuthForm) }),
      ),
    ),
  );
}
function enter(email = 'test@example.test', password = 'Cụm từ dài 2026') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), {
    target: { value: password },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  state.recovery = false;
  state.auth.signOut.mockResolvedValue({ error: null });
  state.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  state.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
});
afterEach(cleanup);
describe('auth workflows with a mocked provider, no real accounts or email', () => {
  it('blocks mismatched passwords and missing captcha before signup', async () => {
    open('/tai-khoan/dang-ky');
    enter();
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByText('Mật khẩu chưa khớp.')).toBeTruthy();
    expect(state.auth.signUp).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'Cụm từ dài 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByText('Hoàn tất xác minh để tiếp tục.')).toBeTruthy();
    expect(state.auth.signUp).not.toHaveBeenCalled();
  });
  it('requires email confirmation and clears the submitted password', async () => {
    open('/tai-khoan/dang-ky');
    enter();
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'Cụm từ dài 2026' },
    });
    fireEvent.click(screen.getByText('Xác minh thử'));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByText('Kiểm tra email để xác minh tài khoản.')).toBeTruthy();
    expect((screen.getByLabelText('Mật khẩu', { exact: true }) as HTMLInputElement).value).toBe('');
    expect(state.auth.signUp.mock.calls[0][0].options.captchaToken).toBe('local-test-token');
  });
  it('rejects auto-confirmed signup if the provider is misconfigured', async () => {
    state.auth.signUp.mockResolvedValue({
      data: { session: { access_token: 'fake' } },
      error: null,
    });
    open('/tai-khoan/dang-ky');
    enter();
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'Cụm từ dài 2026' },
    });
    fireEvent.click(screen.getByText('Xác minh thử'));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(
      await screen.findByText('Đăng ký đang tạm khóa. Vui lòng liên hệ ban tổ chức.'),
    ).toBeTruthy();
    expect(state.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('does not navigate past an enrolled MFA factor until a valid code is verified', async () => {
    state.auth.signInWithPassword.mockResolvedValue({
      data: { user: { email_confirmed_at: '2026-10-13' } },
      error: null,
    });
    state.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor', status: 'verified' }] },
      error: null,
    });
    state.auth.mfa.challengeAndVerify
      .mockResolvedValueOnce({ error: { code: 'mfa_verification_failed' } })
      .mockResolvedValueOnce({ error: null });
    open();
    enter();
    fireEvent.click(screen.getByText('Xác minh thử'));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    const code = await screen.findByLabelText('Mã xác thực');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh' }));
    expect(await screen.findByText('Mã không hợp lệ hoặc đã hết hạn.')).toBeTruthy();
    expect(screen.queryByText('Hồ sơ riêng')).toBeNull();
    fireEvent.change(code, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh' }));
    expect(await screen.findByText('Hồ sơ riêng')).toBeTruthy();
  });
  it('handles reset-email network failure without claiming that mail was sent', async () => {
    state.auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 503 } });
    open('/tai-khoan/quen-mat-khau');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.test' } });
    fireEvent.click(screen.getByText('Xác minh thử'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi liên kết' }));
    expect(await screen.findByText('Không thể gửi hướng dẫn. Vui lòng thử lại.')).toBeTruthy();
    expect(screen.queryByText(/bạn sẽ nhận liên kết/)).toBeNull();
  });
  it('blocks password reset without a recovery event and revokes sessions after recovery', async () => {
    const view = open('/tai-khoan/dat-lai-mat-khau');
    expect(
      (screen.getByRole('button', { name: 'Lưu mật khẩu' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(state.auth.updateUser).not.toHaveBeenCalled();
    view.unmount();
    state.recovery = true;
    state.auth.updateUser.mockResolvedValue({ error: null });
    open('/tai-khoan/dat-lai-mat-khau');
    fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), {
      target: { value: 'Cụm từ dài 2026' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'Cụm từ dài 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
    await waitFor(() => expect(state.auth.signOut).toHaveBeenCalledWith({ scope: 'global' }));
    expect(
      await screen.findByText('Đã đổi mật khẩu và đăng xuất. Hãy đăng nhập lại.'),
    ).toBeTruthy();
  });
});
