'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import {
  getStocktakes,
  applyStocktake,
  rejectStocktake,
  deleteStocktake,
  updateStocktakeItem,
} from '@/app/stocktake-actions'

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
}

export default function AdminStocktakesPage() {
  const [stocktakes, setStocktakes] = useState<StocktakeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPLIED' | 'REJECTED'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState<StocktakeRecord | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadData = async () => {
    setLoading(true)
    const res = await getStocktakes()
    if (res.success) {
      setStocktakes(res.data)
      if (selected) {
        const refreshed = (res.data as StocktakeRecord[]).find(
          (s) => s.id === selected.id
        )
        setSelected(refreshed || null)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const handleApply = (stocktake: StocktakeRecord) => {
    if (
      !confirm(
        `هل أنت متأكد من اعتماد فاتورة الجرد #${stocktake.countNo} (بواسطة: ${stocktake.user.name})؟\n\nسيتم:\n1) اعتماد الكميات المجردة كعدد أولي وحالي للأصناف.\n2) إضافة الأصناف الجديدة غير الموجودة تلقائياً لجدول الأصناف.`
      )
    ) {
      return
    }

    startTransition(async () => {
      const res = await applyStocktake(stocktake.id)
      if (res.success) {
        alert(
          `✅ تم اعتماد وتطبيق الجرد بنجاح!\n- أصناف تم تحديثها: ${res.updatedCount}\n- أصناف جديدة تم إضافتها: ${res.createdCount}`
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
        if (selected?.id === id) setSelected(null)
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
            مراجعة فواتير الجرد المرفوعة من الموظفين واعتمادها كعدد أولي للأصناف
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
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow"
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
                    onClick={() => setSelected(st)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black"
                  >
                    👁️ التفاصيل والتعديل
                  </button>

                  {st.status === 'PENDING' && (
                    <button
                      disabled={isPending}
                      onClick={() => handleApply(st)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow disabled:opacity-50"
                    >
                      ✅ اعتماد وتطبيق
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
          <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                  <span>تفاصيل فاتورة الجرد #{selected.countNo}</span>
                  {getStatusBadge(selected.status)}
                </h2>
                <p className="text-xs font-bold text-gray-500 mt-1">
                  الموظف: {selected.user.name} ({selected.user.code}) |{' '}
                  {new Date(selected.createdAt).toLocaleString('ar-EG')}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-red-500 text-2xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right border-collapse">
                  <thead className="bg-gray-100 text-gray-700 text-xs">
                    <tr>
                      <th className="p-3 border">الموديل</th>
                      <th className="p-3 border">اللون</th>
                      <th className="p-3 border">النوع</th>
                      <th className="p-3 border text-center">الدفتري السابق</th>
                      <th className="p-3 border text-center">المجرد (قطعة)</th>
                      <th className="p-3 border text-center">الفرق</th>
                      <th className="p-3 border text-center">السعر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => {
                      const diff = item.countedQty - item.systemQty
                      return (
                        <tr
                          key={item.id}
                          className={`border-b ${
                            item.isNewItem ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <td className="p-3 border font-black">
                            {item.modelNo}
                            {item.description && (
                              <span className="block text-[11px] font-normal text-gray-400">
                                {item.description}
                              </span>
                            )}
                          </td>
                          <td className="p-3 border font-bold">{item.color}</td>
                          <td className="p-3 border text-xs">
                            {item.isNewItem ? (
                              <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">
                                جديد ✨
                              </span>
                            ) : (
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
                                موجود
                              </span>
                            )}
                          </td>
                          <td className="p-3 border text-center text-gray-500 font-mono">
                            {item.isNewItem ? '-' : item.systemQty}
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
                                className="w-20 p-1.5 border rounded-lg text-center font-black"
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
                                className="w-20 p-1.5 border rounded-lg text-center font-bold"
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
                      onClick={() => handleApply(selected)}
                      className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm shadow-lg"
                    >
                      {isPending
                        ? 'جاري التطبيق...'
                        : '✅ اعتماد الجرد كعدد أولي وتطبيقه على الأصناف'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelected(null)}
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