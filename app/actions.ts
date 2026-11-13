'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'

const prisma = new PrismaClient()

// معامل التحويل (عدد القطع في الدزينة أو الوحدة)
const PIECES_PER_UNIT = 4

// ==========================================
// 0. إدارة الإعدادات (Settings)
// ==========================================

export async function getSettings() {
  let settings = await prisma.settings.findFirst()
  if (!settings) {
    settings = await prisma.settings.create({ data: {} })
  }
  return JSON.parse(JSON.stringify(settings))
}

export async function updateSettings(data: Record<string, unknown>) {
  try {
    const settings = await prisma.settings.findFirst()
    const settingsId = settings ? settings.id : 'new'

    await prisma.settings.upsert({
      where: { id: settingsId },
      update: data,
      create: data,
    })

    revalidatePath('/admin/settings')
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: 'حدث خطأ أثناء تحديث الإعدادات' }
  }
}

// ==========================================
// 1. العملاء (جلب وبحث وتحقق)
// ==========================================

export async function getCustomers() {
  try {
    const customers = await prisma.customer.findMany({ take: 20, orderBy: { name: 'asc' } })
    return JSON.parse(JSON.stringify(customers))
  } catch {
    return []
  }
}

export async function searchCustomers(term: string) {
  if (!term) return []
  const normalizedTerm = term.replace(/[أإآ]/g, 'ا')
  try {
    const customers = await prisma.$queryRaw`
      SELECT id, name, phone, "phone2", address, source 
      FROM "Customer"
      WHERE 
        TRANSLATE(name, 'أإآ', 'ااا') LIKE ${`%${normalizedTerm}%`}
        OR phone LIKE ${`%${term}%`}
        OR "phone2" LIKE ${`%${term}%`}
      LIMIT 50;
    `
    return JSON.parse(JSON.stringify(customers))
  } catch (error) {
    console.error('Search Error:', error)
    return []
  }
}

export async function checkCustomerPhone(phone: string) {
  if (!phone || phone.length < 5) return { exists: false }

  try {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        OR: [{ phone: { contains: phone } }, { phone2: { contains: phone } }],
      },
      select: { name: true, phone: true, phone2: true },
    })

    if (existingCustomer) {
      return {
        exists: true,
        name: existingCustomer.name,
        details: `الرقم مسجل باسم: ${existingCustomer.name}`,
      }
    }

    return { exists: false }
  } catch (error) {
    console.error('Phone Check Error:', error)
    return { exists: false, error: 'حدث خطأ أثناء التحقق' }
  }
}

// ==========================================
// 2. الخزن والمنتجات وتنبيهات المخزون
// ==========================================

export async function getSafes() {
  try {
    const safes = await prisma.safe.findMany({ orderBy: { name: 'asc' } })
    return JSON.parse(JSON.stringify(safes))
  } catch {
    return []
  }
}

export async function getProductsForSearch() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { modelNo: 'asc' },
    })

    const logicalProducts = products.map((p) => {
      return {
        id: p.id,
        modelNo: p.modelNo,
        color: p.color,
        price: p.price,
        // قراءة الرصيد الفعلي الحقيقي المباشر المخصوم منه مبيعات المتجر والمعرض معاً
        currentStock: p.currentStock,
        status: p.status,
        description: p.description,
        discount: p.discount,
      }
    })

    return JSON.parse(JSON.stringify(logicalProducts))
  } catch (error) {
    console.error('Error fetching products for search:', error)
    return []
  }
}

export async function searchProducts(term: string) {
  if (!term || term.length < 2) return []
  try {
    const products = await prisma.product.findMany({
      where: { modelNo: { contains: term, mode: 'insensitive' } },
      orderBy: { modelNo: 'asc' },
    })
    return JSON.parse(JSON.stringify(products))
  } catch {
    return []
  }
}

export async function getAdminStockAlerts() {
  try {
    const lowStockItems = await prisma.product.findMany({
      where: {
        status: 'CLOSED',
        currentStock: {
          lte: 4,
        },
      },
      select: {
        id: true,
        modelNo: true,
        color: true,
        currentStock: true,
        description: true,
      },
      orderBy: {
        currentStock: 'asc',
      },
    })

    return {
      count: lowStockItems.length,
      items: JSON.parse(JSON.stringify(lowStockItems)),
    }
  } catch (error) {
    console.error('Stock Alert Error:', error)
    return { count: 0, items: [] }
  }
}

// ==========================================
// 3. إدارة الأوردرات (Create, Get, Delete, Update)
// ==========================================

export async function createOrder(
  data: {
    customerId: string
    items: Array<{ variants: Array<{ productId: string; quantity: number; price: number; discountPercent?: number }> }>
    total: number
    deposit?: number
    safeId?: string
    currency?: string
    notes?: string
  },
  userId: string
) {
  const { customerId, items, total, deposit = 0, safeId, currency, notes } = data

  if (deposit > 0 && !safeId) {
    return { success: false, error: 'عند وجود دفعة مقدمة، يجب تحديد الخزنة.' }
  }

  const productQuantities = new Map<string, number>()
  const allVariants: Array<{ productId: string; quantity: number; price: number; discountPercent?: number }> = []

  for (const cartItem of items) {
    for (const variant of cartItem.variants) {
      const requestedPieces = variant.quantity * PIECES_PER_UNIT
      productQuantities.set(
        variant.productId,
        (productQuantities.get(variant.productId) || 0) + requestedPieces
      )
      allVariants.push(variant)
    }
  }

  const productIds = Array.from(productQuantities.keys())

  try {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })

    const productMap = new Map(products.map((p) => [p.id, p]))
    const insufficientStockItems: Array<{
      productId: string
      modelNo: string
      color: string
      availableStock: number
      requestedQty: number
    }> = []

    for (const productId of productIds) {
      const product = productMap.get(productId)
      const requestedPieces = productQuantities.get(productId)!

      if (!product) {
        throw new Error(`الصنف بالمعرف ${productId} غير موجود.`)
      }
      if (product.status !== 'OPEN' && product.currentStock < requestedPieces) {
        insufficientStockItems.push({
          productId: product.id,
          modelNo: product.modelNo,
          color: product.color,
          availableStock: Math.floor(product.currentStock / PIECES_PER_UNIT),
          requestedQty: Math.floor(requestedPieces / PIECES_PER_UNIT),
        })
      }
    }

    if (insufficientStockItems.length > 0) {
      return {
        success: false,
        error: 'يوجد أصناف في السلة غير متاحة بالمخزون أو كميتها لا تكفي.',
        insufficientStockItems,
      }
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.create({
          data: {
            userId,
            customerId,
            totalAmount: total,
            deposit: deposit || 0,
            currency: currency || 'EGP',
            notes,
            safeId: deposit > 0 ? safeId : null,
          },
          include: { customer: true },
        })

        const orderItemsData = allVariants.map((variant) => ({
          orderId: order.id,
          productId: variant.productId,
          quantity: variant.quantity,
          price: variant.price,
          discountPercent: variant.discountPercent || 0,
        }))

        await tx.orderItem.createMany({ data: orderItemsData })

        const productsToUpdate = products.filter((p) => p.status !== 'OPEN')
        if (productsToUpdate.length > 0) {
          const caseStatement = productsToUpdate
            .map(
              (p) =>
                `WHEN id = '${p.id}' THEN "currentStock" - ${productQuantities.get(p.id)}`
            )
            .join(' ')

          const idList = productsToUpdate.map((p) => `'${p.id}'`).join(',')
          const query = `UPDATE "Product" SET "currentStock" = CASE ${caseStatement} END WHERE id IN (${idList})`

          await tx.$executeRawUnsafe(query)
        }

        if (deposit > 0) {
          await tx.payment.create({
            data: {
              type: 'PAYMENT_COLLECTION',
              amount: deposit,
              currency: currency || 'EGP',
              safeId: safeId!,
              userId,
              customerId,
              description: `تحصيل دفعة للأوردر رقم #${order.orderNo} للعميل: ${order.customer.name}`,
            },
          })
        }

        return order
      },
      {
        maxWait: 15000,
        timeout: 90000,
      }
    )

    revalidatePath('/')
    revalidatePath('/admin/products')
    revalidatePath('/admin/notifications')
    revalidatePath('/orders/list')
    revalidatePath('/admin/cash-management')

    return { success: true, data: JSON.parse(JSON.stringify(result)) }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'فشل إنشاء الطلب بسبب خطأ غير متوقع.'
    console.error('Error creating order:', error)
    return {
      success: false,
      error: errorMsg,
    }
  }
}

export async function getOrderById(orderId: string) {
  if (!orderId) return null
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            payments: { orderBy: { createdAt: 'desc' } },
          },
        },
        user: true,
        items: { include: { product: true } },
      },
    })
    return JSON.parse(JSON.stringify(order))
  } catch {
    return null
  }
}

export async function deleteOrder(orderId: string) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.image
    if (!userId) {
      return { success: false, error: 'غير مصرح لك بحذف الطلبات' }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'غير مصرح لك بحذف الطلبات' }
    }

    await prisma.$transaction(
      async (tx) => {
        const fulfilledItems = await tx.orderItem.findMany({
          where: { orderId, fulfilledQty: { gt: 0 } },
          include: { product: true },
        })

        if (fulfilledItems.length > 0) {
          const itemDetails = fulfilledItems
            .map((item) => `${item.product.modelNo} (الكمية المصروفة: ${item.fulfilledQty})`)
            .join(', ')
          throw new Error(`لا يمكن حذف الأوردر لوجود أصناف تم صرفها بالفعل: ${itemDetails}`)
        }

        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { orderNo: true, deposit: true, items: true },
        })

        if (!order) {
          throw new Error('لم يتم العثور على الطلب.')
        }

        if (order.deposit && order.deposit > 0) {
          await tx.payment.deleteMany({
            where: {
              description: { contains: `للأوردر رقم #${order.orderNo}` },
              type: 'PAYMENT_COLLECTION',
            },
          })
        }

        if (order.items.length > 0) {
          const caseStatement = order.items
            .map(
              (item) =>
                `WHEN id = '${item.productId}' THEN "currentStock" + ${item.quantity * PIECES_PER_UNIT}`
            )
            .join(' ')

          const idList = order.items.map((item) => `'${item.productId}'`).join(',')
          const query = `UPDATE "Product" SET "currentStock" = CASE ${caseStatement} END WHERE id IN (${idList})`

          await tx.$executeRawUnsafe(query)
        }

        await tx.orderItem.deleteMany({ where: { orderId } })
        await tx.order.delete({ where: { id: orderId } })
      },
      {
        maxWait: 15000,
        timeout: 90000,
      }
    )

    revalidatePath('/orders/list')
    revalidatePath('/admin/notifications')
    revalidatePath('/admin/products')
    revalidatePath('/admin/cash-management')
    return { success: true }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'فشل حذف الطلب'
    console.error('Error deleting order:', error)
    return { success: false, error: errorMsg }
  }
}

export async function toggleDeferredCustomer(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isDeferredCustomer: true },
    })

    if (!order) return { success: false, error: 'لم يتم العثور على الطلب.' }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { isDeferredCustomer: !order.isDeferredCustomer },
      select: { isDeferredCustomer: true },
    })

    revalidatePath('/orders/list')
    revalidatePath('/admin/reports')
    revalidatePath('/admin/cash-management')
    revalidatePath('/sorting')
    revalidatePath('/sorting-cut')

    return { success: true, isDeferredCustomer: updatedOrder.isDeferredCustomer }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'فشل تحديث تمييز العميل'
    console.error('Error toggling deferred customer:', error)
    return { success: false, error: errorMsg }
  }
}

export async function updateOrder(
  orderId: string,
  data: {
    customerId: string
    items: Array<{ variants: Array<{ productId: string; quantity: number; price: number; discountPercent?: number }> }>
    total: number
    deposit?: number
    safeId?: string
    currency?: string
    notes?: string
  }
) {
  const { customerId, items, total, deposit, safeId, currency, notes } = data

  try {
    await prisma.$transaction(
      async (tx) => {
        const oldItems = await tx.orderItem.findMany({
          where: { orderId },
          include: { product: true },
        })

        const newItemsMap = new Map<
          string,
          { quantity: number; price: number; discountPercent: number; productId: string }
        >()

        for (const cartItem of items) {
          for (const variant of cartItem.variants) {
            const key = variant.productId
            if (newItemsMap.has(key)) {
              const existing = newItemsMap.get(key)!
              existing.quantity += variant.quantity
            } else {
              newItemsMap.set(key, {
                productId: variant.productId,
                quantity: variant.quantity,
                price: variant.price,
                discountPercent: variant.discountPercent || 0,
              })
            }
          }
        }

        const oldItemsMap = new Map(oldItems.map((item) => [item.productId, item]))

        const itemsToDelete = oldItems.filter((oldItem) => !newItemsMap.has(oldItem.productId))
        const itemsToAdd: Array<{ productId: string; quantity: number; price: number; discountPercent: number }> = []
        const itemsToUpdate: Array<{
          oldItem: typeof oldItems[0]
          newItem: { productId: string; quantity: number; price: number; discountPercent: number }
        }> = []

        for (const [productId, newItem] of newItemsMap.entries()) {
          if (oldItemsMap.has(productId)) {
            const oldItem = oldItemsMap.get(productId)!
            if (
              oldItem.quantity !== newItem.quantity ||
              oldItem.price !== newItem.price ||
              oldItem.discountPercent !== newItem.discountPercent
            ) {
              itemsToUpdate.push({ oldItem, newItem })
            }
          } else {
            itemsToAdd.push(newItem)
          }
        }

        for (const itemToDelete of itemsToDelete) {
          if (itemToDelete.fulfilledQty > 0) {
            throw new Error(
              `لا يمكن حذف الصنف ${itemToDelete.product.modelNo} لأنه تم صرف كميات منه بالفعل.`
            )
          }
          const piecesToReturn = itemToDelete.quantity * PIECES_PER_UNIT
          await tx.product.update({
            where: { id: itemToDelete.productId },
            data: { currentStock: { increment: piecesToReturn } },
          })
          await tx.orderItem.delete({ where: { id: itemToDelete.id } })
        }

        for (const itemToAdd of itemsToAdd) {
          const requestedPieces = itemToAdd.quantity * PIECES_PER_UNIT
          const product = await tx.product.findUnique({ where: { id: itemToAdd.productId } })
          if (!product) throw new Error(`الصنف ${itemToAdd.productId} غير موجود`)
          if (product.status !== 'OPEN' && product.currentStock < requestedPieces) {
            throw new Error(`عذراً، الكمية نفذت للصنف: ${product.modelNo} - لون: ${product.color}`)
          }
          await tx.product.update({
            where: { id: itemToAdd.productId },
            data: { currentStock: { decrement: requestedPieces } },
          })
          await tx.orderItem.create({
            data: {
              orderId,
              productId: itemToAdd.productId,
              quantity: itemToAdd.quantity,
              price: itemToAdd.price,
              discountPercent: itemToAdd.discountPercent,
            },
          })
        }

        for (const { oldItem, newItem } of itemsToUpdate) {
          if (newItem.quantity < oldItem.fulfilledQty) {
            throw new Error(
              `لا يمكن تخفيض كمية الصنف ${oldItem.product.modelNo} لأقل من الكمية التي تم صرفها (${oldItem.fulfilledQty}).`
            )
          }
          const quantityDifference = newItem.quantity - oldItem.quantity
          const stockDifference = quantityDifference * PIECES_PER_UNIT

          if (stockDifference > 0) {
            const product = await tx.product.findUnique({ where: { id: newItem.productId } })
            if (!product) throw new Error(`الصنف ${newItem.productId} غير موجود`)
            if (product.status !== 'OPEN' && product.currentStock < stockDifference) {
              throw new Error(`عذراً، الكمية الإضافية للصنف ${product.modelNo} غير متاحة.`)
            }
          }

          await tx.product.update({
            where: { id: newItem.productId },
            data: { currentStock: { decrement: stockDifference } },
          })

          await tx.orderItem.update({
            where: { id: oldItem.id },
            data: {
              quantity: newItem.quantity,
              price: newItem.price,
              discountPercent: newItem.discountPercent,
            },
          })
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            customerId,
            totalAmount: total,
            deposit: deposit || 0,
            currency: currency || 'EGP',
            safeId: deposit && deposit > 0 ? safeId : null,
            notes,
          },
        })
      },
      {
        maxWait: 15000,
        timeout: 60000,
      }
    )

    revalidatePath(`/orders/list`)
    revalidatePath(`/orders/${orderId}/edit`)
    revalidatePath('/admin/notifications')
    return { success: true }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'حدث خطأ أثناء تعديل الطلب'
    console.error('Error updating order:', error)
    return { success: false, error: errorMsg }
  }
}

export async function getUserOrders(userId: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    let whereCondition = {}
    if (user?.role !== 'ADMIN' && user?.role !== 'OWNER' && user?.role !== 'ACCOUNTANT') {
      whereCondition = { userId }
    }
    const orders = await prisma.order.findMany({
      where: whereCondition,
      include: {
        customer: true,
        user: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    return { orders: JSON.parse(JSON.stringify(orders)), userRole: user?.role }
  } catch (error) {
    console.error('Error in getUserOrders:', error)
    return { orders: [], userRole: 'EMPLOYEE' }
  }
}

// ==========================================
// 4. إدارة النقدية والموظفين
// ==========================================

export async function createPayment(
  data: {
    type: string
    amount: string | number
    currency?: string
    safeId: string
    customerId?: string | null
    targetSafeId?: string | null
    description?: string
  },
  userId: string
) {
  const { type, amount, currency, safeId, customerId, targetSafeId, description } = data
  try {
    await prisma.payment.create({
      data: {
        type,
        amount: typeof amount === 'number' ? amount : parseFloat(amount),
        currency: currency || 'EGP',
        safeId,
        userId,
        customerId: customerId || null,
        targetSafeId: targetSafeId || null,
        description: description || '',
      },
    })
    revalidatePath('/')
    return { success: true }
  } catch {
    return { success: false, error: 'فشل العملية' }
  }
}

export async function registerEmployee(data: { code: string; name: string; password: string }) {
  try {
    const { code, name, password } = data
    const existingUser = await prisma.user.findUnique({ where: { code } })
    if (existingUser) return { success: false, error: 'كود الموظف مستخدم بالفعل' }

    const hashedPassword = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: { code, name, password: hashedPassword, role: 'EMPLOYEE' },
    })
    return { success: true }
  } catch {
    return { success: false, error: 'حدث خطأ أثناء التسجيل' }
  }
}

export async function getCurrentUser(userId: string) {
  if (!userId) return null
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return JSON.parse(JSON.stringify(user))
  } catch {
    return null
  }
}

// ==========================================
// 5. مزامنة الأوردر مع المتجر الإلكتروني الخارجي (Vooy Store)
// ==========================================

export async function syncOrderToOnlineStore(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });

    if (!order) {
      return { success: false, error: "الأوردر غير موجود" };
    }

    const STORE_API_URL = process.env.STORE_API_URL || "https://www.vooy.shop/api/external/sync-pos-order";
    const SYNC_SECRET = process.env.POS_SYNC_SECRET || "vooy_pos_sync_super_secret_key_2026_xyz";

    const payload = {
      posOrderNo: order.orderNo,
      customerName: order.customer.name,
      customerPhone: order.customer.phone || order.customer.phone2,
      customerAddress: order.customer.address || "",
      totalAmount: order.totalAmount,
      deposit: order.deposit,
      notes: order.notes,
      items: order.items.map((item) => ({
        modelNo: item.product.modelNo,
        color: item.product.color,
        piecesQty: item.quantity * PIECES_PER_UNIT,
        piecePrice: item.price,
      })),
    };

    const response = await fetch(STORE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pos-sync-secret": SYNC_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    let result: { success?: boolean; error?: string; url?: string; orderId?: string };
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Non-JSON Response received:", response.status, responseText.slice(0, 300));
      return {
        success: false,
        error: `استجاب المتجر بكود (${response.status}) بصفحة HTML بدلاً من JSON.\nتأكد أن هذا الرابط يعمل فعلياً:\n${STORE_API_URL}`,
      };
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || `فشل من المتجر (كود ${response.status})`);
    }

    return {
      success: true,
      url: result.url,
      orderId: result.orderId,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "حدث خطأ أثناء الاتصال بالمتجر الإلكتروني";
    console.error("Sync Order To Store Action Error:", errorMsg);
    return { success: false, error: errorMsg };
  }
}