'use client'

import { 
    addProduct, 
    getProducts, 
    deleteProduct, 
    addBulkProducts, 
    deleteBulkProducts, 
    deleteAllProducts, 
    updateProduct, 
    syncFromGoogleSheets,
    getSyncOperations,
    revertSyncOperation,
    previewBulkProductSize,
    applyBulkProductSize,
    clearBulkProductSize,
    SizeRangeMode
} from '@/app/admin-actions';
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';

interface SizePreviewResult {
    success: boolean;
    error?: string;
    fromCode?: string;
    toCode?: string;
    totalRowsCount?: number;
    uniqueModelsCount?: number;
    alreadyHasSizeCount?: number;
    emptySizeCount?: number;
    willUpdateCount?: number;
    sampleModels?: Array<{ modelNo: string; currentSize: string }>;
}

interface SizeSessionLog {
    id: number;
    fromCode: string;
    toCode: string;
    sizeText: string;
    updatedCount: number;
    uniqueModelsCount: number;
    actionType: 'APPLY' | 'CLEAR';
    time: string;
}

const DEFAULT_SIZE_SUGGESTIONS = [
    'بيبي من 1:4',
    'وسط من 5:8',
    'محير من 9:12',
    'شبابي',
    'مواليد',
];

function AdminSyncControl({ onRefresh }: { onRefresh: () => void }) {
    const [startDate, setStartDate] = useState("2025-06-01");
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncHistory, setSyncHistory] = useState<any[]>([]);
    const [isReverting, setIsReverting] = useState<string | null>(null);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        const history = await getSyncOperations();
        setSyncHistory(history);
    };

    const handleSync = async () => {
        if (!confirm(`سيتم سحب كافة البيانات المضافة في جوجل شيت منذ يوم ${startDate}، هل أنت متأكد؟`)) return;
        
        setIsSyncing(true);
        const result = await syncFromGoogleSheets(startDate);
        
        if (result.success) {
            alert(result.message);
            loadHistory();
            onRefresh();
        } else {
            alert("فشل المزامنة: " + result.error);
        }
        setIsSyncing(false);
    };

    const handleRevert = async (op: any) => {
        if (!confirm(`تحذير: سيتم التراجع عن هذه العملية التي شملت ${op.itemsCount} صنف.\nسيتم خصم الكميات المضافة وإلغاء العملية.\nهل أنت متأكد؟`)) return;
        
        setIsReverting(op.id);
        const res = await revertSyncOperation(op.id);
        setIsReverting(null);

        if (res.success) {
            alert("تم التراجع بنجاح وإلغاء العملية.");
            loadHistory();
            onRefresh();
        } else {
            alert("خطأ: " + res.error);
        }
    };

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-green-100 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 pb-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-500 mr-1">بدء المزامنة من تاريخ:</label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)}
                        className="p-2 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-700"
                    />
                </div>

                <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className={`mt-5 bg-green-600 text-white px-8 py-2.5 rounded-xl font-black shadow-lg shadow-green-100 transition-all active:scale-95 flex items-center gap-2 ${isSyncing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'}`}
                >
                    {isSyncing ? (
                        <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> جاري السحب...</>
                    ) : (
                        <><span>🔄 مزامنة جوجل شيت</span></>
                    )}
                </button>
            </div>

            {syncHistory.length > 0 && (
                <div className="w-full">
                    <h4 className="text-xs font-bold text-gray-500 mb-2">أحدث عمليات المزامنة:</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-right border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-600">
                                    <th className="p-2 border">وقت العملية</th>
                                    <th className="p-2 border">تاريخ الاستهداف</th>
                                    <th className="p-2 border">عدد الأصناف</th>
                                    <th className="p-2 border text-center">إجراء</th>
                                </tr>
                            </thead>
                            <tbody>
                                {syncHistory.map((op) => (
                                    <tr key={op.id} className="border-b hover:bg-gray-50">
                                        <td className="p-2 border font-mono text-[10px]" dir="ltr">
                                            {new Date(op.createdAt).toLocaleString('en-GB')}
                                        </td>
                                        <td className="p-2 border font-bold text-blue-600">
                                            {new Date(op.startDate).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="p-2 border font-bold text-green-600">
                                            {op.itemsCount} حركة
                                        </td>
                                        <td className="p-2 border text-center">
                                            <button 
                                                onClick={() => handleRevert(op)}
                                                disabled={isReverting === op.id}
                                                className="bg-red-50 text-red-600 px-3 py-1 rounded font-bold hover:bg-red-100 disabled:opacity-50"
                                            >
                                                {isReverting === op.id ? 'جاري الإلغاء...' : '↩️ تراجع'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Adding States
  const [modelNo, setModelNo] = useState('');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('0');
  const [status, setStatus] = useState('OPEN');
  const [groupName, setGroupName] = useState('');
  const [kindName, setKindName] = useState('');
  const [colors, setColors] = useState([{ color: '', stock: '' }]);

  // Edit States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Bulk Size Modal States
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);
  const [sizeMode, setSizeMode] = useState<SizeRangeMode>('AUTO');
  const [sizeBaseCode, setSizeBaseCode] = useState('');
  const [sizeCustomFrom, setSizeCustomFrom] = useState('');
  const [sizeCustomTo, setSizeCustomTo] = useState('');
  const [sizeValue, setSizeValue] = useState('');
  const [sizeOnlyEmpty, setSizeOnlyEmpty] = useState(false);
  const [sizePreview, setSizePreview] = useState<SizePreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplyingSize, setIsApplyingSize] = useState(false);
  const [sizeFeedback, setSizeFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sizeSessionLogs, setSizeSessionLogs] = useState<SizeSessionLog[]>([]);
  const [sizePreviewTick, setSizePreviewTick] = useState(0);
  const sizeBaseCodeInputRef = useRef<HTMLInputElement>(null);

  // Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Deleting State
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    refreshProducts();
  }, []);

  const refreshProducts = () => {
    getProducts().then(res => {
        setProducts(res);
        setSelectedIds([]);
    });
  };

  // قائمة المقاسات السريعة (الافتراضية + المسجلة بالفعل في المنتجات)
  const quickSizeSuggestions = useMemo(() => {
    const set = new Set<string>(DEFAULT_SIZE_SUGGESTIONS);
    products.forEach((p) => {
      if (p.size && String(p.size).trim()) {
        set.add(String(p.size).trim());
      }
    });
    return Array.from(set).slice(0, 14);
  }, [products]);

  // معاينة النطاق تلقائياً عند تغيير المدخلات
  useEffect(() => {
    if (!isSizeModalOpen) return;

    const hasInput =
      sizeMode === 'CUSTOM'
        ? sizeCustomFrom.trim().length > 0 && sizeCustomTo.trim().length > 0
        : sizeBaseCode.trim().length > 0;

    if (!hasInput) {
      setSizePreview(null);
      setIsPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);

    const timer = setTimeout(async () => {
      const res = await previewBulkProductSize({
        baseCode: sizeBaseCode,
        mode: sizeMode,
        customFrom: sizeCustomFrom,
        customTo: sizeCustomTo,
        onlyEmpty: sizeOnlyEmpty,
      });

      if (!cancelled) {
        setSizePreview(res);
        setIsPreviewLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isSizeModalOpen,
    sizeMode,
    sizeBaseCode,
    sizeCustomFrom,
    sizeCustomTo,
    sizeOnlyEmpty,
    sizePreviewTick,
  ]);

  const openSizeModal = () => {
    setSizeFeedback(null);
    setIsSizeModalOpen(true);
    setTimeout(() => sizeBaseCodeInputRef.current?.focus(), 100);
  };

  const handleApplyBulkSize = async (e: React.FormEvent) => {
    e.preventDefault();
    setSizeFeedback(null);

    if (!sizeValue.trim()) {
      setSizeFeedback({ type: 'error', text: 'يرجى كتابة المقاس أولاً (مثال: بيبي من 1:4).' });
      return;
    }

    setIsApplyingSize(true);
    const res = await applyBulkProductSize({
      baseCode: sizeBaseCode,
      size: sizeValue,
      mode: sizeMode,
      customFrom: sizeCustomFrom,
      customTo: sizeCustomTo,
      onlyEmpty: sizeOnlyEmpty,
    });
    setIsApplyingSize(false);

    if (res.success) {
      const msg = `تم تطبيق المقاس "${sizeValue.trim()}" على ${res.updatedCount} صنف (${res.uniqueModelsCount} موديل) في النطاق من ${res.fromCode} إلى ${res.toCode}.`;
      setSizeFeedback({ type: 'success', text: msg });
      setSizeSessionLogs((prev) => [
        {
          id: Date.now(),
          fromCode: res.fromCode,
          toCode: res.toCode,
          sizeText: sizeValue.trim(),
          updatedCount: res.updatedCount,
          uniqueModelsCount: res.uniqueModelsCount,
          actionType: 'APPLY',
          time: new Date().toLocaleTimeString('ar-EG'),
        },
        ...prev,
      ]);

      setSizeBaseCode('');
      setSizeCustomFrom('');
      setSizeCustomTo('');
      setSizeValue('');
      setSizePreview(null);
      refreshProducts();
      sizeBaseCodeInputRef.current?.focus();
    } else {
      setSizeFeedback({ type: 'error', text: res.error || 'فشل تطبيق المقاسات.' });
    }
  };

  const handleClearBulkSize = async () => {
    if (!sizePreview?.success || !sizePreview.alreadyHasSizeCount) return;
    if (
      !confirm(
        `هل أنت متأكد من مسح المقاسات المسجلة في النطاق من ${sizePreview.fromCode} إلى ${sizePreview.toCode} (${sizePreview.alreadyHasSizeCount} صنف)؟`
      )
    ) {
      return;
    }

    setIsApplyingSize(true);
    setSizeFeedback(null);

    const res = await clearBulkProductSize({
      baseCode: sizeBaseCode,
      mode: sizeMode,
      customFrom: sizeCustomFrom,
      customTo: sizeCustomTo,
    });

    setIsApplyingSize(false);

    if (res.success) {
      setSizeFeedback({
        type: 'success',
        text: `تم مسح المقاسات لعدد ${res.clearedCount} صنف في النطاق من ${res.fromCode} إلى ${res.toCode}.`,
      });
      setSizeSessionLogs((prev) => [
        {
          id: Date.now(),
          fromCode: res.fromCode,
          toCode: res.toCode,
          sizeText: 'مسح المقاسات',
          updatedCount: res.clearedCount,
          uniqueModelsCount: 0,
          actionType: 'CLEAR',
          time: new Date().toLocaleTimeString('ar-EG'),
        },
        ...prev,
      ]);
      setSizePreviewTick((t) => t + 1);
      refreshProducts();
    } else {
      setSizeFeedback({ type: 'error', text: res.error || 'تعذر مسح المقاسات.' });
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
        p.modelNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.color && p.color.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.material && p.material.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.size && p.size.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [products, searchTerm]);

  const handleAddColorField = () => {
    setColors([...colors, { color: '', stock: '' }]);
  };

  const handleColorChange = (index: number, field: string, value: string) => {
    const newColors: any = [...colors];
    newColors[index][field] = value;
    setColors(newColors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelNo || !price) return alert('أكمل البيانات');

    const res = await addProduct({
        modelNo,
        description,
        material,
        size,
        price,
        discount,
        status,
        group_name: groupName,
        kind_name: kindName,
        colors
    });

    if (res.success) {
        alert('تمت الإضافة');
        setModelNo(''); setDescription(''); setMaterial(''); setSize(''); setPrice(''); setDiscount('0');
        setGroupName(''); setKindName('');
        setColors([{ color: '', stock: '' }]);
        refreshProducts();
    } else {
        alert('خطأ: ' + res.error);
    }
  };

  // نموذج الإكسيل الموحد شاملاً عمود المقاس العام (size)
  const downloadTemplate = () => {
    const templateData = [
      {
        modelNo: "3700",
        color: "لبني",
        material: "3700لبني",
        size: "من 1:4 بيبي",
        description: "طقم بناتي قطعتين",
        price: 425,
        discount: 0,
        stockQty: 80,
        status: "OPEN",
        group_name: "بناتي",
        kind_name: "طقم",
        images: "https://images.vooy.shop/3700-لبني.webp"
      },
      {
        modelNo: "4700",
        color: "كافيه",
        material: "4700كافيه",
        size: "من 5:8 وسط",
        description: "طقم بناتي قطعتين",
        price: 450,
        discount: 0,
        stockQty: 60,
        status: "OPEN",
        group_name: "بناتي",
        kind_name: "طقم",
        images: "https://images.vooy.shop/4700-كافيه.webp"
      },
      {
        modelNo: "5700",
        color: "رمادي",
        material: "5700رمادي",
        size: "من 9:12 محير",
        description: "طقم بناتي قطعتين",
        price: 480,
        discount: 10,
        stockQty: 200,
        status: "OPEN",
        group_name: "بناتي",
        kind_name: "طقم",
        images: "https://images.vooy.shop/5700-رمادي.webp"
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Unified_Products");
    XLSX.writeFile(wb, "Unified_Products_Template.xlsx");
  };

  const downloadProducts = () => {
    if (products.length === 0) {
        alert('لا توجد أصناف حالياً للتنزيل');
        return;
    }

    const productData = products.map(product => ({
        modelNo: product.modelNo,
        color: product.color,
        material: product.material || `${product.modelNo}${product.color}`,
        size: product.size || '',
        description: product.description || '',
        price: product.price,
        discount: product.discount || 0,
        stockQty: product.currentStock,
        status: product.status,
        group_name: product.group_name || '',
        kind_name: product.kind_name || '',
        images: product.image || ''
    }));
    const ws = XLSX.utils.json_to_sheet(productData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Uploaded_Products_Backup.xlsx");
  };

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if(!file) return;

    setUploadProgress(0);
    setUploadStatusText('');
    
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if(confirm(`تم قراءة ${data.length} صنف. هل تريد البدء في الرفع التراكمي الموحد؟`)) {
            setIsUploading(true);
            const BATCH_SIZE = 100;
            let successCount = 0;
            let failCount = 0;
            const total = data.length;

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const chunk = data.slice(i, i + BATCH_SIZE);
                setUploadStatusText(`جاري معالجة المجموعة ${Math.floor(i/BATCH_SIZE) + 1} من ${Math.ceil(total/BATCH_SIZE)}...`);
                
                try {
                    const res = await addBulkProducts(chunk as any[]);
                    if (res.success) {
                        successCount += (res.count || 0);
                    } else {
                        failCount += chunk.length;
                    }
                } catch {
                    failCount += chunk.length;
                }

                const percent = Math.round(((i + chunk.length) / total) * 100);
                setUploadProgress(percent);
            }

            setIsUploading(false);
            setUploadStatusText(`✅ اكتملت العملية. ناجح: ${successCount} | فشل: ${failCount}`);
            alert(`تم الانتهاء من المعالجة:\n- أصناف تم رفعها/تحديثها: ${successCount}\n- أصناف فشلت: ${failCount}`);
            refreshProducts();
            e.target.value = '';
        }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = async (id: string) => {
    if (confirm('حذف هذا الصنف نهائياً؟')) {
      setIsDeleting(true);
      const res = await deleteProduct(id);
      setIsDeleting(false);

      if(res.success) {
          refreshProducts();
      } else {
          alert('❌ فشل الحذف: ' + res.error);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if(selectedIds.length === 0) return;
    if(confirm(`هل أنت متأكد من محاولة حذف ${selectedIds.length} صنف؟`)) {
        setIsDeleting(true);
        const res = await deleteBulkProducts(selectedIds);
        setIsDeleting(false);

        if(res.success) {
            alert(`✅ تقرير الحذف:\n- تم حذف: ${res.deleted} صنف.\n- فشل حذف: ${res.failed} صنف (مرتبطة بطلبات بيع).`);
            refreshProducts();
        } else {
            alert('حدث خطأ غير متوقع');
        }
    }
  };

  const handleDeleteAll = async () => {
    const confirm1 = confirm("⚠️ تحذير خطير!\nهل أنت متأكد أنك تريد حذف جميع الأصناف من النظام؟");
    if(confirm1) {
        if(confirm("سيتم حذف الأصناف التي ليس لها مبيعات فقط.\nهل تريد الاستمرار؟")) {
            setIsDeleting(true);
            const res = await deleteAllProducts();
            setIsDeleting(false);

            if(res.success) {
                alert(`✅ تقرير الحذف الشامل:\n- تم حذف: ${res.deleted} صنف.\n- متبقي: ${res.failed} صنف.`);
                refreshProducts();
            } else {
                alert("خطأ: " + res.error);
            }
        }
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if(e.target.checked) setSelectedIds(filteredProducts.map(p => p.id));
      else setSelectedIds([]);
  };

  const handleSelectOne = (id: string) => {
      if(selectedIds.includes(id)) setSelectedIds(selectedIds.filter(itemId => itemId !== id));
      else setSelectedIds([...selectedIds, id]);
  };

  const handleEditClick = (product: any) => {
      setEditingProduct({ ...product, applySizeToModel: true });
      setIsEditModalOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!editingProduct) return;
      
      const res = await updateProduct(editingProduct.id, editingProduct);
      if(res.success) {
          alert('تم التعديل بنجاح');
          setIsEditModalOpen(false);
          setEditingProduct(null);
          refreshProducts();
      } else {
          alert('خطأ: ' + res.error);
      }
  };

  return (
    <div className="space-y-6 relative pb-20" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded shadow-sm border-r-4 border-r-green-600">
        <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">إدارة الأصناف (المعرض والمتجر)</h1>
            <p className="text-xs text-green-600 font-bold mt-1">العدد المصفى: {filteredProducts.length}</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
            <div className="w-full md:w-64">
                <input 
                    type="text" 
                    placeholder="🔍 بحث برقم الموديل أو اللون أو المقاس..." 
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-blue-500 outline-none text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <button
                type="button"
                onClick={openSizeModal}
                className="flex-1 md:flex-none bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-black shadow-md shadow-purple-100 flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
                <span>📏</span>
                <span>إضافة المقاسات</span>
            </button>

            {selectedIds.length > 0 && (
                <button 
                    onClick={handleDeleteSelected} 
                    disabled={isDeleting}
                    className={`flex-1 md:flex-none text-white px-4 py-2 rounded text-sm font-bold shadow transition-all ${isDeleting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 animate-pulse'}`}>
                    {isDeleting ? '⏳...' : `حذف (${selectedIds.length})`}
                </button>
            )}
            <button 
                onClick={handleDeleteAll} 
                disabled={isDeleting}
                className={`flex-1 md:flex-none text-white px-4 py-2 rounded text-sm font-bold shadow transition-all ${isDeleting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900'}`}>
                {isDeleting ? '⏳...' : '⚠️ حذف الكل'}
            </button>
        </div>
      </div>

      {/* Sync Section */}
      <AdminSyncControl onRefresh={refreshProducts} />

      {/* Upload Section */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
            <div className="w-full">
                <h3 className="font-bold text-blue-800 text-sm md:text-lg">📥 استيراد Excel الموحد (المعرض + المتجر)</h3>
                <div className="flex justify-between items-center mt-1">
                    <div className="flex gap-3">
                        <button onClick={downloadTemplate} className="text-xs text-blue-700 underline font-bold">تحميل النموذج الموحد</button>
                        <button onClick={downloadProducts} className="text-xs text-green-700 underline font-bold">نسخ احتياطي للأصناف</button>
                    </div>
                    <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isUploading || isDeleting} className="text-xs bg-white p-2 rounded border cursor-pointer w-1/2" />
                </div>
            </div>
          </div>

          {(isUploading || uploadProgress > 0) && (
             <div className="w-full bg-white p-2 rounded shadow-sm border border-blue-100 mt-2">
                <div className="flex justify-between text-[10px] font-bold text-blue-800 mb-1">
                    <span>{uploadStatusText}</span>
                    <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-in-out striped-progress" style={{ width: `${uploadProgress}%` }}></div>
                </div>
             </div>
          )}
      </div>

      {/* Form Adding */}
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow space-y-4 border-t-4 border-green-600">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2">
            <h2 className="font-bold text-gray-700 text-sm">إضافة صنف جديد (بالمفتاح المميز وتصنيفات المتجر والمقاس العام)</h2>
            <button
                type="button"
                onClick={openSizeModal}
                className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg font-black transition-colors"
            >
                📏 توزيع المقاسات لنطاق موديلات (مثل 3700 ← 3799)
            </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">الموديل (modelNo) *</label><input type="text" className="w-full border p-2 rounded bg-gray-50 focus:bg-white" value={modelNo} onChange={e => setModelNo(e.target.value)} required /></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">الكي / الماتيريال (اختياري)</label><input type="text" className="w-full border p-2 rounded focus:bg-white" placeholder="مثلاً: 301لبني" value={material} onChange={e => setMaterial(e.target.value)} /></div>
            <div><label className="block text-xs font-bold text-purple-700 mb-1">المقاس العام (size)</label><input type="text" className="w-full border p-2 rounded focus:bg-white" placeholder="من 1:4 بيبي" value={size} onChange={e => setSize(e.target.value)} /></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">سعر القطعة *</label><input type="number" className="w-full border p-2 rounded font-bold focus:bg-white" value={price} onChange={e => setPrice(e.target.value)} required /></div>
            <div><label className="block text-xs font-bold text-red-600 mb-1">خصم تلقائي %</label><input type="number" className="w-full border p-2 rounded font-bold focus:bg-red-50" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">الوصف / اسم الموديل</label><input type="text" className="w-full border p-2 rounded focus:bg-white" value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div><label className="block text-xs font-bold text-indigo-700 mb-1">قسم المتجر (group_name)</label><input type="text" placeholder="بناتي / ولادي / أطفال" className="w-full border p-2 rounded focus:bg-white" value={groupName} onChange={e => setGroupName(e.target.value)} /></div>
            <div><label className="block text-xs font-bold text-indigo-700 mb-1">نوع القطعة بالمتجر (kind_name)</label><input type="text" placeholder="طقم / فستان / شورت" className="w-full border p-2 rounded focus:bg-white" value={kindName} onChange={e => setKindName(e.target.value)} /></div>
        </div>
        
        <div className="flex gap-4 items-center bg-gray-50 p-2 rounded">
             <span className="text-xs font-bold text-gray-500">الحالة:</span>
             <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="status" value="OPEN" checked={status === 'OPEN'} onChange={() => setStatus('OPEN')} /><span className="text-green-600 text-xs font-bold">مفتوح</span></label>
             <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="status" value="CLOSED" checked={status === 'CLOSED'} onChange={() => setStatus('CLOSED')} /><span className="text-red-600 text-xs font-bold">مغلق</span></label>
        </div>

        <div className="bg-gray-50 p-3 rounded border">
            <label className="block text-xs font-bold mb-2">الألوان والمخزون المتاح (بالقطع)</label>
            {colors.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" placeholder="اللون" className="border p-2 rounded flex-1 text-sm" value={item.color} onChange={e => handleColorChange(idx, 'color', e.target.value)} required />
                    <input type="number" placeholder="عدد القطع" className="border p-2 rounded w-28 text-center text-sm font-bold" value={item.stock} onChange={e => handleColorChange(idx, 'stock', e.target.value)} required />
                </div>
            ))}
            <button type="button" onClick={handleAddColorField} className="text-xs text-blue-600 font-bold mt-1">+ إضافة لون آخر لنفس الموديل</button>
        </div>
        <button type="submit" disabled={isDeleting} className="bg-green-600 text-white px-6 py-3 rounded font-bold w-full hover:bg-green-700 disabled:opacity-50 transition">حفظ الصنف الموحد</button>
      </form>

      {/* --- Responsive List --- */}
      <div className="relative">
        {isDeleting && (
            <div className="absolute inset-0 bg-white bg-opacity-80 z-20 flex justify-center items-center rounded-lg">
                <div className="text-red-600 font-bold text-lg animate-pulse">⏳ جاري الحذف...</div>
            </div>
        )}

        {/* 1. Mobile View (Cards) */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
            <div className="flex justify-between items-center px-2">
                <span className="text-xs font-bold text-gray-500">العدد المصفى: {filteredProducts.length}</span>
                <label className="flex items-center gap-2 text-xs font-bold bg-gray-100 px-3 py-1 rounded">
                    <input type="checkbox" onChange={handleSelectAll} checked={filteredProducts.length > 0 && selectedIds.length === filteredProducts.length} />
                    تحديد المعروض
                </label>
            </div>
            {filteredProducts.map(p => (
                <div key={p.id} className={`bg-white p-4 rounded-lg shadow border-l-4 ${selectedIds.includes(p.id) ? 'border-l-blue-500 bg-blue-50' : 'border-l-gray-300'}`}>
                    <div className="flex justify-between items-start mb-2">
                         <div className="flex items-center gap-3">
                            <input type="checkbox" className="w-5 h-5" checked={selectedIds.includes(p.id)} onChange={() => handleSelectOne(p.id)} />
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-gray-800 text-lg">{p.modelNo}</h3>
                                    {p.size && <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">📏 {p.size}</span>}
                                    {p.discount > 0 && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold">خصم {p.discount}%</span>}
                                    {p.status === 'CLOSED' && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">مغلق</span>}
                                </div>
                                <span className="text-xs text-gray-500 font-bold">اللون: {p.color}</span>
                                {p.material && <span className="block text-[11px] font-mono text-indigo-600 font-bold">كي: {p.material}</span>}
                            </div>
                         </div>
                         <div className="text-left">
                             <div className="font-bold text-blue-600 text-lg">{p.price} ج.م</div>
                             <div className={`text-xs font-bold ${p.currentStock > 0 ? 'text-green-600' : 'text-red-500'}`}>متاح: {p.currentStock} قطعة ({Math.floor(p.currentStock / 4)} سرية)</div>
                         </div>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2 mt-2">
                        <span className="text-[10px] text-gray-400">قسم: {p.group_name || 'عام'} - نوع: {p.kind_name || 'عام'}</span>
                        <div className="flex gap-2">
                            <button onClick={() => handleEditClick(p)} className="bg-blue-100 text-blue-600 px-3 py-1 rounded text-xs font-bold">تعديل</button>
                            <button onClick={() => handleDelete(p.id)} className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs font-bold">حذف</button>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* 2. Desktop View (Table) */}
        <div className="hidden md:block bg-white rounded-lg shadow overflow-x-auto">
            <div className="p-2 bg-gray-50 border-b flex justify-between items-center text-xs text-gray-500">
                <span>عدد الأصناف المصفاة: {filteredProducts.length}</span>
                <span>المحدد: {selectedIds.length}</span>
            </div>
            <table className="w-full text-sm text-right">
            <thead className="bg-gray-100 text-gray-700">
                <tr>
                <th className="p-3 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} checked={filteredProducts.length > 0 && selectedIds.length === filteredProducts.length} /></th>
                <th className="p-3">الموديل</th>
                <th className="p-3">اللون</th>
                <th className="p-3">المقاس العام</th>
                <th className="p-3">الكي المميز (material)</th>
                <th className="p-3">قسم المتجر</th>
                <th className="p-3">نوع القطعة</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">المخزون (قطع)</th>
                <th className="p-3">المخزون (سرايا)</th>
                <th className="p-3">سعر القطعة</th>
                <th className="p-3 text-center">تحكم</th>
                </tr>
            </thead>
            <tbody>
                {filteredProducts.map(p => (
                <tr key={p.id} className={`border-b hover:bg-gray-50 ${selectedIds.includes(p.id) ? 'bg-blue-50' : ''}`}>
                    <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => handleSelectOne(p.id)} /></td>
                    <td className="p-3 font-bold">{p.modelNo}</td>
                    <td className="p-3">{p.color}</td>
                    <td className="p-3 text-xs font-bold text-purple-700">{p.size || '-'}</td>
                    <td className="p-3 font-mono font-bold text-indigo-700">{p.material || `${p.modelNo}${p.color}`}</td>
                    <td className="p-3 text-xs">{p.group_name || '-'}</td>
                    <td className="p-3 text-xs">{p.kind_name || '-'}</td>
                    <td className="p-3">{p.status === 'CLOSED' ? <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">مغلق</span> : <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">مفتوح</span>}</td>
                    <td className={`p-3 font-bold ${p.currentStock <= 0 ? 'text-red-500' : 'text-blue-600'}`}>{p.currentStock}</td>
                    <td className="p-3 font-bold text-emerald-700">{Math.floor(p.currentStock / 4)}</td>
                    <td className="p-3 font-mono font-bold">{p.price} ج.م</td>
                    <td className="p-3 flex justify-center gap-2">
                    <button onClick={() => handleEditClick(p)} className="text-blue-600 hover:text-blue-800 font-bold bg-blue-100 px-2 py-1 rounded text-xs">تعديل</button>
                    <button onClick={() => handleDelete(p.id)} disabled={isDeleting} className="text-red-600 hover:text-red-800 font-bold bg-red-100 px-2 py-1 rounded text-xs disabled:opacity-50">حذف</button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>

      {/* Bulk Size Assignment Modal */}
      {isSizeModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-3 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
                  {/* Modal Header */}
                  <div className="bg-gradient-to-l from-purple-700 to-indigo-700 text-white p-5 flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-lg sm:text-xl font-black flex items-center gap-2">
                              <span>📏</span>
                              <span>إضافة المقاسات الجماعية حسب نطاق الموديلات</span>
                          </h3>
                          <p className="text-xs text-purple-100 mt-1">
                              تحديث عمود المقاس العام تلقائياً (مثال: 3700 ← 3799 | 600 ← 699 | 3000 ← 3999)
                          </p>
                      </div>
                      <button
                          type="button"
                          onClick={() => setIsSizeModalOpen(false)}
                          className="text-white/80 hover:text-white text-2xl font-bold p-1"
                      >
                          ✕
                      </button>
                  </div>

                  {/* Modal Body */}
                  <form onSubmit={handleApplyBulkSize} className="p-5 overflow-y-auto flex-1 space-y-5">
                      {sizeFeedback && (
                          <div
                              className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold border ${
                                  sizeFeedback.type === 'success'
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                      : 'bg-red-50 border-red-300 text-red-700'
                              }`}
                          >
                              {sizeFeedback.type === 'success' ? '✅ ' : '⚠️ '}
                              {sizeFeedback.text}
                          </div>
                      )}

                      {/* 1. طريقة تحديد النطاق */}
                      <div className="space-y-2">
                          <label className="block text-xs font-black text-gray-600">
                              1. طريقة تحديد النطاق:
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                  { id: 'AUTO', label: '🎯 تلقائي بالأصفار', desc: '3700←3799 / 3000←3999' },
                                  { id: 'LAST_2', label: '💯 نطاق المئة (×99)', desc: 'مثلاً 3000←3099' },
                                  { id: 'CUSTOM', label: '🔢 من - إلى', desc: 'تحديد بداية ونهاية' },
                                  { id: 'EXACT', label: '📌 موديل محدد', desc: 'موديل واحد فقط' },
                              ].map((opt) => (
                                  <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => setSizeMode(opt.id as SizeRangeMode)}
                                      className={`p-2.5 rounded-xl border text-right transition-all ${
                                          sizeMode === opt.id
                                              ? 'bg-purple-50 border-purple-600 ring-2 ring-purple-200 text-purple-900'
                                              : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                      }`}
                                  >
                                      <div className="text-xs font-black">{opt.label}</div>
                                      <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* 2. إدخال الكود أو النطاق */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          {sizeMode === 'CUSTOM' ? (
                              <div className="grid grid-cols-2 gap-2">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-600 mb-1">
                                          من موديل *
                                      </label>
                                      <input
                                          ref={sizeBaseCodeInputRef}
                                          type="text"
                                          value={sizeCustomFrom}
                                          onChange={(e) => setSizeCustomFrom(e.target.value)}
                                          placeholder="3700"
                                          className="w-full p-3 border-2 border-purple-200 rounded-xl font-mono font-black text-base bg-white outline-none focus:border-purple-600"
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-600 mb-1">
                                          إلى موديل *
                                      </label>
                                      <input
                                          type="text"
                                          value={sizeCustomTo}
                                          onChange={(e) => setSizeCustomTo(e.target.value)}
                                          placeholder="3749"
                                          className="w-full p-3 border-2 border-purple-200 rounded-xl font-mono font-black text-base bg-white outline-none focus:border-purple-600"
                                      />
                                  </div>
                              </div>
                          ) : (
                              <div>
                                  <label className="block text-xs font-bold text-gray-600 mb-1">
                                      كود الموديل الأساسي *
                                  </label>
                                  <input
                                      ref={sizeBaseCodeInputRef}
                                      type="text"
                                      value={sizeBaseCode}
                                      onChange={(e) => setSizeBaseCode(e.target.value)}
                                      placeholder="مثال: 3700 أو 600 أو 3000"
                                      className="w-full p-3 border-2 border-purple-200 rounded-xl font-mono font-black text-base bg-white outline-none focus:border-purple-600"
                                  />
                                  <p className="text-[11px] text-gray-400 mt-1">
                                      {sizeMode === 'AUTO' && 'أمثلة: 3700 ← 3799 | 600 ← 699 | 3000 ← 3999'}
                                      {sizeMode === 'LAST_2' && 'مثال: 3000 ← 3099 | 3700 ← 3799'}
                                      {sizeMode === 'EXACT' && 'يطبق على كود الموديل المكتوب فقط'}
                                  </p>
                              </div>
                          )}

                          <div>
                              <label className="block text-xs font-bold text-purple-800 mb-1">
                                  المقاس المطلوب تطبيقه *
                              </label>
                              <input
                                  type="text"
                                  value={sizeValue}
                                  onChange={(e) => setSizeValue(e.target.value)}
                                  placeholder="مثال: بيبي من 1:4"
                                  className="w-full p-3 border-2 border-purple-200 rounded-xl font-bold text-base bg-white outline-none focus:border-purple-600"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">
                                  سيُكتب مباشرة في عمود المقاس العام (size) لكل ألوان النطاق
                              </p>
                          </div>
                      </div>

                      {/* اختصارات سريعة للمقاسات */}
                      <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-gray-500 block">
                              اختصارات سريعة للمقاسات (اضغط للاختيار):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                              {quickSizeSuggestions.map((preset) => (
                                  <button
                                      key={preset}
                                      type="button"
                                      onClick={() => setSizeValue(preset)}
                                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                                          sizeValue.trim() === preset
                                              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                              : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                                      }`}
                                  >
                                      {preset}
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* خيار الكتابة فوق الموجود أم الفارغ فقط */}
                      <div className="flex flex-wrap gap-4 bg-purple-50/60 p-3 rounded-xl border border-purple-100 text-xs font-bold">
                          <label className="flex items-center gap-2 cursor-pointer text-gray-800">
                              <input
                                  type="radio"
                                  name="sizeOverwriteMode"
                                  checked={!sizeOnlyEmpty}
                                  onChange={() => setSizeOnlyEmpty(false)}
                              />
                              <span>تطبيق على جميع الأصناف في النطاق (استبدال القديم إن وجد)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-purple-900">
                              <input
                                  type="radio"
                                  name="sizeOverwriteMode"
                                  checked={sizeOnlyEmpty}
                                  onChange={() => setSizeOnlyEmpty(true)}
                              />
                              <span>تطبيق على الأصناف التي بدون مقاس فقط</span>
                          </label>
                      </div>

                      {/* بطاقة المعاينة المباشرة */}
                      {(isPreviewLoading || sizePreview) && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                              <div className="flex justify-between items-center">
                                  <span className="text-xs font-black text-slate-700">
                                      🔍 معاينة النطاق المباشرة
                                  </span>
                                  {isPreviewLoading && (
                                      <span className="text-xs font-bold text-purple-600 animate-pulse">
                                          جاري الفحص...
                                      </span>
                                  )}
                              </div>

                              {!isPreviewLoading && sizePreview && !sizePreview.success && (
                                  <p className="text-xs font-bold text-red-600">
                                      ⚠️ {sizePreview.error}
                                  </p>
                              )}

                              {!isPreviewLoading && sizePreview && sizePreview.success && (
                                  <>
                                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200">
                                          <div className="text-xs font-bold text-gray-600">
                                              النطاق الفعلي المستهدف:{' '}
                                              <span className="font-mono font-black text-purple-700 text-sm">
                                                  {sizePreview.fromCode}
                                              </span>
                                              {' ← '}
                                              <span className="font-mono font-black text-purple-700 text-sm">
                                                  {sizePreview.toCode}
                                              </span>
                                          </div>
                                          <div className="flex gap-2 text-xs font-black">
                                              <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">
                                                  {sizePreview.uniqueModelsCount} موديل
                                              </span>
                                              <span className="bg-purple-100 text-purple-800 px-2.5 py-1 rounded-lg">
                                                  سيتم تحديث: {sizePreview.willUpdateCount} صنف
                                              </span>
                                          </div>
                                      </div>

                                      {sizePreview.totalRowsCount === 0 ? (
                                          <p className="text-xs font-bold text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                                              لا توجد موديلات مسجلة حالياً ضمن هذا النطاق ({sizePreview.fromCode} - {sizePreview.toCode}).
                                          </p>
                                      ) : (
                                          <>
                                              <div className="text-[11px] font-bold text-gray-500 flex flex-wrap gap-3">
                                                  <span>إجمالي الأصناف (بالألوان): {sizePreview.totalRowsCount}</span>
                                                  <span>•</span>
                                                  <span className="text-amber-700">لديها مقاس سابق: {sizePreview.alreadyHasSizeCount}</span>
                                                  <span>•</span>
                                                  <span className="text-emerald-700">بدون مقاس: {sizePreview.emptySizeCount}</span>
                                              </div>

                                              {sizePreview.sampleModels && sizePreview.sampleModels.length > 0 && (
                                                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
                                                      {sizePreview.sampleModels.map((m) => (
                                                          <span
                                                              key={m.modelNo}
                                                              className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold border ${
                                                                  m.currentSize
                                                                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                                                                      : 'bg-white text-slate-700 border-slate-200'
                                                              }`}
                                                          >
                                                              {m.modelNo}
                                                              {m.currentSize ? ` (${m.currentSize})` : ''}
                                                          </span>
                                                      ))}
                                                      {(sizePreview.uniqueModelsCount || 0) > 20 && (
                                                          <span className="text-[11px] font-bold text-gray-400 px-2 py-0.5">
                                                              + {(sizePreview.uniqueModelsCount || 0) - 20} موديل آخر...
                                                          </span>
                                                      )}
                                                  </div>
                                              )}
                                          </>
                                      )}
                                  </>
                              )}
                          </div>
                      )}

                      {/* سجل العمليات المنفذة في الجلسة */}
                      {sizeSessionLogs.length > 0 && (
                          <div className="border-t border-gray-100 pt-3 space-y-2">
                              <h4 className="text-xs font-black text-gray-500">
                                  سجل التعديلات المنفذة في هذه النافذة:
                              </h4>
                              <div className="max-h-32 overflow-y-auto space-y-1.5">
                                  {sizeSessionLogs.map((log) => (
                                      <div
                                          key={log.id}
                                          className={`flex justify-between items-center text-xs px-3 py-2 rounded-xl border ${
                                              log.actionType === 'APPLY'
                                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                                  : 'bg-red-50/70 border-red-200 text-red-900'
                                          }`}
                                      >
                                          <div className="font-bold">
                                              <span className="font-mono">{log.fromCode} → {log.toCode}</span>
                                              {' : '}
                                              <span>{log.sizeText}</span>
                                          </div>
                                          <div className="text-[11px] font-bold">
                                              {log.updatedCount} صنف ({log.time})
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {/* Footer Buttons */}
                      <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-gray-100">
                          <button
                              type="button"
                              onClick={handleClearBulkSize}
                              disabled={
                                  isApplyingSize ||
                                  !sizePreview?.success ||
                                  !sizePreview.alreadyHasSizeCount
                              }
                              className="px-3.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                              🗑️ مسح مقاس النطاق
                          </button>

                          <div className="flex gap-2">
                              <button
                                  type="button"
                                  onClick={() => setIsSizeModalOpen(false)}
                                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700 text-sm"
                              >
                                  إغلاق
                              </button>
                              <button
                                  type="submit"
                                  disabled={
                                      isApplyingSize ||
                                      isPreviewLoading ||
                                      !sizeValue.trim() ||
                                      !sizePreview?.success ||
                                      (sizePreview.willUpdateCount || 0) === 0
                                  }
                                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-sm shadow-lg shadow-purple-200 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
                              >
                                  {isApplyingSize
                                      ? '⏳ جاري التطبيق...'
                                      : `✅ تطبيق المقاس (${sizePreview?.willUpdateCount || 0} صنف)`}
                              </button>
                          </div>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
                  <h3 className="font-bold border-b pb-2 text-lg">تعديل بيانات الصنف</h3>
                  <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-gray-500">الموديل</label><input type="text" className="w-full border p-2 rounded bg-gray-100 font-bold" value={editingProduct.modelNo} readOnly /></div>
                      <div><label className="text-xs text-gray-500">اللون</label><input type="text" className="w-full border p-2 rounded bg-gray-100 font-bold" value={editingProduct.color} readOnly /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-gray-500">الكي المميز (material)</label><input type="text" className="w-full border p-2 rounded font-mono font-bold text-indigo-700" value={editingProduct.material || ''} onChange={(e) => setEditingProduct({...editingProduct, material: e.target.value})} /></div>
                      <div><label className="text-xs text-purple-700 font-bold">المقاس العام (size)</label><input type="text" placeholder="مثال: من 1:4 بيبي" className="w-full border p-2 rounded font-bold text-purple-800" value={editingProduct.size || ''} onChange={(e) => setEditingProduct({...editingProduct, size: e.target.value})} /></div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-purple-700 cursor-pointer">
                      <input type="checkbox" checked={Boolean(editingProduct.applySizeToModel)} onChange={(e) => setEditingProduct({...editingProduct, applySizeToModel: e.target.checked})} />
                      <span>تعميم المقاس العام على كل ألوان الموديل {editingProduct.modelNo}</span>
                  </label>
                  <div><label className="text-xs text-gray-500">الوصف</label><input type="text" className="w-full border p-2 rounded" value={editingProduct.description || ''} onChange={(e) => setEditingProduct({...editingProduct, description: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-gray-500">قسم المتجر (group_name)</label><input type="text" className="w-full border p-2 rounded" value={editingProduct.group_name || ''} onChange={(e) => setEditingProduct({...editingProduct, group_name: e.target.value})} /></div>
                      <div><label className="text-xs text-gray-500">نوع القطعة بالمتجر (kind_name)</label><input type="text" className="w-full border p-2 rounded" value={editingProduct.kind_name || ''} onChange={(e) => setEditingProduct({...editingProduct, kind_name: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                      <div><label className="text-xs text-gray-500">الكمية (قطع)</label><input type="number" className="w-full border p-2 rounded font-bold" value={editingProduct.currentStock} onChange={(e) => setEditingProduct({...editingProduct, currentStock: e.target.value, stockQty: e.target.value})} /></div>
                      <div><label className="text-xs text-gray-500">السعر</label><input type="number" className="w-full border p-2 rounded font-bold" value={editingProduct.price} onChange={(e) => setEditingProduct({...editingProduct, price: e.target.value})} /></div>
                      <div><label className="text-xs text-red-600">الخصم %</label><input type="number" className="w-full border p-2 rounded font-bold bg-red-50" value={editingProduct.discount} onChange={(e) => setEditingProduct({...editingProduct, discount: e.target.value})} /></div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">الحالة</label>
                    <select className="w-full border p-2 rounded bg-white" value={editingProduct.status} onChange={(e) => setEditingProduct({...editingProduct, status: e.target.value})}>
                        <option value="OPEN">مفتوح</option>
                        <option value="CLOSED">مغلق</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded font-bold">إلغاء</button>
                      <button onClick={handleEditSave} className="px-4 py-2 text-white bg-blue-600 rounded font-bold">حفظ</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}