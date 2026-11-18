'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'

const prisma = new PrismaClient()

export interface LastAppliedCountInfo {
  countNo: number
  userName: string
  date: string
  countedQty: number
}

export interface StocktakeProductOption {
  id: string
  modelNo: string
  color: string
  description: string | null
  material: string | null
  price: number
  currentStock: number
  stockQty: number
  status: string
  lastAppliedCount: LastAppliedCountInfo | null
}

export interface CreateStocktakeItemInput {
  productId?: string | null
  modelNo: string
  color: string
  description?: string
  price?: number
  status?: string
  countedQty: number
  isNewItem: boolean
}

export type DuplicateResolutionMode = 'ADD' | 'REPLACE'

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.image
  if (!userId) return null

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, code: true, role: true },
  })
}

// 1. جلب الأصناف لشاشة الجرد (مع معرفة آخر جرد معتمد لكل صنف)
export async function getProductsForStocktake(): Promise<StocktakeProductOption[]> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return []

    const [products, appliedStocktakes] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ modelNo: 'asc' }, { color: 'asc' }],
        select: {
          id: true,
          modelNo: true,
          color: true,
          description: true,
          material: true,
          price: true,
          currentStock: true,
          stockQty: true,
          status: true,
        },
      }),
      prisma.stocktake.findMany({
        where: { status: 'APPLIED' },
        orderBy: [{ appliedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { name: true } },
          items: {
            select: { modelNo: true, color: true, countedQty: true },
          },
        },
      }),
    ])

    const lastAppliedMap = new Map<string, LastAppliedCountInfo>()
    for (const st of appliedStocktakes) {
      const dateStr = (st.appliedAt || st.createdAt).toISOString()
      for (const item of st.items) {
        const key = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
        if (!lastAppliedMap.has(key)) {
          lastAppliedMap.set(key, {
            countNo: st.countNo,
            userName: st.user.name,
            date: dateStr,
            countedQty: item.countedQty,
          })
        }
      }
    }

    const enriched: StocktakeProductOption[] = products.map((p) => {
      const key = `${p.modelNo.trim().toLowerCase()}__${p.color.trim().toLowerCase()}`
      return {
        ...p,
        lastAppliedCount: lastAppliedMap.get(key) || null,
      }
    })

    return JSON.parse(JSON.stringify(enriched))
  } catch (error) {
    console.error('Error fetching products for stocktake:', error)
    return []
  }
}

// 2. حفظ فاتورة الجرد (مع إرجاع تنبيه إن وجدت أصناف مجردة في فواتير معتمدة سابقة)
export async function createStocktake(payload: {
  items: CreateStocktakeItemInput[]
  notes?: string
}) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'يجب تسجيل الدخول أولاً' }
    }

    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'فاتورة الجرد فارغة، أضف صنفاً واحداً على الأقل' }
    }

    const productIds = payload.items
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id))

    const [dbProducts, appliedStocktakes] = await Promise.all([
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              modelNo: true,
              color: true,
              description: true,
              price: true,
              currentStock: true,
              status: true,
            },
          })
        : Promise.resolve([]),
      prisma.stocktake.findMany({
        where: { status: 'APPLIED' },
        select: {
          countNo: true,
          items: { select: { modelNo: true, color: true } },
        },
      }),
    ])

    const dbProductMap = new Map(dbProducts.map((p) => [p.id, p]))
    const appliedKeysMap = new Map<string, number>()
    for (const st of appliedStocktakes) {
      for (const item of st.items) {
        const k = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
        if (!appliedKeysMap.has(k)) {
          appliedKeysMap.set(k, st.countNo)
        }
      }
    }

    const mergedItemsMap = new Map<
      string,
      {
        productId: string | null
        modelNo: string
        color: string
        description: string
        price: number
        status: string
        countedQty: number
        systemQty: number
        isNewItem: boolean
      }
    >()

    const duplicateApprovedModels: string[] = []

    for (const raw of payload.items) {
      const modelNo = String(raw.modelNo || '').trim()
      const color = String(raw.color || '').trim()
      const countedQty = Math.max(0, parseInt(String(raw.countedQty), 10) || 0)

      if (!modelNo || !color) {
        return { success: false, error: 'يجب تحديد كود الموديل واللون لكل صنف' }
      }

      const dbProd = raw.productId ? dbProductMap.get(raw.productId) : undefined
      const finalModel = dbProd ? dbProd.modelNo : modelNo
      const finalColor = dbProd ? dbProd.color : color
      const key = `${finalModel.toLowerCase()}__${finalColor.toLowerCase()}`

      const prevCountNo = appliedKeysMap.get(key)
      if (prevCountNo !== undefined) {
        const label = `${finalModel} (${finalColor}) - فاتورة #${prevCountNo}`
        if (!duplicateApprovedModels.includes(label)) {
          duplicateApprovedModels.push(label)
        }
      }

      const existing = mergedItemsMap.get(key)
      if (existing) {
        existing.countedQty += countedQty
      } else {
        mergedItemsMap.set(key, {
          productId: dbProd ? dbProd.id : null,
          modelNo: finalModel,
          color: finalColor,
          description: dbProd
            ? dbProd.description || ''
            : String(raw.description || '').trim(),
          price: dbProd ? dbProd.price : parseFloat(String(raw.price || 0)) || 0,
          status: dbProd
            ? dbProd.status
            : raw.status === 'CLOSED'
            ? 'CLOSED'
            : 'OPEN',
          countedQty,
          systemQty: dbProd ? dbProd.currentStock : 0,
          isNewItem: !dbProd || Boolean(raw.isNewItem),
        })
      }
    }

    const readyItems = Array.from(mergedItemsMap.values())

    const created = await prisma.stocktake.create({
      data: {
        userId: user.id,
        notes: payload.notes ? payload.notes.trim() : null,
        status: 'PENDING',
        items: {
          create: readyItems,
        },
      },
      select: {
        id: true,
        countNo: true,
      },
    })

    revalidatePath('/admin/stocktakes')
    return {
      success: true,
      id: created.id,
      countNo: created.countNo,
      duplicateApprovedModels,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'فشل حفظ فاتورة الجرد'
    console.error('Error creating stocktake:', error)
    return { success: false, error: message }
  }
}

// 3. جلب سجلات فواتير الجرد مع كشف التكرارات مع الفواتير المعتمدة السابقة
export async function getStocktakes() {
  try {
    const user = await getAuthenticatedUser()
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'غير مصرح لك بعرض سجلات الجرد', data: [] }
    }

    const stocktakes = await prisma.stocktake.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, code: true, role: true } },
        appliedBy: { select: { id: true, name: true, code: true } },
        items: {
          orderBy: [{ modelNo: 'asc' }, { color: 'asc' }],
          include: {
            product: {
              select: { id: true, currentStock: true, stockQty: true },
            },
          },
        },
      },
      take: 200,
    })

    // بناء فهرس لجميع الفواتير المعتمدة وغير المعتمدة لكشف التكرار
    const appliedHistoryByKey = new Map<
      string,
      Array<{
        stocktakeId: string
        countNo: number
        userName: string
        date: Date
        countedQty: number
      }>
    >()

    const pendingByKey = new Map<
      string,
      Array<{
        stocktakeId: string
        countNo: number
        userName: string
        countedQty: number
      }>
    >()

    for (const st of stocktakes) {
      for (const item of st.items) {
        const key = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
        if (st.status === 'APPLIED') {
          if (!appliedHistoryByKey.has(key)) appliedHistoryByKey.set(key, [])
          appliedHistoryByKey.get(key)!.push({
            stocktakeId: st.id,
            countNo: st.countNo,
            userName: st.user.name,
            date: st.appliedAt || st.createdAt,
            countedQty: item.countedQty,
          })
        } else if (st.status === 'PENDING') {
          if (!pendingByKey.has(key)) pendingByKey.set(key, [])
          pendingByKey.get(key)!.push({
            stocktakeId: st.id,
            countNo: st.countNo,
            userName: st.user.name,
            countedQty: item.countedQty,
          })
        }
      }
    }

    const enriched = stocktakes.map((st) => {
      let appliedDuplicatesCount = 0
      let pendingDuplicatesCount = 0

      const enrichedItems = st.items.map((item) => {
        const key = `${item.modelNo.trim().toLowerCase()}__${item.color.trim().toLowerCase()}`
        const appliedList = (appliedHistoryByKey.get(key) || []).filter((h) => {
          if (h.stocktakeId === st.id) return false
          if (st.status === 'APPLIED') {
            return new Date(h.date).getTime() <= new Date(st.appliedAt || st.createdAt).getTime()
          }
          return true
        })

        const previousApplied = appliedList.length > 0 ? appliedList[0] : null
        const otherPending = (pendingByKey.get(key) || []).filter(
          (p) => p.stocktakeId !== st.id
        )

        if (previousApplied) appliedDuplicatesCount++
        if (otherPending.length > 0) pendingDuplicatesCount++

        return {
          ...item,
          liveCurrentStock: item.product ? item.product.currentStock : item.systemQty,
          liveStockQty: item.product ? item.product.stockQty : item.systemQty,
          previousApplied,
          otherPending,
        }
      })

      return {
        ...st,
        items: enrichedItems,
        appliedDuplicatesCount,
        pendingDuplicatesCount,
      }
    })

    return {
      success: true,
      data: JSON.parse(JSON.stringify(enriched)),
    }
  } catch (error) {
    console.error('Error fetching stocktakes:', error)
    return { success: false, error: 'فشل جلب سجلات الجرد', data: [] }
  }
}

// 4. تعديل كمية أو سعر بند في فاتورة جرد قبل الاعتماد
export async function updateStocktakeItem(
  itemId: string,
  data: { countedQty: number; price?: number; status?: string }
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'غير مصرح لك بالتعديل' }
    }

    const item = await prisma.stocktakeItem.findUnique({
      where: { id: itemId },
      include: { stocktake: { select: { status: true } } },
    })

    if (!item) return { success: false, error: 'البند غير موجود' }
    if (item.stocktake.status !== 'PENDING') {
      return { success: false, error: 'لا يمكن تعديل فاتورة تم اعتمادها أو رفضها' }
    }

    await prisma.stocktakeItem.update({
      where: { id: itemId },
      data: {
        countedQty: Math.max(0, parseInt(String(data.countedQty), 10) || 0),
        ...(data.price !== undefined && {
          price: Math.max(0, parseFloat(String(data.price)) || 0),
        }),
        ...(data.status && {
          status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        }),
      },
    })

    revalidatePath('/admin/stocktakes')
    return { success: true }
  } catch (error) {
    console.error('Error updating stocktake item:', error)
    return { success: false, error: 'فشل تحديث البند' }
  }
}

// 5. اعتماد فاتورة الجرد وتطبيقها (مع دعم اختيار الزيادة على السابق أو اعتماد الحالي للمكرر)
export async function applyStocktake(
  stocktakeId: string,
  itemModes: Record<string, DuplicateResolutionMode> = {}
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'غير مصرح لك باعتماد الجرد' }
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const stocktake = await tx.stocktake.findUnique({
          where: { id: stocktakeId },
          include: { items: true },
        })

        if (!stocktake) {
          throw new Error('فاتورة الجرد غير موجودة')
        }
        if (stocktake.status === 'APPLIED') {
          throw new Error('تم اعتماد وتطبيق هذه الفاتورة مسبقاً')
        }
        if (stocktake.status === 'REJECTED') {
          throw new Error('لا يمكن اعتماد فاتورة مرفوضة')
        }
        if (stocktake.items.length === 0) {
          throw new Error('فاتورة الجرد فارغة')
        }

        const aggregated = new Map<
          string,
          {
            key: string
            modelNo: string
            color: string
            description: string
            price: number
            status: string
            countedQty: number
            mode: DuplicateResolutionMode
          }
        >()

        for (const item of stocktake.items) {
          const m = item.modelNo.trim()
          const c = item.color.trim()
          const key = `${m.toLowerCase()}__${c.toLowerCase()}`
          const chosenMode: DuplicateResolutionMode =
            itemModes[key] === 'ADD' || itemModes[item.id] === 'ADD'
              ? 'ADD'
              : 'REPLACE'

          const current = aggregated.get(key)
          if (current) {
            current.countedQty += item.countedQty
            if (chosenMode === 'ADD') current.mode = 'ADD'
          } else {
            aggregated.set(key, {
              key,
              modelNo: m,
              color: c,
              description: item.description || '',
              price: item.price || 0,
              status: item.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
              countedQty: item.countedQty,
              mode: chosenMode,
            })
          }
        }

        let updatedCount = 0
        let addedToPreviousCount = 0
        let createdCount = 0

        for (const entry of aggregated.values()) {
          const existingProduct = await tx.product.findFirst({
            where: {
              modelNo: { equals: entry.modelNo, mode: 'insensitive' },
              color: { equals: entry.color, mode: 'insensitive' },
            },
          })

          if (existingProduct) {
            if (entry.mode === 'ADD') {
              await tx.product.update({
                where: { id: existingProduct.id },
                data: {
                  stockQty: existingProduct.stockQty + entry.countedQty,
                  currentStock: existingProduct.currentStock + entry.countedQty,
                },
              })
              addedToPreviousCount++
            } else {
              await tx.product.update({
                where: { id: existingProduct.id },
                data: {
                  stockQty: entry.countedQty,
                  currentStock: entry.countedQty,
                },
              })
              updatedCount++
            }
          } else {
            const finalMaterial = `${entry.modelNo}${entry.color}`.trim()
            await tx.product.create({
              data: {
                modelNo: entry.modelNo,
                color: entry.color,
                description: entry.description,
                material: finalMaterial,
                price: entry.price,
                stockQty: entry.countedQty,
                currentStock: entry.countedQty,
                status: entry.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
              },
            })
            createdCount++
          }
        }

        await tx.stocktake.update({
          where: { id: stocktakeId },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
            appliedById: user.id,
          },
        })

        return { updatedCount, addedToPreviousCount, createdCount }
      },
      { maxWait: 15000, timeout: 90000 }
    )

    revalidatePath('/')
    revalidatePath('/admin/products')
    revalidatePath('/admin/reports')
    revalidatePath('/admin/notifications')
    revalidatePath('/admin/stocktakes')
    revalidatePath('/orders/new')

    return {
      success: true,
      updatedCount: result.updatedCount,
      addedToPreviousCount: result.addedToPreviousCount,
      createdCount: result.createdCount,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'فشل اعتماد فاتورة الجرد'
    console.error('Error applying stocktake:', error)
    return { success: false, error: message }
  }
}

// 6. رفض أو حذف فاتورة جرد غير معتمدة
export async function rejectStocktake(stocktakeId: string) {
  try {
    const user = await getAuthenticatedUser()
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'غير مصرح لك بهذا الإجراء' }
    }

    const stocktake = await prisma.stocktake.findUnique({
      where: { id: stocktakeId },
      select: { status: true },
    })

    if (!stocktake) return { success: false, error: 'الفاتورة غير موجودة' }
    if (stocktake.status === 'APPLIED') {
      return { success: false, error: 'لا يمكن رفض فاتورة تم اعتمادها بالفعل' }
    }

    await prisma.stocktake.update({
      where: { id: stocktakeId },
      data: { status: 'REJECTED' },
    })

    revalidatePath('/admin/stocktakes')
    return { success: true }
  } catch (error) {
    console.error('Error rejecting stocktake:', error)
    return { success: false, error: 'فشل رفض الفاتورة' }
  }
}

export async function deleteStocktake(stocktakeId: string) {
  try {
    const user = await getAuthenticatedUser()
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'غير مصرح لك بحذف الفواتير' }
    }

    const stocktake = await prisma.stocktake.findUnique({
      where: { id: stocktakeId },
      select: { status: true },
    })

    if (!stocktake) return { success: false, error: 'الفاتورة غير موجودة' }
    if (stocktake.status === 'APPLIED') {
      return { success: false, error: 'لا يمكن حذف فاتورة جرد معتمدة' }
    }

    await prisma.stocktake.delete({ where: { id: stocktakeId } })

    revalidatePath('/admin/stocktakes')
    return { success: true }
  } catch (error) {
    console.error('Error deleting stocktake:', error)
    return { success: false, error: 'فشل حذف فاتورة الجرد' }
  }
}