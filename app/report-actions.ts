'use server'

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export async function getInventoryReport() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { modelNo: 'asc' },
      include: {
        orderItems: {
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

export async function bulkUploadWarehouseReceipts(receiptsData: any[]) {
  try {
    if (!Array.isArray(receiptsData) || receiptsData.length === 0) {
      return { success: false, error: 'لا توجد بيانات لإضافتها' };
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of receiptsData) {
      const uniqueid = row.uniqueid || row.معرف;
      const dateStr = row.date || row.التاريخ;
      const empName = row.empName || row['emp name'] || row.الموظف || row['اسم الموظف'] || '';
      const modelNo = row.modelNo || row['model no'] || row['كود الموديل'] || row.موديل;
      const mostStr = row.most || row.الكمية;
      const color = row.color || row.tadakhol || row.اللون || null;

      if (!uniqueid || !modelNo || !dateStr) {
        errors.push(`صف ناقص (معرف: ${uniqueid || '؟'}) - يجب توفر المعرف والتاريخ والموديل`);
        continue;
      }

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
        where: { uniqueid: String(uniqueid) }
      });

      if (existing) {
        skipped++;
        continue;
      }

      try {
        await prisma.warehouseReceipt.create({
          data: {
            uniqueid: String(uniqueid),
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

    return { success: true, inserted, skipped, errors };
  } catch (e) {
    console.error(e);
    return { success: false, error: 'فشل الرفع الجماعي' };
  }
}

export async function getEmployeePerformance() {
    try {
        const users = await prisma.user.findMany({
            include: {
                orders: {
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
