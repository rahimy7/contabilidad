// fix-req-undefined.mjs
// Script para corregir el error "req is not defined"

import fs from 'fs';
import path from 'path';

console.log('🔧 CORRIGIENDO ERROR "req is not defined"...\n');

function createBackup(filePath) {
  const backupPath = filePath + '.req-fix.' + Date.now();
  try {
    fs.copyFileSync(filePath, backupPath);
    console.log(`📦 Backup creado: ${backupPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error creando backup: ${error.message}`);
    return false;
  }
}

async function fixReqUndefined() {
  try {
    const routesPath = path.join(process.cwd(), 'server/routes.ts');
    
    if (!fs.existsSync(routesPath)) {
      console.log('❌ server/routes.ts no encontrado');
      return;
    }

    console.log('✅ Archivo server/routes.ts encontrado');
    console.log('🔍 Analizando línea 926...');

    // Crear backup
    createBackup(routesPath);

    // Leer contenido
    const content = fs.readFileSync(routesPath, 'utf8');
    const lines = content.split('\n');
    
    console.log(`📊 Total de líneas: ${lines.length}`);

    // Mostrar contexto alrededor de la línea 926
    const problemLine = 926;
    const contextStart = Math.max(0, problemLine - 15);
    const contextEnd = Math.min(lines.length, problemLine + 15);

    console.log('\n📋 CONTEXTO ALREDEDOR DE LA LÍNEA 926:');
    for (let i = contextStart; i < contextEnd; i++) {
      const lineNum = i + 1;
      const marker = lineNum === problemLine ? '>>> ' : '    ';
      const line = lines[i] || '';
      console.log(`${marker}${lineNum}: ${line}`);
    }

    // Analizar la línea problemática
    const line926 = lines[problemLine - 1] || '';
    console.log(`\n🔍 Línea 926: "${line926}"`);

    let corrected = false;
    let newContent = content;

    // Buscar patrones problemáticos
    console.log('\n🔍 Buscando código mal estructurado...');

    // Patrón 1: req fuera de función
    if (line926.includes('req') && !line926.includes('(req,') && !line926.includes('(req)')) {
      console.log('✅ Encontrado uso de req fuera de función en línea 926');
      
      // Buscar hacia atrás para encontrar dónde debería estar este código
      let functionStart = -1;
      let functionPattern = null;
      
      for (let i = problemLine - 1; i >= Math.max(0, problemLine - 30); i--) {
        const line = lines[i];
        
        // Buscar inicio de función de ruta
        if (line.includes('router.post(') || line.includes('router.get(') || 
            line.includes('app.post(') || line.includes('app.get(')) {
          functionStart = i;
          functionPattern = line;
          break;
        }
      }
      
      if (functionStart !== -1) {
        console.log(`🔍 Función de ruta encontrada en línea ${functionStart + 1}: ${functionPattern}`);
        
        // Verificar si el código está fuera de la función
        let braceCount = 0;
        let insideFunction = false;
        
        for (let i = functionStart; i < problemLine; i++) {
          const line = lines[i];
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
          
          if (braceCount > 0) {
            insideFunction = true;
          } else if (braceCount === 0 && insideFunction) {
            console.log(`⚠️ Código en línea ${problemLine} está fuera de la función`);
            break;
          }
        }
      }
    }

    // Patrón 2: Buscar }) seguido de código que debería estar dentro
    const problematicPatterns = [
      {
        pattern: /\}\)\s*;\s*\n\s*[^\/\n]*req\./,
        description: 'Código con req después de cierre de función',
        fix: (match) => {
          // Mover el código con req dentro de la función anterior
          return match.replace(/(\}\)\s*;\s*\n)(\s*[^\/\n]*req\.[^;]*;?)/, '$2\n$1');
        }
      },
      {
        pattern: /\}\s*\)\s*;\s*\n\s*[^\/\n]*req\./,
        description: 'Código con req después de }) ;',
        fix: (match) => {
          return match.replace(/(\}\s*\)\s*;\s*\n)(\s*[^\/\n]*req\.[^;]*;?)/, '$2\n$1');
        }
      }
    ];

    for (const patternInfo of problematicPatterns) {
      if (patternInfo.pattern.test(newContent)) {
        console.log(`🔄 Aplicando corrección: ${patternInfo.description}`);
        newContent = newContent.replace(patternInfo.pattern, patternInfo.fix);
        corrected = true;
      }
    }

    // Patrón 3: Buscar líneas específicas con req mal ubicadas
    const linesArray = newContent.split('\n');
    for (let i = 0; i < linesArray.length; i++) {
      const line = linesArray[i];
      
      // Si una línea contiene req pero no está en una función
      if (line.includes('req.') && !line.includes('(req,') && !line.includes('(req)')) {
        // Verificar si está fuera de una función mirando hacia atrás
        let inFunction = false;
        let braceCount = 0;
        
        for (let j = i - 1; j >= Math.max(0, i - 50); j--) {
          const prevLine = linesArray[j];
          
          // Contar llaves hacia atrás
          braceCount += (prevLine.match(/\}/g) || []).length;
          braceCount -= (prevLine.match(/\{/g) || []).length;
          
          // Si encontramos una función de ruta y estamos dentro de sus llaves
          if ((prevLine.includes('router.') || prevLine.includes('app.')) && 
              (prevLine.includes('post(') || prevLine.includes('get(')) &&
              braceCount <= 0) {
            inFunction = true;
            break;
          }
        }
        
        if (!inFunction && i === problemLine - 1) {
          console.log(`⚠️ Línea ${i + 1} contiene req fuera de función: ${line}`);
          
          // Buscar la función anterior para mover esta línea
          let targetFunction = -1;
          for (let j = i - 1; j >= 0; j--) {
            if (linesArray[j].includes('router.') && linesArray[j].includes('async (req, res)')) {
              // Buscar el final de esta función
              let endFunction = -1;
              let braces = 0;
              for (let k = j; k < i; k++) {
                braces += (linesArray[k].match(/\{/g) || []).length;
                braces -= (linesArray[k].match(/\}/g) || []).length;
                if (braces === 0 && k > j) {
                  endFunction = k;
                  break;
                }
              }
              
              if (endFunction !== -1) {
                console.log(`🔄 Moviendo línea ${i + 1} dentro de función en línea ${j + 1}`);
                
                // Mover la línea problemática antes del cierre de la función
                const lineToMove = linesArray[i];
                linesArray.splice(i, 1); // Remover de posición actual
                linesArray.splice(endFunction - 1, 0, '    ' + lineToMove.trim()); // Insertar antes del cierre
                
                newContent = linesArray.join('\n');
                corrected = true;
                break;
              }
            }
          }
        }
      }
    }

    // Patrón 4: Corregir funciones incompletas
    if (newContent.includes('async (req, res) => {') && 
        !corrected && 
        line926.includes('req')) {
      console.log('🔄 Detectando función async incompleta...');
      
      // Buscar funciones que no están cerradas correctamente
      const functionRegex = /router\.(post|get|put|delete)\([^}]*async \(req, res\) => \{[^}]*$/gm;
      const matches = [...newContent.matchAll(functionRegex)];
      
      if (matches.length > 0) {
        console.log(`🔍 Encontradas ${matches.length} funciones potencialmente incompletas`);
        
        // Para cada función incompleta, agregar cierre apropiado
        for (const match of matches) {
          const incompleteFunction = match[0];
          if (!incompleteFunction.includes('});')) {
            const correctedFunction = incompleteFunction + '\n  });\n';
            newContent = newContent.replace(incompleteFunction, correctedFunction);
            corrected = true;
          }
        }
      }
    }

    if (corrected) {
      // Escribir archivo corregido
      fs.writeFileSync(routesPath, newContent);
      
      console.log('\n✅ ARCHIVO CORREGIDO');
      
      // Mostrar contexto después de corrección
      const newLines = newContent.split('\n');
      console.log('\n📋 CONTEXTO DESPUÉS DE CORRECCIÓN (línea 926):');
      const newProblemLine = Math.min(926, newLines.length);
      const newContextStart = Math.max(0, newProblemLine - 5);
      const newContextEnd = Math.min(newLines.length, newProblemLine + 5);
      
      for (let i = newContextStart; i < newContextEnd; i++) {
        const lineNum = i + 1;
        const marker = lineNum === newProblemLine ? '>>> ' : '    ';
        const line = newLines[i] || '';
        console.log(`${marker}${lineNum}: ${line}`);
      }
      
    } else {
      console.log('\n❌ No se pudo corregir automáticamente');
      console.log('\n🔧 CORRECCIÓN MANUAL:');
      console.log('1. Abre server/routes.ts');
      console.log('2. Ve a la línea 926');
      console.log('3. Busca código que use "req" fuera de una función');
      console.log('4. Mueve ese código dentro de una función de ruta');
      console.log('5. Verifica que todas las llaves {} estén balanceadas');
    }

    console.log('\n📋 PRÓXIMOS PASOS:');
    console.log('1. Reinicia el servidor: yarn dev');
    console.log('2. Si persiste, busca manualmente código con req fuera de funciones');

  } catch (error) {
    console.error('❌ Error corrigiendo req undefined:', error.message);
  }
}

// Ejecutar corrección
console.log('🔧 CORRECCIÓN DE req undefined INICIADA\n');
fixReqUndefined();