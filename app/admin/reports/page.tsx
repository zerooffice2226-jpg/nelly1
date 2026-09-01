'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getInventoryReport, getSafesList, getSafeLedger, getEmployeePerformance, getWarehouseReport, bulkUploadWarehouseReceipts, clearWarehouseReceipts } from '@/app/report-actions';
import { useSession } from 'next-auth/react';
import * as XLSX from 'xlsx';

const exportToExcel = (data: any[], fileName: string) => {
    if (data.length === 0) {
        alert('لا توجد بيانات حالية في الجدول لتصديرها.');
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

const PRINT_STYLES = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 10mm 8mm 10mm 8mm;
    }

    html, body, #__next, main {
      height: auto !important;
      min-height: 0 !important;
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
      font-size: 18px !important;
    }

    body {
      overflow: visible !important;
      background: white !important;
    }

    body * {
      visibility: hidden !important;
    }

    .print\:hidden,
    .report-controls,
    .report-mode-switch,
    .report-summary,
    .report-table-desktop,
    .report-table-mobile,
    nav,
    aside,
    header,
    footer,
    .no-print {
      display: none !important;
    }

    #inventory-print-root,
    #inventory-print-root * {
      visibility: visible !important;
    }

    #inventory-print-root {
      position: relative !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      display: block !important;
      background: white !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    #inventory-print-root table {
      display: table !important;
      width: 100% !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
      font-size: 18px !important;
    }

    #inventory-print-root thead th,
    #inventory-print-root tbody td {
      font-size: 16px !important;
      padding: 8px 6px !important;
      border: 1px solid #111827 !important;
      text-align: center !important;
      vertical-align: middle !important;
      word-break: break-word !important;
    }

    #inventory-print-root thead {
      background: #020617 !important;
      color: white !important;
    }

    #inventory-print-root thead th {
      font-weight: 900 !important;
      font-size: 17px !important;
    }

    #inventory-print-root tbody tr:nth-child(even) {
      background: #f8fafc !important;
    }

    .required-cut-input,
    .required-cut-button,
    .required-cut-controls {
      display: none !important;
    }

    * {
      box-shadow: none !important;
    }
  }
`;

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'INVENTORY' | 'SAFE' | 'EMPLOYEES' | 'WAREHOUSE'>('INVENTORY');
  const [printMode, setPrintMode] = useState<'TABLE' | 'CARD'>('TABLE');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handlePrintReport = (mode: 'TABLE' | 'CARD') => {
    const printableArea = document.getElementById('printable-area');
    const normalizedMode = mode.toLowerCase();
    if (printableArea) {
      printableArea.setAttribute('data-print-mode', normalizedMode);
      printableArea.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    }
    setPrintMode(mode);
    setTimeout(() => window.print(), 150);
  };
  
  return (
    <div className="min-h-screen print:min-h-0 bg-gray-50 p-4 md:p-6 print:p-0 print:bg-white" dir="rtl">
      {isMounted && <style>{PRINT_STYLES}</style>}

    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 sm:mb-8 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 print:hidden">
        <div className="flex items-center gap-4">
                    <div className="bg-blue-600 p-3 sm:p-4 rounded-2xl shadow-lg shadow-blue-200 text-white">
                        <span className="text-2xl sm:text-3xl">📊</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-4xl font-black text-gray-800 tracking-tight">التقارير والإحصائيات المركزية</h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-1 font-bold">مراقبة المخزون، التدفقات النقدية، وتقييم الموظفين</p>
          </div>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto print:hidden">
            <button 
              onClick={() => {
                const event = new CustomEvent('download-excel');
                window.dispatchEvent(event);
              }}
              className="flex-1 md:flex-none bg-green-700 text-white px-3 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black shadow-xl hover:bg-green-800 transition-all transform active:scale-95 flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-base"
            >
                <span className="text-xl">📄</span>
                <span>تحميل Excel</span>
            </button>

            <button 
              onClick={() => handlePrintReport('TABLE')}
              className="flex-1 md:flex-none bg-slate-900 text-white px-3 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black shadow-xl hover:bg-black transition-all transform active:scale-95 flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-base"
            >
                <span className="text-xl">🖨️</span>
                <span>طباعة جدول</span>
            </button>

            <button 
              onClick={() => handlePrintReport('CARD')}
              className="flex-1 md:flex-none bg-fuchsia-700 text-white px-3 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black shadow-xl hover:bg-fuchsia-800 transition-all transform active:scale-95 flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-base"
            >
                <span className="text-xl">📋</span>
                <span>طباعة كروت</span>
            </button>
        </div>
      </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-5 sm:mb-8 print:hidden">
        <button 
            onClick={() => setActiveTab('INVENTORY')}
            className={`p-3 sm:p-6 text-xs sm:text-base font-black transition-all rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 border ${activeTab === 'INVENTORY' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-lg' : 'bg-white border-gray-100 text-gray-500 hover:border-blue-300 hover:text-blue-600'}`}
        >
            <span className="text-2xl">📦</span>
            المخزون وحركة الأصناف
        </button>
        <button 
            onClick={() => setActiveTab('SAFE')}
            className={`p-3 sm:p-6 text-xs sm:text-base font-black transition-all rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 border ${activeTab === 'SAFE' ? 'bg-green-50 border-green-500 text-green-700 shadow-lg' : 'bg-white border-gray-100 text-gray-500 hover:border-green-300 hover:text-green-600'}`}
        >
            <span className="text-2xl">💰</span>
            حركة الخزنة
        </button>
        <button 
            onClick={() => setActiveTab('EMPLOYEES')}
            className={`p-3 sm:p-6 text-xs sm:text-base font-black transition-all rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 border ${activeTab === 'EMPLOYEES' ? 'bg-purple-50 border-purple-500 text-purple-700 shadow-lg' : 'bg-white border-gray-100 text-gray-500 hover:border-purple-300 hover:text-purple-600'}`}
        >
            <span className="text-2xl">👥</span>
            أداء فريق المبيعات
        </button>
        <button
            onClick={() => setActiveTab('WAREHOUSE')}
            className={`p-3 sm:p-6 text-xs sm:text-base font-black transition-all rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 border ${activeTab === 'WAREHOUSE' ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-lg' : 'bg-white border-gray-100 text-gray-500 hover:border-amber-300 hover:text-amber-600'}`}
        >
            <span className="text-2xl">🚚</span>
            إيصالات المستودع
        </button>
      </div>

      <div id="printable-area" data-print-mode={printMode.toLowerCase()} className="bg-white p-4 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-50 print:min-h-0 print:border-none print:shadow-none print:p-0">
          {activeTab === 'INVENTORY' && <InventoryReportView printMode={printMode} />}
          {activeTab === 'SAFE' && <SafeLedgerView />}
          {activeTab === 'EMPLOYEES' && <EmployeePerformanceView />}
          {activeTab === 'WAREHOUSE' && <WarehouseReportView />}
      </div>
    </div>
  );
}

function InventoryReportView({ printMode }: { printMode: 'TABLE' | 'CARD' }) {
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    const [data, setData] = useState<any[]>([]); 
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'COLOR' | 'MODEL'>('COLOR');
    const [showInitialStock, setShowInitialStock] = useState(true);
    const [showCurrentStock, setShowCurrentStock] = useState(true);
    const [showSold, setShowSold] = useState(true);
    const [bulkCutAmount, setBulkCutAmount] = useState(1);
    const [isLinkedStagesActive, setIsLinkedStagesActive] = useState(false);
    const [selectedHistory, setSelectedHistory] = useState<any[] | null>(null);
    const [selectedItemName, setSelectedItemName] = useState('');
    const [cutInputs, setCutInputs] = useState<Record<string, number>>({});
    const [requiredCuts, setRequiredCuts] = useState<Record<string, number>>({});
    // الترتيب الافتراضي أصبح بكود الموديل تصاعدياً
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'modelNo', direction: 'asc' });

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const openHistory = (item: any) => {
        setSelectedHistory(item.history || []);
        setSelectedItemName(`${item.modelNo} (${item.color || 'تجميعي'})`);
    };
    
    useEffect(() => {
        getInventoryReport().then(res => {
            if(res.success && res.data) { 
                setData(res.data); 
            } else {
                setData([]);
            }
            setLoading(false);
        });
    }, []);

    const getGroupedData = () => {
        const groups: any = {};
        data.forEach(item => {
            if (!groups[item.modelNo]) {
                groups[item.modelNo] = {
                    id: item.modelNo, modelNo: item.modelNo, material: item.material,
                    colors: [], initialStock: 0, initialStockValue: 0, totalSold: 0, totalSoldValue: 0, currentStock: 0, currentValue: 0, history: []
                };
            }
            const g = groups[item.modelNo];
            g.colors.push({ name: item.color, sold: item.totalSold, stock: item.currentStock });
            g.initialStock += item.initialStock;
            g.initialStockValue += item.initialStock * (item.price || 0);
            g.totalSold += item.totalSold;
            g.totalSoldValue += item.totalSoldValue;
            g.currentStock += item.currentStock;
            g.currentValue += item.currentValue;
            if (item.history) {
                g.history.push(...item.history)
            }
        });
        return Object.values(groups);
    };

    let displayData = viewMode === 'COLOR' ? [...data] : getGroupedData();

    if (searchTerm.trim() !== '') {
        displayData = displayData.filter((item: any) => {
            const term = searchTerm.toLowerCase();
            if (isLinkedStagesActive && !isNaN(Number(term))) {
                const num = parseInt(term);
                const suffix = (num % 100).toString().padStart(2, '0');
                let linked: string[] = [];
                if (num >= 300 && num <= 599) linked = ["3", "4", "5"].map(p => p + suffix);
                else if (num >= 600 && num <= 899) linked = ["6", "7", "8"].map(p => p + suffix);
                else if (num >= 1100 && num <= 1399) linked = ["11", "12", "13"].map(p => p + suffix);
                else if (num >= 2100 && num <= 2299) linked = ["21", "22"].map(p => p + suffix);
                else linked = [term];
                return linked.includes(item.modelNo.toString());
            }
            return item.modelNo.toLowerCase().includes(term) || item.material?.toLowerCase().includes(term);
        });
    }

    if (sortConfig !== null) {
        displayData.sort((a: any, b: any) => {
            // الترتيب الرقمي (للمبيعات والمخزون)
            if (sortConfig.key === 'totalSold' || sortConfig.key === 'currentStock') {
                const valA = Number(a[sortConfig.key]) || 0;
                const valB = Number(b[sortConfig.key]) || 0;
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            // الترتيب النصي/الرقمي الطبيعي (لكود الموديل)
            if (sortConfig.key === 'modelNo') {
                const valA = String(a.modelNo || '');
                const valB = String(b.modelNo || '');
                
                // الترتيب الطبيعي (مثلاً 2 تأتي قبل 10 وليس بعدها)
                let comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                
                // إذا تطابق كود الموديل، نقوم بالترتيب الفرعي حسب الخامة
                if (comparison === 0) {
                    const matA = String(a.material || '');
                    const matB = String(b.material || '');
                    comparison = matA.localeCompare(matB, undefined, { numeric: true, sensitivity: 'base' });
                }

                return sortConfig.direction === 'asc' ? comparison : -comparison;
            }

            return 0;
        });
    }

    const filteredSummary = displayData.reduce((totals: any, item: any) => ({
        totalInitialStock: totals.totalInitialStock + (item.initialStock || 0),
        totalInitialStockValue: totals.totalInitialStockValue + (item.initialStockValue ?? ((item.initialStock || 0) * (item.price || 0))),
        totalSoldUnits: totals.totalSoldUnits + (item.totalSold || 0),
        totalSalesValue: totals.totalSalesValue + (item.totalSoldValue || 0),
        totalCurrentStock: totals.totalCurrentStock + (item.currentStock || 0),
        totalValue: totals.totalValue + (item.currentValue || 0)
    }), {
        totalInitialStock: 0,
        totalInitialStockValue: 0,
        totalSoldUnits: 0,
        totalSalesValue: 0,
        totalCurrentStock: 0,
        totalValue: 0
    });

    const formatNumber = (value: number) => new Intl.NumberFormat('ar-EG').format(value || 0);
    const formatCurrency = (value: number) => `${formatNumber(value)} ج.م`;
    const canViewTotals = userRole === 'ADMIN' || userRole === 'OWNER';

    const getItemKey = (item: any) => viewMode === 'COLOR' ? `${item.modelNo}-${item.color || 'group'}` : `${item.modelNo}-${item.material || 'material'}`;
    const getSoldUnits = (item: any) => Number(item.totalSold || 0) / 4;

    const getRequiredCut = (item: any) => {
        const key = getItemKey(item);
        const soldUnits = getSoldUnits(item);
        const value = requiredCuts[key];
        return Number.isFinite(value) ? value : soldUnits;
    };

    const handleCutInputChange = (item: any, rawValue: string) => {
        const key = getItemKey(item);
        const nextValue = Number(rawValue);
        setCutInputs(prev => ({
            ...prev,
            [key]: Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0
        }));
    };

    const handleAddCut = (item: any) => {
        const key = getItemKey(item);
        const amount = Number(cutInputs[key] ?? 0);
        const currentRequired = getRequiredCut(item);

        setRequiredCuts(prev => ({
            ...prev,
            [key]: currentRequired + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
        }));

        setCutInputs(prev => ({
            ...prev,
            [key]: 0
        }));
    };

    const handleBulkAddCut = () => {
        const amount = Number(bulkCutAmount) || 0;
        if (amount <= 0) return;

        const nextRequiredCuts = { ...requiredCuts };

        displayData.forEach((item: any) => {
            const key = getItemKey(item);
            const currentRequired = getRequiredCut(item);
            if (currentRequired > 0) {
                nextRequiredCuts[key] = currentRequired + amount;
            }
        });

        setRequiredCuts(nextRequiredCuts);
    };

    useEffect(() => {
        const handleDownload = () => {
            const excelData = displayData.map((item: any) => ({
                "كود الموديل": item.modelNo,
                "الخامة": item.material || '-',
                "اللون": viewMode === 'COLOR' ? (item.color || '-') : (item.colors?.map((c: any) => `${c.name} (${c.sold / 4} سرية)`).join(' | ') || '-'),
                "المخزون الأولي": item.initialStock ?? 0,
                "المباع (سرية)": item.totalSold ?? 0,
                "المخزون الحالي": item.currentStock ?? 0,
                "قيمة المخزون الحالي": item.currentValue ?? 0,
            }));
            exportToExcel(excelData, "Inventory_Stock_Report");
        };

        window.addEventListener('download-excel', handleDownload);
        return () => window.removeEventListener('download-excel', handleDownload);
    }, [displayData, viewMode]);

    return (
        <div className="space-y-8 print:space-y-0 print:mt-0">
            {canViewTotals && <div className="report-summary grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
                    <h2 className="text-lg font-black text-blue-900">إجمالي المخزون الأولي</h2>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-xs font-bold text-gray-500">عدد</div>
                            <div className="mt-1 text-xl font-black text-blue-800">{formatNumber(filteredSummary.totalInitialStock)} قطعة</div>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-xs font-bold text-gray-500">قيمة</div>
                            <div className="mt-1 text-xl font-black text-blue-800">{formatCurrency(filteredSummary.totalInitialStockValue)}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
                    <h2 className="text-lg font-black text-amber-900">إجمالي المبيعات</h2>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-xs font-bold text-gray-500">عدد</div>
                            <div className="mt-1 text-xl font-black text-amber-800">{formatNumber(filteredSummary.totalSoldUnits)} قطعة</div>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-xs font-bold text-gray-500">قيمة</div>
                            <div className="mt-1 text-xl font-black text-amber-800">{formatCurrency(filteredSummary.totalSalesValue)}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
                    <h2 className="text-lg font-black text-emerald-900">إجمالي المخزون الحالي</h2>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-xs font-bold text-gray-500">عدد</div>
                            <div className="mt-1 text-xl font-black text-emerald-800">{formatNumber(filteredSummary.totalCurrentStock)} قطعة</div>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-xs font-bold text-gray-500">قيمة</div>
                            <div className="mt-1 text-xl font-black text-emerald-800">{formatCurrency(filteredSummary.totalValue)}</div>
                        </div>
                    </div>
                </div>
            </div>}

            <div id="inventory-print-root" className="hidden print:block">
                <div className="mb-6 border-b border-slate-200 pb-3">
                    <h2 className="text-2xl font-black text-slate-900">تقرير المخزون</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">نتيجة الفلتر الحالي</p>
                </div>

                <table className="w-full border-collapse text-right">
                    <thead className="bg-slate-950 text-white">
                        <tr>
                            <th className="p-3 text-xs">كود الموديل</th>
                            <th className="p-3 text-xs">الخامة</th>
                            <th className="p-3 text-xs">{viewMode === 'COLOR' ? 'اللون' : 'الألوان'}</th>
                            {showInitialStock && <th className="p-3 text-xs">أولي</th>}
                            {showSold && <th className="p-3 text-xs">مباع</th>}
                            <th className="p-3 text-xs">المطلوب قصه</th>
                            {showCurrentStock && <th className="p-3 text-xs">حالي</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((item: any) => {
                            const requiredCut = getRequiredCut(item);
                            const soldUnits = getSoldUnits(item);
                            return (
                                <tr key={getItemKey(item)} className="bg-white even:bg-slate-50">
                                    <td className="p-3 text-sm font-black">{item.modelNo}</td>
                                    <td className="p-3 text-sm">{item.material || '-'}</td>
                                    <td className="p-3 text-sm">
                                        {viewMode === 'COLOR' ? (item.color || '-') : (item.colors?.map((c: any) => `${c.name} (${c.sold / 4})`).join(' / ') || '-')}
                                    </td>
                                    {showInitialStock && <td className="p-3 text-sm">{item.initialStock ?? 0}</td>}
                                    {showSold && <td className="p-3 text-sm">{item.totalSold ?? 0} / {soldUnits}</td>}
                                    <td className="p-3 text-sm font-black text-indigo-700">{requiredCut}</td>
                                    {showCurrentStock && <td className="p-3 text-sm font-black text-green-700">{item.currentStock ?? 0}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="report-controls flex flex-wrap gap-4 items-center justify-between print:hidden">
                <div className="flex gap-2 items-center flex-1 min-w-[300px]">
                    <input 
                        type="text" placeholder="ابحث بالموديل أو الخامة..." 
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 p-4 border rounded-2xl outline-none"
                    />
                    <button 
                        onClick={() => setIsLinkedStagesActive(!isLinkedStagesActive)}
                        className={`px-4 py-4 rounded-2xl font-black border ${isLinkedStagesActive ? 'bg-indigo-600 text-white' : 'bg-white text-gray-400'}`}
                    >
                        {isLinkedStagesActive ? '🔗 الربط مفعل' : '⛓️ ربط المراحل'}
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-2xl p-2 shadow-inner">
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={bulkCutAmount}
                        onChange={(e) => setBulkCutAmount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 border border-indigo-200 rounded-xl px-2 py-3 text-center font-black text-indigo-700 outline-none"
                    />
                    <button
                        onClick={handleBulkAddCut}
                        className="bg-indigo-600 text-white px-4 py-3 rounded-xl font-black shadow hover:bg-indigo-700 transition-all"
                    >
                        + قص لكل السجلات
                    </button>
                </div>

                <div className="bg-gray-100 p-2 rounded-2xl flex flex-wrap gap-2 items-center shadow-inner print:hidden report-mode-switch">
                    <button onClick={() => setViewMode('COLOR')} className={`px-6 py-3 rounded-xl ${viewMode === 'COLOR' ? 'bg-white shadow text-blue-700 font-bold' : ''}`}>الألوان</button>
                    <button onClick={() => setViewMode('MODEL')} className={`px-6 py-3 rounded-xl ${viewMode === 'MODEL' ? 'bg-white shadow text-blue-700 font-bold' : ''}`}>الموديلات</button>
                    <button onClick={() => setShowInitialStock(!showInitialStock)} className={`px-4 py-3 rounded-xl text-xs font-black border transition-all ${showInitialStock ? 'bg-white shadow text-blue-700 border-blue-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showInitialStock ? '👁️ إخفاء الأولي' : '🙈 إظهار الأولي'}
                    </button>
                    <button onClick={() => setShowCurrentStock(!showCurrentStock)} className={`px-4 py-3 rounded-xl text-xs font-black border transition-all ${showCurrentStock ? 'bg-white shadow text-blue-700 border-blue-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showCurrentStock ? '👁️ إخفاء الحالي' : '🙈 إظهار الحالي'}
                    </button>
                    <button onClick={() => setShowSold(!showSold)} className={`px-4 py-3 rounded-xl text-xs font-black border transition-all ${showSold ? 'bg-white shadow text-yellow-700 border-yellow-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showSold ? '👁️ إخفاء المباع' : '🙈 إظهار المباع'}
                    </button>
                </div>
            </div>

            <div className={`report-table-desktop ${printMode === 'CARD' ? 'hidden' : 'hidden md:block'} overflow-x-auto rounded-[2rem] border border-gray-100`}>
                <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-widest">
                        <tr>
                            <th 
                                className="p-5 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('modelNo')}
                            >
                                كود الموديل {sortConfig?.key === 'modelNo' && (sortConfig.direction === 'asc' ? ' ↓' : ' ↑')}
                            </th>
                            <th className="p-5">الخامة</th>
                            <th className="p-5">{viewMode === 'COLOR' ? 'اللون' : 'الألوان'}</th>
                            {showInitialStock && <th className="p-5">أولي (قطعة)</th>}
                            {showSold && <th 
                                className="p-5 text-yellow-500 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('totalSold')}
                            >
                                المباع (سرية) {sortConfig?.key === 'totalSold' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                            </th>}
                            <th className="p-5 text-indigo-200">المطلوب قصه</th>
                            {showCurrentStock && 
                                <th 
                                    className="p-5 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                    onClick={() => handleSort('currentStock')}
                                >
                                    حالي (قطعة) {sortConfig?.key === 'currentStock' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                </th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((item: any) => {
                            const key = getItemKey(item);
                            const soldUnits = getSoldUnits(item);
                            const requiredCut = getRequiredCut(item);
                            const inputValue = cutInputs[key] ?? soldUnits;

                            return (
                                <tr key={key} className="border-b hover:bg-gray-50 transition-colors">
                                    <td className="p-5 font-black text-xl">{item.modelNo}</td>
                                    <td className="p-5 text-gray-400 font-bold text-sm">{item.material || '-'}</td>
                                    <td className="p-5">
                                        {viewMode === 'COLOR' ? (
                                            <span className="font-bold text-gray-600">{item.color}</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.colors.map((c:any, i:number) => (
                                                    <div key={i} className="bg-gray-50 border px-2 py-1 rounded-lg text-[10px] font-bold">
                                                        {c.name} ({c.sold/4} سرية)
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    {showInitialStock && <td className="p-5 font-bold text-gray-400">{item.initialStock}</td>}
                                    {showSold && <td className="p-5 text-yellow-600 font-black text-lg">
                                        {item.totalSold > 0 ? (
                                            <button 
                                                onClick={() => openHistory(item)} 
                                                className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-xl shadow-lg transition-all active:scale-95 flex flex-col items-center"
                                                title="اضغط لعرض تفاصيل البيع بالقطع"
                                            >
                                                <span className="text-lg leading-none">{soldUnits}</span>
                                                <span className="text-[9px] font-bold">سرية</span>
                                            </button>
                                        ) : (
                                            <span className="text-gray-300">0</span>
                                        )}
                                    </td>}
                                    <td className="required-cut-cell p-5">
                                        <div className="required-cut-controls flex items-center gap-2">
                                            <span className="required-cut-value min-w-[72px] rounded-xl bg-indigo-50 px-3 py-2 text-center font-black text-indigo-700">{requiredCut}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={inputValue}
                                                onChange={(e) => handleCutInputChange(item, e.target.value)}
                                                placeholder="إضافة"
                                                className="required-cut-input w-20 border border-indigo-200 rounded-xl px-2 py-2 text-center font-black text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-200"
                                            />
                                            <button
                                                onClick={() => handleAddCut(item)}
                                                className="required-cut-button bg-indigo-600 text-white px-3 py-2 rounded-xl font-black shadow hover:bg-indigo-700 transition-all"
                                            >
                                                + قص
                                            </button>
                                        </div>
                                    </td>
                                    {showCurrentStock && <td className={`p-5 font-black text-xl ${item.currentStock < 0 ? 'text-red-500' : 'text-green-600'}`}>{item.currentStock}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className={`report-table-mobile ${printMode === 'TABLE' ? 'hidden' : 'grid'} gap-3 md:hidden`}>
                {displayData.map((item: any) => {
                    const key = getItemKey(item);
                    const soldUnits = getSoldUnits(item);
                    const requiredCut = getRequiredCut(item);
                    const inputValue = cutInputs[key] ?? soldUnits;

                    return (
                        <article key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">{item.modelNo}</h3>
                                    <p className="mt-1 text-xs font-bold text-slate-400">{item.material || 'بدون خامة'}</p>
                                </div>
                                {viewMode === 'COLOR' ? (
                                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{item.color}</span>
                                ) : (
                                    <span className="text-left text-[10px] font-bold text-slate-500">{item.colors.length} ألوان</span>
                                )}
                            </div>
                            {viewMode === 'MODEL' && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {item.colors.map((color: any, index: number) => (
                                        <span key={index} className="rounded-md border bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                                            {color.name} ({color.sold / 4} سرية)
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                                {showInitialStock && (
                                    <div className="rounded-xl bg-blue-50 p-2">
                                        <div className="text-[10px] font-bold text-blue-500">المخزون الأولي</div>
                                        <div className="mt-1 text-lg font-black text-blue-800">{item.initialStock}</div>
                                    </div>
                                )}
                                {showSold && <button onClick={() => item.totalSold > 0 && openHistory(item)} className="rounded-xl bg-amber-50 p-2 text-amber-700 disabled:cursor-default" disabled={item.totalSold <= 0}>
                                    <div className="text-[10px] font-bold text-amber-600">المباع بالسرية</div>
                                    <div className="mt-1 text-lg font-black">{item.totalSold > 0 ? soldUnits : 0}</div>
                                </button>}
                                {showCurrentStock && (
                                    <div className="rounded-xl bg-emerald-50 p-2">
                                        <div className="text-[10px] font-bold text-emerald-600">المخزون الحالي</div>
                                        <div className={`mt-1 text-lg font-black ${item.currentStock < 0 ? 'text-red-500' : 'text-emerald-700'}`}>{item.currentStock}</div>
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 rounded-xl bg-indigo-50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] font-black text-indigo-700">المطلوب قصه</div>
                                    <span className="rounded-lg bg-white px-2 py-1 text-sm font-black text-indigo-700">{requiredCut}</span>
                                </div>
                                <div className="mt-2 flex gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={inputValue}
                                        onChange={(e) => handleCutInputChange(item, e.target.value)}
                                        placeholder="إضافة"
                                        className="required-cut-input w-20 flex-1 border border-indigo-200 rounded-lg px-2 py-2 text-center font-black text-indigo-700 outline-none"
                                    />
                                    <button onClick={() => handleAddCut(item)} className="required-cut-button bg-indigo-600 text-white px-3 py-2 rounded-lg font-black">+ قص</button>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            {selectedHistory && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4" onClick={() => setSelectedHistory(null)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                            <h3 className="font-black text-xl">سجل حركة البيع: {selectedItemName}</h3>
                            <button onClick={() => setSelectedHistory(null)} className="text-2xl">✕</button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto font-sans">
                            <table className="w-full text-right">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                                    <tr>
                                        <th className="p-3 border-b">التاريخ</th>
                                        <th className="p-3 border-b text-center">العميل</th>
                                        <th className="p-3 border-b text-center bg-blue-50 text-blue-600 font-black">الكمية (قطعة)</th>
                                        <th className="p-3 border-b text-left">السعر</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {selectedHistory.map((h: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="p-3 text-xs text-gray-400">{new Date(h.date).toLocaleDateString('ar-EG')}</td>
                                            <td className="p-3 font-bold text-gray-700 text-center">{h.customer}</td>
                                            <td className="p-3 text-center font-black text-xl text-blue-800 bg-blue-50/30">{h.quantity}</td>
                                            <td className="p-3 text-left font-mono font-bold text-green-600">{h.price}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


function SafeLedgerView() {
    const getTodayDateString = () => new Date().toISOString().split('T')[0];
    const [safes, setSafes] = useState<any[]>([]);
    const [selectedSafe, setSelectedSafe] = useState('');
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [ledger, setLedger] = useState<any[]>([]);
    const [summaryGrouped, setSummaryGrouped] = useState<any>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getSafesList().then(data => { setSafes(data); if(data.length > 0) setSelectedSafe(data[0].id); });
    }, []);

    const fetchLedgerData = useCallback(async () => {
        if(!selectedSafe) return;
        setLoading(true);
        const res = await getSafeLedger(selectedSafe, startDate, endDate);
        if(res.success) { 
            setLedger(res.data || []); 
            setSummaryGrouped(res.summaryGrouped || {}); 
        }
        setLoading(false);
    }, [selectedSafe, startDate, endDate]);

    useEffect(() => { fetchLedgerData(); }, [fetchLedgerData]);

    useEffect(() => {
        const handleDownload = () => {
            const excelData = ledger.map(row => ({
                "التاريخ": new Date(row.date).toLocaleDateString('ar-EG'),
                "نوع الحركة": row.type,
                "البيان": row.description,
                "العملة": row.currency,
                "وارد": row.inAmount > 0 ? row.inAmount : '-',
                "صادر": row.outAmount > 0 ? row.outAmount : '-',
                "المستخدم": row.user
            }));
            exportToExcel(excelData, "Safe_Ledger_Report");
        };
        window.addEventListener('download-excel', handleDownload);
        return () => window.removeEventListener('download-excel', handleDownload);
    }, [ledger]);

    const getCurrencyName = (code: string) => {
        const names: any = { 'EGP': 'جنيه مصري', 'USD': 'دولار أمريكي', 'SAR': 'ريال سعودي', 'KWD': 'دينار كويتي' };
        return names[code] || code;
    };

    return (
        <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
            <h2 className="text-3xl font-black text-gray-800 border-b pb-6">دفتر الأستاذ الموحد للخزينة</h2>
            
            <div className="flex flex-wrap gap-3 sm:gap-4 items-end bg-slate-100/50 p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-slate-200/50 shadow-inner print:hidden">
                <div className="flex-1 min-w-[250px]">
                    <label className="block text-[10px] font-black mb-3 text-slate-500 uppercase tracking-[0.2em]">اختر الخزنة المستهدفة</label>
                    <select value={selectedSafe} onChange={e => setSelectedSafe(e.target.value)} className="w-full p-3 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-[1.2rem] shadow-sm outline-none focus:ring-4 focus:ring-green-500/20 font-bold transition-all">
                        {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-black mb-3 text-slate-500">الفترة من</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-3 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-[1.2rem] shadow-sm font-bold" />
                </div>
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-black mb-3 text-slate-500">الفترة إلى</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-3 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-[1.2rem] shadow-sm font-bold" />
                </div>
                <button onClick={fetchLedgerData} className="w-full sm:w-auto bg-green-600 text-white px-8 sm:px-14 py-3 sm:py-4 rounded-xl sm:rounded-[1.2rem] font-black shadow-2xl shadow-green-200 hover:bg-green-700 hover:scale-105 transition-all flex items-center justify-center gap-3">
                    تحديث البيانات ⟳
                </button>
            </div>

            {loading ? (
              <div className="text-center py-32 text-gray-300 font-black text-xl animate-pulse italic">جاري جلب سجلات التدفق المالي...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                        {Object.entries(summaryGrouped).map(([curr, totals]: any) => (
                            <div key={curr} className="bg-white border-2 border-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl transform hover:-translate-y-2 transition-all duration-500">
                                <div className="bg-slate-900 text-white p-5 text-center font-black text-sm flex justify-center items-center gap-3">
                                    <span className="text-2xl">🏛️</span>
                                    <span>رصيد الـ {getCurrencyName(curr)}</span>
                                </div>
                                <div className="p-8 space-y-5">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-gray-400 uppercase tracking-widest">إجمالي الوارد:</span>
                                        <span className="text-green-600 font-black">+{totals.in.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-gray-400 uppercase tracking-widest">إجمالي الصادر:</span>
                                        <span className="text-red-600 font-black">-{totals.out.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-slate-50 pt-5 mt-3">
                                        <span className="font-black text-slate-800 uppercase text-[10px]">الصافي النهائي:</span>
                                        <span className="text-3xl font-black text-slate-900 tracking-tighter">{totals.balance.toLocaleString()} <small className="text-[10px] text-gray-400 font-normal">{curr}</small></span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 bg-white">
                        <table className="w-full text-sm text-right border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[9px] tracking-widest">
                                <tr>
                                    <th className="p-6 border-b border-slate-100">تاريخ السند</th>
                                    <th className="p-6 border-b border-slate-100">نوع الحركة</th>
                                    <th className="p-6 border-b border-slate-100">البيان والتفاصيل</th>
                                    <th className="p-6 border-b border-slate-100 text-center">العملة</th>
                                    <th className="p-6 border-b border-slate-100 text-green-700 bg-green-50/20">وارد (+)</th>
                                    <th className="p-6 border-b border-slate-100 text-red-700 bg-red-50/20">صادر (-)</th>
                                    <th className="p-6 border-b border-slate-100 text-slate-300 font-normal">المستلم</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {ledger.map((row: any) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-6 whitespace-nowrap text-gray-400 font-mono text-xs">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-6 font-black text-xs">
                                            <span className={`px-4 py-2 rounded-2xl shadow-sm ${row.type.includes('وارد') || row.type.includes('قبض') ? 'bg-green-100 text-green-700 shadow-green-100' : 'bg-red-100 text-red-700 shadow-red-100'}`}>
                                                {row.type}
                                            </span>
                                        </td>
                                        <td className="p-6 text-slate-700 font-black max-w-[300px] truncate">{row.description}</td>
                                        <td className="p-6 text-center font-black text-blue-600 text-xl tracking-tighter">{row.currency}</td>
                                        <td className="p-6 font-black text-2xl text-green-700 bg-green-50/5">{row.inAmount > 0 ? row.inAmount.toLocaleString() : '-'}</td>
                                        <td className="p-6 font-black text-2xl text-red-700 bg-red-50/5">{row.outAmount > 0 ? row.outAmount.toLocaleString() : '-'}</td>
                                        <td className="p-6 text-xs text-slate-300 font-mono italic">{row.user}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid gap-3 md:hidden">
                        {ledger.map((row: any) => (
                            <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-bold text-slate-400">{new Date(row.date).toLocaleDateString('ar-EG')}</div>
                                        <div className="mt-2 font-black text-slate-800">{row.description}</div>
                                    </div>
                                    <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${row.type.includes('وارد') || row.type.includes('قبض') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.type}</span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                                    <div className="rounded-xl bg-green-50 p-2"><div className="text-[10px] font-bold text-green-600">وارد</div><div className="font-black text-green-700">{row.inAmount > 0 ? row.inAmount.toLocaleString() : '-'}</div></div>
                                    <div className="rounded-xl bg-red-50 p-2"><div className="text-[10px] font-bold text-red-600">صادر</div><div className="font-black text-red-700">{row.outAmount > 0 ? row.outAmount.toLocaleString() : '-'}</div></div>
                                </div>
                                <div className="mt-2 flex justify-between text-xs font-bold text-slate-400"><span>العملة: {row.currency}</span><span>{row.user}</span></div>
                            </article>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function EmployeePerformanceView() {
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    useEffect(() => {
        getEmployeePerformance().then(res => {
            if (res.success) setData(res.data || []);
            setLoading(false);
        });
    }, []);

    const sortedData = [...data];
    if (sortConfig !== null) {
        sortedData.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    useEffect(() => {
        const handleDownload = () => {
            const excelData = sortedData.map(emp => ({
                "اسم الموظف": emp.name,
                "كود الدخول": emp.code,
                "عدد الأوردرات": emp.orderCount,
                ...(userRole !== 'ACCOUNTANT' && { "إجمالي المبيعات": emp.totalSales }),
                "الخصومات الممنوحة": emp.totalDiscount
            }));
            exportToExcel(excelData, "Employees_Performance_Report");
        };
        window.addEventListener('download-excel', handleDownload);
        return () => window.removeEventListener('download-excel', handleDownload);
    }, [sortedData, userRole]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
        setSortConfig({ key, direction });
    };

    if (loading) return <div className="text-center py-40 font-black text-slate-300 text-2xl animate-pulse italic">جاري تحليل كفاءة فريق المبيعات...</div>;

    return (
        <div className="space-y-12 animate-in zoom-in-95 duration-700">
            <div className="flex justify-between items-center border-b border-slate-50 pb-8">
                <h2 className="text-3xl font-black text-slate-700 tracking-tight">تقرير تقييم الكفاءة والإنتاجية</h2>
                <span className="bg-purple-100 text-purple-700 px-6 py-2 rounded-full text-xs font-black uppercase shadow-lg shadow-purple-50 tracking-[0.3em]">LIVE STATS</span>
            </div>
            
            <div className="hidden md:block overflow-x-auto rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 bg-white">
                <table className="w-full text-sm text-right border-collapse">
                    <thead className="bg-purple-600 text-white font-black uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="p-8">اسم الموظف</th>
                            <th className="p-8 text-purple-200">كود الدخول</th>
                            <th className="p-8 cursor-pointer hover:bg-purple-700 transition-all" onClick={() => handleSort('orderCount')}>
                                عدد الأوردرات {sortConfig?.key === 'orderCount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            {userRole !== 'ACCOUNTANT' && 
                                <th className="p-8 cursor-pointer hover:bg-purple-700 transition-all" onClick={() => handleSort('totalSales')}>
                                    إجمالي المبيعات {sortConfig?.key === 'totalSales' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                            }
                            <th className="p-8 cursor-pointer hover:bg-purple-700 transition-all" onClick={() => handleSort('totalDiscount')}>
                                الخصومات الممنوحة {sortConfig?.key === 'totalDiscount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {sortedData.map((emp: any) => (
                            <tr key={emp.id} className="hover:bg-purple-50 transition-all group border-b last:border-0">
                                <td className="p-8 font-black text-slate-900 text-2xl group-hover:text-purple-700 transition-colors">{emp.name}</td>
                                <td className="p-8 font-mono text-slate-300 text-xs tracking-tighter">{emp.code}</td>
                                <td className="p-8 text-center font-black text-4xl text-slate-800 tracking-tighter">{emp.orderCount}</td>
                                {userRole !== 'ACCOUNTANT' && 
                                    <td className="p-8 font-black text-green-700 text-3xl tracking-tighter">
                                        {emp.totalSales.toLocaleString()} <small className="text-xs font-normal">ج.م</small>
                                    </td>
                                }
                                <td className="p-8 font-black text-red-600 text-2xl tracking-tighter">
                                    {emp.totalDiscount.toLocaleString()} <small className="text-xs font-normal">ج.م</small>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid gap-3 md:hidden">
                {sortedData.map((emp: any) => (
                    <article key={emp.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-purple-50 pb-3">
                            <div><h3 className="font-black text-slate-900">{emp.name}</h3><p className="mt-1 font-mono text-[10px] text-slate-400">كود: {emp.code}</p></div>
                            <span className="rounded-xl bg-purple-50 px-3 py-2 text-center"><strong className="block text-xl font-black text-purple-700">{emp.orderCount}</strong><small className="text-[10px] font-bold text-purple-500">أوردر</small></span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                            {userRole !== 'ACCOUNTANT' && <div className="rounded-xl bg-green-50 p-2"><div className="text-[10px] font-bold text-green-600">إجمالي المبيعات</div><div className="mt-1 font-black text-green-700">{emp.totalSales.toLocaleString()} ج.م</div></div>}
                            <div className="rounded-xl bg-red-50 p-2"><div className="text-[10px] font-bold text-red-600">الخصومات</div><div className="mt-1 font-black text-red-700">{emp.totalDiscount.toLocaleString()} ج.م</div></div>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

function WarehouseReportView() {
    const getTodayDateString = () => new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [detail, setDetail] = useState<any[]>([]);
    const [byModel, setByModel] = useState<any[]>([]);
    const [byEmployee, setByEmployee] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>({});
    const [itemSearch, setItemSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'DETAIL' | 'MODEL' | 'EMPLOYEE'>('DETAIL');
    const [uploading, setUploading] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const normalizedItemSearch = itemSearch.trim().toLowerCase();
    const filteredDetail = useMemo(() => {
        if (!normalizedItemSearch) return detail;

        return detail.filter((row: any) => {
            const haystack = [row.modelNo, row.color, row.empName].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(normalizedItemSearch);
        });
    }, [detail, normalizedItemSearch]);

    const filteredByModel = useMemo(() => {
        if (!normalizedItemSearch) return byModel;

        const modelMatches = new Set(filteredDetail.map((row: any) => String(row.modelNo ?? '')));
        return byModel.filter((row: any) => modelMatches.has(String(row.modelNo ?? '')));
    }, [byModel, filteredDetail, normalizedItemSearch]);

    const filteredByEmployee = useMemo(() => {
        if (!normalizedItemSearch) return byEmployee;

        const employeeMatches = new Set(filteredDetail.map((row: any) => String(row.empName ?? '')));
        return byEmployee.filter((row: any) => employeeMatches.has(String(row.empName ?? '')));
    }, [byEmployee, filteredDetail, normalizedItemSearch]);

    const filteredSummary = useMemo(() => {
        if (!normalizedItemSearch) return summary;

        const totalReceipts = filteredDetail.length;
        const totalQuantity = filteredDetail.reduce((acc, row: any) => acc + (Number(row.most) || 0), 0);
        const uniqueModels = new Set(filteredDetail.map((row: any) => String(row.modelNo ?? ''))).size;
        const uniqueEmployees = new Set(filteredDetail.map((row: any) => String(row.empName ?? ''))).size;

        return {
            totalReceipts,
            totalQuantity,
            uniqueModels,
            uniqueEmployees,
        };
    }, [filteredDetail, normalizedItemSearch, summary]);

    const visibleSummary = filteredSummary || summary;

    const handleClearAllReceipts = async () => {
        const confirmed = window.confirm('هل أنت متأكد؟ سيتم حذف جميع إيصالات المستودع الحالية قبل إعادة الرفع.');
        if (!confirmed) return;

        setClearing(true);
        setUploadResult(null);

        try {
            const res = await clearWarehouseReceipts();
            setUploadResult(res.success
                ? { success: true, inserted: 0, skipped: 0, deleted: res.deleted, error: null }
                : { success: false, error: res.error || 'فشل حذف البيانات' }
            );

            if (res.success) {
                fetchReport();
            }
        } catch (err: any) {
            setUploadResult({ success: false, error: 'فشل حذف جميع البيانات: ' + (err.message || err) });
        }

        setClearing(false);
    };

    const downloadTemplate = () => {
        const template = [
            {
                'معرف فريد (uniqueid)': 'ex: 17561165692176nwfn',
                'التاريخ (date)': '8/25/2025 13:09:29',
                'اسم الموظف (emp name)': 'ابو مالك',
                'كود الموديل (model no)': '3760',
                'الكمية (most)': 488,
                'اللون (tadakhol)': 'رصاصي',
            },
        ];
        const ws = XLSX.utils.json_to_sheet(template);
        ws['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'إيصالات المستودع');
        XLSX.writeFile(wb, 'Warehouse_Receipts_Template.xlsx');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setUploading(true);
        setUploadResult(null);
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = (XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, any>[])
              .map((row) => JSON.parse(JSON.stringify(row)));

            const res = await bulkUploadWarehouseReceipts(rows);
            setUploadResult(res);
            if (res.success) {
                fetchReport();
            }
        } catch (err: any) {
            setUploadResult({ success: false, error: 'فشل قراءة الملف: ' + (err.message || err) });
        }
        setUploading(false);
    };

    const fetchReport = useCallback(async () => {
        setLoading(true);
        const res = await getWarehouseReport(startDate || undefined, endDate || undefined);
        if (res.success) {
            setDetail(res.data || []);
            setByModel(res.byModel || []);
            setByEmployee(res.byEmployee || []);
            setSummary(res.summary || {});
        } else {
            setDetail([]);
            setByModel([]);
            setByEmployee([]);
            setSummary({});
        }
        setLoading(false);
    }, [startDate, endDate]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    useEffect(() => {
        const handleDownload = () => {
            const excelData = filteredDetail.map(row => ({
                "التاريخ": new Date(row.date).toLocaleDateString('ar-EG'),
                "اسم الموظف": row.empName,
                "كود الموديل": row.modelNo,
                "اللون": row.color,
                "الكمية": row.most,
                "مصدر": row.synced ? 'مزامنة' : 'يدوي'
            }));
            exportToExcel(excelData, "Warehouse_Receipts_Report");
        };
        window.addEventListener('download-excel', handleDownload);
        return () => window.removeEventListener('download-excel', handleDownload);
    }, [filteredDetail]);

    const summaryCards = [
        { label: 'إجمالي الإيصالات', value: visibleSummary.totalReceipts, color: 'bg-blue-600', icon: '🧾' },
        { label: 'إجمالي الكمية', value: visibleSummary.totalQuantity, color: 'bg-amber-500', icon: '📦' },
        { label: 'عدد الموديلات', value: visibleSummary.uniqueModels, color: 'bg-emerald-600', icon: '🏷️' },
        { label: 'عدد الموظفين', value: visibleSummary.uniqueEmployees, color: 'bg-purple-600', icon: '👷' },
    ];

    return (
        <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
            <h2 className="text-3xl font-black text-gray-800 border-b pb-6">تقرير إيصالات المستودع</h2>

            <div className="flex flex-wrap gap-4 items-end bg-amber-50/70 p-8 rounded-[2.5rem] border border-amber-200/60 shadow-inner print:hidden">
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-black mb-3 text-amber-600 uppercase tracking-[0.2em]">الفترة من</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-4 bg-white border border-amber-200 rounded-[1.2rem] shadow-sm font-bold" />
                </div>
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-black mb-3 text-amber-600 uppercase tracking-[0.2em]">الفترة إلى</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-4 bg-white border border-amber-200 rounded-[1.2rem] shadow-sm font-bold" />
                </div>
                <div className="flex-1 min-w-[260px]">
                    <label className="block text-[10px] font-black mb-3 text-amber-600 uppercase tracking-[0.2em]">بحث بالصنف / كود الموديل</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={itemSearch}
                            onChange={e => setItemSearch(e.target.value)}
                            placeholder="اكتب اسم أو كود الصنف..."
                            className="w-full p-4 bg-white border border-amber-200 rounded-[1.2rem] shadow-sm font-bold pr-12"
                        />
                        {itemSearch && (
                            <button
                                type="button"
                                onClick={() => setItemSearch('')}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700 hover:text-amber-900"
                                aria-label="مسح البحث"
                            >
                                مسح
                            </button>
                        )}
                    </div>
                </div>
                <button onClick={fetchReport} className="w-full sm:w-auto bg-amber-500 text-white px-14 py-4 rounded-[1.2rem] font-black shadow-2xl shadow-amber-200 hover:bg-amber-600 hover:scale-105 transition-all flex items-center justify-center gap-3">
                    تحديث البيانات ⟳
                </button>
            </div>

            <div className="flex flex-wrap gap-4 items-center bg-slate-900 p-6 rounded-[2rem] shadow-xl print:hidden">
                <span className="text-white font-black text-sm flex items-center gap-2">
                    <span className="text-2xl">📥</span>
                    رفع جماعي للإيصالات
                </span>
                <button onClick={downloadTemplate} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-black shadow-lg hover:bg-gray-100 transition-all flex items-center gap-2">
                    <span>📄</span>
                    تحميل نموذج Excel استرشادي
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={`bg-amber-500 text-white px-6 py-3 rounded-xl font-black shadow-lg transition-all flex items-center gap-2 ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-600'}`}
                >
                    <span>{uploading ? '⏳ جاري الرفع...' : '⬆️ رفع ملف Excel'}</span>
                </button>
                <button
                    onClick={handleClearAllReceipts}
                    disabled={clearing || uploading}
                    className={`bg-red-600 text-white px-6 py-3 rounded-xl font-black shadow-lg transition-all flex items-center gap-2 ${clearing || uploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700'}`}
                >
                    <span>{clearing ? '⏳ جاري الحذف...' : '🗑️ حذف الجميع'}</span>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                />
            </div>

            {uploadResult && (
                <div className={`p-6 rounded-[2rem] border-2 font-bold ${uploadResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {uploadResult.success ? (
                        <div className="space-y-2">
                            <div className="text-lg font-black">✅ تمت عملية الرفع بنجاح</div>
                            <div className="flex flex-wrap gap-4 text-sm">
                                <span className="bg-emerald-200 px-4 py-1.5 rounded-xl font-black">أُضيف: {uploadResult.inserted || 0}</span>
                                <span className="bg-slate-200 px-4 py-1.5 rounded-xl font-black">مكرر (تم التخطي): {uploadResult.skipped || 0}</span>
                            </div>
                            {uploadResult.errors && uploadResult.errors.length > 0 && (
                                <div className="text-xs text-red-600 mt-2 max-h-32 overflow-y-auto">
                                    {uploadResult.errors.map((err: string, i: number) => (
                                        <div key={i}>• {err}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>❌ فشل الرفع: {uploadResult.error || 'خطأ غير معروف'}</div>
                    )}
                    <button onClick={() => setUploadResult(null)} className="mt-3 text-xs font-black opacity-60 hover:opacity-100">إغلاق ✕</button>
                </div>
            )}

            {loading ? (
                <div className="text-center py-32 text-gray-300 font-black text-xl animate-pulse italic">جاري جلب إيصالات المستودع...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {summaryCards.map(card => (
                            <div key={card.label} className={`${card.color} text-white rounded-[2rem] p-6 shadow-xl transform hover:-translate-y-1 transition-all duration-300`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-3xl">{card.icon}</span>
                                    <span className="text-4xl font-black tracking-tighter">{card.value}</span>
                                </div>
                                <div className="mt-3 text-sm font-bold opacity-90">{card.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-gray-100 p-2 rounded-2xl flex flex-wrap gap-2 items-center shadow-inner w-fit print:hidden">
                        <button onClick={() => setViewMode('DETAIL')} className={`px-6 py-3 rounded-xl font-bold transition-all ${viewMode === 'DETAIL' ? 'bg-white shadow text-amber-600' : 'text-gray-400'}`}>كل الإيصالات</button>
                        <button onClick={() => setViewMode('MODEL')} className={`px-6 py-3 rounded-xl font-bold transition-all ${viewMode === 'MODEL' ? 'bg-white shadow text-amber-600' : 'text-gray-400'}`}>حسب الموديل</button>
                        <button onClick={() => setViewMode('EMPLOYEE')} className={`px-6 py-3 rounded-xl font-bold transition-all ${viewMode === 'EMPLOYEE' ? 'bg-white shadow text-amber-600' : 'text-gray-400'}`}>حسب الموظف</button>
                    </div>

                    <div className="hidden md:block overflow-x-auto rounded-[3rem] border border-amber-100 shadow-2xl shadow-amber-100/50 bg-white">
                        {viewMode === 'DETAIL' && (
                            <table className="w-full text-sm text-right border-collapse">
                                <thead className="bg-amber-500 text-white font-black uppercase text-[9px] tracking-widest">
                                    <tr>
                                        <th className="p-6 border-b">تاريخ الإيصال</th>
                                        <th className="p-6 border-b">اسم الموظف</th>
                                        <th className="p-6 border-b">كود الموديل</th>
                                        <th className="p-6 border-b">اللون</th>
                                        <th className="p-6 border-b text-center">الكمية (الأكثر)</th>
                                        <th className="p-6 border-b text-center">المصدر</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-50">
                                    {filteredDetail.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-16 text-center text-gray-300 font-black text-lg">
                                                {itemSearch ? 'لا توجد نتائج تطابق البحث الحالي.' : 'لا توجد إيصالات مستودع حتى الآن. قم بمزامنة إيصالات المستودع من صفحة الفرز أولاً.'}
                                            </td>
                                        </tr>
                                    )}
                                    {filteredDetail.map((row: any) => (
                                        <tr key={row.uniqueid} className="hover:bg-amber-50/40 transition-colors">
                                            <td className="p-6 whitespace-nowrap text-gray-400 font-mono text-xs">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                                            <td className="p-6 font-black text-slate-700">{row.empName}</td>
                                            <td className="p-6 font-black text-xl text-blue-700 tracking-tight">{row.modelNo}</td>
                                            <td className="p-6">
                                                <span className="font-bold text-slate-600 bg-gray-100 px-3 py-1.5 rounded-xl text-xs">{row.color}</span>
                                            </td>
                                            <td className="p-6 text-center font-black text-2xl text-amber-600">{row.most}</td>
                                            <td className="p-6 text-center">
                                                <span className={`px-4 py-2 rounded-2xl text-xs font-black shadow-sm ${row.synced ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {row.synced ? '🔄 مزامنة' : 'يدوي'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {viewMode === 'MODEL' && (
                            <table className="w-full text-sm text-right border-collapse">
                                <thead className="bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest">
                                    <tr>
                                        <th className="p-6 border-b">كود الموديل</th>
                                        <th className="p-6 border-b text-center">عدد الإيصالات</th>
                                        <th className="p-6 border-b text-center">إجمالي الكمية</th>
                                        <th className="p-6 border-b text-center">آخر إيصال</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredByModel.map((row: any) => (
                                        <tr key={row.modelNo} className="hover:bg-amber-50/40 transition-colors">
                                            <td className="p-6 font-black text-xl text-blue-700 tracking-tight">{row.modelNo}</td>
                                            <td className="p-6 text-center font-bold text-gray-500">{row.receipts}</td>
                                            <td className="p-6 text-center font-black text-2xl text-amber-600">{row.quantity}</td>
                                            <td className="p-6 text-center text-gray-400 font-mono text-xs">{new Date(row.lastDate).toLocaleDateString('ar-EG')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {viewMode === 'EMPLOYEE' && (
                            <table className="w-full text-sm text-right border-collapse">
                                <thead className="bg-purple-600 text-white font-black uppercase text-[9px] tracking-widest">
                                    <tr>
                                        <th className="p-6 border-b">اسم الموظف</th>
                                        <th className="p-6 border-b text-center">عدد الإيصالات</th>
                                        <th className="p-6 border-b text-center">إجمالي الكمية</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-purple-50">
                                    {filteredByEmployee.map((row: any) => (
                                        <tr key={row.empName} className="hover:bg-purple-50/40 transition-colors">
                                            <td className="p-6 font-black text-slate-800">{row.empName}</td>
                                            <td className="p-6 text-center font-bold text-gray-500">{row.receipts}</td>
                                            <td className="p-6 text-center font-black text-2xl text-purple-600">{row.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div className="grid gap-3 md:hidden">
                        {viewMode === 'DETAIL' && filteredDetail.map((row: any) => (
                            <article key={row.uniqueid} className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div><div className="text-xs font-bold text-gray-400">{new Date(row.date).toLocaleDateString('ar-EG')}</div><h3 className="mt-1 text-lg font-black text-blue-700">{row.modelNo}</h3></div>
                                    <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${row.synced ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{row.synced ? 'مزامنة' : 'يدوي'}</span>
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t border-amber-50 pt-3 text-sm"><span className="font-bold text-slate-700">{row.empName}</span><span className="rounded-xl bg-amber-50 px-3 py-1 font-black text-amber-600">{row.most} قطعة</span></div>
                                <div className="mt-2 text-xs font-bold text-slate-400">اللون: {row.color}</div>
                            </article>
                        ))}
                        {viewMode === 'MODEL' && filteredByModel.map((row: any) => (
                            <article key={row.modelNo} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><h3 className="text-lg font-black text-blue-700">{row.modelNo}</h3><p className="mt-1 text-xs font-bold text-slate-400">{row.receipts} إيصالات</p></div><div className="text-left"><strong className="block text-xl font-black text-amber-600">{row.quantity}</strong><small className="text-[10px] font-bold text-slate-400">آخر إيصال {new Date(row.lastDate).toLocaleDateString('ar-EG')}</small></div></article>
                        ))}
                        {viewMode === 'EMPLOYEE' && filteredByEmployee.map((row: any) => (
                            <article key={row.empName} className="flex items-center justify-between rounded-2xl border border-purple-100 bg-white p-4 shadow-sm"><h3 className="font-black text-slate-800">{row.empName}</h3><div className="text-left"><strong className="block text-xl font-black text-purple-600">{row.quantity}</strong><small className="text-[10px] font-bold text-slate-400">{row.receipts} إيصالات</small></div></article>
                        ))}
                        {((viewMode === 'DETAIL' && filteredDetail.length === 0) || (viewMode === 'MODEL' && filteredByModel.length === 0) || (viewMode === 'EMPLOYEE' && filteredByEmployee.length === 0)) && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">{itemSearch ? 'لا توجد نتائج تطابق البحث الحالي' : 'لا توجد بيانات لهذه الفترة'}</div>}
                    </div>
                </>
            )}
        </div>
    );
}
