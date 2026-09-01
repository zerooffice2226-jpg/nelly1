'use server'

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export async function getInventoryReport() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { modelNo: 'asc' },
      include: {
        orderItems: {
          where: { order: { isDeferredCustomer: false } },
          include: { order: { include: { customer: true } } }
        }
      }
    });

    const report = products.map(p => {
        const initial = p.stockQty || 0;
        const totalSoldPieces = p.orderItems.reduce((acc, item) => acc + ((item.quantity || 0) * 4), 0);
        const logicalCurrentStock = initial - totalSoldPieces;

        return {
            id: p.id,
            modelNo: p.modelNo,
            material: p.material,
            color: p.color,
            initialStock: initial,
            totalSold: totalSoldPieces,
            currentStock: logicalCurrentStock,
            totalSoldValue: p.orderItems.reduce((acc, item) => acc + ((item.quantity || 0) * 4 * (item.price || 0)), 0),
            currentValue: logicalCurrentStock * (p.price || 0),
            price: p.price,
            status: p.status,
            history: p.orderItems.map(item => ({
                orderNo: item.order.orderNo,
                date: item.order.createdAt,
                customer: item.order.customer.name,
                quantity: (item.quantity || 0) * 4,
                price: item.price
            }))
        };
    });

    const summary = {
      totalItems: report.length,
      totalInitialStock: report.reduce((acc, item) => acc + item.initialStock, 0),
       totalInitialStockValue: report.reduce((acc, item) => acc + (item.initialStock * (item.price || 0)), 0),
      totalCurrentStock: report.reduce((acc, item) => acc + item.currentStock, 0),
      totalSoldUnits: report.reduce((acc, item) => acc + item.totalSold, 0), 
      totalSalesValue: report.reduce((acc, item) => acc + item.totalSoldValue, 0),
      totalValue: report.reduce((acc, item) => acc + item.currentValue, 0)
    };

    return { success: true, data: report, summary };
  } catch (e) {
    return { success: false, error: 'فشل جلب البيانات' };
  }
}

export async function getSafesList() {
    const safes = await prisma.safe.findMany();
    return JSON.parse(JSON.stringify(safes));
}

export async function getSafeLedger(safeId: string, startDate?: string, endDate?: string) {
  try {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59); 
        dateFilter.lte = end;
    }

    const payments = await prisma.payment.findMany({
      where: {
        OR: [ { safeId: safeId }, { targetSafeId: safeId } ],
        createdAt: startDate || endDate ? dateFilter : undefined,
        type: {
          notIn: ['PAYMENT_COLLECTION']
        }
      },
      include: { customer: true, user: true, safe: true, targetSafe: true }
    });

    const orders = await prisma.order.findMany({
      where: { 
          safeId, 
          deposit: { gt: 0 }, 
          isDeferredCustomer: false,
          createdAt: startDate || endDate ? dateFilter : undefined 
      },
      include: { customer: true, user: true }
    });

    let transactions: any[] = [];

    payments.forEach((p: any) => {
        let desc = '';
        let inAmt = 0;
        let outAmt = 0;
        let typeLabel = '';

        if (p.type === 'IN') {
             typeLabel = 'سند قبض';
             const custName = p.customer?.name || 'عميل';
             desc = p.description || (p.customer ? `إيصال #${p.receiptNo} - ${custName}` : `إيصال #${p.receiptNo}`);
             inAmt = p.amount;
        } else if (p.type === 'OUT') {
             typeLabel = 'سند صرف';
             desc = p.description || 'مصروفات';
             outAmt = p.amount;
        } else if (p.type === 'TRANSFER') {
             if (p.safeId === safeId) {
                typeLabel = 'تحويل صادر';
                const targetName = p.targetSafe?.name || 'غير معروف';
                desc = `تحويل إلى: ${targetName} - ${p.description || ''}`;
                outAmt = p.amount;
             } else {
                typeLabel = 'تحويل وارد';
                const sourceName = p.safe?.name || 'غير معروف';
                desc = `تحويل من: ${sourceName} - ${p.description || ''}`;
                inAmt = p.amount;
             }
        }

        if (typeLabel) {
            transactions.push({
                id: p.id, 
                date: p.createdAt, 
                type: typeLabel,
                description: desc,
                currency: p.currency || 'EGP',
                inAmount: inAmt, 
                outAmount: outAmt, 
                user: p.user.name
            });
        }
    });

    orders.forEach(o => {
        transactions.push({
            id: o.id, 
            date: o.createdAt, 
            type: 'عربون أوردر',
            description: `أوردر #${o.orderNo} - ${o.customer.name}`,
            currency: o.currency || 'EGP',
            inAmount: o.deposit, 
            outAmount: 0, 
            user: o.user.name
        });
    });

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const summaryByCurrency: any = {};
    transactions.forEach(t => {
        const curr = t.currency;
        if (!summaryByCurrency[curr]) {
            summaryByCurrency[curr] = { in: 0, out: 0, balance: 0 };
        }
        summaryByCurrency[curr].in += t.inAmount;
        summaryByCurrency[curr].out += t.outAmount;
        summaryByCurrency[curr].balance += (t.inAmount - t.outAmount);
    });

    return { 
        success: true, 
        data: transactions, 
        summaryGrouped: summaryByCurrency 
    };

  } catch (e) {
    console.error(e);
    return { success: false, error: 'فشل جلب دفتر الخزنة' };
  }
}

export async function getWarehouseReport(startDate?: string, endDate?: string) {
  try {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      dateFilter.lte = end;
    }

    const where = startDate || endDate ? { date: dateFilter } : {};

    const receipts = await prisma.warehouseReceipt.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { warehouseSyncRecord: true }
    });

    const detail = receipts.map(r => ({
      uniqueid: r.uniqueid,
      date: r.date,
      empName: r.empName || 'غير محدد',
      modelNo: r.modelNo,
      most: r.most,
      color: r.color || '-',
      synced: !!r.warehouseSyncRecord
    }));

    const totalQuantity = receipts.reduce((acc, r) => acc + (r.most || 0), 0);

    const byModelMap: any = {};
    const byEmployeeMap: any = {};
    receipts.forEach(r => {
      const m = r.modelNo || '-';
      if (!byModelMap[m]) byModelMap[m] = { modelNo: m, receipts: 0, quantity: 0, lastDate: null };
      byModelMap[m].receipts += 1;
      byModelMap[m].quantity += (r.most || 0);
      if (!byModelMap[m].lastDate || r.date > byModelMap[m].lastDate) byModelMap[m].lastDate = r.date;

      const e = r.empName || 'غير محدد';
      if (!byEmployeeMap[e]) byEmployeeMap[e] = { empName: e, receipts: 0, quantity: 0 };
      byEmployeeMap[e].receipts += 1;
      byEmployeeMap[e].quantity += (r.most || 0);
    });

    const byModel = Object.values(byModelMap).sort((a: any, b: any) => b.quantity - a.quantity);
    const byEmployee = Object.values(byEmployeeMap).sort((a: any, b: any) => b.quantity - a.quantity);

    const summary = {
      totalReceipts: receipts.length,
      totalQuantity,
      uniqueModels: byModel.length,
      uniqueEmployees: byEmployee.length
    };

    return { success: true, data: detail, byModel, byEmployee, summary };
  } catch (e) {
    console.error(e);
    return { success: false, error: 'فشل جلب تقرير المستودع' };
  }
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u200c\u200b]/g, '')
    .replace(/[\s_\-()]+/g, '');
}

function getRowValue(row: Record<string, any>, aliases: string[]) {
  const keyMap = new Map<string, any>();

  Object.entries(row ?? {}).forEach(([key, value]) => {
    const normalized = normalizeHeader(key);
    if (normalized) keyMap.set(normalized, value);
  });

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const value = keyMap.get(normalizedAlias);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return undefined;
}

export async function clearWarehouseReceipts() {
  try {
    const result = await prisma.warehouseReceipt.deleteMany({});
    return { success: true, deleted: result.count };
  } catch (e) {
    console.error(e);
    return { success: false, error: 'فشل حذف جميع إيصالات المستودع' };
  }
}

export async function bulkUploadWarehouseReceipts(receiptsData: any[]) {
  try {
    if (!Array.isArray(receiptsData) || receiptsData.length === 0) {
      return { success: false, error: 'لا توجد بيانات لإضافتها' };
    }

    const plainRows = receiptsData
      .map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          return {};
        }

        const safeRow: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
            safeRow[String(key)] = value == null ? '' : value;
          }
        });

        return JSON.parse(JSON.stringify(safeRow));
      })
      .filter((row) => row && Object.keys(row).length > 0);

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const seenUniqueIds = new Set<string>();

    for (let index = 0; index < plainRows.length; index++) {
      const row = plainRows[index];

      const rawUniqueId = getRowValue(row, ['uniqueid', 'معرف', 'معرف فريد', 'معرف فريد (uniqueid)', 'معرف فريد (uniqueId)']);
      const uniqueid = rawUniqueId == null ? '' : String(rawUniqueId).trim();
      const dateStr = getRowValue(row, ['date', 'التاريخ', 'التاريخ (date)', 'تاريخ']);
      const empName = getRowValue(row, ['empName', 'emp name', 'اسم الموظف', 'اسم الموظف (emp name)', 'الموظف']) ?? '';
      const modelNo = getRowValue(row, ['modelNo', 'model no', 'كود الموديل', 'كود الموديل (model no)', 'موديل', 'model']);
      const mostStr = getRowValue(row, ['most', 'الكمية', 'الكمية (most)', 'quantity', 'qty']);
      const color = getRowValue(row, ['color', 'tadakhol', 'اللون', 'اللون (tadakhol)', 'التداخل']) ?? null;

      if (!uniqueid || !modelNo || !dateStr) {
        errors.push(`صف ناقص (معرف: ${uniqueid || '؟'}) - يجب توفر المعرف والتاريخ والموديل`);
        continue;
      }

      if (seenUniqueIds.has(uniqueid)) {
        skipped++;
        errors.push(`معرف مكرر داخل الملف: ${uniqueid}`);
        continue;
      }
      seenUniqueIds.add(uniqueid);

      const itemDate = new Date(dateStr);
      if (isNaN(itemDate.getTime())) {
        errors.push(`تاريخ غير صالح في السجل ${uniqueid}`);
        continue;
      }

      const parsedMost = parseInt(mostStr);
      if (isNaN(parsedMost)) {
        errors.push(`كمية غير صالحة في السجل ${uniqueid}`);
        continue;
      }

      const existing = await prisma.warehouseReceipt.findUnique({
        where: { uniqueid }
      });

      if (existing) {
        skipped++;
        errors.push(`معرف موجود مسبقاً في قاعدة البيانات: ${uniqueid}`);
        continue;
      }

      try {
        await prisma.warehouseReceipt.create({
          data: {
            uniqueid,
            date: itemDate,
            empName: String(empName || ''),
            modelNo: String(modelNo),
            most: parsedMost,
            color: color ? String(color) : null
          }
        });
        inserted++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          skipped++;
        } else {
          errors.push(`فشل إضافة ${uniqueid}: ${e.message}`);
        }
      }
    }

    if (inserted > 0) {
      return {
        success: true,
        inserted,
        skipped,
        errors,
        partial: skipped > 0 || errors.length > 0
      };
    }

    if (errors.length > 0) {
      return {
        success: false,
        inserted: 0,
        skipped,
        errors,
        error: errors.slice(0, 3).join(' | ') || 'فشل الرفع الجماعي'
      };
    }

    return { success: true, inserted, skipped, errors };
  } catch (e: any) {
    const message = e instanceof Error ? e.message : 'فشل الرفع الجماعي';
    console.error('Warehouse bulk upload failed:', e);
    return { success: false, error: `فشل الرفع الجماعي: ${message}` };
  }
}

export async function getEmployeePerformance() {
    try {
        const users = await prisma.user.findMany({
            include: {
                orders: {
                  where: { isDeferredCustomer: false },
                    include: { items: true }
                }
            }
        });

        const report = users.map(user => {
            const orderCount = user.orders.length;
            const totalSales = user.orders.reduce((sum, o) => sum + o.totalAmount, 0);
            
            let totalDiscountValue = 0;
            user.orders.forEach(order => {
                order.items.forEach(item => {
                    if (item.discountPercent > 0) {
                        const finalPrice = item.price;
                        const discountPct = item.discountPercent;
                        const originalPrice = finalPrice / (1 - (discountPct / 100));
                        const discountPerPiece = originalPrice - finalPrice;
                        totalDiscountValue += (discountPerPiece * (item.quantity || 0) * 4);
                    }
                });
                totalDiscountValue += (order.discount || 0);
            });

            return {
                id: user.id,
                name: user.name,
                code: user.code,
                role: user.role,
                orderCount,
                totalSales,
                totalDiscount: Math.round(totalDiscountValue)
            };
        }).filter(u => u.orderCount > 0);

        return { success: true, data: report };
    } catch (e) {
        return { success: false, error: 'فشل جلب أداء الموظفين' };
    }
}
