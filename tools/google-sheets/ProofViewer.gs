/** @OnlyCurrentDoc */
// Install ONLY in the script bound to Data. No credentials or network requests.
// The standalone synchronizer owns Auth; this viewer only reads embedded images.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Minh chứng')
    .addItem('Xem ảnh đang chọn', 'showFtuProof').addToUi();
}
function onSelectionChange(event) {
  if (!event || !event.range || event.range.getNumRows() !== 1 || event.range.getNumColumns() !== 1) return;
  try { showFtuProof_(event.range); } catch { /* Menu remains available if Google skips/restricts a simple trigger. */ }
}
function showFtuProof() {
  showFtuProof_(SpreadsheetApp.getActiveRange());
}
function ftuViewerProof_(range) {
  if (!range || range.getNumRows() !== 1 || range.getNumColumns() !== 1 || range.getRow() < 2) return null;
  const sheet = range.getSheet();
  if (sheet.getParent().getId() !== '1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU') return null;
  const column = { 'Khách mua vé': 20, 'Database hiện hành': 9, 'Vé bán kết': 13, 'Vé chung kết': 13, 'Vé DEMO': 13 }[sheet.getName()];
  if (range.getColumn() !== column) return null;
  const image = range.getValue();
  if (!image || image.valueType !== SpreadsheetApp.ValueType.IMAGE) return null;
  const match = String(image.getAltTextDescription()).match(/^FTU_PROOF:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  if (!match) return null;
  // Google gives a short-lived content URL for the already embedded image.
  // It is sent only to the authorized Sheet user's dialog, never saved/logged.
  const src = image.getContentUrl();
  if (!/^https:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com\//i.test(src)) return null;
  return { src, id: match[1].toLowerCase() };
}
function showFtuProof_(range) {
  const proof = ftuViewerProof_(range);
  if (!proof) return;
  const page = HtmlService.createHtmlOutput(ftuViewerHtml_(proof)).setWidth(960).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(page, 'Minh chứng chuyển khoản');
}
function ftuViewerHtml_(proof) {
  const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const link = 'https://ftucharm-test.bancotaima1235.workers.dev/minh-chung/' + encodeURIComponent(proof.id);
  return '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;font:15px Arial,sans-serif;background:#f4f4f4}header{position:sticky;top:0;padding:12px;background:white;border-bottom:1px solid #ddd;display:flex;gap:16px;align-items:center}a,button{padding:10px;color:#163e85}button{cursor:pointer}main{overflow:auto;padding:12px}img{display:block;width:100%;height:auto;margin:auto;cursor:zoom-in}img.full{width:auto;max-width:none;cursor:zoom-out}p{color:#444}</style></head><body>' +
    '<header><button type="button" id="zoom">Phóng to / thu nhỏ</button><a target="_blank" rel="noopener noreferrer" href="' + escape(link) + '">Mở trên website</a><button type="button" id="close">Đóng</button></header>' +
    '<main><p>Ảnh đính kèm đơn vé; không phải xác nhận đã thanh toán. Nhấp ảnh để đổi mức phóng to.</p><img id="proof" alt="Minh chứng chuyển khoản" src="' + escape(proof.src) + '"><p id="error" hidden>Chưa tải được ảnh. Đóng và mở lại, hoặc dùng liên kết website.</p></main>' +
    '<script>const image=document.getElementById("proof");const zoom=()=>image.classList.toggle("full");image.addEventListener("click",zoom);document.getElementById("zoom").addEventListener("click",zoom);document.getElementById("close").addEventListener("click",()=>google.script.host.close());image.addEventListener("error",()=>document.getElementById("error").hidden=false);</script></body></html>';
}
