'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'

const prisma = new PrismaClient()

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
}

export interface CreateStocktakeItemInput {
  productId?: string | null
  modelNo: string
  color: string
  description?: string
  price?: number
  status?: string
  countedQty: number // بالقطع
  isNewItem: boolean
}

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.image
  if (!userId) return null

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, code: true, role: true },
  })
}

// 1. جلب الأصناف لشاشة الجرد (للبحث والسكان)
export async function getProductsForStocktake(): Promise<StocktakeProductOption[]> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return []

    const products = await prisma.product.findMany({
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
    })

    return JSON.parse(JSON.stringify(products))
  } catch (error) {
    console.error('Error fetching products for stocktake:', error)
    return []
  }
}

// 2. حفظ فاتورة الجرد (متاح لجميع الموظفين والمديرين والمحاسبين)
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

    const dbProducts = productIds.length
      ? await prisma.product.findMany({
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
      : []

    const dbProductMap = new Map(dbProducts.map((p) => [p.id, p]))

    // تجميع البنود المتكررة لنفس (الموديل + اللون) داخل نفس فاتورة الجرد
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

    for (const raw of payload.items) {
      const modelNo = String(raw.modelNo || '').trim()
      const color = String(raw.color || '').trim()
      const countedQty = Math.max(0, parseInt(String(raw.countedQty), 10) || 0)

      if (!modelNo || !color) {
        return { success: false, error: 'يجب تحديد كود الموديل واللون لكل صنف' }
      }

      const dbProd = raw.productId ? dbProductMap.get(raw.productId) : undefined
      const key = `${modelNo.toLowerCase()}__${color.toLowerCase()}`

      const existing = mergedItemsMap.get(key)
      if (existing) {
        existing.countedQty += countedQty
      } else {
        mergedItemsMap.set(key, {
          productId: dbProd ? dbProd.id : null,
          modelNo: dbProd ? dbProd.modelNo : modelNo,
          color: dbProd ? dbProd.color : color,
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
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'فشل حفظ فاتورة الجرد'
    console.error('Error creating stocktake:', error)
    return { success: false, error: message }
  }
}

// 3. جلب سجلات فواتير الجرد (لوحة التحكم فقط)
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
        },
      },
      take: 200,
    })

    return {
      success: true,
      data: JSON.parse(JSON.stringify(stocktakes)),
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

// 5. اعتماد فاتورة الجرد وتطبيقها على الأصناف كعدد أولي وحالي
export async function applyStocktake(stocktakeId: string) {
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

        // تجميع الكميات لكل (موديل + لون)
        const aggregated = new Map<
          string,
          {
            modelNo: string
            color: string
            description: string
            price: number
            status: string
            countedQty: number
          }
        >()

        for (const item of stocktake.items) {
          const m = item.modelNo.trim()
          const c = item.color.trim()
          const key = `${m.toLowerCase()}__${c.toLowerCase()}`
          const current = aggregated.get(key)
          if (current) {
            current.countedQty += item.countedQty
          } else {
            aggregated.set(key, {
              modelNo: m,
              color: c,
              description: item.description || '',
              price: item.price || 0,
              status: item.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
              countedQty: item.countedQty,
            })
          }
        }

        let updatedCount = 0
        let createdCount = 0

        for (const entry of aggregated.values()) {
          const existingProduct = await tx.product.findFirst({
            where: {
              modelNo: { equals: entry.modelNo, mode: 'insensitive' },
              color: { equals: entry.color, mode: 'insensitive' },
            },
          })

          if (existingProduct) {
            await tx.product.update({
              where: { id: existingProduct.id },
              data: {
                stockQty: entry.countedQty,
                currentStock: entry.countedQty,
              },
            })
            updatedCount++
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

        return { updatedCount, createdCount }
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