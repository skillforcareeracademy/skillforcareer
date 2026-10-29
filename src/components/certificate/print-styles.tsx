/**
 * Print rules for a certificate page.
 *
 * The sheet is A4 landscape and bleeds to the paper edge, so the page margin is
 * zero and the sheet's own frame is the border. The catch that cut certificates
 * in half: the page wrapper keeps its on-screen padding when printing, which
 * pushes a full-height sheet past the bottom of the paper and onto a second
 * page. So printing resets the wrapper's spacing and pins the sheet to exact A4
 * landscape (297×210mm), and the body is clipped to one page so nothing can
 * spill over.
 */
export function CertificatePrintStyles() {
  return (
    <style>{`@page { size: A4 landscape; margin: 0; }
      @media print {
        html, body {
          background: white !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 297mm !important;
          height: 210mm !important;
          overflow: hidden !important;
        }
        main {
          padding: 0 !important;
          margin: 0 !important;
          min-height: 0 !important;
          background: white !important;
        }
        .cert-chrome { display: none !important; }
        #certificate {
          box-shadow: none !important;
          width: 297mm !important;
          height: 210mm !important;
          max-width: none !important;
          margin: 0 !important;
        }
      }`}</style>
  );
}
