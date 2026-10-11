'use client'

import { useState, useEffect, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { getCustomers, getSafes, searchCustomers } from '@/app/actions'
import { createBulkOrder, BulkOrderItemInput } from './bulk-order-actions'
import Link from 'next/link'

interface Props {
  userId: string
}

export default function BulkOrderModal({ userId }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Customers & Safes State
  const [customers, setCustomers] = useState<any[]>([])
  const [safes, setSafes] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([])

  // Order Details
  const [paymentType, setPaymentType] = useState<'DEFERRED' | 'COLLECTION'>('DEFERRED')
  const [deposit, setDeposit] = useState<string>('')
  const [selectedSafeId, setSelectedSafeId] = useState<string>('')
  const [currency, setCurrency] = useState('EGP')
  const [isDeferredCustomer, setIsDeferredCustomer] = useState(false)
  const [notes, setNotes] = useState('')

  // Excel Parsed State
  const [parsedItems, setParsedItems] = useState<BulkOrderItemInput[]>([])
  const [fileName, setFileName] = useState('')
  const [stats, setStats] = useState<{ totalQuantity: number; estimatedPieces: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [createdOrderResult, setCreatedOrderResult] = useState<{ orderId: string; orderNo: number } | null>(null)

  useEffect(() => {
    if (isOpen) {
      getCustomers().then(data => {
        setCustomers(data)
        setFilteredCustomers(data)
      })
      getSafes().then(data => {
        setSafes(data)
        if (data.length > 0) {
          const main = data.find((s: any) => s.name === 'الخزنة الرئيسية')
          setSelectedSafeId(main ? main.id : data[0].id)
        }
      })
    }
  }, [isOpen])

  // Customer search debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (customerSearch.trim().length > 0) {
        const res = await searchCustomers(customerSearch)
        setFilteredCustomers(res)
      } else {
        setFilteredCustomers(customers)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [customerSearch, customers])

  // تنزيل نموذج إكسيل يوضح أن اللون والسعر اختياريان
  const downloadTemplate = () => {
    const templateData = [
      { 'كود الموديل': '1001', 'اللون (اختياري)': '', 'الكمية بالسريات': 5, 'السعر (اختياري)': '', 'الخصم % (اختياري)': '' },
      { 'كود الموديل': '1001', 'اللون (اختياري)': 'أسود', 'الكمية بالسريات': 3, 'السعر (اختياري)': 150, 'الخصم % (اختياري)': 10 },
      { 'كود الموديل': '2005', 'اللون (اختياري)': '', 'الكمية بالسريات': 10, 'السعر (اختياري)': 200, 'الخصم % (اختياري)': 0 }
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BulkOrder')
    XLSX.writeFile(wb, 'Bulk_Order_Template.xlsx')
  }

  // قراءة وتحليل ملف الإكسيل
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMsg('')
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rows: any[] = XLSX.utils.sheet_to_json(ws)

        if (!rows || rows.length === 0) {
          setErrorMsg('الملف فارغ أو لا يحتوي على صفوف بيانات.')
          return
        }

        const items: BulkOrderItemInput[] = []
        let totalQty = 0

        for (const row of rows) {
          // استخراج القيم مع دعم مسميات عربية أو إنجليزية
          const modelNo = String(row['كود الموديل'] || row['الموديل'] || row['modelNo'] || row['Model'] || row['كود'] || '').trim()
          const color = String(row['اللون (اختياري)'] || row['اللون'] || row['لون'] || row['color'] || row['Color'] || '').trim()
          const qty = parseInt(String(row['الكمية بالسريات'] || row['الكمية'] || row['العدد'] || row['quantity'] || row['qty'] || 0))
          const price = parseFloat(String(row['السعر (اختياري)'] || row['السعر'] || row['price'] || 0))
          const discount = parseFloat(String(row['الخصم % (اختياري)'] || row['الخصم'] || row['discount'] || 0))

          if (modelNo && qty > 0) {
            items.push({
              modelNo,
              color: color || undefined, // إن لم يحدد، نتركه undefined ليأخذ أول لون افتراضياً
              quantity: qty,
              price: price > 0 ? price : undefined,
              discountPercent: discount > 0 ? discount : undefined
            })
            totalQty += qty
          }
        }

        if (items.length === 0) {
          setErrorMsg('لم يتم التعرف على أي أصناف. تأكد من وجود عمودي: (كود الموديل، الكمية).')
          return
        }

        setParsedItems(items)
        setStats({
          totalQuantity: totalQty,
          estimatedPieces: totalQty * 4
        })
      } catch (err: any) {
        setErrorMsg('فشل قراءة الملف: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleSubmit = () => {
    if (!selectedCustomerId) {
      alert('يرجى اختيار العميل أولاً.')
      return
    }
    if (parsedItems.length === 0) {
      alert('يرجى رفع ملف إكسيل يحتوي على أصناف صالحة.')
      return
    }
    const depositAmt = paymentType === 'COLLECTION' ? parseFloat(deposit) || 0 : 0
    if (paymentType === 'COLLECTION' && depositAmt <= 0) {
      alert('يرجى إدخال مبلغ التحصيل.')
      return
    }

    startTransition(async () => {
      const res = await createBulkOrder({
        customerId: selectedCustomerId,
        items: parsedItems,
        deposit: depositAmt,
        safeId: depositAmt > 0 ? selectedSafeId : undefined,
        currency,
        isDeferredCustomer,
        notes
      }, userId)

      if (res.success && res.orderId) {
        setCreatedOrderResult({
          orderId: res.orderId,
          orderNo: res.orderNo!
        })
      } else {
        alert('❌ فشل إنشاء الفاتورة:\n' + res.error)
      }
    })
  }

  const resetAll = () => {
    setIsOpen(false)
    setParsedItems([])
    setFileName('')
    setStats(null)
    setErrorMsg('')
    setDeposit('')
    setNotes('')
    setIsDeferredCustomer(false)
    setCreatedOrderResult(null)
    setSelectedCustomerId('')
  }

  return (
    <>
      {/* زر الفاتورة المجمعة (بديل الفاتورة التجريبية) */}
      <button
        onClick={() => setIsOpen(true)}
        className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 active:scale-95"
      >
        <span>فاتورة مجمعة (Excel)</span>
        <span>📥</span>
      </button>

      {/* نافذة المودال */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 animate-in fade-in duration-200" dir="rtl">

            {/* شاشة اكتمال الفاتورة بنجاح */}
            {createdOrderResult ? (
              <div className="text-center py-6 space-y-5">
                <div className="text-6xl">🎉</div>
                <h3 className="text-2xl font-black text-gray-800">تم إنشاء الفاتورة المجمعة بنجاح!</h3>
                <p className="text-gray-500 font-bold">
                  رقم الأوردر: <span className="text-blue-600 text-xl font-mono">#{createdOrderResult.orderNo}</span>
                  <br />
                  تم تخصيم الرصيد من المخزون، وتحديث كشف حساب العميل وحركة الخزينة فوراً.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
                  <Link
                    href={`/orders/${createdOrderResult.orderId}/print`}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow"
                  >
                    🖨️ طباعة الفاتورة والباركود
                  </Link>
                  <Link
                    href="/orders/list"
                    className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-900 shadow"
                  >
                    📋 الانتقال لقائمة الأوردرات
                  </Link>
                  <button
                    onClick={resetAll}
                    className="bg-gray-100 text-gray-600 px-6 py-3 rounded-xl font-bold hover:bg-gray-200"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* رأس النافذة */}
                <div className="flex justify-between items-center border-b pb-4 mb-6">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-gray-800 flex items-center gap-2">
                      <span>📥</span>
                      <span>فاتورة بيع مجمعة من الإكسيل</span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                      اللون اختياري (سيتم اختيار أول لون متاح للصنف افتراضياً إذا تُرك فارغاً)
                    </p>
                  </div>
                  <button
                    onClick={resetAll}
                    className="text-gray-400 hover:text-red-500 text-2xl font-bold p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6">

                  {/* 1. اختيار العميل */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <label className="block text-xs font-bold text-gray-600 mb-2">1. اختيار العميل *</label>
                    <input
                      type="text"
                      placeholder="بحث سريع باسم العميل أو الكود أو الهاتف..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full p-2.5 border rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                    />
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full p-3 border rounded-xl bg-white text-sm font-bold text-gray-800 outline-none"
                    >
                      <option value="">-- اضغط لاختيار العميل --</option>
                      {filteredCustomers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''} - [{c.code}]
                        </option>
                      ))}
                    </select>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="deferredCust"
                        checked={isDeferredCustomer}
                        onChange={(e) => setIsDeferredCustomer(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                      />
                      <label htmlFor="deferredCust" className="text-xs font-bold text-orange-700 cursor-pointer select-none">
                        تمييز هذا الطلب كـ "عميل آجل" (استبعاد من شاشات الفرز العامة)
                      </label>
                    </div>
                  </div>

                  {/* 2. رفع الإكسيل */}
                  <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-bold text-indigo-900">2. ملف أصناف الفاتورة (Excel) *</label>
                      <button
                        type="button"
                        onClick={downloadTemplate}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline font-bold"
                      >
                        📄 تنزيل نموذج فارغ
                      </button>
                    </div>

                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleFileUpload}
                      className="w-full text-xs bg-white p-3 border rounded-xl cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-100 file:text-indigo-700"
                    />

                    {errorMsg && (
                      <p className="text-xs font-bold text-red-600 mt-2 bg-red-50 p-2 rounded-lg whitespace-pre-line">{errorMsg}</p>
                    )}

                    {stats && (
                      <div className="mt-3 bg-white p-3 rounded-xl border border-indigo-200 text-xs font-bold flex flex-wrap justify-between items-center text-indigo-900 gap-2">
                        <span>📁 الملف: {fileName}</span>
                        <span>📦 عدد الأصناف: {parsedItems.length}</span>
                        <span>🔢 إجمالي السريات: {stats.totalQuantity}</span>
                        <span>👕 إجمالي القطع: {stats.estimatedPieces}</span>
                      </div>
                    )}
                  </div>

                  {/* 3. خيارات الدفع والخزينة */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
                    <label className="block text-xs font-bold text-gray-600">3. طريقة السداد والخزينة</label>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setPaymentType('DEFERRED'); setDeposit(''); }}
                        className={`py-3 rounded-xl font-bold text-sm border transition-all ${paymentType === 'DEFERRED' ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                      >
                        آجل بالكامل (بدون دفع)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentType('COLLECTION')}
                        className={`py-3 rounded-xl font-bold text-sm border transition-all ${paymentType === 'COLLECTION' ? 'bg-green-600 text-white border-green-600 shadow' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                      >
                        تحصيل نقدي / عربون
                      </button>
                    </div>

                    {paymentType === 'COLLECTION' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 animate-in fade-in duration-200">
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 mb-1 block">المبلغ المدفوع *</label>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={deposit}
                            onChange={(e) => setDeposit(e.target.value)}
                            className="w-full p-2.5 border rounded-xl bg-white font-bold text-green-700 outline-none text-base"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-500 mb-1 block">الخزنة المستلمة *</label>
                          <select
                            value={selectedSafeId}
                            onChange={(e) => setSelectedSafeId(e.target.value)}
                            className="w-full p-2.5 border rounded-xl bg-white font-bold text-sm outline-none"
                          >
                            {safes.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-500 mb-1 block">العملة</label>
                          <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full p-2.5 border rounded-xl bg-white font-bold text-sm outline-none"
                          >
                            <option value="EGP">جنيه مصري (EGP)</option>
                            <option value="USD">دولار أمريكي (USD)</option>
                            <option value="SAR">ريال سعودي (SAR)</option>
                            <option value="KWD">دينار كويتي (KWD)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. ملاحظات الفاتورة */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظات الفاتورة (اختياري)</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="أي تفاصيل أو ملاحظات تخص هذه الفاتورة..."
                      className="w-full p-3 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                    />
                  </div>

                  {/* زر الحفظ والتنفيذ */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={isPending || !selectedCustomerId || parsedItems.length === 0}
                      onClick={handleSubmit}
                      className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                    >
                      {isPending ? (
                        <>
                          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>جاري مراجعة المخزون وإنشاء الفاتورة...</span>
                        </>
                      ) : (
                        <span>تأكيد وإنشاء الفاتورة المجمعة ✅</span>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}