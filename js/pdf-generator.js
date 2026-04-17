/**
 * PDF Generator - Export fiscal conforme URSSAF
 * Utilise jsPDF via CDN pour génération côté client
 */

class PDFGenerator {
  constructor(ikCalculator) {
    this.ikCalc = ikCalculator;
    this.jsPDF = null;
  }

  async init() {
    // Load jsPDF dynamically if not already loaded
    if (typeof window.jspdf === 'undefined') {
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      this.jsPDF = window.jspdf.jsPDF;
    } else {
      this.jsPDF = window.jspdf.jsPDF;
    }
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async generateFiscalReport(options) {
    await this.init();
    
    const { year, trips, vehicle, includeDetails } = options;
    const doc = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // === Header ===
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT FISCAL - INDEMNITÉS KILOMÉTRIQUES', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Année fiscale: ${year}`, 105, 30, { align: 'center' });
    doc.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, 105, 35, { align: 'center' });
    
    // === Vehicle Info ===
    doc.setFontSize(10);
    doc.setDrawColor(200);
    doc.line(20, 40, 190, 40);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Véhicule utilisé:', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`• Puissance fiscale: ${vehicle.cv} CV`, 20, 57);
    doc.text(`• Type: ${vehicle.electric ? '100% électrique (+20% majoration)' : 'Thermique'}`, 20, 63);
    if (vehicle.name) {
      doc.text(`• Modèle: ${vehicle.name}`, 20, 69);
    }
    
    // === Summary ===
    const totalKm = trips.reduce((sum, t) => sum + t.distance, 0);
    const totalIK = trips.reduce((sum, t) => sum + t.ikAmount, 0);
    
    doc.setFont('helvetica', 'bold');
    doc.text('RÉCAPITULATIF ANNUEL', 20, 85);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`Nombre de trajets: ${trips.length}`, 20, 95);
    doc.text(`Distance totale: ${totalKm.toFixed(2)} km`, 20, 102);
    doc.text(`Montant IK estimé: ${this.ikCalc.format(totalIK)}`, 20, 109);
    
    // === Barème Reference ===
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Barème appliqué: URSSAF 2026 - Véhicules particuliers [[1]][[2]]', 20, 120);
    doc.text('Ce document est fourni à titre indicatif. Conservez vos justificatifs de trajet.', 20, 125);
    doc.setTextColor(0);
    
    let yPos = 135;
    
    // === Detailed Trips (if requested) ===
    if (includeDetails && trips.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('DÉTAIL DES TRAJETS PROFESSIONNELS', 20, yPos);
      yPos += 10;
      
      // Table header
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const headers = ['Date', 'Motif', 'Distance', 'IK'];
      let x = 20;
      headers.forEach((h, i) => {
        doc.text(h, x, yPos);
        x += i === 1 ? 70 : 35;
      });
      yPos += 5;
      doc.line(20, yPos, 190, yPos);
      yPos += 7;
      
      // Table rows
      doc.setFont('helvetica', 'normal');
      trips.slice(0, 40).forEach(trip => { // Limit to 40 trips per page
        const date = new Date(trip.date).toLocaleDateString('fr-FR');
        const purpose = trip.purpose.length > 35 ? trip.purpose.slice(0, 32) + '...' : trip.purpose;
        
        doc.text(date, 20, yPos);
        doc.text(purpose, 40, yPos);
        doc.text(`${trip.distance.toFixed(2)} km`, 110, yPos);
        doc.text(this.ikCalc.format(trip.ikAmount), 145, yPos, { align: 'right' });
        
        yPos += 6;
        
        // New page if needed
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
      
      if (trips.length > 40) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`... et ${trips.length - 40} trajets supplémentaires (voir export complet)`, 20, yPos + 5);
      }
    }
    
    // === Footer ===
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('IKtracker Pro - Application PWA autonome', 105, 290, { align: 'center' });
    doc.text('Conforme au barème URSSAF 2026 | Données stockées localement', 105, 295, { align: 'center' });
    
    // Generate blob
    return doc.output('blob');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFGenerator;
}