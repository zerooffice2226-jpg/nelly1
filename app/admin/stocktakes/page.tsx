'use client'

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react'
import {
  getStocktakes,
  applyStocktake,
  rejectStocktake,
  deleteStocktake,
  updateStocktakeItem,
  DuplicateResolutionMode,
} from '@/app/stocktake-actions'

interface PreviousAppliedInfo {
  stocktakeId: string
  countNo: number
  userName: string
  date: string
  countedQty: number
}

interface OtherPendingInfo {
  stocktakeId: string
  countNo: number
  userName: string
  countedQty: number
}

interface StocktakeItemRecord {
  id: string
  productId: string | null
  modelNo: string
  color: string
  description: string | null
  price: number
  status: string
  countedQty: number
  systemQty: number
  isNewItem: boolean
  liveCurrentStock: number
  liveStockQty: number
  previousApplied: PreviousAppliedInfo | null
  otherPending: OtherPendingInfo[]
}

interface StocktakeRecord {
  id: string
  countNo: number
  createdAt: string
  appliedAt: string | null
  status: 'PENDING' | 'APPLIED' | 'REJECTED'
  notes: string | null
  user: { id: string; name: string; code: string; role: string }
  appliedBy: { id: string; name: string; code: string } | null
  items: StocktakeItemRecord[]
  appliedDuplicatesCount: number
  pendingDuplicatesCount: number
}

export default function AdminStocktakesPage() {
  const [stocktakes, setStocktakes] = useState<StocktakeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPLIED' | 'REJECTED'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [itemModes, setItemModes] = useState<Record<string, DuplicateResolutionMode>>({})
  const [isPending, startTransition] = useTransition()

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await getStocktakes()
    if (res.success) {
      setStocktakes(res.data as StocktakeRecord[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selected = useMemo(
    () => stocktakes.find((s) => s.id === selectedId) || null,
    [stocktakes, selectedId]
  )

  const openStocktakeModal = (st: StocktakeRecord) => {
    // تعيين افتراضي 'REPLACE' للمكررات عند الفتح
    const initialModes: Record<string, DuplicateResolutionMode> = {}
    st.items.forEach((item) => {
      const key = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
      initialModes[key] = 'REPLACE'
    })
    setItemModes(initialModes)
    setSelectedId(st.id)
  }

  const filtered = useMemo(() => {
    return stocktakes.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      return (
        String(s.countNo).includes(term) ||
        s.user.name.toLowerCase().includes(term) ||
        s.user.code.toLowerCase().includes(term) ||
        s.items.some(
          (i) =>
            i.modelNo.toLowerCase().includes(term) ||
            i.color.toLowerCase().includes(term)
        )
      )
    })
  }, [stocktakes, statusFilter, searchTerm])

  const setAllDuplicatesMode = (mode: DuplicateResolutionMode) => {
    if (!selected) return
    const next: Record<string, DuplicateResolutionMode> = { ...itemModes }
    selected.items.forEach((item) => {
      if (item.previousApplied) {
        const key = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
        next[key] = mode
      }
    })
    setItemModes(next)
  }

  const handleApplyFromCard = (stocktake: StocktakeRecord) => {
    // إذا كانت الفاتورة تحتوي على أصناف مجردة مسبقاً، نفتح التفاصيل أولاً ليختار الأدمن بين الزيادة أو اعتماد الحالي
    if (stocktake.appliedDuplicatesCount > 0) {
      openStocktakeModal(stocktake)
      return
    }
    executeApply(stocktake, {})
  }

  const executeApply = (
    stocktake: StocktakeRecord,
    modesToUse: Record<string, DuplicateResolutionMode>
  ) => {
    const duplicateItems = stocktake.items.filter((i) => i.previousApplied)
    let addCount = 0
    let replaceCount = 0

    duplicateItems.forEach((i) => {
      const key = `${i.modelNo.trim().toLowerCase()}__${i.color.trim().toLowerCase()}`
      if (modesToUse[key] === 'ADD') addCount++
      else replaceCount++
    })

    const extraDuplicateSummary =
      duplicateItems.length > 0
        ? `\n\nتنبيه الأصناف المكررة (${duplicateItems.length} صنف):\n- زيادة على الجرد السابق: ${addCount}\n- اعتماد العدد الحالي فقط: ${replaceCount}`
        : ''

    if (
      !confirm(
        `هل أنت متأكد من اعتماد فاتورة الجرد #${stocktake.countNo} (بواسطة: ${stocktake.user.name})؟${extraDuplicateSummary}`
      )
    ) {
      return
    }

    startTransition(async () => {
      const res = await applyStocktake(stocktake.id, modesToUse)
      if (res.success) {
        alert(
          `✅ تم اعتماد وتطبيق الجرد بنجاح!\n- اعتماد بالعدد الحالي: ${res.updatedCount}\n- زيادة على الرصيد السابق: ${res.addedToPreviousCount}\n- أصناف جديدة تم إضافتها: ${res.createdCount}`
        )
        await loadData()
      } else {
        alert('❌ فشل الاعتماد: ' + res.error)
      }
    })
  }

  const handleReject = (id: string) => {
    if (!confirm('هل تريد رفض فاتورة الجرد هذه؟')) return
    startTransition(async () => {
      const res = await rejectStocktake(id)
      if (res.success) {
        await loadData()
      } else {
        alert(res.error)
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('حذف فاتورة الجرد نهائياً؟')) return
    startTransition(async () => {
      const res = await deleteStocktake(id)
      if (res.success) {
        if (selectedId === id) setSelectedId(null)
        await loadData()
      } else {
        alert(res.error)
      }
    })
  }

  const handleItemEdit = (
    item: StocktakeItemRecord,
    nextQty: number,
    nextPrice: number
  ) => {
    startTransition(async () => {
      const res = await updateStocktakeItem(item.id, {
        countedQty: nextQty,
        price: nextPrice,
      })
      if (res.success) {
        await loadData()
      } else {
        alert(res.error)
      }
    })
  }

  const getStatusBadge = (status: StocktakeRecord['status']) => {
    if (status === 'APPLIED') {
      return (
        <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-black">
          ✅ معتمدة ومطبقة
        </span>
      )
    }
    if (status === 'REJECTED') {
      return (
        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-black">
          ❌ مرفوضة
        </span>
      )
    }
    return (
      <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-black animate-pulse">
        ⏳ بانتظار الاعتماد
      </span>
    )
  }

  if (loading) {
    return (
      <div className="p-10 text-center font-bold text-gray-500">
        جاري تحميل سجلات الجرد...
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      {/* الترويسة */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800">
            📋 سجلات فواتير الجرد
          </h1>
          <p className="text-xs font-bold text-gray-400 mt-1">
            مراجعة فواتير الجرد المرفوعة من الموظفين وكشف المكرر مع الفواتير المعتمدة السابقة
          </p>
        </div>

        <input
          type="text"
          placeholder="🔍 بحث برقم الفاتورة أو اسم الموظف أو الموديل..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-80 p-2.5 border-2 border-teal-100 rounded-xl text-sm outline-none focus:border-teal-500"
        />
      </div>

      {/* تبويبات الفلترة */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'ALL', label: `الكل (${stocktakes.length})` },
          {
            key: 'PENDING',
            label: `قيد المراجعة (${stocktakes.filter((s) => s.status === 'PENDING').length})`,
          },
          {
            key: 'APPLIED',
            label: `معتمدة (${stocktakes.filter((s) => s.status === 'APPLIED').length})`,
          },
          {
            key: 'REJECTED',
            label: `مرفوضة (${stocktakes.filter((s) => s.status === 'REJECTED').length})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() =>
              setStatusFilter(tab.key as 'ALL' | 'PENDING' | 'APPLIED' | 'REJECTED')
            }
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${
              statusFilter === tab.key
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* قائمة السجلات */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400 font-bold border border-dashed border-gray-200">
          لا توجد فواتير جرد مطابقة حالياً
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((st) => {
            const totalQty = st.items.reduce((s, i) => s + i.countedQty, 0)
            const newCount = st.items.filter((i) => i.isNewItem).length

            return (
              <div
                key={st.id}
                className={`bg-white rounded-2xl p-5 shadow-sm border flex flex-col justify-between gap-4 hover:shadow-md transition-shadow ${
                  st.appliedDuplicatesCount > 0 && st.status === 'PENDING'
                    ? 'border-amber-400 ring-2 ring-amber-100'
                    : 'border-gray-100'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-xl font-black text-teal-700 font-mono">
                        #{st.countNo}
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(st.createdAt).toLocaleString('ar-EG')}
                      </div>
                    </div>
                    {getStatusBadge(st.status)}
                  </div>

                  {/* إشعارات التكرار على بطاقة الفاتورة */}
                  {st.appliedDuplicatesCount > 0 && (
                    <div className="bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2 rounded-xl text-xs font-black">
                      ⚠️ تنبيه: يحتوي على {st.appliedDuplicatesCount} صنف تم جرده في فواتير معتمدة سابقة
                    </div>
                  )}

                  {st.pendingDuplicatesCount > 0 && st.status === 'PENDING' && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-xl text-[11px] font-bold">
                      🔁 {st.pendingDuplicatesCount} صنف موجود أيضاً في فاتورة قيد المراجعة أخرى
                    </div>
                  )}

                  <div className="bg-gray-50 p-3 rounded-xl text-xs space-y-1">
                    <div>
                      <span className="text-gray-500">قام بالجرد: </span>
                      <span className="font-black text-gray-800">
                        👤 {st.user.name}
                      </span>{' '}
                      <span className="text-gray-400 font-mono">
                        ({st.user.code})
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-200/70">
                      <span>عدد الأصناف: {st.items.length}</span>
                      <span className="font-black text-teal-700">
                        الإجمالي: {totalQty} قطعة
                      </span>
                    </div>
                    {newCount > 0 && (
                      <div className="text-indigo-600 font-bold">
                        ✨ يحتوي على {newCount} صنف غير مسجل مسبقاً
                      </div>
                    )}
                    {st.appliedBy && st.appliedAt && (
                      <div className="text-green-700 font-bold pt-1 border-t border-gray-200/70">
                        اعتمد بواسطة: {st.appliedBy.name} (
                        {new Date(st.appliedAt).toLocaleDateString('ar-EG')})
                      </div>
                    )}
                  </div>

                  {st.notes && (
                    <p className="text-xs text-gray-500 bg-amber-50/50 p-2 rounded-lg">
                      📝 {st.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => openStocktakeModal(st)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black"
                  >
                    👁️ التفاصيل والقرار
                  </button>

                  {st.status === 'PENDING' && (
                    <button
                      disabled={isPending}
                      onClick={() => handleApplyFromCard(st)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-white text-xs font-black shadow disabled:opacity-50 ${
                        st.appliedDuplicatesCount > 0
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-teal-600 hover:bg-teal-700'
                      }`}
                    >
                      {st.appliedDuplicatesCount > 0
                        ? '⚠️ مراجعة واعتماد'
                        : '✅ اعتماد وتطبيق'}
                    </button>
                  )}

                  {st.status !== 'APPLIED' && (
                    <button
                      disabled={isPending}
                      onClick={() => handleDelete(st.id)}
                      className="py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold disabled:opacity-50"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* نافذة تفاصيل ومراجعة فاتورة الجرد */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-xl font-black text-gray-800 flex items-center gap-2 flex-wrap">
                  <span>تفاصيل فاتورة الجرد #{selected.countNo}</span>
                  {getStatusBadge(selected.status)}
                </h2>
                <p className="text-xs font-bold text-gray-500 mt-1">
                  الموظف: {selected.user.name} ({selected.user.code}) |{' '}
                  {new Date(selected.createdAt).toLocaleString('ar-EG')}
                </p>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-gray-400 hover:text-red-500 text-2xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* شريط تنبيه وإجراءات سريعة للأصناف المكررة */}
              {selected.appliedDuplicatesCount > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
                  <div className="text-sm font-black text-amber-900">
                    ⚠️ تنبيه: الأصناف المميزة باللون البرتقالي تم جردها واعتمادها في فواتير سابقة!
                  </div>
                  {selected.status === 'PENDING' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-amber-800">
                        اختيار جماعي للمكررات:
                      </span>
                      <button
                        type="button"
                        onClick={() => setAllDuplicatesMode('ADD')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm"
                      >
                        ➕ تعيين الكل: زيادة على الجرد السابق
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllDuplicatesMode('REPLACE')}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-sm"
                      >
                        🔄 تعيين الكل: اعتماد الحالي فقط
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right border-collapse">
                  <thead className="bg-gray-100 text-gray-700 text-xs">
                    <tr>
                      <th className="p-3 border">الموديل</th>
                      <th className="p-3 border">اللون</th>
                      <th className="p-3 border">الحالة / التكرار</th>
                      <th className="p-3 border text-center">الرصيد الحالي</th>
                      <th className="p-3 border text-center">المجرد (قطعة)</th>
                      <th className="p-3 border text-center">الفرق</th>
                      {selected.status === 'PENDING' &&
                        selected.appliedDuplicatesCount > 0 && (
                          <th className="p-3 border text-center">قرار المكرر</th>
                        )}
                      <th className="p-3 border text-center">السعر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => {
                      const key = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
                      const mode: DuplicateResolutionMode = itemModes[key] || 'REPLACE'
                      const isDup = Boolean(item.previousApplied)
                      const diff = item.countedQty - item.liveCurrentStock
                      const expectedAfterApply =
                        mode === 'ADD'
                          ? item.liveCurrentStock + item.countedQty
                          : item.countedQty

                      return (
                        <tr
                          key={item.id}
                          className={`border-b ${
                            isDup
                              ? 'bg-amber-50/90'
                              : item.isNewItem
                              ? 'bg-indigo-50/50'
                              : ''
                          }`}
                        >
                          <td className="p-3 border font-black">
                            {item.modelNo}
                            {item.description && (
                              <span className="block text-[11px] font-normal text-gray-500">
                                {item.description}
                              </span>
                            )}
                          </td>
                          <td className="p-3 border font-bold">{item.color}</td>
                          <td className="p-3 border text-xs space-y-1">
                            {item.isNewItem ? (
                              <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold inline-block">
                                جديد ✨
                              </span>
                            ) : (
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold inline-block">
                                موجود
                              </span>
                            )}

                            {item.previousApplied && (
                              <div className="bg-amber-200/70 text-amber-950 p-1.5 rounded-lg text-[11px] font-bold">
                                🔁 مكرر مع فاتورة #{item.previousApplied.countNo} (
                                {item.previousApplied.userName} • كمية:{' '}
                                {item.previousApplied.countedQty})
                              </div>
                            )}

                            {item.otherPending.length > 0 && (
                              <div className="bg-blue-100 text-blue-900 p-1 rounded-lg text-[10px] font-bold">
                                متداخل مع فاتورة قيد المراجعة #
                                {item.otherPending.map((p) => p.countNo).join(', #')}
                              </div>
                            )}
                          </td>
                          <td className="p-3 border text-center text-gray-600 font-mono font-bold">
                            {item.isNewItem ? '-' : item.liveCurrentStock}
                          </td>
                          <td className="p-3 border text-center font-black">
                            {selected.status === 'PENDING' ? (
                              <input
                                type="number"
                                min="0"
                                defaultValue={item.countedQty}
                                onBlur={(e) => {
                                  const nextVal = parseInt(e.target.value, 10)
                                  if (!isNaN(nextVal) && nextVal !== item.countedQty) {
                                    handleItemEdit(item, nextVal, item.price)
                                  }
                                }}
                                className="w-20 p-1.5 border rounded-lg text-center font-black bg-white"
                              />
                            ) : (
                              item.countedQty
                            )}
                          </td>
                          <td
                            className={`p-3 border text-center font-black font-mono ${
                              diff > 0
                                ? 'text-green-600'
                                : diff < 0
                                ? 'text-red-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {item.isNewItem
                              ? `+${item.countedQty}`
                              : diff > 0
                              ? `+${diff}`
                              : diff}
                          </td>

                          {selected.status === 'PENDING' &&
                            selected.appliedDuplicatesCount > 0 && (
                              <td className="p-3 border text-center">
                                {isDup ? (
                                  <div className="flex flex-col gap-1.5 min-w-[165px]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setItemModes((prev) => ({
                                          ...prev,
                                          [key]: 'ADD',
                                        }))
                                      }
                                      className={`px-2 py-1.5 rounded-lg text-[11px] font-black border transition-all ${
                                        mode === 'ADD'
                                          ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                                          : 'bg-white text-gray-700 border-gray-300'
                                      }`}
                                    >
                                      ➕ زيادة على السابق
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setItemModes((prev) => ({
                                          ...prev,
                                          [key]: 'REPLACE',
                                        }))
                                      }
                                      className={`px-2 py-1.5 rounded-lg text-[11px] font-black border transition-all ${
                                        mode === 'REPLACE'
                                          ? 'bg-blue-600 text-white border-blue-600 shadow'
                                          : 'bg-white text-gray-700 border-gray-300'
                                      }`}
                                    >
                                      🔄 اعتماد الحالي فقط
                                    </button>
                                    <span className="text-[10px] font-bold text-gray-600">
                                      الناتج النهائي:{' '}
                                      <b className="text-slate-900">
                                        {expectedAfterApply} قطعة
                                      </b>
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            )}

                          <td className="p-3 border text-center">
                            {selected.status === 'PENDING' && item.isNewItem ? (
                              <input
                                type="number"
                                min="0"
                                defaultValue={item.price}
                                onBlur={(e) => {
                                  const nextPrice = parseFloat(e.target.value)
                                  if (!isNaN(nextPrice) && nextPrice !== item.price) {
                                    handleItemEdit(item, item.countedQty, nextPrice)
                                  }
                                }}
                                className="w-20 p-1.5 border rounded-lg text-center font-bold bg-white"
                              />
                            ) : (
                              `${item.price} ج.م`
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-between items-center gap-3">
              <div className="text-sm font-black text-gray-700">
                إجمالي القطع المجردة:{' '}
                <span className="text-teal-700">
                  {selected.items.reduce((s, i) => s + i.countedQty, 0)} قطعة
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.status === 'PENDING' && (
                  <>
                    <button
                      disabled={isPending}
                      onClick={() => handleReject(selected.id)}
                      className="px-4 py-2.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-bold text-sm"
                    >
                      ❌ رفض
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => executeApply(selected, itemModes)}
                      className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm shadow-lg"
                    >
                      {isPending
                        ? 'جاري التطبيق...'
                        : '✅ اعتماد الجرد كعدد أولي وتطبيقه على الأصناف'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedId(null)}
                  className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-bold text-sm"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}