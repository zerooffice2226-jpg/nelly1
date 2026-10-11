'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()
const PIECES_PER_UNIT = 4 // معامل التحويل: 4 قطع في السرية

export interface BulkOrderItemInput {
  modelNo: string
  color?: string // اختياري: لو لم يحدد يؤخذ أول لون للصنف افتراضياً
  quantity: number // عدد السريات
  price?: number // اختياري: لو لم يحدد يؤخذ سعر الصنف من قاعدة البيانات
  discountPercent?: number // اختياري: نسبة الخصم
}

export interface CreateBulkOrderPayload {
  customerId: string
  items: BulkOrderItemInput[]
  deposit: number
  safeId?: string
  currency?: string
  notes?: string
  isDeferredCustomer?: boolean
}

export async function createBulkOrder(payload: CreateBulkOrderPayload, userId: string) {
  const { customerId, items, deposit, safeId, currency = 'EGP', notes, isDeferredCustomer = false } = payload

  if (!items || items.length === 0) {
    return { success: false, error: 'الملف لا يحتوي على أي أصناف صالحة.' }
  }

  if (deposit > 0 && !safeId) {
    return { success: false, error: 'عند وجود تحصيل نقدي / عربون، يجب تحديد الخزنة المستلمة.' }
  }

  try {
    // 1. استخراج أكواد الموديلات المطلوبة
    const validRawItems = items.filter(i => {
      const model = String(i.modelNo || '').trim()
      const qty = parseInt(String(i.quantity || 0))
      return model.length > 0 && qty > 0
    })

    if (validRawItems.length === 0) {
      return { success: false, error: 'لم يتم العثور على أي كميات صالحة في الملف المرفوع.' }
    }

    const uniqueModelCodes = Array.from(new Set(validRawItems.map(i => String(i.modelNo).trim().toLowerCase())))

    // 2. جلب جميع الموديلات وألوانها المسجلة في قاعدة البيانات مرتبة بالأقدمية
    const productsInDb = await prisma.product.findMany({
      where: {
        modelNo: { in: uniqueModelCodes, mode: 'insensitive' }
      },
      orderBy: { id: 'asc' }
    })

    // تجميع المنتجات حسب كود الموديل للوصول السريع
    const modelProductsMap = new Map<string, typeof productsInDb>()
    productsInDb.forEach(p => {
      const key = p.modelNo.trim().toLowerCase()
      if (!modelProductsMap.has(key)) {
        modelProductsMap.set(key, [])
      }
      modelProductsMap.get(key)!.push(p)
    })

    // 3. مطابقة كل بند بالمنتج المناسب (واختيار أول لون تلقائياً إذا لم يُحدد)
    const aggregatedProductsMap = new Map<string, {
      product: typeof productsInDb[0]
      quantity: number
      customPrice?: number
      customDiscount?: number
    }>()

    const missingModels: string[] = []

    for (const rawItem of validRawItems) {
      const modelKey = String(rawItem.modelNo).trim().toLowerCase()
      const availableVariants = modelProductsMap.get(modelKey)

      if (!availableVariants || availableVariants.length === 0) {
        if (!missingModels.includes(rawItem.modelNo)) {
          missingModels.push(rawItem.modelNo)
        }
        continue
      }

      let selectedProduct: typeof productsInDb[0] | undefined

      const inputColor = String(rawItem.color || '').trim().toLowerCase()
      if (inputColor && inputColor !== 'افتراضي' && inputColor !== 'default') {
        // البحث عن اللون المحدد إن وُجد
        selectedProduct = availableVariants.find(p => p.color.trim().toLowerCase() === inputColor)
      }

      // إذا لم يُحدد لون أو لم يُعثر على اللون المدخل، يتم اعتماد أول لون مسجل للصنف تلقائياً
      if (!selectedProduct) {
        selectedProduct = availableVariants[0]
      }

      const currentQty = parseInt(String(rawItem.quantity || 0))
      const productId = selectedProduct.id

      if (aggregatedProductsMap.has(productId)) {
        const existing = aggregatedProductsMap.get(productId)!
        existing.quantity += currentQty
      } else {
        aggregatedProductsMap.set(productId, {
          product: selectedProduct,
          quantity: currentQty,
          customPrice: rawItem.price ? Number(rawItem.price) : undefined,
          customDiscount: rawItem.discountPercent ? Number(rawItem.discountPercent) : undefined,
        })
      }
    }

    if (missingModels.length > 0) {
      return {
        success: false,
        error: `الموديلات التالية غير مسجلة في قاعدة البيانات:\n${missingModels.slice(0, 10).join(' ، ')}${missingModels.length > 10 ? ' ...وغيرها' : ''}`
      }
    }

    if (aggregatedProductsMap.size === 0) {
      return { success: false, error: 'لم يتم العثور على أي منتجات مطابقة في النظام.' }
    }

    // 4. فحص رصيد المخزون للأصناف المغلقة CLOSED وحساب الأسعار
    const insufficientStockItems: any[] = []
    const readyItemsData: Array<{
      productId: string
      quantity: number
      price: number
      discountPercent: number
      totalLinePrice: number
      neededPieces: number
    }> = []

    for (const [, item] of aggregatedProductsMap.entries()) {
      const product = item.product
      const neededPieces = item.quantity * PIECES_PER_UNIT

      if (product.status !== 'OPEN' && product.currentStock < neededPieces) {
        insufficientStockItems.push({
          modelNo: product.modelNo,
          color: product.color,
          available: Math.floor(product.currentStock / PIECES_PER_UNIT),
          requested: item.quantity
        })
      }

      // حساب السعر والخصم
      const basePrice = item.customPrice !== undefined && item.customPrice > 0 ? item.customPrice : product.price
      const discountPct = item.customDiscount !== undefined ? item.customDiscount : (product.discount || 0)
      const discountedPiecePrice = basePrice * (1 - (discountPct / 100))
      const totalLinePrice = neededPieces * discountedPiecePrice

      readyItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        price: discountedPiecePrice,
        discountPercent: discountPct,
        totalLinePrice,
        neededPieces
      })
    }

    if (insufficientStockItems.length > 0) {
      return {
        success: false,
        error: `الرصيد لا يكفي لبعض الأصناف المغلقة (CLOSED):\n` +
          insufficientStockItems.slice(0, 5).map(i => `• موديل ${i.modelNo} (${i.color}): مطلوب ${i.requested} سرية - متاح ${i.available} سرية`).join('\n')
      }
    }

    const orderTotalAmount = readyItemsData.reduce((sum, item) => sum + item.totalLinePrice, 0)

    // 5. حفظ الفاتورة وتحديث المخزون والخزينة في Transaction واحدة
    const newOrder = await prisma.$transaction(async (tx) => {
      // أ) إنشاء الأوردر
      const order = await tx.order.create({
        data: {
          userId,
          customerId,
          totalAmount: orderTotalAmount,
          deposit: deposit || 0,
          currency,
          safeId: deposit > 0 ? safeId : null,
          notes: notes || 'فاتورة مجمعة (رفع من ملف إكسيل)',
          isDeferredCustomer,
        },
        include: { customer: true }
      })

      // ب) إدراج بنود الفاتورة OrderItem
      const orderItems = readyItemsData.map(item => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        discountPercent: item.discountPercent
      }))
      await tx.orderItem.createMany({ data: orderItems })

      // ج) خصم رصيد المخزون currentStock للأصناف غير المفتوحة
      const productsToUpdate = readyItemsData.filter(item => {
        const prod = productsInDb.find(p => p.id === item.productId)
        return prod && prod.status !== 'OPEN'
      })

      if (productsToUpdate.length > 0) {
        const caseStatement = productsToUpdate
          .map(i => `WHEN id = '${i.productId}' THEN "currentStock" - ${i.neededPieces}`)
          .join(' ')
        const idList = productsToUpdate.map(i => `'${i.productId}'`).join(',')
        const query = `UPDATE "Product" SET "currentStock" = CASE ${caseStatement} END WHERE id IN (${idList})`
        await tx.$executeRawUnsafe(query)
      }

      // د) إنشاء حركة سند قبض في الخزينة إن وجد تحصيل/عربون
      if (deposit > 0 && safeId) {
        await tx.payment.create({
          data: {
            type: 'PAYMENT_COLLECTION',
            amount: deposit,
            currency,
            safeId,
            userId,
            customerId,
            description: `تحصيل دفعة للفاتورة المجمعة #${order.orderNo} للعميل: ${order.customer.name}`
          }
        })
      }

      return order
    }, {
      maxWait: 15000,
      timeout: 60000
    })

    // تحديث مسارات التطبيق
    revalidatePath('/')
    revalidatePath('/orders/list')
    revalidatePath('/admin/products')
    revalidatePath('/admin/notifications')
    revalidatePath('/admin/reports')
    revalidatePath('/admin/cash-management')
    revalidatePath('/sorting')
    revalidatePath('/sorting-cut')

    return {
      success: true,
      orderId: newOrder.id,
      orderNo: newOrder.orderNo,
      totalAmount: orderTotalAmount,
      itemsCount: readyItemsData.length
    }
  } catch (error: any) {
    console.error('Error creating bulk order:', error)
    return { success: false, error: error.message || 'حدث خطأ غير متوقع أثناء معالجة الفاتورة.' }
  }
}