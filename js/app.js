/**
 * IKtracker Pro - Application Principale
 * Fonctionnalités: GPS tracking, stockage local, UI responsive
 */

class IKTrackerApp {
  constructor() {
    this.vehicle = this.loadVehicle();
    this.trips = this.loadTrips();
    this.gps = {
      watchId: null,
      isTracking: false,
      startTime: null,
      points: [],
      totalDistance: 0
    };
    this.pdfGenerator = null;
    this.ikCalc = new IKCalculator(this.vehicle);
    
    this.init();
  }

  async init() {
    // Initialisation de l'UI
    this.setupNavigation();
    this.setupVehicleForm();
    this.setupGPSTracking();
    this.setupTripsList();
    this.setupStats();
    this.setupExport();
    this.setupPWAInstall();
    
    // Chargement initial des données
    this.renderTripsList();
    this.updateStats();
    
    // Initialisation du générateur PDF
    if (typeof PDFGenerator !== 'undefined') {
      this.pdfGenerator = new PDFGenerator(this.ikCalc);
    }
    
    console.log('✅ IKtracker Pro initialisé');
  }

  // === Navigation ===
  setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const screen = e.currentTarget.dataset.screen;
        this.switchScreen(screen);
      });
    });
    
    // Support URL params (?screen=gps)
    const params = new URLSearchParams(window.location.search);
    const screen = params.get('screen');
    if (screen && document.getElementById(`${screen}-screen`)) {
      this.switchScreen(screen);
    }
  }

  switchScreen(screenName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screenName);
    });
    
    // Show selected screen
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${screenName}-screen`);
    if (target) target.classList.add('active');
    
    // Refresh data if needed
    if (screenName === 'trips') this.renderTripsList();
    if (screenName === 'stats') this.updateStats();
  }

  // === Vehicle Configuration ===
  setupVehicleForm() {
    // Load saved values
    if (this.vehicle) {
      document.getElementById('vehicle-cv').value = this.vehicle.cv || 5;
      document.getElementById('vehicle-electric').checked = this.vehicle.electric || false;
      document.getElementById('vehicle-name').value = this.vehicle.name || '';
    }
    
    // Save handler
    document.getElementById('save-vehicle').addEventListener('click', () => {
      const cv = parseInt(document.getElementById('vehicle-cv').value);
      const electric = document.getElementById('vehicle-electric').checked;
      const name = document.getElementById('vehicle-name').value.trim();
      
      this.vehicle = { cv, electric, name, updatedAt: new Date().toISOString() };
      this.saveVehicle();
      this.ikCalc = new IKCalculator(this.vehicle);
      
      this.showToast('✅ Configuration enregistrée', 'success');
      
      // Update bareme display if visible
      this.updateBaremeDisplay();
    });
  }

  saveVehicle() {
    localStorage.setItem('iktracker_vehicle', JSON.stringify(this.vehicle));
  }

  loadVehicle() {
    try {
      const data = localStorage.getItem('iktracker_vehicle');
      return data ? JSON.parse(data) : { cv: 5, electric: false };
    } catch {
      return { cv: 5, electric: false };
    }
  }

  updateBaremeDisplay() {
    // Optionnel: mettre à jour l'affichage du barème si nécessaire
  }

  // === GPS Tracking ===
  setupGPSTracking() {
    const toggleBtn = document.getElementById('gps-toggle');
    const validateBtn = document.getElementById('validate-trip');
    
    toggleBtn.addEventListener('click', () => {
      if (this.gps.isTracking) {
        this.stopTracking();
      } else {
        this.startTracking();
      }
    });
    
    validateBtn.addEventListener('click', () => {
      this.validateAndSaveTrip();
    });
    
    // Update validate button state
    document.getElementById('trip-purpose').addEventListener('input', (e) => {
      validateBtn.disabled = !e.target.value.trim() || !this.gps.isTracking;
    });
  }

  async startTracking() {
    if (!navigator.geolocation) {
      this.showToast('❌ Géolocalisation non supportée', 'error');
      return;
    }

    try {
      // Request high accuracy for professional use
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      this.gps.watchId = navigator.geolocation.watchPosition(
        (position) => this.onGPSUpdate(position),
        (error) => this.onGPSError(error),
        options
      );

      this.gps.isTracking = true;
      this.gps.startTime = new Date();
      this.gps.points = [];
      this.gps.totalDistance = 0;

      // Update UI
      document.getElementById('gps-dot').className = 'status-dot active';
      document.getElementById('gps-text').textContent = '📡 Tracking actif...';
      document.getElementById('gps-info').style.display = 'block';
      document.getElementById('gps-toggle').textContent = '⏹️ Arrêter le tracking';
      document.getElementById('gps-toggle').classList.replace('btn-success', 'btn-danger');
      document.getElementById('validate-trip').disabled = true;

      this.showToast('📍 Tracking démarré', 'success');
      
    } catch (err) {
      console.error('GPS error:', err);
      this.showToast('❌ Impossible de démarrer le GPS', 'error');
    }
  }

  stopTracking() {
    if (this.gps.watchId !== null) {
      navigator.geolocation.clearWatch(this.gps.watchId);
      this.gps.watchId = null;
    }
    
    this.gps.isTracking = false;
    
    // Update UI
    document.getElementById('gps-dot').className = 'status-dot';
    document.getElementById('gps-text').textContent = '⏸️ Tracking arrêté';
    document.getElementById('gps-toggle').textContent = '▶️ Démarrer le tracking';
    document.getElementById('gps-toggle').classList.replace('btn-danger', 'btn-success');
    
    // Enable validate button if we have distance
    const hasDistance = this.gps.totalDistance > 0.1; // Min 100m
    document.getElementById('validate-trip').disabled = !hasDistance;
    
    if (hasDistance) {
      this.showToast(`✅ ${this.gps.totalDistance.toFixed(2)} km enregistrés`, 'success');
    }
  }

  onGPSUpdate(position) {
    const { latitude, longitude, accuracy, timestamp } = position.coords;
    
    const point = {
      lat: latitude,
      lng: longitude,
      accuracy,
      timestamp: new Date(timestamp).toISOString()
    };
    
    // Calculate distance from previous point
    if (this.gps.points.length > 0) {
      const lastPoint = this.gps.points[this.gps.points.length - 1];
      const segment = this.calculateDistance(
        lastPoint.lat, lastPoint.lng,
        latitude, longitude
      );
      
      // Filter noise: ignore segments < 10m or accuracy > 50m
      if (segment >= 0.01 && accuracy < 50) {
        this.gps.totalDistance += segment;
      }
    }
    
    this.gps.points.push(point);
    
    // Update UI (throttled)
    if (this.gps.points.length % 5 === 0) {
      this.updateGPSDisplay();
    }
  }

  onGPSError(error) {
    console.error('GPS Error:', error);
    let message = '❌ Erreur GPS';
    
    switch(error.code) {
      case error.PERMISSION_DENIED:
        message = '❌ Autorisation GPS refusée';
        break;
      case error.POSITION_UNAVAILABLE:
        message = '❌ Position indisponible';
        break;
      case error.TIMEOUT:
        message = '❌ Timeout GPS';
        break;
    }
    
    this.showToast(message, 'error');
    document.getElementById('gps-dot').className = 'status-dot error';
    this.stopTracking();
  }

  updateGPSDisplay() {
    document.getElementById('gps-start-time').textContent = 
      this.gps.startTime?.toLocaleTimeString('fr-FR') || '--:--';
    document.getElementById('gps-distance').textContent = 
      this.gps.totalDistance.toFixed(2);
    document.getElementById('gps-points').textContent = 
      this.gps.points.length;
  }

  /**
   * Calcule la distance entre deux points (formule de Haversine)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon terrestre en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  async validateAndSaveTrip() {
    const purpose = document.getElementById('trip-purpose').value.trim();
    if (!purpose || this.gps.totalDistance < 0.1) {
      this.showToast('⚠️ Veuillez renseigner un motif et parcourir au moins 100m', 'error');
      return;
    }

    const trip = {
      id: Date.now().toString(),
      date: this.gps.startTime.toISOString(),
      purpose,
      distance: Math.round(this.gps.totalDistance * 100) / 100,
      points: this.gps.points.length,
      ikAmount: this.ikCalc.calculate(this.gps.totalDistance),
      vehicle: { ...this.vehicle }
    };

    this.trips.unshift(trip); // Add to beginning
    this.saveTrips();
    
    // Reset GPS state
    this.gps.totalDistance = 0;
    this.gps.points = [];
    document.getElementById('trip-purpose').value = '';
    document.getElementById('validate-trip').disabled = true;
    
    this.showToast(`✅ Trajet enregistré: ${trip.distance} km = ${this.ikCalc.format(trip.ikAmount)}`, 'success');
    this.updateGPSDisplay();
    
    // Refresh other views if needed
    this.renderTripsList();
    this.updateStats();
  }

  // === Trips Management ===
  setupTripsList() {
    document.getElementById('filter-month').addEventListener('change', () => {
      this.renderTripsList();
    });
    document.getElementById('clear-filter').addEventListener('click', () => {
      document.getElementById('filter-month').value = 'all';
      this.renderTripsList();
    });
  }

  renderTripsList() {
    const container = document.getElementById('trips-list');
    const filter = document.getElementById('filter-month').value;
    
    // Filter trips
    let filtered = this.trips;
    if (filter !== 'all') {
      const [year, month] = filter.split('-');
      filtered = this.trips.filter(t => {
        const tripDate = new Date(t.date);
        return tripDate.getFullYear() == year && 
               (tripDate.getMonth() + 1).toString().padStart(2, '0') === month;
      });
    }
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📭</div>
          <p>Aucun trajet enregistré ${filter !== 'all' ? 'pour cette période' : ''}</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = filtered.map(trip => `
      <div class="trip-item">
        <div class="trip-info">
          <div class="trip-date">${new Date(trip.date).toLocaleDateString('fr-FR')}</div>
          <div class="trip-purpose" style="font-weight: 500;">${trip.purpose}</div>
          <div class="trip-distance">${trip.distance.toFixed(2)} km • ${trip.points} points GPS</div>
        </div>
        <div class="trip-amount">${this.ikCalc.format(trip.ikAmount)}</div>
      </div>
    `).join('');
  }

  saveTrips() {
    // Keep only last 2 years of data to limit storage
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    
    const filtered = this.trips.filter(t => new Date(t.date) > cutoff);
    localStorage.setItem('iktracker_trips', JSON.stringify(filtered));
  }

  loadTrips() {
    try {
      const data = localStorage.getItem('iktracker_trips');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // === Statistics ===
  setupStats() {
    // Populate month filter with last 12 months
    const select = document.getElementById('filter-month');
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      select.appendChild(option);
    }
  }

  updateStats() {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Filter current year trips
    const yearTrips = this.trips.filter(t => new Date(t.date).getFullYear() === currentYear);
    
    const totalKm = yearTrips.reduce((sum, t) => sum + t.distance, 0);
    const totalIK = yearTrips.reduce((sum, t) => sum + t.ikAmount, 0);
    const avgKm = yearTrips.length > 0 ? totalKm / yearTrips.length : 0;
    
    // Update display
    document.getElementById('stat-total-km').textContent = Math.round(totalKm).toLocaleString('fr-FR');
    document.getElementById('stat-total-ik').textContent = this.ikCalc.format(totalIK);
    document.getElementById('stat-trips-count').textContent = yearTrips.length;
    document.getElementById('stat-avg-km').textContent = avgKm.toFixed(1);
    
    // Update monthly chart
    this.renderMonthlyChart(currentYear);
  }

  renderMonthlyChart(year) {
    const container = document.getElementById('monthly-chart');
    container.innerHTML = '';
    
    // Group trips by month
    const monthly = {};
    for (let m = 0; m < 12; m++) {
      monthly[m] = { km: 0, ik: 0 };
    }
    
    this.trips
      .filter(t => new Date(t.date).getFullYear() === year)
      .forEach(t => {
        const month = new Date(t.date).getMonth();
        monthly[month].km += t.distance;
        monthly[month].ik += t.ikAmount;
      });
    
    // Find max for scaling
    const maxIK = Math.max(...Object.values(monthly).map(m => m.ik), 1);
    
    // Render bars
    Object.entries(monthly).forEach(([month, data]) => {
      const height = (data.ik / maxIK) * 150;
      const monthName = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'short' });
      
      const bar = document.createElement('div');
      bar.style.cssText = `
        flex: 1; 
        display: flex; 
        flex-direction: column; 
        align-items: center;
        gap: 4px;
      `;
      bar.innerHTML = `
        <div style="width: 100%; background: var(--primary); border-radius: 4px 4px 0 0; 
                    min-height: ${height}px; transition: height 0.3s;" 
             title="${monthName}: ${this.ikCalc.format(data.ik)}">
        </div>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${monthName}</span>
      `;
      container.appendChild(bar);
    });
  }

  // === Export ===
  setupExport() {
    document.getElementById('generate-pdf').addEventListener('click', () => {
      this.generateFiscalPDF();
    });
    
    document.getElementById('export-data').addEventListener('click', () => {
      this.exportDataJSON();
    });
    
    document.getElementById('import-data').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    
    document.getElementById('import-file').addEventListener('change', (e) => {
      this.importDataJSON(e.target.files[0]);
    });
  }

  async generateFiscalPDF() {
    if (!this.pdfGenerator) {
      this.showToast('❌ Module PDF non chargé', 'error');
      return;
    }
    
    const year = parseInt(document.getElementById('export-year').value);
    const includeDetails = document.getElementById('export-include-details').checked;
    
    try {
      this.showToast('🔄 Génération du PDF...', 'success');
      
      const blob = await this.pdfGenerator.generateFiscalReport({
        year,
        trips: this.trips.filter(t => new Date(t.date).getFullYear() === year),
        vehicle: this.vehicle,
        includeDetails
      });
      
      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IKtracker_Pro_Rapport_Fiscal_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.showToast('✅ PDF généré et téléchargé', 'success');
    } catch (err) {
      console.error('PDF generation error:', err);
      this.showToast('❌ Erreur lors de la génération du PDF', 'error');
    }
  }

  exportDataJSON() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      vehicle: this.vehicle,
      trips: this.trips
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iktracker_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showToast('✅ Données exportées', 'success');
  }

  importDataJSON(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (!data.version || !data.trips) {
          throw new Error('Format invalide');
        }
        
        // Merge trips (avoid duplicates by ID)
        const existingIds = new Set(this.trips.map(t => t.id));
        const newTrips = data.trips.filter(t => !existingIds.has(t.id));
        
        this.trips = [...newTrips, ...this.trips];
        
        if (data.vehicle) {
          this.vehicle = { ...this.vehicle, ...data.vehicle };
          this.ikCalc = new IKCalculator(this.vehicle);
        }
        
        this.saveVehicle();
        this.saveTrips();
        this.renderTripsList();
        this.updateStats();
        
        this.showToast(`✅ ${newTrips.length} trajets importés`, 'success');
      } catch (err) {
        console.error('Import error:', err);
        this.showToast('❌ Erreur lors de l\'import', 'error');
      }
    };
    reader.readAsText(file);
  }

  // === PWA Installation ===
  setupPWAInstall() {
    let deferredPrompt;
    const banner = document.getElementById('install-banner');
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      banner.classList.add('show');
    });
    
    document.getElementById('install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        this.showToast('🎉 Application installée !', 'success');
      }
      banner.classList.remove('show');
      deferredPrompt = null;
    });
    
    document.getElementById('dismiss-install').addEventListener('click', () => {
      banner.classList.remove('show');
    });
    
    // Hide banner if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      banner.style.display = 'none';
    }
  }

  // === Utilities ===
  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `show ${type}`;
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.ikApp = new IKTrackerApp();
});