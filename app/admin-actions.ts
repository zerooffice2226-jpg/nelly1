'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ==========================================
// 1. إدارة المستخدمين (Users)
// ==========================================

export async function addUser(data: { code: string; name: string; password: string; role: string }) {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await prisma.user.create({
      data: {
        code: data.code,
        name: data.name,
        password: hashedPassword,
        role: data.role,
      },
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch {
    return { success: false, error: 'الكود مستخدم من قبل' };
  }
}

export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({ where: { id } });
    revalidatePath('/admin/users');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function updateUser(id: string, data: { code: string; name: string; role: string }) {
  try {
    const existingUser = await prisma.user.findFirst({
      where: { code: data.code, NOT: { id } },
    });
    if (existingUser) return { success: false, error: 'الكود مستخدم من قبل' };

    await prisma.user.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        role: data.role,
      },
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch {
    return { success: false, error: 'تعذر تعديل المستخدم' };
  }
}

export async function getUsers() {
  const users = await prisma.user.findMany({ orderBy: { id: 'desc' } });
  return JSON.parse(JSON.stringify(users));
}

// ==========================================
// 2. إدارة المنتجات (Products) الموحدة
// ==========================================

export async function addProduct(data: {
  modelNo: string;
  description?: string;
  material?: string;
  price: string | number;
  discount?: string | number;
  status?: string;
  group_name?: string;
  kind_name?: string;
  image?: string;
  colors: Array<{ color: string; stock: string | number }>;
}) {
  try {
    for (const item of data.colors) {
      const cleanColor = String(item.color).trim();
      const finalMaterial = (data.material && data.material.trim() !== "")
        ? data.material.trim()
        : `${data.modelNo}${cleanColor}`.trim();

      await prisma.product.upsert({
        where: {
          modelNo_color: {
            modelNo: data.modelNo.trim(),
            color: cleanColor,
          },
        },
        update: {
          stockQty: { increment: parseInt(String(item.stock), 10) || 0 },
          currentStock: { increment: parseInt(String(item.stock), 10) || 0 },
          price: parseFloat(String(data.price)) || 0,
          discount: parseFloat(String(data.discount)) || 0,
          material: finalMaterial,
          description: data.description || '',
          group_name: data.group_name || undefined,
          kind_name: data.kind_name || undefined,
          image: data.image || undefined,
        },
        create: {
          modelNo: data.modelNo.trim(),
          description: data.description || '',
          material: finalMaterial,
          price: parseFloat(String(data.price)) || 0,
          discount: parseFloat(String(data.discount)) || 0,
          color: cleanColor,
          stockQty: parseInt(String(item.stock), 10) || 0,
          currentStock: parseInt(String(item.stock), 10) || 0,
          status: data.status || 'OPEN',
          group_name: data.group_name || null,
          kind_name: data.kind_name || null,
          image: data.image || null,
        },
      });
    }
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    revalidatePath('/admin/reports');
    return { success: true };
  } catch (e: unknown) {
    console.error(e);
    return { success: false, error: 'حدث خطأ أثناء الإضافة التراكمية' };
  }
}

export async function updateProduct(id: string, data: {
  modelNo: string;
  description?: string;
  material?: string;
  color: string;
  price: string | number;
  discount?: string | number;
  stockQty: string | number;
  status: string;
  group_name?: string;
  kind_name?: string;
  image?: string;
}) {
  try {
    const cleanColor = String(data.color).trim();
    const finalMaterial = (data.material && data.material.trim() !== "")
      ? data.material.trim()
      : `${data.modelNo}${cleanColor}`.trim();

    await prisma.product.update({
      where: { id },
      data: {
        modelNo: data.modelNo.trim(),
        description: data.description || '',
        material: finalMaterial,
        color: cleanColor,
        price: parseFloat(String(data.price)) || 0,
        discount: parseFloat(String(data.discount)) || 0,
        stockQty: parseInt(String(data.stockQty), 10) || 0,
        currentStock: parseInt(String(data.stockQty), 10) || 0,
        status: data.status,
        group_name: data.group_name || undefined,
        kind_name: data.kind_name || undefined,
        image: data.image || undefined,
      },
    });
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    return { success: true };
  } catch {
    return { success: false, error: 'فشل التعديل' };
  }
}

export async function addBulkProducts(products: Record<string, unknown>[]) {
  try {
    let count = 0;
    for (const p of products) {
      const modelNo = String(p.modelNo || p.master_code || '').trim();
      const color = String(p.color || '').trim();

      if (modelNo && color) {
        const productStatus = (p.status && String(p.status).toUpperCase() === 'CLOSED') ? 'CLOSED' : 'OPEN';
        const finalMaterial = (p.material && String(p.material).trim() !== '')
          ? String(p.material).trim()
          : `${modelNo}${color}`.trim();

        const stockVal = parseInt(String(p.stockQty || p.cur_qty || 0), 10) || 0;
        const priceVal = parseFloat(String(p.price || p.out_price || 0)) || 0;
        const discountVal = parseFloat(String(p.discount || 0)) || 0;
        const descVal = String(p.description || p.item_name || '');
        const groupVal = String(p.group_name || '');
        const kindVal = String(p.kind_name || '');
        const imageVal = String(p.images || p.image || '');

        await prisma.product.upsert({
          where: {
            modelNo_color: {
              modelNo,
              color,
            },
          },
          update: {
            stockQty: { increment: stockVal },
            currentStock: { increment: stockVal },
            price: priceVal > 0 ? priceVal : undefined,
            discount: discountVal,
            description: descVal || undefined,
            material: finalMaterial,
            status: productStatus,
            group_name: groupVal || undefined,
            kind_name: kindVal || undefined,
            image: imageVal || undefined,
          },
          create: {
            modelNo,
            description: descVal,
            material: finalMaterial,
            color,
            price: priceVal,
            discount: discountVal,
            stockQty: stockVal,
            currentStock: stockVal,
            status: productStatus,
            group_name: groupVal || null,
            kind_name: kindVal || null,
            image: imageVal || null,
          },
        });
        count++;
      }
    }
    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    return { success: true, count };
  } catch {
    return { success: false, error: 'حدث خطأ أثناء الاستيراد التراكمي' };
  }
}

// ==========================================
// قسم المزامنة مع جوجل شيت (Google Sheets Sync)
// ==========================================

export async function syncFromGoogleSheets(startDateStr: string) {
  try {
    const SYNC_START_DATE = new Date(startDateStr);
    if (isNaN(SYNC_START_DATE.getTime())) throw new Error("التاريخ المختار غير صحيح");

    const SHEET_ID = "1EhPqEOYOzoLREVC3IMsjmXiPP5WXTjhF5_DJxVOcI2M";
    const GID = "2110927030";
    const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error("فشل الاتصال بجوجل شيت");
    const csvText = await response.text();

    const lines = csvText.split("\n");
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1);

    const syncOp = await prisma.syncOperation.create({
      data: { startDate: SYNC_START_DATE },
    });

    let processedCount = 0;

    for (const row of rows) {
      const values = row.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map((v) => v.replace(/^\"|\"$/g, '').trim());
      if (values.length < headers.length) continue;

      const data: Record<string, string> = {};
      headers.forEach((header, index) => { data[header] = values[index]; });

      const rowDate = new Date(data["datetime"]);
      if (rowDate < SYNC_START_DATE) continue; 
      if (data["tasneef"] !== "اساسي") continue;

      const modelCodes = (data["model code"] || "").split("-").map((m: string) => m.trim()).filter((m: string) => m !== "");
      const totalPieces = (parseInt(data["raqty"], 10) || 0) * 4;

      for (const modelNo of modelCodes) {
        const compositeKey = `${data["id"]}-${modelNo}`;

        const existingRecord = await prisma.syncRecord.findUnique({
          where: { uniqueKey: compositeKey },
        });
        if (existingRecord) continue;

        const product = await prisma.product.findFirst({
          where: { modelNo: modelNo, material: data["khcode"] },
        });

        if (product) {
          await prisma.product.update({
            where: { id: product.id },
            data: { stockQty: { increment: totalPieces }, currentStock: { increment: totalPieces } },
          });

          await prisma.syncRecord.create({
            data: {
              syncOperationId: syncOp.id,
              productId: product.id,
              quantityAdded: totalPieces,
              uniqueKey: compositeKey,
            },
          });
          processedCount++;
        }
      }
    }

    if (processedCount > 0) {
      await prisma.syncOperation.update({
        where: { id: syncOp.id },
        data: { itemsCount: processedCount },
      });
    } else {
      await prisma.syncOperation.delete({ where: { id: syncOp.id } });
      return { success: true, message: `لم يتم العثور على حركات جديدة لسحبها.` };
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');

    return { 
      success: true, 
      message: `تم سحب ${processedCount} حركة جديدة بنجاح.`,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "خطأ غير متوقع";
    return { success: false, error: errorMsg };
  }
}

export async function getSyncOperations() {
  const ops = await prisma.syncOperation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return JSON.parse(JSON.stringify(ops));
}

export async function revertSyncOperation(operationId: string) {
  try {
    const records = await prisma.syncRecord.findMany({
      where: { syncOperationId: operationId },
    });

    for (const record of records) {
      await prisma.product.update({
        where: { id: record.productId },
        data: {
          stockQty: { decrement: record.quantityAdded },
          currentStock: { decrement: record.quantityAdded },
        },
      });
    }

    await prisma.syncOperation.delete({ where: { id: operationId } });

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    return { success: true };
  } catch {
    return { success: false, error: 'حدث خطأ أثناء التراجع عن المزامنة.' };
  }
}

export async function deleteProduct(id: string) {
  try {
    await prisma.product.delete({ where: { id } });
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    return { success: true };
  } catch {
    return { success: false, error: 'لا يمكن حذف الصنف لأنه موجود في طلبات سابقة' };
  }
}

export async function deleteBulkProducts(ids: string[]) {
  try {
    const res = await prisma.product.deleteMany({
      where: {
        id: { in: ids },
        orderItems: { none: {} },
      },
    });
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    return { success: true, deleted: res.count, failed: ids.length - res.count };
  } catch {
    return { success: false, error: 'حدث خطأ أثناء الحذف' };
  }
}

export async function deleteAllProducts() {
  try {
    const res = await prisma.product.deleteMany({
      where: {
        orderItems: { none: {} },
      },
    });
    const remaining = await prisma.product.count();
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    return { success: true, deleted: res.count, failed: remaining };
  } catch {
    return { success: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function getProducts() {
  const products = await prisma.product.findMany({ orderBy: { id: 'desc' }, take: 5000 });
  return JSON.parse(JSON.stringify(products));
}

// ==========================================
// 3. إدارة العملاء (Customers)
// ==========================================

export async function addCustomer(data: {
  name: string;
  phone?: string;
  phone2?: string;
  code?: string;
  address?: string;
  source?: string;
  force?: boolean;
}) {
  try {
    const { name, phone, phone2, code, source, force } = data;
    const normalizedInputName = name.replace(/[أإآ]/g, 'ا');
    const existingByName: Array<{ name: string }> = await prisma.$queryRaw`
      SELECT name FROM "Customer" 
      WHERE TRANSLATE(name, 'أإآ', 'ااا') = ${normalizedInputName}
      LIMIT 1
    `;

    if (existingByName.length > 0) {
      return { success: false, error: `الاسم موجود مسبقاً باسم: (${existingByName[0].name})` };
    }

    if (!force) {
      const phonesToCheck = [phone, phone2].filter((p): p is string => Boolean(p && p.trim() !== ""));
      if (phonesToCheck.length > 0) {
        const existingByPhone = await prisma.customer.findFirst({
          where: {
            OR: [
              { phone: { in: phonesToCheck } },
              { phone2: { in: phonesToCheck } },
            ],
          },
          select: { name: true },
        });

        if (existingByPhone) {
          return { success: false, warning: true, existingName: existingByPhone.name };
        }
      }
    }

    let finalCode = code;
    if (!finalCode || finalCode.trim() === "") {
      finalCode = "C-" + Date.now().toString().slice(-6);
    }

    const customer = await prisma.customer.create({
      data: {
        code: finalCode,
        name,
        phone: phone || null,
        phone2: phone2 || null,
        address: data.address || '',
        source: source || 'ADMIN',
      },
    });
    revalidatePath('/admin/customers');
    return { success: true, customer: JSON.parse(JSON.stringify(customer)) };
  } catch {
    return { success: false, error: 'كود العميل مكرر أو خطأ في البيانات' };
  }
}

export async function updateCustomer(id: string, data: {
  code: string;
  name: string;
  phone?: string;
  phone2?: string;
  address?: string;
}) {
  try {
    await prisma.customer.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        phone: data.phone,
        phone2: data.phone2,
        address: data.address,
      },
    });
    revalidatePath('/admin/customers');
    return { success: true };
  } catch {
    return { success: false, error: 'حدث خطأ أثناء التعديل' };
  }
}

export async function addBulkCustomers(customers: Array<{
  code: string;
  name: string;
  phone?: string;
  phone2?: string;
  address?: string;
}>) {
  try {
    let count = 0;
    for (const c of customers) {
      if (c.code && c.name) {
        await prisma.customer.upsert({
          where: { code: String(c.code) },
          update: {
            name: c.name,
            phone: String(c.phone || ''),
            phone2: String(c.phone2 || ''),
            address: c.address || '',
          },
          create: {
            code: String(c.code),
            name: c.name,
            phone: String(c.phone || ''),
            phone2: String(c.phone2 || ''),
            address: c.address || '',
            source: 'ADMIN',
          },
        });
        count++;
      }
    }
    revalidatePath('/admin/customers');
    return { success: true, count };
  } catch {
    return { success: false, error: 'حدث خطأ أثناء الاستيراد' };
  }
}

export async function deleteCustomer(id: string) {
  try {
    await prisma.customer.delete({ where: { id } });
    revalidatePath('/admin/customers');
    return { success: true };
  } catch {
    return { success: false, error: 'لا يمكن حذف العميل لوجود معاملات سابقة' };
  }
}

export async function deleteBulkCustomers(ids: string[]) {
  try {
    const res = await prisma.customer.deleteMany({
      where: {
        id: { in: ids },
        orders: { none: {} },
        payments: { none: {} },
      },
    });
    revalidatePath('/admin/customers');
    return { success: true, deleted: res.count, failed: ids.length - res.count };
  } catch {
    return { success: false, error: 'حدث خطأ في قاعدة البيانات' };
  }
}

export async function deleteAllCustomers() {
  try {
    const totalBefore = await prisma.customer.count();
    const res = await prisma.customer.deleteMany({
      where: {
        orders: { none: {} },
        payments: { none: {} },
      },
    });
    const remaining = totalBefore - res.count;
    revalidatePath('/admin/customers');
    return { success: true, deleted: res.count, failed: remaining };
  } catch {
    return { success: false, error: 'حدث خطأ غير متوقع', deleted: 0, failed: 0 };
  }
}

export async function getAdminCustomers() {
  const custs = await prisma.customer.findMany({ orderBy: { id: 'desc' }, take: 2000 });
  return JSON.parse(JSON.stringify(custs));
}

// ==========================================
// 4. نظام الإشعارات (Notifications)
// ==========================================

export async function getLowStockClosedCount() {
  try {
    const count = await prisma.product.count({
      where: {
        status: 'CLOSED',
        currentStock: { lte: 4 },
      },
    });
    return count;
  } catch {
    return 0;
  }
}

export async function getLowStockClosedItems() {
  try {
    const items = await prisma.product.findMany({
      where: {
        status: "CLOSED",
        currentStock: { lte: 4 },
      },
      select: {
        id: true,
        modelNo: true,
        color: true,
        currentStock: true,
        price: true,
        isStockAlertRead: true,
      },
      orderBy: {
        currentStock: 'asc',
      },
    });
    return items;
  } catch {
    return [];
  }
}

// ==========================================
// 5. إدارة النقدية ودفتر الأستاذ (Cash Management & Ledger)
// ==========================================

export async function getPayments() {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        safe: true,
        targetSafe: true,
        customer: true,
        user: true,
      },
      take: 200,
    });

    const processedPayments = payments.map((p) => ({
      ...p,
      isDownPayment: p.description ? p.description.startsWith('تحصيل دفعة للأوردر') : false,
    }));

    return { success: true, data: JSON.parse(JSON.stringify(processedPayments)) };
  } catch (e) {
    console.error("Failed to fetch payments ledger:", e);
    return { success: false, error: 'Failed to fetch payments.' };
  }
}

export async function updatePayment(id: string, data: {
  amount: string | number;
  description?: string;
  type: string;
  currency?: string;
  safeId: string;
  targetSafeId?: string | null;
  customerId?: string | null;
}) {
  try {
    await prisma.payment.update({
      where: { id },
      data: {
        amount: parseFloat(String(data.amount)),
        description: data.description,
        type: data.type,
        currency: data.currency,
        safeId: data.safeId,
        targetSafeId: data.targetSafeId,
        customerId: data.customerId,
      },
    });
    revalidatePath('/admin/cash-management');
    revalidatePath('/admin/reports');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update payment.' };
  }
}

export async function deletePayment(id: string) {
  try {
    await prisma.payment.delete({ where: { id } });
    revalidatePath('/admin/cash-management');
    revalidatePath('/admin/reports');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete payment.' };
  }
}