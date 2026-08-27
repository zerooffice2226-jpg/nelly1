'use client';

const PrintStyles = ({ siteName, customerName }: { siteName: string, customerName: string }) => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');

    @media print {
        @page {
            size: A4;
            margin-top: 4.5cm;
            margin-bottom: 3cm;
            margin-left: 1.5cm;
            margin-right: 1.5cm;

            @top-center {
                content: '';
            }

            @top-right {
                content: '';
            }

            @bottom-center {
                content: "صفحة " counter(page) " من " counter(pages);
                font-family: 'Cairo', sans-serif;
                font-size: 10px;
                color: #888;
            }
        }

        body {
            font-family: 'Cairo', sans-serif !important;
            background: #ffffff !important;
            color: #000000 !important;
        }

        #invoice-content,
        #invoice-content * {
            color: #000000 !important;
            font-weight: 600;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        #invoice-content h1,
        #invoice-content h2,
        #invoice-content h3,
        #invoice-content h4,
        #invoice-content th,
        #invoice-content strong,
        #invoice-content b {
            font-weight: 700;
        }

        #invoice-content .text-white {
            color: #ffffff !important;
        }

        .no-print {
            display: none !important;
        }

        #printable-area {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            border: none !important;
        }

        thead {
            display: table-header-group; 
        }

        thead tr {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
        }

        tr, td, th {
            page-break-inside: avoid;
        }
    }
  `}</style>
);

export default PrintStyles;
