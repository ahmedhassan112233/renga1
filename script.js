/**
 * 2. متطلبات الكاميرا والمنطق الأساسي (Vanilla JS)
 * 
 * تم دمج جميع المميزات المطلوبة في ملف واحد نظيف:
 * - الأداء العالي وتوافق الكاميرا الخلفية.
 * - فترة الاستراحة (Refractory Period) 1000ms.
 * - دالة استخلاص وزن ذكية ومحسنة.
 * - ميزات الإدخال اليدوي والحفظ المحلي والتصدير.
 */

// جلب العناصر الأساسية من الـ DOM
const video = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const ctx = canvasElement.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const scannerContainer = document.getElementById('scanner-container');
const toastContainer = document.getElementById('toast-container');
const totalItemsSpan = document.getElementById('total-items');
const totalWeightSpan = document.getElementById('total-weight');
const scanStatus = document.getElementById('scan-status');
const loadingMessage = document.getElementById('loadingMessage');
const boxesTableBody = document.querySelector('#boxesTable tbody');

// عناصر التحكم والنتائج المحفوظة
const manualAddBtn = document.getElementById('manualAdd');
const clearAllBtn = document.getElementById('clearAll');
const saveInvoiceBtn = document.getElementById('saveInvoice');
const exportPdfBtn = document.getElementById('exportPdf');
const invoicesListEl = document.getElementById('invoicesList');
const clientNameInput = document.getElementById('clientName');
const directionSelect = document.getElementById('direction');

// المتغيرات الرئيسية للحالة
let isScanning = false;
let isRefractory = false; // لمنع المسح المزدوج
let animationFrameId = null;
let lastScannedCode = null;
let barcodeList = []; // تخزين الصناديق: {code, weight, timestamp}
let stream = null; // لتخزين تيار الكاميرا
const INVOICES_KEY = 'high_perf_barcode_invoices';

// بيانات المطور (الإنجليزية لـ PDF)
const DEVELOPER_INFO = 'WhatsApp: +201029492347';

// --------------------------------------------------
// 1. الدالة المساعدة: استخلاص الوزن (extractWeightFromBarcode) - المحسّنة
// --------------------------------------------------
/**
 * تستخرج أول رقم يمثل وزناً (عشري أو صحيح كبير) من نص الباركود.
 * @param {string} code نص الباركود
 * @returns {number | null} الوزن المستخرج أو null إذا لم يُعثر على وزن منطقي
 */
function extractWeightFromBarcode(code) {
    // 1. البحث عن رقم عشري (X.X أو X,X)
    let match = code.match(/(\d+[\.,]\d{1,3})/);
    if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        // التحقق من أن الوزن يبدو منطقياً (أقل من 1000 كجم)
        if (!isNaN(val) && val > 0 && val < 1000) { 
            return parseFloat(val.toFixed(2));
        }
    }
    
    // 2. البحث عن رقم صحيح كبير (عادة يكون الوزن مضاعف في 100 أو 1000)
    // نبحث عن رقم صحيح مكون من 3 إلى 5 خانات (مثل 7500 أو 12500)
    match = code.match(/(\d{3,5})/); 
    if (match) {
        const val = parseInt(match[1]);
        // افتراض: إذا كان الرقم > 1000، فهو وزن بالكيلو (مثلاً 12500 = 12.5) أو وزن بالجرام (750 = 0.75)
        if (val >= 1000 && val <= 100000) { // وزن يبدو معقول (1 كجم إلى 100 كجم)
            // افتراض أنه مضاعف في 1000 (مثال: 12500 -> 12.5)
            const weight = val / 1000;
            if (weight > 1) { // نضمن أنه أكبر من 1 كجم على الأقل
                return parseFloat(weight.toFixed(2));
            }
        }
    }

    // 3. البحث عن رقم صحيح صغير (إذا لم نجد ما سبق، فقد يكون وزنًا بالجرام)
    match = code.match(/(\d+)/); 
    if (match) {
        const val = parseInt(match[1]);
        if (val > 100 && val < 1000) { // بين 100 و 1000 (جرامات)
            const weight = val / 1000; // مثال: 750 -> 0.75 كجم
            return parseFloat(weight.toFixed(2));
        }
    }

    // إذا لم يتم العثور على أي وزن منطقي
    showToast("⚠️ لم يُستخرج وزن منطقي. اُستخدم الافتراضي (10.0 كجم)", 'err');
    return 10.0;
}

// --------------------------------------------------
// 2. الدالة المساعدة: رسائل التأكيد (Toasts)
// --------------------------------------------------
function showToast(text, type = 'ok') {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = (type === 'ok' ? '✅ ' : '⚠️ ') + text;
    toastContainer.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(()=> {
        div.classList.remove('show');
        setTimeout(()=> div.remove(), 300);
    }, 1000); // 1 ثانية
}

// --------------------------------------------------
// 3. المنطق: تحديث الواجهة والملخص + جدول النتائج
// --------------------------------------------------
function renderTable(){
    boxesTableBody.innerHTML = '';
    let totalWeight = 0;

    barcodeList.forEach((b, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i+1}</td>
            <td style="font-family:monospace; font-size:12px;">${b.code}</td>
            <td>${b.weight.toFixed(2)}</td>
            <td><button class="btn del-btn" data-i="${i}">حذف</button></td>
        `;
        boxesTableBody.prepend(tr); // إضافة العناصر الجديدة للأعلى
        totalWeight += b.weight;
    });

    // إضافة مستمعي الحذف
    document.querySelectorAll('.del-btn').forEach(btn=>{
        btn.onclick = (e)=>{
            const i = Number(e.currentTarget.dataset.i);
            // نحتاج لحذف العنصر من الأسفل لأننا نضيف العناصر للأعلى
            barcodeList.splice(barcodeList.length - 1 - i, 1);
            renderTable();
        };
    });

    totalItemsSpan.textContent = barcodeList.length;
    totalWeightSpan.textContent = totalWeight.toFixed(2);
}


// --------------------------------------------------
// 4. المنطق: حلقة مسح الكاميرا الرئيسية (tick)
// --------------------------------------------------
function tick() {
    if (!isScanning) return; 

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        loadingMessage.style.display = 'none';
        
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        
        const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

        if (code) {
            handleDecoded(code.data);
        } else if (!isRefractory) {
             scanStatus.textContent = "في انتظار مسح الباركود...";
             scanStatus.style.color = 'var(--text-color)';
        }
    }
    animationFrameId = requestAnimationFrame(tick);
}


function handleDecoded(text){
    if (isRefractory) return; 
    
    const code = String(text).trim();

    // التحقق من التكرار
    if(barcodeList.some(b => b.code === code)) {
        showToast('⚠️ تم مسح هذا الكود بالفعل! يتم التجاهل.', 'err');
        isRefractory = true; // فترة استراحة للتكرار
        setTimeout(() => { isRefractory = false; }, 1000); 
        return;
    }
    
    // وضع الاستراحة لتجنب المسح المزدوج (Refractory Period)
    isRefractory = true;
    setTimeout(() => { isRefractory = false; lastScannedCode = null; }, 1000); 

    let weight = extractWeightFromBarcode(code); 
    
    barcodeList.push({ 
        code, 
        weight, 
        timestamp: new Date().toLocaleTimeString('ar-EG'),
        status: directionSelect.value 
    });
    
    renderTable();
    showToast(`✅ أُضيف الصندوق: ${weight.toFixed(2)} كجم`, 'ok');
    scanStatus.textContent = `نجاح! أضيف الكود: ${code.substring(0, 15)}...`;
    scanStatus.style.color = 'var(--secondary-btn)'; 
}

// --------------------------------------------------
// 5. وظائف التحكم في الكاميرا
// --------------------------------------------------
async function startScan() {
    if (isScanning) return;
    
    const constraints = { 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
    };

    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.setAttribute('playsinline', true); 
        await video.play();
        
        isScanning = true;
        scannerContainer.classList.add('active'); 
        video.style.display = 'block';
        loadingMessage.style.display = 'none';
        
        tick();

        startButton.disabled = true;
        stopButton.disabled = false;
        showToast('✅ تم تفعيل الكاميرا', 'ok');

    } catch (err) {
        console.error("Error starting camera:", err);
        alert("فشل تشغيل الكاميرا. تأكد من الصلاحيات واستخدام بروتوكول HTTPS.");
        scanStatus.textContent = "خطأ: فشل تشغيل الكاميرا.";
        scanStatus.style.color = 'red';
    }
}

function stopScan() {
    if (!isScanning) return;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    isScanning = false;
    scannerContainer.classList.remove('active'); 
    video.style.display = 'none';
    loadingMessage.style.display = 'block';
    video.srcObject = null;
    
    startButton.disabled = false;
    stopButton.disabled = true;
    scanStatus.textContent = "تم إنهاء المسح. يمكنك حفظ الفاتورة.";
    scanStatus.style.color = 'var(--primary-btn)';
}

// --------------------------------------------------
// 6. ميزات الإدخال اليدوي والحفظ
// --------------------------------------------------
manualAddBtn.addEventListener('click', ()=>{
    const code = prompt('أدخل نص الباركود يدوياً') || '';
    if(!code.trim()) return;
    
    let weightInput = prompt('أدخل الوزن يدوياً للصندوق (مثال: 7.5)') || '';
    const val = parseFloat(weightInput.replace(',', '.'));
    let finalWeight = (!isNaN(val) && val > 0) ? Math.round(val * 100) / 100 : 10.0;
    
    if(barcodeList.some(b => b.code === code.trim())) { showToast('الكود موجود بالفعل', 'err'); return; }

    barcodeList.push({ 
        code: code.trim(), 
        weight: finalWeight, 
        timestamp: new Date().toLocaleTimeString('ar-EG'),
        status: directionSelect.value
    });
    renderTable();
    showToast('تمت إضافة الصندوق يدوياً', 'ok');
});

clearAllBtn.addEventListener('click', ()=>{
    if(!confirm('مسح كافة الصناديق الحالية؟ لا يمكن التراجع.')) return;
    barcodeList = [];
    renderTable();
    showToast('تم مسح جميع الصناديق.', 'ok');
});

saveInvoiceBtn.addEventListener('click', ()=>{
    if(barcodeList.length === 0) { alert('لا توجد صناديق للحفظ'); return; }
    const inv = {
        id: 'INV_' + Date.now(),
        date: new Date().toLocaleString('ar-EG'),
        client: clientNameInput.value || 'عميل غير محدد',
        direction: directionSelect.value,
        items: barcodeList.map(x=> ({...x})),
        total: Number(totalWeightSpan.textContent),
    };
    saveInvoiceLocal(inv);
    // مسح القائمة الحالية بعد الحفظ
    barcodeList = [];
    renderTable();
    clientNameInput.value = '';
    showToast('✅ تم حفظ الفاتورة محلياً وتم تفريغ القائمة.', 'ok');
});

function saveInvoiceLocal(inv){
    const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
    arr.unshift(inv);
    localStorage.setItem(INVOICES_KEY, JSON.stringify(arr));
    renderInvoicesList();
}

function renderInvoicesList(){
    const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
    invoicesListEl.innerHTML = '';
    if(arr.length === 0){ invoicesListEl.innerHTML = '<p class="small help">لا توجد فواتير بعد.</p>'; return; }
    
    arr.forEach(inv=>{
        const div = document.createElement('div');
        div.className = 'invoice-row';
        div.innerHTML = `
            <div>
                <strong>${inv.client}</strong>
                <div style="font-size:12px; opacity:0.8;">${inv.date} | ${inv.direction}</div>
            </div>
            <div style="display:flex;gap:6px">
                <button class="btn del-btn" style="background:#f44336; padding:5px; margin:0;" data-id="${inv.id}">حذف</button>
                <button class="btn secondary-btn" style="padding:5px; margin:0;" data-id="${inv.id}">عرض</button>
                <button class="btn primary-btn" style="padding:5px; margin:0;" data-id="${inv.id}">PDF</button>
            </div>
        `;
        invoicesListEl.appendChild(div);
    });

    invoicesListEl.querySelectorAll('.secondary-btn').forEach(b=>{
        b.onclick = (e)=> loadInvoiceToScreen(e.currentTarget.dataset.id);
    });
    invoicesListEl.querySelectorAll('.primary-btn').forEach(b=>{
        b.onclick = (e)=> exportInvoicePdfById(e.currentTarget.dataset.id);
    });
    invoicesListEl.querySelectorAll('.del-btn').forEach(b=>{
        b.onclick = (e)=> deleteInvoiceLocal(e.currentTarget.dataset.id);
    });
}

function deleteInvoiceLocal(id){
    if(!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;
    let arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
    arr = arr.filter(inv => inv.id !== id);
    localStorage.setItem(INVOICES_KEY, JSON.stringify(arr));
    renderInvoicesList();
    showToast('تم حذف الفاتورة.', 'ok');
}

function loadInvoiceToScreen(id){
    const arr = JSON.parse(localStorage.getItem(INVOICES_KEY)||'[]');
    const inv = arr.find(x=> x.id === id);
    if(!inv) return alert('لم أجد الفاتورة');
    
    stopScan(); // إيقاف الماسح قبل التحميل
    barcodeList = inv.items.map(x=> ({...x}));
    clientNameInput.value = inv.client;
    directionSelect.value = inv.direction || 'داخل';
    renderTable();
    showToast('تم تحميل الفاتورة للعرض (يمكنك تعديلها وحفظها مجدداً)', 'ok');
}


// --------------------------------------------------
// 7. متطلبات التصدير (PDF)
// --------------------------------------------------
function exportInvoicePdfById(id){
    const arr = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
    const inv = arr.find(x=> x.id === id);
    if(!inv) return alert('الفاتورة غير موجودة');
    generatePdf(inv);
}

function generatePdf(inv){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); 
    
    // الإعدادات والتنسيق (باللغة الإنجليزية لضمان الثبات)
    const margin = 12;
    const width = doc.internal.pageSize.getWidth();
    let y = 15;

    doc.setFont('Helvetica', 'normal'); 
    doc.setTextColor(30, 30, 30); 

    // العنوان
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Barcode Invoice Report', margin, y);
    y += 8;
    
    // معلومات الفاتورة
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice No.: ${inv.id}`, margin, y); 
    doc.text(`Date: ${inv.date}`, width / 2, y); 
    y += 6;
    doc.text(`Client: ${inv.client}`, margin, y); 
    doc.text(`Direction: ${inv.direction === 'داخل' ? 'IN' : 'OUT'}`, width / 2, y); 
    y += 10;
    
    // جدول البيانات (Headers)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setDrawColor(37, 120, 144); // لون أزرق
    doc.setFillColor(235, 245, 255); 
    doc.rect(margin, y, width - (margin * 2), 6, 'FD');
    doc.text('No.', margin + 2, y + 4);
    doc.text('Weight (KG)', width - 35, y + 4);
    doc.text('Barcode Code', margin + 20, y + 4);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    
    // بيانات الصفوف
    const rowHeight = 6;
    inv.items.forEach((it, idx)=>{
        if(y > 185){ 
            doc.addPage(); y = 15; 
            // إعادة رسم الهيدر
            doc.setFont('helvetica', 'bold');
            doc.rect(margin, y, width - (margin * 2), 6, 'FD');
            doc.text('No.', margin + 2, y + 4);
            doc.text('Weight (KG)', width - 35, y + 4);
            doc.text('Barcode Code', margin + 20, y + 4);
            y += 6;
            doc.setFont('helvetica', 'normal');
        }

        doc.text(String(idx + 1), margin + 2, y + 4);
        // قص الباركود الطويل
        let bc = it.code;
        if(bc.length > 80) bc = bc.slice(0,80) + '...';
        doc.text(bc, margin + 20, y + 4); 
        doc.text(it.weight.toFixed(2), width - 35, y + 4);
        
        doc.setDrawColor(200, 200, 200); 
        doc.line(margin, y, width - margin, y);
        y += rowHeight;
    });

    // الملخص والإجمالي
    y += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Boxes: ${inv.items.length}`, margin, y); 
    doc.text(`Total Weight: ${inv.total.toFixed(2)} kg`, width - 35, y); 
    y += 10;
    
    doc.setDrawColor(37, 120, 144);
    doc.line(margin, y, width - margin, y); 
    y += 8;
    
    // بيانات المطور (WhatsApp: +201029492347.)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text(`Developer: ${DEVELOPER_INFO}`, width - margin, width / 2 < 140 ? 195 : 200, { align: 'right' }); 

    doc.save(`${inv.id}_${inv.client}.pdf`);
    showToast('✅ تم إنشاء PDF', 'ok');
}

// --------------------------------------------------
// 8. تهيئة التطبيق عند التحميل
// --------------------------------------------------
startButton.addEventListener('click', startScan);
stopButton.addEventListener('click', stopScan);
exportPdfBtn.addEventListener('click', () => {
    if (barcodeList.length > 0) {
        alert("يجب إنهاء المسح وحفظ الفاتورة الحالية أولاً لتصدير الفواتير المحفوظة.");
        return;
    }
    // يمكن إضافة منطق لتصدير جميع الفواتير المحفوظة هنا إذا أردت
    // أو يمكن الاعتماد على زر PDF بجانب كل فاتورة في القائمة
    alert('استخدم زر "PDF" بجوار الفاتورة في قائمة "الفواتير المحفوظة" لتصديرها.');
});

// تحميل قائمة الفواتير المحفوظة عند بدء التشغيل
renderInvoicesList();
// عرض قائمة الصناديق الحالية (فارغة في البداية)
renderTable();