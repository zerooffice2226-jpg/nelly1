'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Scanner } from '@yudiel/react-qr-scanner'
import {
  getProductsForStocktake,
  createStocktake,
  StocktakeProductOption,
} from '@/app/stocktake-actions'

const PIECES_PER_SERIA = 4

interface StocktakeRow {
  rowKey: string
  productId: string | null
  modelNo: string
  color: string
  description: string
  price: number
  status: string
  countedPieces: number
  systemQty: number
  isNewItem: boolean
}

export default function NewStocktakePage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [allProducts, setAllProducts] = useState<StocktakeProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  // وحدة الإدخال: قطعة أو سرية (×4)
  const [unitMode, setUnitMode] = useState<'PIECE' | 'SERIA'>('PIECE')

  // البحث والسكان
  const [searchTerm, setSearchTerm] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // اختيار ألوان الموديل الظاهر وكتابة العدد
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({})

  // سلة الجرد
  const [rows, setRows] = useState<StocktakeRow[]>([])
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [savedResult, setSavedResult] = useState<{ countNo: number } | null>(null)

  // نافذة إضافة صنف غير موجود
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [newItem, setNewItem] = useState({
    modelNo: '',
    color: '',
    description: '',
    price: '',
    status: 'OPEN',
    qty: '1',
  })

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login')
    }
  }, [authStatus, router])

  useEffect(() => {
    getProductsForStocktake().then((data) => {
      setAllProducts(data)
      setLoadingProducts(false)
    })
  }, [])

  // مطابقة البحث أو الباركود
  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (term.length < 1) return []

    // أولوية 1: مطابقة تامة للمادة/الباركود (material)
    const exactMaterial = allProducts.filter(
      (p) => p.material && p.material.toLowerCase() === term
    )
    if (exactMaterial.length > 0) return exactMaterial

    // أولوية 2: مطابقة تامة لرقم الموديل (modelNo)
    const exactModel = allProducts.filter(
      (p) => p.modelNo.toLowerCase() === term
    )
    if (exactModel.length > 0) return exactModel

    // أولوية 3: بحث جزئي في الموديل أو المادة أو اللون أو الوصف
    return allProducts
      .filter(
        (p) =>
          p.modelNo.toLowerCase().includes(term) ||
          (p.material && p.material.toLowerCase().includes(term)) ||
          p.color.toLowerCase().includes(term) ||
          (p.description && p.description.toLowerCase().includes(term))
      )
      .slice(0, 40)
  }, [searchTerm, allProducts])

  const multiplier = unitMode === 'SERIA' ? PIECES_PER_SERIA : 1

  const handleAddVariant = (prod: StocktakeProductOption) => {
    const rawQty = parseInt(qtyInputs[prod.id] || '', 10)
    if (isNaN(rawQty) || rawQty < 0) {
      alert('يرجى كتابة العدد الصحيح للصنف')
      return
    }

    const piecesToAdd = rawQty * multiplier

    setRows((prev) => {
      const existingIndex = prev.findIndex(
        (r) =>
          r.modelNo.toLowerCase() === prod.modelNo.toLowerCase() &&
          r.color.toLowerCase() === prod.color.toLowerCase()
      )

      if (existingIndex > -1) {
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          countedPieces: updated[existingIndex].countedPieces + piecesToAdd,
        }
        return updated
      }

      return [
        {
          rowKey: `${prod.id}-${Date.now()}`,
          productId: prod.id,
          modelNo: prod.modelNo,
          color: prod.color,
          description: prod.description || '',
          price: prod.price,
          status: prod.status,
          countedPieces: piecesToAdd,
          systemQty: prod.currentStock,
          isNewItem: false,
        },
        ...prev,
      ]
    })

    setQtyInputs((prev) => {
      const copy = { ...prev }
      delete copy[prod.id]
      return copy
    })
  }

  const handleAddAllShown = () => {
    const itemsWithQty = searchResults.filter((p) => {
      const val = qtyInputs[p.id]
      return val !== undefined && val !== '' && !isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0
    })

    if (itemsWithQty.length === 0) {
      alert('اكتب العدد أمام لون واحد على الأقل لإضافته')
      return
    }

    itemsWithQty.forEach((p) => handleAddVariant(p))
    setSearchTerm('')
    searchInputRef.current?.focus()
  }

  const handleScan = (code: string) => {
    if (!code) return
    const cleanCode = code.trim()
    setSearchTerm(cleanCode)
    setShowScanner(false)

    // لو الكود غير موجود تماماً نجهز المودال السريع في حال رغب بإضافته كصنف جديد
    const term = cleanCode.toLowerCase()
    const matched = allProducts.some(
      (p) =>
        p.modelNo.toLowerCase() === term ||
        (p.material && p.material.toLowerCase() === term)
    )
    if (!matched) {
      setNewItem((prev) => ({ ...prev, modelNo: cleanCode }))
    }
  }

  const handleOpenNewModal = () => {
    setNewItem({
      modelNo: searchTerm.trim(),
      color: '',
      description: '',
      price: '',
      status: 'OPEN',
      qty: '1',
    })
    setIsNewModalOpen(true)
  }

  const handleSaveNewItem = (e: React.FormEvent) => {
    e.preventDefault()
    const modelNo = newItem.modelNo.trim()
    const color = newItem.color.trim()
    const qtyNum = parseInt(newItem.qty, 10)

    if (!modelNo || !color) {
      alert('كود الموديل واللون مطلوبان')
      return
    }
    if (isNaN(qtyNum) || qtyNum < 0) {
      alert('العدد غير صحيح')
      return
    }

    const piecesCount = qtyNum * multiplier

    // تحقق إن كان الصنف مسجلاً فعلاً في القائمة
    const matchedInDb = allProducts.find(
      (p) =>
        p.modelNo.toLowerCase() === modelNo.toLowerCase() &&
        p.color.toLowerCase() === color.toLowerCase()
    )

    setRows((prev) => {
      const existingIndex = prev.findIndex(
        (r) =>
          r.modelNo.toLowerCase() === modelNo.toLowerCase() &&
          r.color.toLowerCase() === color.toLowerCase()
      )

      if (existingIndex > -1) {
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          countedPieces: updated[existingIndex].countedPieces + piecesCount,
        }
        return updated
      }

      return [
        {
          rowKey: `new-${Date.now()}-${Math.random()}`,
          productId: matchedInDb ? matchedInDb.id : null,
          modelNo: matchedInDb ? matchedInDb.modelNo : modelNo,
          color: matchedInDb ? matchedInDb.color : color,
          description: matchedInDb
            ? matchedInDb.description || ''
            : newItem.description.trim(),
          price: matchedInDb
            ? matchedInDb.price
            : parseFloat(newItem.price) || 0,
          status: matchedInDb ? matchedInDb.status : newItem.status,
          countedPieces: piecesCount,
          systemQty: matchedInDb ? matchedInDb.currentStock : 0,
          isNewItem: !matchedInDb,
        },
        ...prev,
      ]
    })

    setIsNewModalOpen(false)
    setSearchTerm('')
  }

  const updateRowPieces = (rowKey: string, nextPieces: number) => {
    if (nextPieces < 0) return
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, countedPieces: nextPieces } : r))
    )
  }

  const removeRow = (rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey))
  }

  const handleSubmitStocktake = async () => {
    if (rows.length === 0) {
      alert('أضف صنفاً واحداً على الأقل قبل حفظ فاتورة الجرد')
      return
    }

    setIsSaving(true)
    const res = await createStocktake({
      notes,
      items: rows.map((r) => ({
        productId: r.productId,
        modelNo: r.modelNo,
        color: r.color,
        description: r.description,
        price: r.price,
        status: r.status,
        countedQty: r.countedPieces,
        isNewItem: r.isNewItem,
      })),
    })
    setIsSaving(false)

    if (res.success && res.countNo) {
      setSavedResult({ countNo: res.countNo })
      setRows([])
      setNotes('')
    } else {
      alert('❌ خطأ: ' + (res.error || 'فشل حفظ فاتورة الجرد'))
    }
  }

  const totalPieces = rows.reduce((sum, r) => sum + r.countedPieces, 0)

  if (savedResult) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center p-4"
        dir="rtl"
      >
        <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 text-center space-y-5 border border-emerald-100">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-black text-gray-800">
            تم حفظ فاتورة الجرد بنجاح!
          </h1>
          <p className="text-gray-500 font-bold text-sm leading-relaxed">
            رقم فاتورة الجرد:{' '}
            <span className="text-emerald-600 text-xl font-mono">
              #{savedResult.countNo}
            </span>
            <br />
            تم إرسال الفاتورة إلى سجلات الجرد في لوحة التحكم للمراجعة والاعتماد.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => setSavedResult(null)}
              className="w-full py-3.5 rounded-2xl bg-teal-600 text-white font-black text-base hover:bg-teal-700 shadow-lg"
            >
              📋 بدء فاتورة جرد جديدة
            </button>
            <Link
              href="/"
              className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-base hover:bg-gray-200"
            >
              🏠 العودة للرئيسية
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-36 font-sans text-gray-800" dir="rtl">
      {/* الهيدر الثابت المناسب للموبايل */}
      <header className="bg-white p-3.5 shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex justify-between items-center gap-2">
          <Link
            href="/"
            className="text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-bold shrink-0"
          >
            🏠 الرئيسية
          </Link>
          <div className="text-center min-w-0">
            <h1 className="font-black text-base sm:text-lg text-teal-800 truncate">
              📋 فاتورة جرد المخزون
            </h1>
            <p className="text-[11px] font-bold text-gray-400 truncate">
              الموظف: {session?.user?.name || '...'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenNewModal}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl font-bold shrink-0 shadow"
          >
            + صنف جديد
          </button>
        </div>
      </header>

      <main className="p-3 sm:p-4 max-w-2xl mx-auto space-y-4">
        {/* تبديل وحدة الإدخال */}
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-gray-600">
            وحدة العدّ عند الإدخال:
          </span>
          <div className="grid grid-cols-2 gap-1.5 bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setUnitMode('PIECE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                unitMode === 'PIECE'
                  ? 'bg-teal-600 text-white shadow'
                  : 'text-gray-600'
              }`}
            >
              بالقطعة
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('SERIA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                unitMode === 'SERIA'
                  ? 'bg-teal-600 text-white shadow'
                  : 'text-gray-600'
              }`}
            >
              بالسرية (×4)
            </button>
          </div>
        </div>

        {/* شريط البحث اليدوي + زر السكان */}
        <div className="flex gap-2">
          <input
            ref={searchInputRef}
            type="text"
            placeholder={
              loadingProducts
                ? 'جاري تحميل الأصناف...'
                : '🔍 اكتب كود الموديل أو اللون أو امسح باركود...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={loadingProducts}
            className="flex-1 p-3.5 bg-white border-2 border-teal-200 rounded-2xl shadow-sm text-base font-bold outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="bg-slate-900 hover:bg-black text-white px-4 sm:px-5 rounded-2xl shadow-md text-xl active:scale-95 transition-transform"
            title="مسح باركود بالكاميرا"
          >
            📷
          </button>
        </div>

        {/* نافذة الكاميرا Scanner */}
        {showScanner && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden relative">
              <button
                type="button"
                onClick={() => setShowScanner(false)}
                className="absolute top-3 right-3 bg-red-600 text-white w-9 h-9 rounded-full font-bold z-10 shadow-lg"
              >
                ✕
              </button>
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0) {
                    handleScan(result[0].rawValue)
                  }
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 border-4 border-dashed border-white rounded-xl"></div>
              </div>
              <div className="p-3 text-center text-xs font-bold text-gray-600 bg-gray-50">
                وجّه الكاميرا نحو باركود أو QR الصنف
              </div>
            </div>
          </div>
        )}

        {/* نتائج البحث للأصناف الموجودة */}
        {searchTerm.trim().length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-teal-100 overflow-hidden">
            <div className="bg-teal-50 px-4 py-2.5 border-b border-teal-100 flex justify-between items-center">
              <span className="text-xs font-black text-teal-800">
                نتائج البحث ({searchResults.length})
              </span>
              {searchResults.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddAllShown}
                  className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-xl font-bold shadow-sm"
                >
                  إضافة المدخل 📥
                </button>
              )}
            </div>

            {searchResults.length > 0 ? (
              <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {searchResults.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-3.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-900 text-base">
                          {prod.modelNo}
                        </span>
                        <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
                          {prod.color}
                        </span>
                        {prod.status === 'CLOSED' && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold">
                            مغلق
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {prod.description || 'بدون وصف'} | دفتري:{' '}
                        <span className="font-bold text-gray-600">
                          {prod.currentStock} قطعة
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder={unitMode === 'SERIA' ? 'سرية' : 'قطعة'}
                        value={qtyInputs[prod.id] ?? ''}
                        onChange={(e) =>
                          setQtyInputs((prev) => ({
                            ...prev,
                            [prod.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddVariant(prod)
                          }
                        }}
                        className="w-20 p-2.5 border-2 border-gray-200 rounded-xl text-center font-black text-base outline-none focus:border-teal-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddVariant(prod)}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-2.5 rounded-xl font-black text-sm shadow active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm font-bold text-gray-500">
                  لم يتم العثور على الصنف &quot;{searchTerm}&quot; في النظام
                </p>
                <button
                  type="button"
                  onClick={handleOpenNewModal}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-sm shadow"
                >
                  ➕ إضافته كصنف غير موجود
                </button>
              </div>
            )}
          </div>
        )}

        {/* قائمة الأصناف المجردة */}
        <section className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h2 className="font-black text-gray-700 text-base">
              الأصناف المضافة للجرد ({rows.length})
            </h2>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('مسح جميع بنود فاتورة الجرد الحالية؟')) {
                    setRows([])
                  }
                }}
                className="text-xs text-red-500 font-bold"
              >
                مسح الكل
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 space-y-2">
              <div className="text-4xl">📦</div>
              <p className="font-bold text-sm">
                امسح باركود الصنف أو ابحث عنه بالأعلى ثم اكتب عدده الفعلي
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {rows.map((row) => {
                const step = unitMode === 'SERIA' ? PIECES_PER_SERIA : 1
                const seriasDisplay = (row.countedPieces / PIECES_PER_SERIA)
                  .toFixed(2)
                  .replace(/\.00$/, '')

                return (
                  <div
                    key={row.rowKey}
                    className={`bg-white p-3.5 rounded-2xl shadow-sm border flex flex-col gap-2.5 ${
                      row.isNewItem
                        ? 'border-indigo-300 bg-indigo-50/30'
                        : 'border-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-lg text-gray-900">
                            {row.modelNo}
                          </span>
                          <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg">
                            {row.color}
                          </span>
                          {row.isNewItem && (
                            <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                              صنف جديد ✨
                            </span>
                          )}
                        </div>
                        {row.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {row.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(row.rowKey)}
                        className="text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0"
                      >
                        حذف
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                      <div className="text-xs font-bold text-gray-500">
                        <div>
                          الفعلي:{' '}
                          <span className="text-teal-700 font-black">
                            {row.countedPieces} قطعة
                          </span>{' '}
                          ({seriasDisplay} سرية)
                        </div>
                        {!row.isNewItem && (
                          <div className="text-[11px] text-gray-400">
                            الدفتري السابق: {row.systemQty} قطعة
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateRowPieces(
                              row.rowKey,
                              Math.max(0, row.countedPieces - step)
                            )
                          }
                          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl font-black text-lg"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={row.countedPieces}
                          onChange={(e) =>
                            updateRowPieces(
                              row.rowKey,
                              Math.max(0, parseInt(e.target.value, 10) || 0)
                            )
                          }
                          className="w-16 h-9 border rounded-xl text-center font-black text-base outline-none focus:border-teal-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateRowPieces(row.rowKey, row.countedPieces + step)
                          }
                          className="w-9 h-9 bg-teal-100 hover:bg-teal-200 text-teal-800 rounded-xl font-black text-lg"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* ملاحظات الجرد */}
              <div className="pt-2">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات الجرد (اختياري)..."
                  className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm outline-none focus:border-teal-500"
                />
              </div>
            </div>
          )}
        </section>
      </main>

      {/* شريط الحفظ السفلي الثابت */}
      {rows.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3.5 z-30 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-gray-400 block">
                إجمالي المجرد ({rows.length} صنف)
              </span>
              <span className="text-lg font-black text-teal-700">
                {totalPieces} قطعة{' '}
                <span className="text-xs text-gray-500">
                  ({(totalPieces / PIECES_PER_SERIA).toFixed(1).replace(/\.0$/, '')} سرية)
                </span>
              </span>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSubmitStocktake}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3.5 rounded-2xl font-black text-sm sm:text-base shadow-lg active:scale-95 transition-all disabled:bg-gray-400"
            >
              {isSaving ? '⏳ جاري الحفظ...' : 'حفظ فاتورة الجرد ✅'}
            </button>
          </div>
        </div>
      )}

      {/* نافذة إضافة صنف غير موجود */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-lg text-indigo-900">
                ➕ إضافة صنف غير موجود للجرد
              </h3>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="text-gray-400 hover:text-red-500 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewItem} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    كود الموديل *
                  </label>
                  <input
                    type="text"
                    required
                    value={newItem.modelNo}
                    onChange={(e) =>
                      setNewItem({ ...newItem, modelNo: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-xl font-bold"
                    placeholder="مثال: 5020"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    اللون *
                  </label>
                  <input
                    type="text"
                    required
                    value={newItem.color}
                    onChange={(e) =>
                      setNewItem({ ...newItem, color: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-xl font-bold"
                    placeholder="مثال: أسود"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  الوصف (اختياري)
                </label>
                <input
                  type="text"
                  value={newItem.description}
                  onChange={(e) =>
                    setNewItem({ ...newItem, description: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-xl"
                  placeholder="وصف الموديل..."
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    الكمية ({unitMode === 'SERIA' ? 'سرية' : 'قطعة'}) *
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    required
                    value={newItem.qty}
                    onChange={(e) =>
                      setNewItem({ ...newItem, qty: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-xl text-center font-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    السعر (قطعة)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={newItem.price}
                    onChange={(e) =>
                      setNewItem({ ...newItem, price: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-xl text-center font-bold"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    الحالة
                  </label>
                  <select
                    value={newItem.status}
                    onChange={(e) =>
                      setNewItem({ ...newItem, status: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-xl bg-white font-bold text-xs"
                  >
                    <option value="OPEN">مفتوح</option>
                    <option value="CLOSED">مغلق</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg"
                >
                  إضافة للجرد ✅
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}