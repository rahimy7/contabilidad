import * as React from "react"

const MOBILE_BREAKPOINT = 1025

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    // ✅ Función optimizada para evitar re-renders innecesarios
    const onChange = () => {
      const newIsMobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(prev => {
        // Solo actualizar si el valor realmente cambió
        return prev !== newIsMobile ? newIsMobile : prev
      })
    }
    
    // ✅ Configurar el estado inicial una sola vez
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    
    // ✅ Usar la API moderna si está disponible
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    } else {
      // Fallback para navegadores antiguos
      mql.addListener(onChange)
      return () => mql.removeListener(onChange)
    }
  }, []) // ✅ Array de dependencias vacío es correcto aquí

  return !!isMobile
}