'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import {
  getProductsForStocktake,
  createStocktake,
  StocktakeProductOption,
  LastAppliedCountInfo,
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
  lastAppliedCount: LastAppliedCountInfo | null
}

interface PendingDuplicatePrompt {
  candidate: Omit<StocktakeRow, 'rowKey'>
  existingRowKey: string
  existingPieces: number
}

interface StocktakeDraft {
  rows: StocktakeRow[]
  notes: string
  unitMode: 'PIECE' | 'SERIA'
  updatedAt: string
}

export default function NewStocktakePage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  const userId = session?.user?.image || 'anon'
  const draftStorageKey = `stocktake_draft_v1_${userId}`

  const [allProducts, setAllProducts] = useState<StocktakeProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [unitMode, setUnitMode] = useState<'PIECE' | 'SERIA'>('PIECE')
  const [searchTerm, setSearchTerm] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({})

  const [rows, setRows] = useState<StocktakeRow[]>([])
  const [notes, setNotes] = useState('')
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null)
  const [isDraftHydrated, setIsDraftHydrated] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [savedResult, setSavedResult] = useState<{
    countNo: number
    duplicateApprovedModels: string[]
  } | null>(null)

  // طابور قرارات التكرار داخل نفس الفاتورة
  const [duplicateQueue, setDuplicateQueue] = useState<PendingDuplicatePrompt[]>([])

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

  // تحميل الأصناف
  useEffect(() => {
    getProductsForStocktake().then((data) => {
      setAllProducts(data)
      setLoadingProducts(false)
    })
  }, [])

  // استعادة المسودة التلقائية من جهاز المستخدم عند فتح الصفحة أو الرجوع للموبايل
  useEffect(() => {
    if (authStatus === 'loading' || isDraftHydrated) return
    try {
      const raw = localStorage.getItem(draftStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as StocktakeDraft
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          setRows(parsed.rows)
          setNotes(parsed.notes || '')
          setUnitMode(parsed.unitMode === 'SERIA' ? 'SERIA' : 'PIECE')
          setDraftRestoredAt(parsed.updatedAt || null)
        }
      }
    } catch {
      // تجاهل خطأ القراءة
    } finally {
      setIsDraftHydrated(true)
    }
  }, [authStatus, draftStorageKey, isDraftHydrated])

  // الحفظ التلقائي المستمر للمسودة في localStorage مع كل تغيير
  useEffect(() => {
    if (!isDraftHydrated || savedResult) return
    try {
      if (rows.length === 0 && !notes.trim()) {
        localStorage.removeItem(draftStorageKey)
      } else {
        const payload: StocktakeDraft = {
          rows,
          notes,
          unitMode,
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      }
    } catch {
      // تجاهل امتلاء التخزين
    }
  }, [rows, notes, unitMode, draftStorageKey, isDraftHydrated, savedResult])

  // حماية من الخروج بالخطأ (زر الرجوع Back في الموبايل أو إغلاق المتصفح)
  useEffect(() => {
    const hasUnsaved = rows.length > 0 && !isSaving && !savedResult

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'لديك فاتورة جرد لم تُحفظ بعد.'
    }

    const handlePopState = () => {
      if (
        window.confirm(
          '⚠️ لديك أصناف في فاتورة الجرد لم تُحفظ بعد (تم حفظها كمسودة على جهازك).\nهل تريد البقاء في صفحة الجرد أم الخروج؟\nاضغط OK للخروج، أو Cancel للبقاء.'
        )
      ) {
        window.removeEventListener('popstate', handlePopState)
        router.back()
      } else {
        history.pushState(null, '', pathname)
      }
    }

    if (hasUnsaved) {
      history.pushState(null, '', pathname)
      window.addEventListener('popstate', handlePopState)
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [rows.length, isSaving, savedResult, pathname, router])

  // مطابقة البحث أو الباركود
  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (term.length < 1) return []

    const exactMaterial = allProducts.filter(
      (p) => p.material && p.material.toLowerCase() === term
    )
    if (exactMaterial.length > 0) return exactMaterial

    const exactModel = allProducts.filter((p) => p.modelNo.toLowerCase() === term)
    if (exactModel.length > 0) return exactModel

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

  const findExistingRow = (modelNo: string, color: string) => {
    return rows.find(
      (r) =>
        r.modelNo.toLowerCase() === modelNo.toLowerCase() &&
        r.color.toLowerCase() === color.toLowerCase()
    )
  }

  const enqueueOrInsertCandidates = (
    candidates: Array<Omit<StocktakeRow, 'rowKey'>>
  ) => {
    const nonDuplicates: StocktakeRow[] = []
    const duplicates: PendingDuplicatePrompt[] = []

    for (const candidate of candidates) {
      const existing = findExistingRow(candidate.modelNo, candidate.color)
      if (existing) {
        duplicates.push({
          candidate,
          existingRowKey: existing.rowKey,
          existingPieces: existing.countedPieces,
        })
      } else {
        nonDuplicates.push({
          ...candidate,
          rowKey: `${candidate.productId || 'new'}-${Date.now()}-${Math.random()}`,
        })
      }
    }

    if (nonDuplicates.length > 0) {
      setRows((prev) => [...nonDuplicates, ...prev])
    }

    if (duplicates.length > 0) {
      setDuplicateQueue((prev) => [...prev, ...duplicates])
    }
  }

  const handleAddVariant = (prod: StocktakeProductOption) => {
    const rawQty = parseInt(qtyInputs[prod.id] || '', 10)
    if (isNaN(rawQty) || rawQty < 0) {
      alert('يرجى كتابة العدد الصحيح للصنف')
      return
    }

    const piecesToAdd = rawQty * multiplier

    enqueueOrInsertCandidates([
      {
        productId: prod.id,
        modelNo: prod.modelNo,
        color: prod.color,
        description: prod.description || '',
        price: prod.price,
        status: prod.status,
        countedPieces: piecesToAdd,
        systemQty: prod.currentStock,
        isNewItem: false,
        lastAppliedCount: prod.lastAppliedCount,
      },
    ])

    setQtyInputs((prev) => {
      const copy = { ...prev }
      delete copy[prod.id]
      return copy
    })
  }

  const handleAddAllShown = () => {
    const itemsWithQty = searchResults.filter((p) => {
      const val = qtyInputs[p.id]
      return (
        val !== undefined &&
        val !== '' &&
        !isNaN(parseInt(val, 10)) &&
        parseInt(val, 10) >= 0
      )
    })

    if (itemsWithQty.length === 0) {
      alert('اكتب العدد أمام لون واحد على الأقل لإضافته')
      return
    }

    const candidates: Array<Omit<StocktakeRow, 'rowKey'>> = itemsWithQty.map((prod) => ({
      productId: prod.id,
      modelNo: prod.modelNo,
      color: prod.color,
      description: prod.description || '',
      price: prod.price,
      status: prod.status,
      countedPieces: parseInt(qtyInputs[prod.id], 10) * multiplier,
      systemQty: prod.currentStock,
      isNewItem: false,
      lastAppliedCount: prod.lastAppliedCount,
    }))

    enqueueOrInsertCandidates(candidates)

    setQtyInputs((prev) => {
      const copy = { ...prev }
      itemsWithQty.forEach((p) => delete copy[p.id])
      return copy
    })
    setSearchTerm('')
    searchInputRef.current?.focus()
  }

  const resolveCurrentDuplicate = (action: 'ADD' | 'REPLACE' | 'IGNORE') => {
    const current = duplicateQueue[0]
    if (!current) return

    if (action === 'ADD') {
      setRows((prev) =>
        prev.map((r) =>
          r.rowKey === current.existingRowKey
            ? { ...r, countedPieces: r.countedPieces + current.candidate.countedPieces }
            : r
        )
      )
    } else if (action === 'REPLACE') {
      setRows((prev) =>
        prev.map((r) =>
          r.rowKey === current.existingRowKey
            ? { ...r, countedPieces: current.candidate.countedPieces }
            : r
        )
      )
    }

    setDuplicateQueue((prev) => prev.slice(1))
  }

  const handleScan = (code: string) => {
    if (!code) return
    const cleanCode = code.trim()
    setSearchTerm(cleanCode)
    setShowScanner(false)

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

    const matchedInDb = allProducts.find(
      (p) =>
        p.modelNo.toLowerCase() === modelNo.toLowerCase() &&
        p.color.toLowerCase() === color.toLowerCase()
    )

    enqueueOrInsertCandidates([
      {
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
        lastAppliedCount: matchedInDb ? matchedInDb.lastAppliedCount : null,
      },
    ])

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

  const clearDraftCompletely = () => {
    if (!confirm('هل تريد مسح المسودة الحالية والبدء بفاتورة فارغة؟')) return
    setRows([])
    setNotes('')
    setDraftRestoredAt(null)
    try {
      localStorage.removeItem(draftStorageKey)
    } catch {
      // تجاهل
    }
  }

  const handleGoHome = () => {
    if (rows.length > 0 && !savedResult) {
      if (
        !window.confirm(
          'الفاتورة غير محفوظة بعد في السجل (تم حفظها كمسودة على جهازك). هل تريد الخروج للرئيسية؟'
        )
      ) {
        return
      }
    }
    router.push('/')
  }

  const handleSubmitStocktake = async () => {
    if (rows.length === 0) {
      alert('أضف صنفاً واحداً على الأقل قبل حفظ فاتورة الجرد')
      return
    }

    const prevAppliedRows = rows.filter((r) => r.lastAppliedCount !== null)
    if (prevAppliedRows.length > 0) {
      const previewNames = prevAppliedRows
        .slice(0, 5)
        .map(
          (r) =>
            `• ${r.modelNo} (${r.color}) — فاتورة معتمدة #${r.lastAppliedCount?.countNo}`
        )
        .join('\n')

      const proceed = window.confirm(
        `⚠️ تنبيه: يوجد ${prevAppliedRows.length} صنف تم جرده واعتماده في فاتورة سابقة:\n${previewNames}${
          prevAppliedRows.length > 5 ? '\n...وغيرها' : ''
        }\n\nسيتم إرسال الفاتورة للوحة التحكم مع تمييز هذه الأصناف للاختيار بين الزيادة أو اعتماد الحالي.\nهل تريد المتابعة وحفظ الفاتورة؟`
      )
      if (!proceed) return
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
      try {
        localStorage.removeItem(draftStorageKey)
      } catch {
        // تجاهل
      }
      setSavedResult({
        countNo: res.countNo,
        duplicateApprovedModels: res.duplicateApprovedModels || [],
      })
      setRows([])
      setNotes('')
      setDraftRestoredAt(null)
    } else {
      alert('❌ خطأ: ' + (res.error || 'فشل حفظ فاتورة الجرد'))
    }
  }

  const totalPieces = rows.reduce((sum, r) => sum + r.countedPieces, 0)
  const previousCountDuplicates = rows.filter((r) => r.lastAppliedCount !== null).length
  const activeDuplicate = duplicateQueue[0] || null

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

          {savedResult.duplicateApprovedModels.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-right text-xs font-bold text-amber-900 space-y-1">
              <div className="font-black">
                ⚠️ ملاحظة: الفاتورة تحتوي على أصناف مجردة في فواتير معتمدة سابقة:
              </div>
              <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px]">
                {savedResult.duplicateApprovedModels.map((label, idx) => (
                  <div key={idx}>• {label}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => setSavedResult(null)}
              className="w-full py-3.5 rounded-2xl bg-teal-600 text-white font-black text-base hover:bg-teal-700 shadow-lg"
            >
              📋 بدء فاتورة جرد جديدة
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-base hover:bg-gray-200"
            >
              🏠 العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-40 font-sans text-gray-800" dir="rtl">
      {/* الهيدر الثابت */}
      <header className="bg-white p-3.5 shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={handleGoHome}
            className="text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-bold shrink-0"
          >
            🏠 الرئيسية
          </button>
          <div className="text-center min-w-0">
            <h1 className="font-black text-base sm:text-lg text-teal-800 truncate">
              📋 فاتورة جرد المخزون
            </h1>
            <p className="text-[11px] font-bold text-gray-400 truncate">
              الموظف: {session?.user?.name || '...'}
              {rows.length > 0 && ' • 💾 محفوظة تلقائياً'}
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
        {/* إشعار استعادة المسودة */}
        {draftRestoredAt && rows.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center justify-between gap-2 text-xs font-bold text-blue-800">
            <span>
              💾 تم استعادة جرد غير محفوظ من جهازك (
              {new Date(draftRestoredAt).toLocaleTimeString('ar-EG')})
            </span>
            <button
              type="button"
              onClick={clearDraftCompletely}
              className="text-red-600 bg-white px-2.5 py-1 rounded-lg border border-red-200 shrink-0"
            >
              مسح والبدء من جديد
            </button>
          </div>
        )}

        {/* تنبيه وجود أصناف مجردة في فواتير معتمدة سابقة */}
        {previousCountDuplicates > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 text-xs font-bold text-amber-900">
            ⚠️ يوجد في قائمتك <b>{previousCountDuplicates}</b> صنف تم جرده واعتماده في فاتورة جرد سابقة (مميز باللون البرتقالي بالأسفل).
          </div>
        )}

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
                {searchResults.map((prod) => {
                  const alreadyInCart = findExistingRow(prod.modelNo, prod.color)
                  return (
                    <div
                      key={prod.id}
                      className={`p-3.5 flex items-center justify-between gap-2 ${
                        alreadyInCart
                          ? 'bg-teal-50/40'
                          : prod.lastAppliedCount
                          ? 'bg-amber-50/50'
                          : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-gray-900 text-base">
                            {prod.modelNo}
                          </span>
                          <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
                            {prod.color}
                          </span>
                          {alreadyInCart && (
                            <span className="text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full font-bold">
                              في الجرد: {alreadyInCart.countedPieces} قطعة
                            </span>
                          )}
                          {prod.lastAppliedCount && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                              جُرد سابقاً #{prod.lastAppliedCount.countNo}
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
                  )
                })}
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
                onClick={clearDraftCompletely}
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
                const hasPrevApplied = Boolean(row.lastAppliedCount)

                return (
                  <div
                    key={row.rowKey}
                    className={`p-3.5 rounded-2xl shadow-sm border flex flex-col gap-2.5 ${
                      hasPrevApplied
                        ? 'bg-amber-50 border-amber-400 border-r-4'
                        : row.isNewItem
                        ? 'border-indigo-300 bg-indigo-50/40'
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-lg text-gray-900">
                            {row.modelNo}
                          </span>
                          <span className="text-xs font-bold bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded-lg">
                            {row.color}
                          </span>
                          {row.isNewItem && (
                            <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                              صنف جديد ✨
                            </span>
                          )}
                          {row.lastAppliedCount && (
                            <span className="text-[10px] font-black bg-amber-600 text-white px-2 py-0.5 rounded-full">
                              🔁 جُرد سابقاً (#{row.lastAppliedCount.countNo})
                            </span>
                          )}
                        </div>
                        {row.lastAppliedCount && (
                          <p className="text-[11px] font-bold text-amber-800 mt-1">
                            معتمد مسبقاً بكمية {row.lastAppliedCount.countedQty} قطعة بواسطة{' '}
                            {row.lastAppliedCount.userName}
                          </p>
                        )}
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

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/70">
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
                            الدفتري الحالي: {row.systemQty} قطعة
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
                          className="w-16 h-9 bg-white border rounded-xl text-center font-black text-base outline-none focus:border-teal-500"
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

      {/* نافذة قرار تكرار الصنف داخل نفس فاتورة الجرد */}
      {activeDuplicate && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="text-4xl">🔁</div>
              <h3 className="text-lg font-black text-gray-900">
                صنف مكرر في نفس الفاتورة!
              </h3>
              <p className="text-sm font-bold text-teal-700">
                موديل {activeDuplicate.candidate.modelNo} — لون{' '}
                {activeDuplicate.candidate.color}
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">العدد المسجل حالياً:</span>
                <span className="font-black text-gray-900">
                  {activeDuplicate.existingPieces} قطعة
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">العدد الجديد المدخل:</span>
                <span className="font-black text-blue-600">
                  {activeDuplicate.candidate.countedPieces} قطعة
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-dashed border-gray-300">
                <span className="text-gray-600 font-bold">الإجمالي عند الجمع:</span>
                <span className="font-black text-emerald-700">
                  {activeDuplicate.existingPieces +
                    activeDuplicate.candidate.countedPieces}{' '}
                  قطعة
                </span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => resolveCurrentDuplicate('ADD')}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg"
              >
                ➕ زيادة على العدد ({activeDuplicate.existingPieces + activeDuplicate.candidate.countedPieces} قطعة)
              </button>
              <button
                type="button"
                onClick={() => resolveCurrentDuplicate('REPLACE')}
                className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm"
              >
                🔄 اعتماد العدد الجديد فقط ({activeDuplicate.candidate.countedPieces} قطعة)
              </button>
              <button
                type="button"
                onClick={() => resolveCurrentDuplicate('IGNORE')}
                className="w-full py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm"
              >
                ❌ تجاهل (تم الإدخال بالخطأ)
              </button>
            </div>
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