/* script.js
  - الواجهة الأمامية (Site) بالعربي.
  - ملف PDF يتم تصديره بالإنجليزية لضمان عدم تلف الخطوط والأرقام.
  - تم إلغاء قائمة الكاميرات والاعتماد على التشغيل المباشر لأي كاميرا متاحة.
*/

/* عناصر DOM */
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const exportPdfBtn = document.getElementById('exportPdf');
const readerDiv = document.getElementById('reader');
const boxesTableBody = document.querySelector('#boxesTable tbody');
const countBoxesEl = document.getElementById('countBoxes');
const totalWeightEl = document.getElementById('totalWeight');
const manualAddBtn = document.getElementById('manualAdd');
const clearAllBtn = document.getElementById('clearAll');
const saveInvoiceBtn = document.getElementById('saveInvoice');
const invoicesListEl = document.getElementById('invoicesList');
const exportAllBtn = document.getElementById('exportAll');
const clearSavedBtn = document.getElementById('clearSaved');
const clientNameInput = document.getElementById('clientName');
const directionSelect = document.getElementById('direction');
const expectedCountInput = document.getElementById('expectedCount');
const requestPermBtn = document.getElementById('requestPermBtn');
// تم إزالة: const cameraSelect = document.getElementById('cameraSelect'); 

const toastsRoot = document.getElementById('toasts');

let html5QrCode = null;
let scanning = false;
let currentPendingCode = null;
let boxes = []; // {code, weight, time, status}
const INVOICES_KEY = 'renga_invoices_v3';

/* بيانات المطور (الإنجليزية لـ PDF) */
const DEVELOPER_NAME = 'Ahmed Hassan Salem';
const DEVELOPER_INFO = 'WhatsApp: +201029492347';

/* toast helper: يظهر في الركن السفلي ويفضل ثانية واحدة (يبقى بالعربي) */
function showToast(text, type = 'ok') {
  const div = document.createElement('div');
  div.className = 'toast';
  // الحفاظ على التوست بالعربي لسرعة الفهم
  const toastText = (type === 'ok' ? '✅ ' : '⚠️ ') + text;
  div.textContent = toastText;
  toastsRoot.appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  setTimeout(()=> {
    div.classList.remove('show');
    setTimeout(()=> div.remove(), 300);
  }, 1000);
}

/* render table */
function renderTable(){
  boxesTableBody.innerHTML = '';
  boxes.forEach((b, i) => {
    const isDuplicate = boxes.slice(0, i).some(x => x.code === b.code);
    const tr = document.createElement('tr');
    tr.className = isDuplicate ? 'duplicate' : '';
    tr.innerHTML = `<td>${i+1}</td>
      <td style="text-align:right;font-family:monospace">${escapeHtml(b.code)}</td>
      <td>${b.weight !== null ? b.weight.toFixed(2) : '-'}</td>
      <td>${new Date(b.time).toLocaleTimeString()}</td>
      <td>${b.status||''}</td>
      <td><button class="btn ghost del-btn" data-i="${i}">حذف</button></td>`;
    boxesTableBody.appendChild(tr);
  });
  document.querySelectorAll('.del-btn').forEach(btn=>{
    btn.onclick = (e)=>{
      const i = Number(e.currentTarget.dataset.i);
      boxes.splice(i,1);
      renderTable();
    };
  });
  const total = boxes.reduce((s,b)=> s + (b.weight||0), 0);
  countBoxesEl.textContent = boxes.length;
  totalWeightEl.textContent = total.toFixed(2);
}

/* escape */
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ... (بقية دوال إدارة الفواتير) ... */

function saveInvoice(inv){
  const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
  arr.unshift(inv);
  localStorage.setItem(INVOICES_KEY, JSON.stringify(arr));
  renderInvoicesList();
}

function renderInvoicesList(){
  const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
  invoicesListEl.innerHTML = '';
  if(arr.length === 0){ invoicesListEl.textContent = 'لا توجد فواتير بعد.'; return; }
  arr.forEach(inv=>{
    const div = document.createElement('div');
    div.className = 'invoice-row';
    div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${escapeHtml(inv.client)}</strong><div class="small">${inv.date}</div></div>
      <div style="display:flex;gap:6px"><button class="btn ghost view" data-id="${inv.id}">عرض</button><button class="btn ghost pdf" data-id="${inv.id}">PDF</button><button class="btn ghost del" data-id="${inv.id}">حذف</button></div>
    </div>`;
    invoicesListEl.appendChild(div);
  });
  invoicesListEl.querySelectorAll('.view').forEach(b=>{
    b.onclick = ()=> {
      const id = b.dataset.id;
      loadInvoiceToScreen(id);
    };
  });
  invoicesListEl.querySelectorAll('.pdf').forEach(b=>{
    b.onclick = ()=> exportInvoicePdfById(b.dataset.id);
  });
  invoicesListEl.querySelectorAll('.del').forEach(b=>{
    b.onclick = ()=> {
      if(!confirm('حذف الفاتورة؟')) return;
      const id = b.dataset.id;
      const arr = JSON.parse(localStorage.getItem(INVOICES_KEY)||'[]');
      const n = arr.filter(x=> x.id !== id);
      localStorage.setItem(INVOICES_KEY, JSON.stringify(n));
      renderInvoicesList();
    };
  });
}

function loadInvoiceToScreen(id){
  const arr = JSON.parse(localStorage.getItem(INVOICES_KEY)||'[]');
  const inv = arr.find(x=> x.id === id);
  if(!inv) return alert('لم أجد الفاتورة');
  boxes = inv.items.map(x=> ({...x}));
  clientNameInput.value = inv.client;
  directionSelect.value = inv.direction || 'داخل';
  renderTable();
  showToast('تم تحميل الفاتورة للعرض', 'ok');
}

/* الإدخال اليدوي: يطلب الوزن يدوياً */
manualAddBtn.addEventListener('click', ()=>{
  const code = prompt('أدخل نص الباركود يدوياً') || '';
  if(!code.trim()) return;
  
  // طلب الوزن يدوياً
  let weight = prompt('أدخل الوزن يدوياً للصندوق (مثال: 7.5)') || '';
  const val = parseFloat(weight);
  const finalWeight = isNaN(val) ? null : Math.round(val * 100) / 100;

  if(boxes.some(b => b.code === code.trim())) { showToast('الكود موجود بالفعل', 'err'); return; }

  boxes.push({ code: code.trim(), weight: finalWeight, time: Date.now(), status: directionSelect.value });
  renderTable();
  showToast('تمت إضافة الصندوق يدوياً', 'ok');
});

clearAllBtn.addEventListener('click', ()=>{
  if(!confirm('مسح كافة الصناديق الحالية؟')) return;
  boxes = [];
  renderTable();
});

saveInvoiceBtn.addEventListener('click', ()=>{
  if(boxes.length === 0) { alert('لا توجد صناديق للحفظ'); return; }
  const inv = {
    id: 'INV_' + Date.now(),
    date: new Date().toLocaleString(),
    client: clientNameInput.value || 'عميل غير محدد',
    direction: directionSelect.value,
    items: boxes.map(x=> ({...x})),
    total: Number(totalWeightEl.textContent),
  };
  if(inv.direction === 'خارج'){
    const rec = prompt('ادخل اسم المستلم (اختياري)') || '';
    inv.recipient = rec;
  }
  saveInvoice(inv);
  showToast('تم حفظ الفاتورة محلياً', 'ok');
});

exportAllBtn.addEventListener('click', ()=>{
  const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
  if(arr.length === 0) return alert('لا توجد فواتير');
  const blob = new Blob([JSON.stringify(arr, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'invoices_renga.json'; a.click(); URL.revokeObjectURL(url);
});

clearSavedBtn.addEventListener('click', ()=>{
  if(!confirm('مسح كل الفواتير المخزنة؟')) return;
  localStorage.removeItem(INVOICES_KEY);
  renderInvoicesList();
});

/* ================= Camera & scanner ================== */

// تم إزالة: دالة listCameras

async function requestCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    showToast('✅ تم منح إذن الكاميرا', 'ok');
    return true;
  } catch (err) {
    console.warn('Camera permission denied or error', err);
    showToast('⚠️ لم يتم منح إذن الكاميرا. فعّل الإذن من المتصفح.', 'err');
    return false;
  }
}

requestPermBtn.addEventListener('click', requestCameraPermission);


async function startScanner() {
  if (scanning) return;
  
  const ok = await requestCameraPermission();
  if(!ok) return;
  
  // خطوة جديدة: إيقاف أي عملية سابقة وتنظيفها قبل البدء
  if (html5QrCode && html5QrCode.isScanning) {
      await stopScanner();
  }
  
  // إعادة إنشاء الكائن في كل مرة لضمان عدم وجود حالة سابقة فاسدة
  html5QrCode = new Html5Qrcode("reader", { verbose: false });
  
  try {
    scanning = true;
    showToast('جارٍ تشغيل الكاميرا...', 'ok');
    
    // محاولة التشغيل باستخدام الكاميرا الخلفية (للهاتف) أو الافتراضية
    await html5QrCode.start(
      { facingMode: 'environment' }, 
      { 
        fps: 10, 
        qrbox: { width: 900, height: 100 },
        aspectRatio: 1.5 
      },
      (decodedText, decodedResult) => {
        handleDecoded(decodedText);
        const expected = Number(expectedCountInput.value) || Infinity;
        if(boxes.length >= expected && expected !== Infinity){
          stopScanner();
        }
      },
      (err) => {
        // آراء صغيرة يمكن تجاهلها
      }
    );
    showToast('✅ تم تفعيل الكاميرا', 'ok');
    
  } catch(e){
    console.error('startScanner environment error', e);
    showToast('⚠️ فشل تشغيل الكاميرا الخلفية. نحاول الكاميرا الأمامية.', 'err');
    scanning = false; // إعادة تعيين للحالة
    
    // محاولة ثانية: باستخدام الكاميرا الأمامية (أو أي كاميرا افتراضية)
     try {
         html5QrCode = new Html5Qrcode("reader", { verbose: false });
         await html5QrCode.start(
            { facingMode: 'user' }, 
            { fps: 10, qrbox: { width: 900, height: 100 }, aspectRatio: 1.5 },
            (decodedText, decodedResult) => handleDecoded(decodedText),
            (err) => {}
         );
         scanning = true;
         showToast('✅ تم تفعيل الكاميرا الأمامية', 'ok');
    } catch(e2){
         console.error('startScanner user fallback error', e2);
         showToast('خطأ فادح: فشل بدء التشغيل. تأكد من رفع الموقع على رابط https://', 'err');
         scanning = false;
    }
  }
}

async function stopScanner() {
  if(!html5QrCode || !scanning) return;
  try { await html5QrCode.stop(); } catch(e){ /* ignore */ }
  scanning = false;
  showToast('تم إيقاف المسح', 'ok');
}

/* دالة استخراج الوزن من الباركود (الكاميرا) */
function extractWeightFromBarcode(code){
  // البحث عن أي رقم عشري (رقم.رقم أو رقم,رقم)
  const match = code.match(/(\d+[\.\,]\d+)/);
  if(match && match[1]){
    const val = parseFloat(match[1].replace(',', '.')); // تحويل الفاصلة إلى نقطة
    return Math.round(val * 100) / 100;
  }
  // إذا لم يُعثر على رقم عشري، نستخدم 10 كقيمة افتراضية للمسح التلقائي
  return 10.0; 
}

/* عند قراءة باركود (الكاميرا - يستخرج الوزن تلقائياً) */
function handleDecoded(text){
  const code = String(text).trim();
  // تجنب التكرار
  if(boxes.some(b => b.code === code)) {
    showToast('⚠️ تم مسح هذا الكود بالفعل', 'err');
    return;
  }
  
  // استخراج الوزن من نص الباركود (تلقائي)
  let weight = extractWeightFromBarcode(code); 
  
  if (weight === 10.0) {
      showToast('⚠️ لم يُستخرج وزن، اُستخدم الافتراضي (10 كجم)', 'err');
  }
  
  boxes.push({ code, weight, time: Date.now(), status: directionSelect.value });
  renderTable();
  showToast(`✅ أُضيف الصندوق (${weight.toFixed(2)} كجم)`, 'ok');
}

/* دالة مساعدة: تحويل صورة إلى dataURL */
async function imgToDataURL(url){
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = ()=> res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  } catch(e){ return null; }
}

/* export invoice PDF (current boxes) */
exportPdfBtn.addEventListener('click', async ()=>{
  if(boxes.length === 0) { alert('لا توجد صناديق لتصديرها'); return; }
  const inv = {
    id: 'INV_' + Date.now(),
    date: new Date().toLocaleString(),
    client: clientNameInput.value || 'عميل غير محدد',
    direction: directionSelect.value || 'داخل',
    items: boxes.map(x=> ({...x})),
    total: Number(totalWeightEl.textContent)
  };
  await exportInvoicePdf(inv);
});

/* export by id */
async function exportInvoicePdfById(id){
  const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
  const inv = arr.find(x=> x.id === id);
  if(!inv) return alert('الفاتورة غير موجودة');
  await exportInvoicePdf(inv);
}

/* export PDF implementation (English for stable rendering) */
async function exportInvoicePdf(inv){
  const { jsPDF } = window.jspdf;
  // استخدام LTR في PDF لضمان صحة الأرقام والخطوط
  const doc = new jsPDF({unit:'mm',format:'a4',orientation:'landscape'}); 
  const margin = 12;
  const width = doc.internal.pageSize.getWidth();
  let y = 12;

  // استخدام خط افتراضي (Helvetica) لضمان الاستقرار
  doc.setFont('Helvetica', 'normal'); 
  doc.setTextColor(30, 30, 30); 

  // معلومات المطور (LTR)
  doc.setDrawColor(3, 107, 122); 
  doc.setFillColor(207, 245, 252);
  doc.rect(width - 85, y, 73, 22, 'FD'); 
  doc.setFontSize(10);
  
  doc.text(DEVELOPER_INFO, width - 82, y + 6);
  doc.text(DEVELOPER_NAME, width - 82, y + 12);
  
  // avatar (تم الحفاظ على صورتك)
  const avatarData = await imgToDataURL('aaaa.jpg');
  if(avatarData) doc.addImage(avatarData, 'JPEG', margin, y, 20,20);
  
  // عنوان
  doc.setFontSize(18);
  doc.text('Renga Aboul Sayed', margin + 26, y + 8);
  doc.setFontSize(12);
  doc.text('Barcode Invoicing System', margin + 26, y + 14);
  y += 26;
  
  doc.setDrawColor(3, 107, 122);
  doc.line(margin, y, width - margin, y); y += 4;
  
  // معلومات الفاتورة
  doc.setFontSize(11);
  doc.text(`Invoice No.: ${inv.id}`, margin, y); 
  doc.text(`Date: ${inv.date}`, width / 2, y); 
  y += 6;
  // Client name
  doc.text(`Client: ${inv.client}`, margin, y); 
  // تحويل "داخل" / "خارج" إلى IN / OUT
  doc.text(`Direction: ${inv.direction === 'داخل' ? 'IN' : 'OUT'}`, width / 2, y); 
  y += 8;

  // table header
  doc.setFontSize(11);
  doc.setDrawColor(3, 107, 122); 
  doc.setFillColor(207, 245, 252); 
  doc.rect(margin, y, width - (margin * 2), 6, 'FD');
  doc.text('No.', margin + 2, y + 4);
  doc.text('Barcode', margin + 22, y + 4);
  doc.text('Weight (kg)', width - 25, y + 4);
  y += 6;
  
  doc.setFontSize(10);
  inv.items.forEach((it, idx)=>{
    if(y > 180){ doc.addPage(); y = 14; }
    doc.text(String(idx + 1), margin + 2, y + 4);
    let bc = it.code;
    if(bc.length > 60) bc = bc.slice(0,60) + '...';
    doc.text(bc, margin + 22, y + 4); 
    const w = (it.weight !== null) ? it.weight.toFixed(2) : '-';
    doc.text(String(w), width - 25, y + 4);
    
    doc.setDrawColor(200, 200, 200); 
    doc.line(margin, y, width - margin, y);
    y += 6;
  });

  y += 8;
  doc.setFontSize(12);
  // الإجمالي سيظهر بالإنجليزية والأرقام لن تتأثر
  doc.text(`Total Weight: ${inv.total.toFixed(2)} kg`, margin, y); y += 10;
  
  doc.setDrawColor(3, 107, 122);
  doc.line(margin, y, width - margin, y); 
  y += 4;

  doc.text('Signature:', margin, y);
  doc.line(margin + 20, y + 2, margin + 90, y + 2);

  doc.save(`${inv.id}.pdf`);
  showToast('✅ تم إنشاء PDF', 'ok');
}


/* ==================== start/stop buttons =================== */
// تمت إزالة: if (typeof Html5Qrcode !== 'undefined') { requestCameraPermission(); }
// لأننا سنقوم بالبدء مباشرة عند الضغط على زر "ابدأ الفاتورة"

startBtn.addEventListener('click', ()=> startScanner());
stopBtn.addEventListener('click', ()=> stopScanner());

/* render invoices on load */
renderInvoicesList();

/* small helper: load saved boxes if needed (not automatic) */
renderTable();