// Standalone Apps Script owned by the admin; do not share the script project with Sheet editors.
// Put credentials in private Script Properties, never in cells or this source.
const FTU_SHEET_ID = '1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU';
const FTU_FOLDER_ID = '135fZ0togpOpVqe2ugXvv-DzlPxwEL-FM';
const FTU_TAB = 'Khách mua vé';
const FTU_SYNC_TAB = '_Đồng bộ';
const FTU_OPERATIONS_TAB = '_Lệnh đồng bộ';
const FTU_SOURCE_TAB = 'Database hiện hành';
const FTU_CODE_TABS = { BK: 'Vé bán kết', CK: 'Vé chung kết', DM: 'Vé DEMO' };
const FTU_CODE_HEADERS = [
  'Mã vé / nhóm',
  'Mã vé thành viên',
  'Đêm',
  'Trạng thái',
  'Mã đơn',
  'Họ tên',
  'Trường',
  'Khóa/lớp',
  'MSSV',
  'Email liên hệ',
  'Số điện thoại',
  'Facebook',
  'Minh chứng',
  'Loại vé',
  'Đợt vé',
  'Số vé',
  'Combo',
  'Số lượng combo',
  'Hoàn tất lúc',
  'Mã lịch sử',
  '_ticket_ids',
  '_request_id',
  '_round_id',
  '_sequences',
];
const FTU_HEADERS = [
  'Mã đơn',
  'Họ tên',
  'Trường',
  'Khóa/lớp',
  'MSSV',
  'Email liên hệ',
  'Số điện thoại',
  'Facebook',
  'Minh chứng',
  'Loại vé',
  'Số lượng vé',
  'Combo',
  'Số lượng combo',
  'Trạng thái đồng bộ',
  'Cập nhật cuối',
  '_id',
  '_revision',
  '_evidence_id',
  '_product_id',
];

// Creates a separate session in the existing Supabase Auth, not a second login/user database.
// Deploy the standalone callback web app for the owner only and allow its exact URL in Supabase.
function doGet(event) {
  try {
    if (event && event.parameter && event.parameter.code) {
      finishFtuAuthorization_(event.parameter.code);
      return ftuManagementPage_();
    }
    if (PropertiesService.getScriptProperties().getProperty('FTU_REFRESH_TOKEN'))
      return ftuManagementPage_();
    const url = startFtuAuthorization_();
    return HtmlService.createHtmlOutput(
      '<a target="_top" href="' +
        url.replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
        '">Đăng nhập Google để kết nối đồng bộ vé</a>',
    );
  } catch (_) {
    return HtmlService.createHtmlOutput(
      'Chưa kết nối được. Kiểm tra cấu hình callback, quyền owner và thử đăng nhập lại.',
    );
  }
}
function ftuManagementPage_() {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Đồng bộ FTU</title><body><h1>Đồng bộ vé FTU</h1><p>Bảng Khách mua vé là bản chỉnh sửa; Database hiện hành là dữ liệu đang lưu. Các cột đang sửa được giữ nguyên khi làm mới.</p><button id="sync">Đồng bộ ngay</button><p><label for="order">UUID đơn cần đối chiếu</label> <input id="order"></p><button id="review">Xem hai bản</button><pre id="result" style="white-space:pre-wrap"></pre><button id="confirm" disabled>Gửi bản chỉnh sửa đã xem trên cơ sở phiên bản database này</button><script>let review;const output=document.getElementById("result");function fail(e){output.textContent=e.message;document.getElementById("confirm").disabled=true;}document.getElementById("sync").onclick=()=>google.script.run.withSuccessHandler(()=>{output.textContent="Đã đồng bộ";}).withFailureHandler(fail).syncFtuPurchases();document.getElementById("review").onclick=()=>{document.getElementById("confirm").disabled=true;google.script.run.withSuccessHandler(r=>{review=r;output.textContent=JSON.stringify(r,null,2);document.getElementById("confirm").disabled=false;}).withFailureHandler(fail).reviewFtuConflict(document.getElementById("order").value.trim());};document.getElementById("confirm").onclick=()=>{document.getElementById("confirm").disabled=true;google.script.run.withSuccessHandler(()=>{output.textContent="Đã gửi chỉnh sửa; kiểm tra trạng thái trong bảng.";}).withFailureHandler(fail).confirmFtuRebase(review.id,review.revision,review.signature,review.nonce);};</script></body></html>',
  );
}
function databaseFtuOrder_(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('UUID đơn không hợp lệ.');
  for (let page = 0; ; page++) {
    const data = ftuApi_('/admin/sheets/purchases?page=' + page);
    const found = data.rows.find((row) => row.id === id);
    if (found) return found;
    if ((page + 1) * 100 >= data.count) throw new Error('Không tìm thấy đơn đã Hoàn tất.');
  }
}
function reviewFtuConflict(id) {
  assertPrivateFtuSheet_();
  const current = ftuRows_().filter((row) => row[15] === id),
    purchase = databaseFtuOrder_(id);
  if (!current.length) throw new Error('Không tìm thấy dòng đơn trong bảng.');
  const review = {
    id,
    revision: purchase.revision,
    signature: editableSignature_(current),
    nonce: Utilities.getUuid(),
    expires: Date.now() + 600000,
  };
  PropertiesService.getScriptProperties().setProperty('FTU_REVIEW_' + id, JSON.stringify(review));
  return {
    ...review,
    columns: FTU_HEADERS.slice(0, 12),
    sheet: current.map((row) => row.slice(0, 12)),
    database: purchase.lines.map((line) => ftuRow_(purchase, line).slice(0, 12)),
  };
}
function confirmFtuRebase(id, revision, signature, nonce) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    assertPrivateFtuSheet_();
    const props = PropertiesService.getScriptProperties(),
      key = 'FTU_REVIEW_' + id;
    const review = JSON.parse(props.getProperty(key) || 'null');
    if (
      !review ||
      review.nonce !== nonce ||
      review.expires < Date.now() ||
      review.revision !== revision ||
      review.signature !== signature
    )
      throw new Error('Cần xem lại hai bản trước khi gửi.');
    const current = ftuRows_().filter((row) => row[15] === id);
    if (editableSignature_(current) !== signature)
      throw new Error('Ô đã thay đổi sau khi xem; đối chiếu lại.');
    const purchase = databaseFtuOrder_(id);
    if (purchase.revision !== revision)
      throw new Error('Database đã đổi sau khi xem; đối chiếu lại.');
    if (editableSignature_(ftuRows_().filter((row) => row[15] === id)) !== signature)
      throw new Error('Ô đã thay đổi trong lúc đối chiếu; xem lại.');
    // Explicitly reviewed rebase; no editable cells are overwritten. A competing old
    // operation still has its old revision, so database row locks cannot let both win.
    const sheet = ftuSheet_();
    ftuRows_().forEach((row, index) => {
      if (row[15] === id) sheet.getRange(index + 2, 17).setValue(revision);
    });
    props.setProperty('FTU_PENDING_' + id, Utilities.getUuid());
    props.deleteProperty(key);
  } finally {
    lock.releaseLock();
  }
  syncFtuPurchases();
}
function ftuPublicConfig_() {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('FTU_API_BASE_URL'),
    supabase = props.getProperty('FTU_SUPABASE_URL'),
    key = props.getProperty('FTU_SUPABASE_PUBLISHABLE_KEY');
  if (
    !base ||
    !/^https:\/\/[^/]+$/.test(base) ||
    /localhost|127\.0\.0\.1/.test(base) ||
    !supabase ||
    !key
  )
    throw new Error('Thiếu cấu hình API HTTPS và Supabase. Không dùng localhost.');
  if (supabase !== 'https://ifgtyslifgegwcguysbb.supabase.co')
    throw new Error('Sai project Supabase.');
  return { props, base, supabase, key };
}
function startFtuAuthorization_() {
  assertPrivateFtuSheet_();
  const config = ftuPublicConfig_(),
    callback = config.props.getProperty('FTU_SCRIPT_CALLBACK_URL');
  if (
    !callback ||
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(callback)
  )
    throw new Error('Cần callback Apps Script của owner trong allowlist Supabase.');
  const verifier = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const challenge = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier, Utilities.Charset.UTF_8),
  ).replace(/=+$/, '');
  config.props.setProperties({
    FTU_PKCE_VERIFIER: verifier,
    FTU_PKCE_EXPIRES_AT: String(Date.now() + 600000),
  });
  return (
    config.supabase +
    '/auth/v1/authorize?provider=google&redirect_to=' +
    encodeURIComponent(callback) +
    '&code_challenge=' +
    challenge +
    '&code_challenge_method=s256'
  );
}
function finishFtuAuthorization_(code) {
  assertPrivateFtuSheet_();
  const config = ftuPublicConfig_(),
    verifier = config.props.getProperty('FTU_PKCE_VERIFIER');
  const expiry = Number(config.props.getProperty('FTU_PKCE_EXPIRES_AT') || '0');
  config.props.deleteProperty('FTU_PKCE_VERIFIER');
  config.props.deleteProperty('FTU_PKCE_EXPIRES_AT');
  if (!verifier || expiry < Date.now()) throw new Error('Phiên kết nối đã hết hạn.');
  const response = UrlFetchApp.fetch(config.supabase + '/auth/v1/token?grant_type=pkce', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: config.key },
    muteHttpExceptions: true,
    payload: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (response.getResponseCode() !== 200) throw new Error('Không đổi được mã kết nối.');
  const session = JSON.parse(response.getContentText());
  const owner = Session.getEffectiveUser().getEmail();
  if (
    !owner ||
    !session.user ||
    session.user.email.toLowerCase() !== owner.toLowerCase() ||
    !session.user.email_confirmed_at
  )
    throw new Error('Phiên phải thuộc owner đã xác minh email.');
  // The protected endpoint verifies the real JWT and role before persisting integration credentials.
  const checked = UrlFetchApp.fetch(config.base + '/api/admin/sheets/purchases?page=0', {
    headers: { Authorization: 'Bearer ' + session.access_token },
    muteHttpExceptions: true,
  });
  if (checked.getResponseCode() !== 200) throw new Error('Tài khoản chưa có quyền quản lý vé.');
  config.props.setProperties({
    FTU_ACCESS_TOKEN: session.access_token,
    FTU_REFRESH_TOKEN: session.refresh_token,
    FTU_TOKEN_EXPIRES_AT: String(Date.now() + Number(session.expires_in) * 1000),
  });
}

function restrictFtuSharing() {
  // The user explicitly authorized restricting these two resources.
  DriveApp.getFolderById(FTU_FOLDER_ID).setSharing(
    DriveApp.Access.PRIVATE,
    DriveApp.Permission.NONE,
  );
  DriveApp.getFileById(FTU_SHEET_ID).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  assertPrivateFtuSheet_();
}

function installFtuSync() {
  restrictFtuSharing();
  ftuConfig_();
  const sheet = ftuSheet_();
  const headers = sheet.getRange(1, 1, 1, FTU_HEADERS.length).getValues()[0];
  if (headers.some((value, index) => value !== FTU_HEADERS[index]))
    throw new Error(
      'Cấu trúc bảng không khớp; cần cột Số lượng combo ở M và UUID/revision ở P:S trước khi bật đồng bộ.',
    );
  sheet.getRange(1, 1, sheet.getMaxRows(), 10).setNumberFormat('@');
  sheet.getRange(1, 12, sheet.getMaxRows(), 1).setNumberFormat('@');
  // Verify connectivity and authorization before creating background jobs.
  ftuApi_('/admin/sheets/purchases?page=0');
  syncFtuPurchases();
  syncFtuTicketCodes();
  const functions = ['syncFtuPurchases', 'onFtuPurchaseEdit', 'syncFtuTicketCodes'];
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (functions.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncFtuPurchases').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('syncFtuTicketCodes').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('onFtuPurchaseEdit').forSpreadsheet(FTU_SHEET_ID).onEdit().create();
}

// These three register tabs are server-owned views, one row per combo selection.
// Individual codes/UUIDs remain in the source and member columns. Edit buyer
// details/quantities in Khách mua vé, whose existing conflict protections apply.
function ftuCodeRows_(records) {
  const groups = new Map();
  const codes = new Set();
  const tickets = new Set();
  records.forEach((record) => {
    if (
      !/^(BK|CK|DM)\d{5}$/.test(record.code) ||
      record.code.slice(0, 2) !== record.prefix ||
      codes.has(record.code)
    )
      throw new Error('Mã vé nguồn không hợp lệ hoặc bị trùng.');
    codes.add(record.code);
    if (record.ticket_id) {
      if (tickets.has(record.ticket_id)) throw new Error('Vé nguồn bị gắn nhiều mã.');
      tickets.add(record.ticket_id);
    }
    const line = record.line || {};
    const combo = record.ticket_id && [2, 3].indexOf(line.bundle_size) !== -1;
    if (combo && (!record.request_id || !record.round_id))
      throw new Error('Thiếu đơn hoặc vòng của combo.');
    // Merge selections within one order, not different buyers or ticket types.
    const key = combo
      ? JSON.stringify([
          record.request_id,
          record.round_id,
          line.product_id || line.name,
          line.tier,
          line.bundle_size,
          record.status,
        ])
      : record.code;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return Array.from(groups.values()).map((members) => {
    members.sort((a, b) => a.code.localeCompare(b.code));
    const record = members[0];
    const buyer = record.buyer || {};
    const line = record.line || {};
    if (
      members.some(
        (member) =>
          JSON.stringify(member.buyer || {}) !== JSON.stringify(buyer) ||
          member.evidence_id !== record.evidence_id ||
          member.order_code !== record.order_code,
      )
    )
      throw new Error('Thông tin trong nhóm combo không khớp; cần đối chiếu nguồn.');
    const combo = record.ticket_id && [2, 3].indexOf(line.bundle_size) !== -1;
    if (combo && record.status === 'ISSUED' && members.length % line.bundle_size !== 0)
      throw new Error('Số vé combo không đủ; không ghi nhóm thiếu.');
    const memberCodes = members.map((member) => member.code);
    const group = combo
      ? 'cb' + line.bundle_size + '_' + members.length + '_' + ftuCodeRanges_(memberCodes)
      : record.code;
    return [
      group,
      memberCodes.join('\n'),
      record.prefix === 'BK' ? 'Bán kết' : record.prefix === 'CK' ? 'Chung kết' : 'DEMO',
      record.status === 'AVAILABLE'
        ? 'Chưa cấp'
        : record.status === 'ISSUED'
          ? 'Đã cấp'
          : 'Đã ngừng dùng',
      record.order_code || '',
      buyer.name || '',
      buyer.school || '',
      buyer.cohort_class || '',
      buyer.student_id || '',
      buyer.email || '',
      buyer.phone || '',
      buyer.facebook || '',
      record.evidence_id || '',
      line.name || '',
      line.tier === 'EARLY' ? 'Vé sớm' : line.tier === 'NORMAL' ? 'Vé thường' : '',
      record.ticket_id ? members.length : 0,
      line.bundle_size ? (line.bundle_size === 1 ? 'Đơn' : 'Combo ' + line.bundle_size) : '',
      combo ? members.length / line.bundle_size : '',
      record.completed_at ? new Date(record.completed_at) : '',
      members.map((member) => member.legacy_code || '').join('\n'),
      members.map((member) => member.ticket_id || '').join('\n'),
      record.request_id || '',
      record.round_id,
      members.map((member) => member.sequence).join('\n'),
    ].map((value) =>
      typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value,
    );
  });
}

// A range is used only for consecutive codes; gaps remain explicit.
function ftuCodeRanges_(codes) {
  const ranges = [];
  let first = codes[0],
    last = first;
  codes.slice(1).forEach((code) => {
    if (
      code.slice(0, 2) === last.slice(0, 2) &&
      Number(code.slice(2)) === Number(last.slice(2)) + 1
    ) {
      last = code;
    } else {
      ranges.push(first === last ? first : first + '-' + last);
      first = last = code;
    }
  });
  ranges.push(first === last ? first : first + '-' + last);
  return ranges.join('+');
}
function syncFtuTicketCodes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    assertPrivateFtuSheet_();
    const book = SpreadsheetApp.openById(FTU_SHEET_ID);
    ['LIVE', 'DEMO'].forEach((mode) => {
      const records = [];
      for (let page = 0; ; page++) {
        const data = ftuApi_('/admin/sheets/ticket-codes?mode=' + mode + '&page=' + page);
        data.rows.forEach((row) => records.push(row));
        if ((page + 1) * 200 >= data.count) break;
      }
      const prefixes = mode === 'LIVE' ? ['BK', 'CK'] : ['DM'];
      if (records.some((record) => prefixes.indexOf(record.prefix) === -1))
        throw new Error('Tiền tố mã vé không khớp phạm vi nguồn.');
      prefixes.forEach((prefix) => {
        writeFtuTicketCodeTab_(
          book,
          prefix,
          records.filter((record) => record.prefix === prefix),
        );
      });
    });
  } finally {
    lock.releaseLock();
  }
}

function writeFtuTicketCodeTab_(book, prefix, records) {
  const sheet = book.getSheetByName(FTU_CODE_TABS[prefix]);
  if (!sheet)
    throw new Error('Thiếu tab ' + FTU_CODE_TABS[prefix] + '; không tự ghi sang tab khác.');
  const headers = sheet.getRange(1, 1, 1, FTU_CODE_HEADERS.length).getValues()[0];
  if (headers.some((value, index) => value !== FTU_CODE_HEADERS[index]))
    throw new Error('Cấu trúc tab mã vé không khớp.');
  const rows = ftuCodeRows_(records);
  const previousLength = Math.max(0, sheet.getLastRow() - 1);
  const current = previousLength ? sheet.getRange(2, 2, previousLength, 1).getValues() : [];
  const sourceCodes = new Set(records.map((record) => record.code));
  const existingCodes = new Set();
  current.forEach((row) => {
    String(row[0] || '')
      .split('\n')
      .filter(Boolean)
      .forEach((code) => {
        if (!/^(BK|CK|DM)\d{5}$/.test(code) || existingCodes.has(code) || !sourceCodes.has(code))
          throw new Error('Mã thành viên thay đổi hoặc nguồn giảm; giữ nguyên bảng để đối chiếu.');
        existingCodes.add(code);
      });
  });
  // Grouping reduces view rows without removing a single source ticket/code.
  // Write the complete view plus blank padding in one call, including old tail rows.
  const length = Math.max(rows.length, previousLength);
  if (sheet.getMaxRows() < length + 1)
    sheet.insertRowsAfter(sheet.getMaxRows(), length + 1 - sheet.getMaxRows());
  if (length) {
    const output = rows.concat(
      Array.from({ length: length - rows.length }, () => Array(24).fill('')),
    );
    sheet.getRange(2, 1, length, 24).setValues(output);
  }
}

function assertPrivateFtuSheet_() {
  if (
    DriveApp.getFolderById(FTU_FOLDER_ID).getSharingAccess() !== DriveApp.Access.PRIVATE ||
    DriveApp.getFileById(FTU_SHEET_ID).getSharingAccess() !== DriveApp.Access.PRIVATE
  )
    throw new Error('Đổi thư mục và bảng sang Hạn chế trước khi đồng bộ thông tin khách.');
}

function ftuConfig_() {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('FTU_API_BASE_URL');
  const supabase = props.getProperty('FTU_SUPABASE_URL');
  const key = props.getProperty('FTU_SUPABASE_PUBLISHABLE_KEY');
  const refresh = props.getProperty('FTU_REFRESH_TOKEN');
  if (
    !base ||
    !/^https:\/\/[^/]+$/.test(base) ||
    /localhost|127\.0\.0\.1/.test(base) ||
    !supabase ||
    !key ||
    !refresh
  )
    throw new Error(
      'Thiếu cấu hình API HTTPS và phiên admin trong Script Properties. Không dùng localhost.',
    );
  if (supabase !== 'https://ifgtyslifgegwcguysbb.supabase.co')
    throw new Error('Sai project Supabase.');
  return { props, base, supabase, key, refresh };
}

function ftuToken_() {
  const config = ftuConfig_();
  const expiry = Number(config.props.getProperty('FTU_TOKEN_EXPIRES_AT') || '0');
  const token = config.props.getProperty('FTU_ACCESS_TOKEN');
  if (token && expiry > Date.now() + 60000) return token;
  const response = UrlFetchApp.fetch(config.supabase + '/auth/v1/token?grant_type=refresh_token', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: config.key },
    payload: JSON.stringify({ refresh_token: config.refresh }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('Phiên admin hết hiệu lực; kết nối lại.');
  const session = JSON.parse(response.getContentText());
  config.props.setProperties({
    FTU_ACCESS_TOKEN: session.access_token,
    FTU_REFRESH_TOKEN: session.refresh_token,
    FTU_TOKEN_EXPIRES_AT: String(Date.now() + Number(session.expires_in) * 1000),
  });
  return session.access_token;
}

function ftuApi_(path, method, body) {
  const config = ftuConfig_();
  const response = UrlFetchApp.fetch(config.base + '/api' + path, {
    method: method || 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ftuToken_(), Origin: config.base },
    payload: body === undefined ? undefined : JSON.stringify(body),
    muteHttpExceptions: true,
  });
  let result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (_) {
    throw new Error('API không trả dữ liệu JSON.');
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300)
    throw new Error(result.error || 'Không đồng bộ được dữ liệu.');
  return result.data;
}

function ftuSheet_() {
  return SpreadsheetApp.openById(FTU_SHEET_ID).getSheetByName(FTU_TAB);
}
function ftuRows_() {
  const sheet = ftuSheet_();
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues();
}
function ftuRow_(purchase, line) {
  const buyer = purchase.buyer;
  return [
    purchase.code,
    buyer.name,
    buyer.school,
    buyer.cohort_class,
    buyer.student_id,
    buyer.email,
    buyer.phone,
    buyer.facebook,
    purchase.evidence_id,
    line.name + ' · ' + (line.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường'),
    line.ticket_quantity,
    line.bundle_size === 1 ? 'Đơn' : 'Combo ' + line.bundle_size,
    line.bundle_size === 1 ? 0 : line.ticket_quantity / line.bundle_size,
    'Đã đồng bộ',
    new Date(),
    purchase.id,
    purchase.revision,
    purchase.evidence_id,
    line.product_id,
  ];
}

function syncFtuPurchases() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    assertPrivateFtuSheet_();
    const props = PropertiesService.getScriptProperties();
    const pending = readFtuPending_();
    Object.keys(pending).forEach((id) => {
      try {
        writeFtuOrder_(id, pending[id]);
        delete pending[id];
        props.deleteProperty('FTU_PENDING_' + id);
      } catch (error) {
        markFtuRows_(id, 'Chưa lưu: ' + error.message);
      }
    });
    const all = [];
    for (let page = 0; ; page++) {
      const data = ftuApi_('/admin/sheets/purchases?page=' + page);
      data.rows.forEach((purchase) => all.push(purchase));
      if ((page + 1) * 100 >= data.count) break;
    }
    mirrorFtuDatabase_(all);
    // Compare with the last confirmed cells, not just queued edits: an edit trigger may be delayed.
    const baseline = readFtuBaseline_();
    const existing = ftuRows_();
    const dirty = {};
    existing.forEach((row) => {
      if (
        row[15] &&
        baseline[row[15]] &&
        editableSignature_(existing.filter((r) => r[15] === row[15])) !== baseline[row[15]]
      )
        dirty[row[15]] = true;
    });
    Object.keys(dirty).forEach((id) => {
      if (!pending[id]) {
        props.setProperty('FTU_PENDING_' + id, Utilities.getUuid());
        markFtuRows_(id, 'Thay đổi đang chờ lượt đồng bộ tiếp theo');
      }
    });
    const sheet = ftuSheet_();
    let appendRow = Math.max(sheet.getLastRow() + 1, 2);
    all.forEach((purchase) => {
      const current = ftuRows_().filter((row) => row[15] === purchase.id);
      if (pending[purchase.id] || dirty[purchase.id]) {
        return;
      }
      const rows = purchase.lines.map((line) => ftuRow_(purchase, line));
      if (current.length) {
        // Google cells have no compare-and-set with user edits. Background reads never
        // replace existing editable cells, even when a delayed edit trigger has not fired.
        if (editableSignature_(current) !== editableSignature_(rows)) {
          markFtuRows_(purchase.id, 'Database đã đổi — cần đối chiếu, giữ nguyên ô đang sửa');
          return;
        }
        updateFtuMetadata_(purchase.id, purchase);
      } else {
        if (sheet.getMaxRows() < appendRow + rows.length - 1)
          sheet.insertRowsAfter(
            sheet.getMaxRows(),
            appendRow + rows.length - 1 - sheet.getMaxRows(),
          );
        sheet
          .getRange(appendRow, 1, rows.length, 19)
          .setValues(rows.map((row) => row.map(safeFtuCell_)));
        appendRow += rows.length;
      }
      baseline[purchase.id] = editableSignature_(rows);
    });
    // Existing/unknown rows are never removed or reordered by the background job.
    writeFtuBaseline_(baseline);
    props.setProperty('FTU_LAST_SUCCESS', new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}
function mirrorFtuDatabase_(purchases) {
  const book = SpreadsheetApp.openById(FTU_SHEET_ID);
  let sheet = book.getSheetByName(FTU_SOURCE_TAB);
  if (!sheet) {
    sheet = book.insertSheet(FTU_SOURCE_TAB);
    protectFtuInternal_(sheet);
    sheet.setFrozenRows(1);
  }
  const rows = purchases.flatMap((purchase) =>
    purchase.lines.map((line) => ftuRow_(purchase, line)),
  );
  if (sheet.getMaxRows() < rows.length + 1)
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  const old = sheet.getLastRow();
  sheet.getRange(1, 1, 1, 19).setValues([FTU_HEADERS]);
  sheet.getRange(1, 1, sheet.getMaxRows(), 10).setNumberFormat('@');
  if (rows.length)
    sheet.getRange(2, 1, rows.length, 19).setValues(rows.map((row) => row.map(safeFtuCell_)));
  if (old > rows.length + 1)
    sheet.getRange(rows.length + 2, 1, old - rows.length - 1, 19).clearContent();
  sheet.hideColumns(16, 4);
}

function editableSignature_(rows) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(rows.map((row) => row.slice(0, 12))),
    Utilities.Charset.UTF_8,
  )
    .map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0'))
    .join('');
}
function readFtuPending_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const result = {};
  Object.keys(props)
    .filter((key) => key.indexOf('FTU_PENDING_') === 0)
    .forEach((key) => (result[key.slice(12)] = props[key]));
  return result;
}
function baselineSheet_() {
  const book = SpreadsheetApp.openById(FTU_SHEET_ID);
  let sheet = book.getSheetByName(FTU_SYNC_TAB);
  if (!sheet) {
    sheet = book.insertSheet(FTU_SYNC_TAB);
    sheet.getRange(1, 1, 1, 2).setValues([['_id', 'signature']]);
    protectFtuInternal_(sheet);
    sheet.hideSheet();
  }
  return sheet;
}
function protectFtuInternal_(sheet) {
  const protection = sheet.protect().setDescription('Trạng thái nội bộ đồng bộ FTU');
  const owner = Session.getEffectiveUser();
  protection.addEditor(owner);
  protection.removeEditors(
    protection.getEditors().filter((user) => user.getEmail() !== owner.getEmail()),
  );
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}
function operationRows_(id, operation, current) {
  const book = SpreadsheetApp.openById(FTU_SHEET_ID);
  let sheet = book.getSheetByName(FTU_OPERATIONS_TAB);
  if (!sheet) {
    sheet = book.insertSheet(FTU_OPERATIONS_TAB);
    sheet.getRange(1, 1, 1, 3).setValues([['_operation', '_id', 'snapshot']]);
    protectFtuInternal_(sheet);
    sheet.hideSheet();
  }
  const entries =
    sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  const saved = entries.find((row) => row[0] === operation);
  if (saved) {
    if (saved[1] !== id) throw new Error('Operation không khớp đơn.');
    return JSON.parse(saved[2]);
  }
  const snapshot = JSON.stringify(current);
  if (snapshot.length > 45000)
    throw new Error('Đơn vượt giới hạn ô lưu lệnh; quản lý trong web admin.');
  sheet.appendRow([operation, id, snapshot]);
  return JSON.parse(snapshot);
}
function updateFtuMetadata_(id, purchase) {
  const sheet = ftuSheet_();
  const current = ftuRows_();
  const changed =
    editableSignature_(current.filter((row) => row[15] === id)) !==
    editableSignature_(purchase.lines.map((line) => ftuRow_(purchase, line)));
  current.forEach((row, index) => {
    if (row[15] !== id) return;
    const line = purchase.lines.find(
      (line) =>
        line.product_id === row[18] &&
        line.bundle_size === { Đơn: 1, 'Combo 2': 2, 'Combo 3': 3 }[String(row[11])],
    );
    sheet
      .getRange(index + 2, 13, 1, 7)
      .setValues([
        [
          ftuComboCount_(row),
          changed ? 'Database đã lưu — ô khác cần đối chiếu' : 'Đã đồng bộ',
          new Date(),
          id,
          purchase.revision,
          purchase.evidence_id,
          line?.product_id || row[18],
        ],
      ]);
  });
}
function readFtuBaseline_() {
  const sheet = baselineSheet_(),
    result = {};
  if (sheet.getLastRow() > 1)
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 2)
      .getValues()
      .forEach((row) => (result[row[0]] = row[1]));
  return result;
}
function writeFtuBaseline_(baseline) {
  const sheet = baselineSheet_(),
    entries = Object.entries(baseline);
  if (sheet.getMaxRows() < entries.length + 1)
    sheet.insertRowsAfter(sheet.getMaxRows(), entries.length + 1 - sheet.getMaxRows());
  if (entries.length) sheet.getRange(2, 1, entries.length, 2).setValues(entries);
}
function safeFtuCell_(value) {
  return typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? "'" + value : value;
}
function ftuComboCount_(row) {
  const size = { Đơn: 1, 'Combo 2': 2, 'Combo 3': 3 }[String(row[11])];
  const tickets = Number(row[10]);
  if (!size || !Number.isSafeInteger(tickets) || tickets < 1 || tickets % size !== 0) return '';
  return size === 1 ? 0 : tickets / size;
}
function markFtuRows_(id, message) {
  const sheet = ftuSheet_();
  ftuRows_().forEach((row, index) => {
    if (row[15] === id) sheet.getRange(index + 2, 14).setValue(message);
  });
}
function writeFtuOrder_(id, operation) {
  const rows = operationRows_(
    id,
    operation,
    ftuRows_().filter((row) => row[15] === id),
  );
  if (!rows.length) throw new Error('Không tìm thấy dòng đơn; không tự xóa đơn.');
  const first = rows[0];
  if (
    rows.some(
      (row) =>
        JSON.stringify(row.slice(0, 9)) !== JSON.stringify(first.slice(0, 9)) ||
        row[16] !== first[16],
    )
  )
    throw new Error('Các dòng cùng đơn phải có thông tin người mua và revision thống nhất.');
  const buyer = {
    name: String(first[1]),
    school: String(first[2]),
    cohort_class: String(first[3]),
    student_id: String(first[4]),
    email: String(first[5]),
    phone: String(first[6]),
    facebook: String(first[7]),
  };
  const catalog = ftuApi_('/admin/purchase-offers');
  const lines = rows.map((row) => {
    const products = catalog.flatMap((offer) => offer.products);
    const matches = products.filter(
      (product) =>
        product.name + ' · ' + (product.tier === 'EARLY' ? 'Vé sớm' : 'Vé thường') === row[9],
    );
    const original = products.find((product) => product.id === row[18]);
    const product = matches.find((product) => product.offer_id === original?.offer_id);
    const size = { Đơn: 1, 'Combo 2': 2, 'Combo 3': 3 }[String(row[11])];
    const count = Number(row[10]);
    if (!product || !size || !Number.isInteger(count) || count < 1 || count % size !== 0)
      throw new Error('Loại vé hoặc số lượng không phù hợp combo.');
    return { product_id: product.id, bundle_size: size, quantity: count / size };
  });
  // Replacing a proof requires uploading a new file through the protected API, not trusting a cell URL.
  let evidence = String(first[17]);
  if (String(first[8]) !== evidence) evidence = uploadFtuProof_(id, String(first[8]), operation);
  const result = ftuApi_('/admin/sheets/purchases/' + id, 'post', {
    operation_id: operation,
    expected_revision: Number(first[16]),
    code: String(first[0]),
    buyer,
    lines,
    evidence_id: evidence,
  });
  const baseline = readFtuBaseline_();
  const updated = result.lines.map((line) => ftuRow_(result, line));
  // Keep edits made while the HTTP request was in flight. Only protected metadata is written.
  updateFtuMetadata_(id, result);
  baseline[id] = editableSignature_(updated);
  writeFtuBaseline_(baseline);
}

function uploadFtuProof_(id, input, operation) {
  const match = input.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
  const fileId = match ? match[1] : /^[A-Za-z0-9_-]{20,}$/.test(input) ? input : null;
  if (!fileId) throw new Error('Minh chứng mới phải là file ảnh Google Drive có quyền đọc.');
  const file = DriveApp.getFileById(fileId),
    parents = file.getParents();
  let approved = false;
  while (parents.hasNext()) if (parents.next().getId() === FTU_FOLDER_ID) approved = true;
  if (!approved)
    throw new Error('Đặt ảnh mới trong thư mục FTU_DATA; không đọc ảnh từ Drive riêng khác.');
  const blob = file.getBlob();
  if (
    !['image/png', 'image/jpeg'].includes(blob.getContentType()) ||
    blob.getBytes().length > 5242880
  )
    throw new Error('Minh chứng phải là PNG/JPG tối đa5MB.');
  const config = ftuConfig_();
  const response = UrlFetchApp.fetch(
    config.base + '/api/admin/sheets/purchases/' + id + '/evidence',
    {
      method: 'post',
      contentType: blob.getContentType(),
      payload: blob.getBytes(),
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + ftuToken_(),
        Origin: config.base,
        'Idempotency-Key': operation,
      },
    },
  );
  const body = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200) throw new Error(body.error || 'Không lưu được ảnh mới.');
  return body.data.id;
}
function onFtuPurchaseEdit(event) {
  if (
    !event ||
    event.range.getSheet().getName() !== FTU_TAB ||
    event.range.getRow() < 2 ||
    event.range.getColumn() > 12
  )
    return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    assertPrivateFtuSheet_();
    const sheet = ftuSheet_(),
      rows = ftuRows_(),
      props = PropertiesService.getScriptProperties();
    const pending = readFtuPending_();
    const start = event.range.getRow() - 2,
      end = start + event.range.getNumRows();
    if (event.range.getColumn() <= 12 && event.range.getColumn() + event.range.getNumColumns() > 10)
      rows
        .slice(start, end)
        .forEach((row, index) =>
          sheet.getRange(start + index + 2, 13).setValue(ftuComboCount_(row)),
        );
    const ids = new Set(
      rows
        .slice(start, end)
        .map((row) => row[15])
        .filter(Boolean),
    );
    ids.forEach((id) => {
      const edited = rows.slice(start, end).find((row) => row[15] === id);
      const commonRows = rows.slice(start, end).filter((row) => row[15] === id);
      if (
        event.range.getColumn() <= 9 &&
        commonRows.some(
          (row) => JSON.stringify(row.slice(0, 9)) !== JSON.stringify(edited.slice(0, 9)),
        )
      ) {
        markFtuRows_(id, 'Chưa lưu: các dòng cùng đơn có thông tin chung khác nhau');
        return;
      }
      // Shared buyer/code/proof fields are repeated for each line of an order.
      if (event.range.getColumn() <= 9)
        rows.forEach((row, index) => {
          // Propagate only the columns in this edit, preserving unrelated buyer fields.
          const column = event.range.getColumn(),
            count = Math.min(event.range.getNumColumns(), 10 - column);
          if (row[15] === id && (index < start || index >= end))
            sheet
              .getRange(index + 2, column, 1, count)
              .setValues([edited.slice(column - 1, column - 1 + count).map(safeFtuCell_)]);
        });
      // Keep an uncertain operation's identity so retry cannot duplicate the change.
      if (!pending[id]) pending[id] = Utilities.getUuid();
      markFtuRows_(id, 'Chờ lưu');
    });
    Object.keys(pending).forEach((id) => props.setProperty('FTU_PENDING_' + id, pending[id]));
  } finally {
    lock.releaseLock();
  }
  syncFtuPurchases();
}
