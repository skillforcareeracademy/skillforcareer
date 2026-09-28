/**
 * Print rules for a page whose only printable part is the report card.
 *
 * The panel's sidebar, header and buttons are all around it, and a printer
 * should see none of them: hide everything, show the card back, and let it have
 * the sheet to itself. Visibility rather than `display`, so the card keeps its
 * layout instead of collapsing.
 */
export function ReportCardPrintStyles() {
  return (
    <style>{`@page { size: A4 portrait; margin: 12mm; }
    @media print {
      html, body { background: #fff !important; }
      body * { visibility: hidden !important; }
      #report-card, #report-card * { visibility: visible !important; }
      #report-card {
        position: absolute !important;
        left: 0; top: 0; right: 0;
        margin: 0 !important;
        max-width: none !important;
        box-shadow: none !important;
      }
      #report-card table { font-size: 10.5px; }
    }`}</style>
  );
}
