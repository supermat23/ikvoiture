/**
 * IK Calculator - Barème URSSAF 2026 officiel
 * Source: https://www.urssaf.fr et https://iktracker.fr [[1]][[2]]
 */

const IK_BAREME_2026 = {
  car: {
    // Puissance fiscale : { maxKm1: { coef, fixed }, maxKm2: { coef, fixed }, beyond: { coef } }
    3: {
      upTo5k: { coef: 0.529, fixed: 0 },
      upTo20k: { coef: 0.316, fixed: 1065 },
      beyond: { coef: 0.370, fixed: 0 }
    },
    4: {
      upTo5k: { coef: 0.606, fixed: 0 },
      upTo20k: { coef: 0.340, fixed: 1330 },
      beyond: { coef: 0.407, fixed: 0 }
    },
    5: {
      upTo5k: { coef: 0.636, fixed: 0 },
      upTo20k: { coef: 0.357, fixed: 1395 },
      beyond: { coef: 0.427, fixed: 0 }
    },
    6: {
      upTo5k: { coef: 0.665, fixed: 0 },
      upTo20k: { coef: 0.374, fixed: 1457 },
      beyond: { coef: 0.447, fixed: 0 }
    },
    7: {
      upTo5k: { coef: 0.697, fixed: 0 },
      upTo20k: { coef: 0.394, fixed: 1515 },
      beyond: { coef: 0.470, fixed: 0 }
    }
  },
  moto: {
    '1-2': {
      upTo3k: { coef: 0.395, fixed: 0 },
      upTo6k: { coef: 0.099, fixed: 891 },
      beyond: { coef: 0.248, fixed: 0 }
    },
    '3-5': {
      upTo3k: { coef: 0.468, fixed: 0 },
      upTo6k: { coef: 0.082, fixed: 1158 },
      beyond: { coef: 0.275, fixed: 0 }
    },
    '6+': {
      upTo3k: { coef: 0.606, fixed: 0 },
      upTo6k: { coef: 0.079, fixed: 1583 },
      beyond: { coef: 0.343, fixed: 0 }
    }
  },
  moped: {
    upTo3k: { coef: 0.315, fixed: 0 },
    upTo6k: { coef: 0.079, fixed: 711 },
    beyond: { coef: 0.198, fixed: 0 }
  }
};

class IKCalculator {
  constructor(vehicleConfig) {
    this.vehicle = vehicleConfig;
  }

  /**
   * Calcule l'indemnité kilométrique pour une distance donnée
   * @param {number} distance - Distance en km
   * @param {string} vehicleType - 'car', 'moto', 'moped'
   * @returns {number} Montant en euros
   */
  calculate(distance, vehicleType = 'car') {
    if (!distance || distance <= 0) return 0;
    
    const bareme = IK_BAREME_2026[vehicleType];
    if (!bareme) return 0;
    
    // Sélectionner la puissance fiscale
    let powerKey;
    if (vehicleType === 'car') {
      powerKey = Math.min(Math.max(this.vehicle.cv || 5, 3), 7);
    } else if (vehicleType === 'moto') {
      const cv = this.vehicle.cv || 5;
      powerKey = cv <= 2 ? '1-2' : cv <= 5 ? '3-5' : '6+';
    }
    
    const rates = bareme[powerKey] || bareme[vehicleType === 'car' ? 5 : '3-5'];
    
    // Sélectionner la tranche kilométrique
    let rate;
    if (distance <= (vehicleType === 'car' ? 5000 : 3000)) {
      rate = rates.upTo5k || rates.upTo3k;
    } else if (distance <= (vehicleType === 'car' ? 20000 : 6000)) {
      rate = rates.upTo20k || rates.upTo6k;
    } else {
      rate = rates.beyond;
    }
    
    // Calcul: (distance × coef) + fixed
    let amount = (distance * rate.coef) + rate.fixed;
    
    // Majoration +20% pour véhicule électrique
    if (this.vehicle.electric && vehicleType === 'car') {
      amount *= 1.20;
    }
    
    return Math.round(amount * 100) / 100;
  }

  /**
   * Calcule l'IK annuelle cumulative avec progression dans les tranches
   * @param {number} totalAnnualKm - Kilométrage annuel total
   * @returns {number} Montant annuel en euros
   */
  calculateAnnual(totalAnnualKm) {
    if (!totalAnnualKm || totalAnnualKm <= 0) return 0;
    
    const vehicleType = 'car';
    const powerKey = Math.min(Math.max(this.vehicle.cv || 5, 3), 7);
    const rates = IK_BAREME_2026.car[powerKey];
    
    let amount = 0;
    const km1 = 5000;
    const km2 = 20000;
    
    if (totalAnnualKm <= km1) {
      // Tranche 1 uniquement
      amount = totalAnnualKm * rates.upTo5k.coef;
    } else if (totalAnnualKm <= km2) {
      // Tranche 1 complète + tranche 2 partielle
      amount = (km1 * rates.upTo5k.coef) + 
               ((totalAnnualKm - km1) * rates.upTo20k.coef) + 
               rates.upTo20k.fixed;
    } else {
      // Toutes les tranches
      amount = (km1 * rates.upTo5k.coef) +
               ((km2 - km1) * rates.upTo20k.coef) + rates.upTo20k.fixed +
               ((totalAnnualKm - km2) * rates.beyond.coef);
    }
    
    // Majoration électrique
    if (this.vehicle.electric) {
      amount *= 1.20;
    }
    
    return Math.round(amount * 100) / 100;
  }

  /**
   * Formate un montant en euros
   */
  format(amount) {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Récupère les infos du barème pour affichage
   */
  getBaremeInfo() {
    const cv = Math.min(Math.max(this.vehicle.cv || 5, 3), 7);
    const rates = IK_BAREME_2026.car[cv];
    return {
      cv,
      electric: this.vehicle.electric,
      tiers: [
        { label: '≤ 5 000 km', formula: `d × ${rates.upTo5k.coef} €` },
        { label: '5 001 - 20 000 km', formula: `(d × ${rates.upTo20k.coef}) + ${rates.upTo20k.fixed} €` },
        { label: '> 20 000 km', formula: `d × ${rates.beyond.coef} €` }
      ]
    };
  }
}

// Export pour usage dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IKCalculator, IK_BAREME_2026 };
}