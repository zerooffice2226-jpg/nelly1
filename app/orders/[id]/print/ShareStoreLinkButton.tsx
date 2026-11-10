"use client";

import { useState } from "react";
import { syncOrderToOnlineStore } from "@/app/actions";

interface Props {
  orderId: string;
  orderNo: number;
  customerName: string;
  phone: string | null;
}

export default function ShareStoreLinkButton({ orderId, orderNo, customerName, phone }: Props) {
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const res = await syncOrderToOnlineStore(orderId);

      if (!res.success || !res.url) {
        alert("فشل إنشاء رابط المتجر: " + (res.error || "خطأ غير معروف"));
        setLoading(false);
        return;
      }

      const storeLink = res.url;
      const message = `مرحباً يا فندم ❤️\nشكراً لزيارتك لنا في المعرض.\nفاتورة رقم #${orderNo}\n\nيمكنك الآن استعراض فاتورتك وموديلاتك التي قمت باختيارها بالصور كاملة، وتصفح باقي تشكيلة المتجر عبر الرابط التالي مباشرة:\n\n${storeLink}`;

      const rawPhone = phone ? phone.replace(/[^0-9]/g, "") : "";
      const formattedPhone = rawPhone.startsWith("0") ? `2${rawPhone}` : rawPhone;

      if (formattedPhone) {
        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, "_blank");
      } else {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(message);
          alert("تم نسخ الرابط والرسالة بنجاح، يمكنك مشاركتها مع العميل الآن!");
        } else {
          prompt("انسخ الرابط التالي وأرسله للعميل:", storeLink);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
      alert("حدث خطأ: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className={`bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-md font-bold shadow transition-all flex items-center gap-2 ${
        loading ? "opacity-60 cursor-wait" : "active:scale-95"
      }`}
    >
      <span>📱</span>
      <span>{loading ? "جاري تجهيز رابط المتجر..." : "إرسال رابط الصور (واتساب)"}</span>
    </button>
  );
}