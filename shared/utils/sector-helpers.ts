// shared/utils/sector-helpers.ts

/**
 * Utilidades para trabajar con sectores geográficos
 */

export interface Location {
  province?: string;
  municipality?: string;
  sector?: string;
}

export interface CoverageArea {
  province?: string;
  municipality?: string;
  sector?: string;
  coverageProvinces?: string[];
  coverageMunicipalities?: string[];
  coverageSectors?: string[];
}

/**
 * Verifica si un técnico cubre una ubicación específica
 */
export function coversSector(
  technicianCoverage: CoverageArea,
  customerLocation: Location
): boolean {
  // Si no hay ubicación del cliente, no se puede verificar
  if (!customerLocation.province) {
    return false;
  }

  // 1. Verificar cobertura de provincia
  const coversProvince = 
    technicianCoverage.province === customerLocation.province ||
    technicianCoverage.coverageProvinces?.includes(customerLocation.province);

  if (!coversProvince) {
    return false;
  }

  // 2. Si cliente no especifica municipio, con provincia es suficiente
  if (!customerLocation.municipality) {
    return true;
  }

  // 3. Verificar cobertura de municipio
  const coversMunicipality = 
    technicianCoverage.municipality === customerLocation.municipality ||
    technicianCoverage.coverageMunicipalities?.includes(customerLocation.municipality);

  if (!coversMunicipality) {
    return false;
  }

  // 4. Si cliente no especifica sector, con municipio es suficiente
  if (!customerLocation.sector) {
    return true;
  }

  // 5. Verificar cobertura de sector específico
  const coversSectorSpecific = 
    technicianCoverage.sector === customerLocation.sector ||
    technicianCoverage.coverageSectors?.includes(customerLocation.sector);

  // Si cubre el sector específico, true
  // Si no cubre sector pero cubre municipio, también true (puede atender zonas cercanas)
  return coversSectorSpecific || coversMunicipality;
}

/**
 * Calcula el nivel de coincidencia entre cobertura y ubicación
 * Retorna: 0 (no coincide) a 3 (coincidencia exacta)
 */
export function calculateMatchLevel(
  technicianCoverage: CoverageArea,
  customerLocation: Location
): number {
  if (!coversSector(technicianCoverage, customerLocation)) {
    return 0; // No cubre
  }

  let matchLevel = 1; // Coincide al menos en provincia

  // +1 si coincide municipio
  if (
    customerLocation.municipality &&
    (technicianCoverage.municipality === customerLocation.municipality ||
     technicianCoverage.coverageMunicipalities?.includes(customerLocation.municipality))
  ) {
    matchLevel++;
  }

  // +1 si coincide sector exacto
  if (
    customerLocation.sector &&
    (technicianCoverage.sector === customerLocation.sector ||
     technicianCoverage.coverageSectors?.includes(customerLocation.sector))
  ) {
    matchLevel++;
  }

  return matchLevel;
}

/**
 * Obtiene municipios adyacentes (simplificado)
 * En producción, esto vendría de una base de datos o API
 */
export function getAdjacentMunicipalities(municipality: string): string[] {
  const adjacencyMap: Record<string, string[]> = {
    "Santo Domingo Este": ["Santo Domingo Norte", "Santo Domingo Oeste", "San Antonio de Guerra"],
    "Santo Domingo Norte": ["Santo Domingo Este", "Distrito Nacional", "Santo Domingo Oeste"],
    "Santo Domingo Oeste": ["Santo Domingo Norte", "Santo Domingo Este", "Distrito Nacional"],
    "Distrito Nacional": ["Santo Domingo Norte", "Santo Domingo Este", "Santo Domingo Oeste"],
    // Agregar más según necesidad
  };

  return adjacencyMap[municipality] || [];
}

/**
 * Verifica si dos municipios son adyacentes
 */
export function areAdjacentMunicipalities(municipality1: string, municipality2: string): boolean {
  const adjacent = getAdjacentMunicipalities(municipality1);
  return adjacent.includes(municipality2);
}

/**
 * Formatea una ubicación completa como string
 */
export function formatLocation(location: Location): string {
  const parts: string[] = [];

  if (location.sector) parts.push(location.sector);
  if (location.municipality) parts.push(location.municipality);
  if (location.province) parts.push(location.province);

  return parts.join(", ");
}

/**
 * Valida que una ubicación tenga los campos mínimos requeridos
 */
export function validateLocation(location: Location): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!location.province) {
    errors.push("Provincia es requerida");
  }

  if (!location.municipality) {
    errors.push("Municipio es requerido");
  }

  if (!location.sector) {
    errors.push("Sector es requerido");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normaliza el nombre de un sector (capitalización)
 */
export function normalizeSectorName(sector: string): string {
  return sector
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Calcula distancia aproximada entre dos ubicaciones usando sectores
 * (Simplificado - en producción usar coordenadas GPS)
 */
export function estimateDistanceBySector(
  location1: Location,
  location2: Location
): "same_sector" | "same_municipality" | "same_province" | "different_province" {
  if (location1.province !== location2.province) {
    return "different_province";
  }

  if (location1.municipality !== location2.municipality) {
    return "same_province";
  }

  if (location1.sector !== location2.sector) {
    return "same_municipality";
  }

  return "same_sector";
}

/**
 * Filtra técnicos por cobertura de ubicación
 */
export function filterTechniciansByLocation<T extends CoverageArea>(
  technicians: T[],
  customerLocation: Location,
  options?: {
    allowAdjacentMunicipalities?: boolean;
    sortByMatchLevel?: boolean;
  }
): T[] {
  let filtered = technicians.filter(tech => {
    const covers = coversSector(tech, customerLocation);
    
    if (covers) return true;

    // Si permite adyacentes y el municipio es adyacente
    if (
      options?.allowAdjacentMunicipalities &&
      customerLocation.municipality &&
      tech.municipality &&
      areAdjacentMunicipalities(tech.municipality, customerLocation.municipality)
    ) {
      return true;
    }

    return false;
  });

  // Ordenar por nivel de coincidencia si se solicita
  if (options?.sortByMatchLevel) {
    filtered = filtered.sort((a, b) => {
      const levelA = calculateMatchLevel(a, customerLocation);
      const levelB = calculateMatchLevel(b, customerLocation);
      return levelB - levelA; // Mayor nivel primero
    });
  }

  return filtered;
}

/**
 * Obtiene estadísticas de cobertura de un técnico
 */
export function getCoverageStats(coverage: CoverageArea): {
  totalProvinces: number;
  totalMunicipalities: number;
  totalSectors: number;
  coverageLevel: "local" | "regional" | "extensive";
} {
  const totalProvinces = 
    (coverage.province ? 1 : 0) + 
    (coverage.coverageProvinces?.length || 0);

  const totalMunicipalities = 
    (coverage.municipality ? 1 : 0) + 
    (coverage.coverageMunicipalities?.length || 0);

  const totalSectors = 
    (coverage.sector ? 1 : 0) + 
    (coverage.coverageSectors?.length || 0);

  let coverageLevel: "local" | "regional" | "extensive";
  if (totalProvinces === 1 && totalMunicipalities <= 2) {
    coverageLevel = "local";
  } else if (totalProvinces <= 3 && totalMunicipalities <= 5) {
    coverageLevel = "regional";
  } else {
    coverageLevel = "extensive";
  }

  return {
    totalProvinces,
    totalMunicipalities,
    totalSectors,
    coverageLevel
  };
}

/**
 * Genera una descripción legible de la cobertura
 */
export function describeCoverage(coverage: CoverageArea): string {
  const stats = getCoverageStats(coverage);
  
  const parts: string[] = [];

  if (coverage.province) {
    parts.push(`Base: ${formatLocation(coverage)}`);
  }

  if (stats.totalProvinces > 1) {
    parts.push(`${stats.totalProvinces} provincias`);
  }

  if (stats.totalMunicipalities > 1) {
    parts.push(`${stats.totalMunicipalities} municipios`);
  }

  if (stats.totalSectors > 1) {
    parts.push(`${stats.totalSectors} sectores`);
  }

  return parts.join(" • ") || "Sin cobertura definida";
}

/**
 * Verifica si una cobertura está completa (tiene todos los campos necesarios)
 */
export function isCoverageComplete(coverage: CoverageArea): boolean {
  return !!(coverage.province && coverage.municipality);
}

/**
 * Extrae ubicación de una dirección de texto (muy básico)
 */
export function parseLocationFromAddress(address: string): Partial<Location> {
  const location: Partial<Location> = {};

  // Buscar patrones comunes
  const provincePattern = /(Santo Domingo|Santiago|La Vega|Puerto Plata|Distrito Nacional)/i;
  const municipalityPattern = /(Santo Domingo Este|Santo Domingo Norte|Santo Domingo Oeste|Villa Mella)/i;

  const provinceMatch = address.match(provincePattern);
  const municipalityMatch = address.match(municipalityPattern);

  if (provinceMatch) {
    location.province = provinceMatch[1];
  }

  if (municipalityMatch) {
    location.municipality = municipalityMatch[1];
  }

  return location;
}