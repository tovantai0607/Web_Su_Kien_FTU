import { describe, it, expect } from 'vitest';
import { applicationSchema, voteSchema, votingState, roundSchema, type Round } from '@ftu/shared';
import { imageSignature, stripWebPMetadata } from '../../apps/api/src/security';
import { emailTemplate } from '../../apps/api/src/outbox';
const id = '11111111-1111-4111-8111-111111111111';
describe('contracts & safety', () => {
  it('rejects invalid email, extra identity/role and duplicate-sized media', () => {
    const data = {
      edition_id: id,
      full_name: 'Thí sinh thử',
      email: 'test@example.com',
      phone: '0912345678',
      faculty: 'Kinh tế',
      cohort: 'K63',
      class_name: 'Anh 1',
      height_cm: 168,
      gender: 'female',
      bio: 'Một câu chuyện có đầy đủ ba mươi ký tự.',
      talents: '',
      media_ids: [
        id,
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ],
      student_card_media_id: '44444444-4444-4444-8444-444444444444',
      consent: true,
      turnstile_token: 'token',
    };
    expect(applicationSchema.safeParse(data).success).toBe(true);
    expect(applicationSchema.safeParse({ ...data, email: 'bad' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...data, user_id: id }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...data, role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...data, consent: false }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...data, university: 'Other university' }).success).toBe(
      false,
    );
    expect(applicationSchema.safeParse({ ...data, student_card_media_id: undefined }).success).toBe(
      false,
    );
    expect(applicationSchema.safeParse({ ...data, student_card_media_id: id }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...data, media_ids: [id, id, id] }).success).toBe(false);
  });
  it('vote contract rejects forged user identity and missing token', () => {
    expect(
      voteSchema.safeParse({
        round_id: id,
        ticket_id: id,
        contestant_id: id,
        turnstile_token: 't',
        user_id: id,
      }).success,
    ).toBe(false);
    expect(voteSchema.safeParse({ round_id: id, ticket_id: id, contestant_id: id }).success).toBe(
      false,
    );
  });
  it('window closes at exact boundary', () => {
    const r = {
      vote_open_at: '2026-10-13T10:00:00Z',
      vote_close_at: '2026-10-13T10:10:00Z',
    } as Round;
    expect(votingState(r, Date.parse('2026-10-13T10:00:00Z'))).toBe('open');
    expect(votingState(r, Date.parse('2026-10-13T10:10:00Z'))).toBe('closed');
    expect(votingState(r, Date.parse('2026-10-13T09:59:59Z'))).toBe('scheduled');
  });
  it('invalid reversed round times cannot be saved', () => {
    expect(
      roundSchema.safeParse({
        edition_id: id,
        title: 'Chung kết',
        kind: 'final',
        position: 2,
        cutoff: 15,
        published: true,
        vote_open_at: '2026-10-13T10:10:00Z',
        vote_close_at: '2026-10-13T10:00:00Z',
      }).success,
    ).toBe(false);
  });
  it('never accepts SVG/HTML as image', () => {
    expect(imageSignature(new TextEncoder().encode('<svg/>'))).toBe(null);
    expect(imageSignature(new Uint8Array([255, 216, 255]))).toBe('image/jpeg');
  });
  it('strips WebP metadata and validates chunk boundaries', () => {
    const chunks = (name: string, content: string) => {
      const b = new Uint8Array(8 + content.length + (content.length % 2));
      b.set(new TextEncoder().encode(name));
      new DataView(b.buffer).setUint32(4, content.length, true);
      b.set(new TextEncoder().encode(content), 8);
      return b;
    };
    const image = chunks('VP8 ', 'image'),
      exif = chunks('EXIF', 'private gps');
    const bytes = new Uint8Array(12 + image.length + exif.length);
    bytes.set(new TextEncoder().encode('RIFF'));
    bytes.set(new TextEncoder().encode('WEBP'), 8);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    bytes.set(image, 12);
    bytes.set(exif, 12 + image.length);
    const clean = stripWebPMetadata(bytes.buffer);
    expect(new TextDecoder().decode(clean)).not.toContain('private gps');
    expect(clean.byteLength).toBe(12 + image.length);
    expect(() => stripWebPMetadata(new ArrayBuffer(20))).toThrow();
  });
  it('email escaping and wording do not claim acceptance', () => {
    const email = emailTemplate('received', { code: '<script>', note: '' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('chưa phải thông báo trúng tuyển');
  });
});
