'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function normalizeArabicDigits(val: string): string {
  return val
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

function validateCustomerFields(data: {
  name?: string
  phone?: string
  phone2?: string
  address?: string
}): { valid: true; phone1: string | null; phone2: string | null; name: string; address: string } | { valid: false; error: string } {
  const cleanName = String(data.name || '').trim()
  const cleanAddress = String(data.address || '').trim()
  const rawPhone1 = normalizeArabicDigits(String(data.phone || '').trim())
  const rawPhone2 = normalizeArabicDigits(String(data.phone2 || '').trim())

  if (!cleanName) {
    return { valid: false, error: 'اسم العميل مطلوب.' }
  }

  if (!cleanAddress) {
    return { valid: false, error: 'عنوان العميل مطلوب.' }
  }

  if (!rawPhone1 && !rawPhone2) {
    return { valid: false, error: 'يجب إدخال رقم هاتف واحد على الأقل (11 رقماً على الأقل).' }
  }

  if (rawPhone1) {
    if (!/^[+\d\s()-]+$/.test(rawPhone1)) {
      return { valid: false, error: 'رقم هاتف 1 يحتوي على حروف غير صالحة.' }
    }
    const digits1 = rawPhone1.replace(/\D/g, '')
    if (digits1.length < 11) {
      return { valid: false, error: 'رقم هاتف 1 يجب أن يكون 11 رقماً على الأقل.' }
    }
  }

  if (rawPhone2) {
    if (!/^[+\d\s()-]+$/.test(rawPhone2)) {
      return { valid: false, error: 'رقم هاتف 2 يحتوي على حروف غير صالحة.' }
    }
    const digits2 = rawPhone2.replace(/\D/g, '')
    if (digits2.length < 11) {
      return { valid: false, error: 'رقم هاتف 2 يجب أن يكون 11 رقماً على الأقل.' }
    }
  }

  return {
    valid: true,
    name: cleanName,
    address: cleanAddress,
    phone1: rawPhone1 || null,
    phone2: rawPhone2 || null,
  }
}

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
  size?: string;
  price: string | number;
  discount?: string | number;
  status?: string;
  group_name?: string;
  kind_name?: string;
  image?: string;
  colors: Array<{ color: string; stock: string | number }>;
}) {
  try {
    const cleanSize = data.size ? data.size.trim() : '';

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
          size: cleanSize || undefined,
          group_name: data.group_name || undefined,
          kind_name: data.kind_name || undefined,
          image: data.image || undefined,
        },
        create: {
          modelNo: data.modelNo.trim(),
          description: data.description || '',
          material: finalMaterial,
          size: cleanSize || null,
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
  size?: string;
  applySizeToModel?: boolean;
  color: string;
  price: string | number;
  discount?: string | number;
  stockQty: string | number;
  currentStock?: string | number;
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
    const cleanSize = data.size !== undefined ? (data.size.trim() || null) : undefined;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return { success: false, error: 'الصنف غير موجود' };

    const newCurrentStock =
      data.currentStock !== undefined && data.currentStock !== ''
        ? parseInt(String(data.currentStock), 10) || 0
        : parseInt(String(data.stockQty), 10) || 0;

    const stockDelta = newCurrentStock - existing.currentStock;

    await prisma.product.update({
      where: { id },
      data: {
        modelNo: data.modelNo.trim(),
        description: data.description || '',
        material: finalMaterial,
        ...(cleanSize !== undefined && { size: cleanSize }),
        color: cleanColor,
        price: parseFloat(String(data.price)) || 0,
        discount: parseFloat(String(data.discount)) || 0,
        stockQty: existing.stockQty + stockDelta,
        currentStock: newCurrentStock,
        status: data.status,
        group_name: data.group_name || undefined,
        kind_name: data.kind_name || undefined,
        image: data.image || undefined,
      },
    });

    if (data.applySizeToModel && cleanSize !== undefined) {
      await prisma.product.updateMany({
        where: { modelNo: existing.modelNo },
        data: { size: cleanSize },
      });
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    revalidatePath('/admin/reports');
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
        const sizeVal = String(p.size || '').trim();
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
            size: sizeVal || undefined,
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
            size: sizeVal || null,
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
// 2-ب. إدارة المقاسات الجماعية حسب النطاق (Bulk Size Assignment)
// ==========================================

export type SizeRangeMode = 'AUTO' | 'LAST_2' | 'LAST_3' | 'EXACT' | 'CUSTOM';

export interface BulkSizePayload {
  baseCode: string;
  size?: string;
  mode?: SizeRangeMode;
  customFrom?: string;
  customTo?: string;
  onlyEmpty?: boolean;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildModelRangeSpec(payload: {
  baseCode: string;
  mode?: SizeRangeMode;
  customFrom?: string;
  customTo?: string;
}):
  | {
      valid: true;
      fromCode: string;
      toCode: string;
      matcher: (modelNo: string) => boolean;
    }
  | { valid: false; error: string } {
  const mode: SizeRangeMode = payload.mode || 'AUTO';
  const rawBase = normalizeArabicDigits(String(payload.baseCode || '')).trim();
  const rawFrom = normalizeArabicDigits(String(payload.customFrom || '')).trim();
  const rawTo = normalizeArabicDigits(String(payload.customTo || '')).trim();

  if (mode === 'CUSTOM') {
    if (!rawFrom || !rawTo) {
      return { valid: false, error: 'يجب إدخال كود البداية وكود النهاية للنطاق المخصص.' };
    }

    const mFrom = rawFrom.match(/^(.*?)(\d+)$/);
    const mTo = rawTo.match(/^(.*?)(\d+)$/);

    if (mFrom && mTo && mFrom[1].toLowerCase() === mTo[1].toLowerCase()) {
      const prefix = mFrom[1];
      const numStr1 = mFrom[2];
      const numStr2 = mTo[2];
      const n1 = parseInt(numStr1, 10);
      const n2 = parseInt(numStr2, 10);
      const minN = Math.min(n1, n2);
      const maxN = Math.max(n1, n2);
      const hasLeadingZeroPad =
        numStr1.length === numStr2.length &&
        (numStr1.startsWith('0') || numStr2.startsWith('0'));
      const expectedDigitLen = numStr1.length;

      return {
        valid: true,
        fromCode: n1 <= n2 ? rawFrom : rawTo,
        toCode: n1 <= n2 ? rawTo : rawFrom,
        matcher: (modelNo: string) => {
          const clean = normalizeArabicDigits(modelNo).trim();
          if (prefix === '') {
            if (!/^\d+$/.test(clean)) return false;
            if (hasLeadingZeroPad && clean.length !== expectedDigitLen) return false;
            const val = parseInt(clean, 10);
            return val >= minN && val <= maxN;
          }
          if (!clean.toLowerCase().startsWith(prefix.toLowerCase())) return false;
          const rest = clean.slice(prefix.length);
          if (!/^\d+$/.test(rest)) return false;
          if (hasLeadingZeroPad && rest.length !== expectedDigitLen) return false;
          const val = parseInt(rest, 10);
          return val >= minN && val <= maxN;
        },
      };
    }

    if (rawFrom.toLowerCase() === rawTo.toLowerCase()) {
      return {
        valid: true,
        fromCode: rawFrom,
        toCode: rawTo,
        matcher: (modelNo: string) =>
          normalizeArabicDigits(modelNo).trim().toLowerCase() === rawFrom.toLowerCase(),
      };
    }

    return {
      valid: false,
      error: 'تنسيق النطاق المخصص غير متطابق. مثال صحيح: من 3700 إلى 3750.',
    };
  }

  if (!rawBase) {
    return { valid: false, error: 'أدخل كود الموديل الأساسي (مثال: 3700 أو 600 أو 3000).' };
  }

  if (mode === 'EXACT') {
    return {
      valid: true,
      fromCode: rawBase,
      toCode: rawBase,
      matcher: (modelNo: string) =>
        normalizeArabicDigits(modelNo).trim().toLowerCase() === rawBase.toLowerCase(),
    };
  }

  if (mode === 'LAST_2' || mode === 'LAST_3') {
    const digitsCount = mode === 'LAST_2' ? 2 : 3;
    if (rawBase.length < digitsCount) {
      return {
        valid: false,
        error: `الكود "${rawBase}" أقصر من ${digitsCount} خانات.`,
      };
    }
    const suffixPart = rawBase.slice(-digitsCount);
    if (!/^\d+$/.test(suffixPart)) {
      return {
        valid: false,
        error: `يجب أن ينتهي الكود بـ ${digitsCount} أرقام لتطبيق هذا النطاق.`,
      };
    }
    const prefix = rawBase.slice(0, rawBase.length - digitsCount);
    const fromCode = `${prefix}${'0'.repeat(digitsCount)}`;
    const toCode = `${prefix}${'9'.repeat(digitsCount)}`;
    const regex = new RegExp(`^${escapeRegExp(prefix)}\\d{${digitsCount}}$`, 'i');

    return {
      valid: true,
      fromCode,
      toCode,
      matcher: (modelNo: string) => regex.test(normalizeArabicDigits(modelNo).trim()),
    };
  }

  // AUTO: يكتشف الأصفار في نهاية الكود تلقائياً
  // مثال: 3700 -> 3700..3799 | 600 -> 600..699 | 3000 -> 3000..3999
  const zeroMatch = rawBase.match(/^(.*?)(0+)$/);
  if (zeroMatch && (zeroMatch[1].length > 0 || zeroMatch[2].length >= 2)) {
    const prefix = zeroMatch[1];
    const zerosLen = zeroMatch[2].length;
    const fromCode = rawBase;
    const toCode = `${prefix}${'9'.repeat(zerosLen)}`;
    const regex = new RegExp(`^${escapeRegExp(prefix)}\\d{${zerosLen}}$`, 'i');

    return {
      valid: true,
      fromCode,
      toCode,
      matcher: (modelNo: string) => regex.test(normalizeArabicDigits(modelNo).trim()),
    };
  }

  return {
    valid: true,
    fromCode: rawBase,
    toCode: rawBase,
    matcher: (modelNo: string) =>
      normalizeArabicDigits(modelNo).trim().toLowerCase() === rawBase.toLowerCase(),
  };
}

export async function previewBulkProductSize(payload: Omit<BulkSizePayload, 'size'>) {
  try {
    const spec = buildModelRangeSpec(payload);
    if (!spec.valid) {
      return { success: false as const, error: spec.error };
    }

    const allProducts = await prisma.product.findMany({
      select: { id: true, modelNo: true, size: true },
    });

    const matched = allProducts.filter((p) => spec.matcher(p.modelNo));
    const onlyEmpty = Boolean(payload.onlyEmpty);

    let alreadyHasSizeCount = 0;
    let emptySizeCount = 0;
    const modelsMap = new Map<string, Set<string>>();

    for (const p of matched) {
      const hasSize = Boolean(p.size && p.size.trim() !== '');
      if (hasSize) alreadyHasSizeCount++;
      else emptySizeCount++;

      const key = p.modelNo.trim();
      if (!modelsMap.has(key)) modelsMap.set(key, new Set());
      if (hasSize) modelsMap.get(key)!.add(p.size!.trim());
    }

    const willUpdateCount = onlyEmpty ? emptySizeCount : matched.length;
    const sampleModels = Array.from(modelsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .slice(0, 20)
      .map(([modelNo, sizes]) => ({
        modelNo,
        currentSize: Array.from(sizes).join(' / '),
      }));

    return {
      success: true as const,
      fromCode: spec.fromCode,
      toCode: spec.toCode,
      totalRowsCount: matched.length,
      uniqueModelsCount: modelsMap.size,
      alreadyHasSizeCount,
      emptySizeCount,
      willUpdateCount,
      sampleModels,
    };
  } catch (e) {
    console.error('previewBulkProductSize error:', e);
    return { success: false as const, error: 'تعذر معاينة النطاق.' };
  }
}

export async function applyBulkProductSize(payload: BulkSizePayload) {
  try {
    const cleanSize = String(payload.size || '').trim();
    if (!cleanSize) {
      return { success: false as const, error: 'يرجى كتابة المقاس المطلوب تطبيقه.' };
    }

    const spec = buildModelRangeSpec(payload);
    if (!spec.valid) {
      return { success: false as const, error: spec.error };
    }

    const allProducts = await prisma.product.findMany({
      select: { id: true, modelNo: true, size: true },
    });

    const onlyEmpty = Boolean(payload.onlyEmpty);
    const targetProducts = allProducts.filter((p) => {
      if (!spec.matcher(p.modelNo)) return false;
      if (onlyEmpty && p.size && p.size.trim() !== '') return false;
      return true;
    });

    if (targetProducts.length === 0) {
      return {
        success: false as const,
        error: `لم يتم العثور على أصناف مطابقة للتحديث في النطاق (${spec.fromCode} - ${spec.toCode}).`,
      };
    }

    const ids = targetProducts.map((p) => p.id);
    const uniqueModelsCount = new Set(targetProducts.map((p) => p.modelNo.trim())).size;

    await prisma.$transaction(async (tx) => {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        await tx.product.updateMany({
          where: { id: { in: chunk } },
          data: { size: cleanSize },
        });
      }
    });

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    revalidatePath('/orders/new');

    return {
      success: true as const,
      fromCode: spec.fromCode,
      toCode: spec.toCode,
      updatedCount: ids.length,
      uniqueModelsCount,
    };
  } catch (e) {
    console.error('applyBulkProductSize error:', e);
    return { success: false as const, error: 'حدث خطأ أثناء تطبيق المقاسات.' };
  }
}

export async function clearBulkProductSize(payload: Omit<BulkSizePayload, 'size' | 'onlyEmpty'>) {
  try {
    const spec = buildModelRangeSpec(payload);
    if (!spec.valid) {
      return { success: false as const, error: spec.error };
    }

    const allProducts = await prisma.product.findMany({
      select: { id: true, modelNo: true, size: true },
    });

    const targetProducts = allProducts.filter(
      (p) => spec.matcher(p.modelNo) && Boolean(p.size && p.size.trim() !== '')
    );

    if (targetProducts.length === 0) {
      return {
        success: false as const,
        error: `لا توجد مقاسات مسجلة لمسحها في النطاق (${spec.fromCode} - ${spec.toCode}).`,
      };
    }

    const ids = targetProducts.map((p) => p.id);

    await prisma.$transaction(async (tx) => {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        await tx.product.updateMany({
          where: { id: { in: chunk } },
          data: { size: null },
        });
      }
    });

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    revalidatePath('/orders/new');

    return {
      success: true as const,
      fromCode: spec.fromCode,
      toCode: spec.toCode,
      clearedCount: ids.length,
    };
  } catch (e) {
    console.error('clearBulkProductSize error:', e);
    return { success: false as const, error: 'حدث خطأ أثناء مسح المقاسات.' };
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
    const validation = validateCustomerFields(data);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { name, address, phone1, phone2 } = validation;
    const { code, source, force } = data;

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
      const phonesToCheck = [phone1, phone2].filter((p): p is string => Boolean(p));
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
        code: finalCode.trim(),
        name,
        phone: phone1,
        phone2: phone2,
        address,
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
    const validation = validateCustomerFields(data);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await prisma.customer.update({
      where: { id },
      data: {
        code: String(data.code || '').trim(),
        name: validation.name,
        phone: validation.phone1,
        phone2: validation.phone2,
        address: validation.address,
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