// server/cors-config-railway.ts - Versión corregida
import cors from 'cors';

const setupCorsForRailway = (app: any) => {
  const origins: (string | RegExp)[] = [
    // URLs de desarrollo local
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5173',
    'https://whatsapp2-production-e205.up.railway.app',
    'https://delivery-web-production.up.railway.app/',
    // Regex para dominios de Railway
    /^https:\/\/.*\.railway\.app$/,
  ];

  // Agregar URLs de Railway si existen
  if (process.env.RAILWAY_STATIC_URL) {
    origins.push(process.env.RAILWAY_STATIC_URL);
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }

  const corsOptions = {
    origin: function (origin: string | undefined, callback: Function) {
      // Permitir requests sin origin (como Postman, aplicaciones móviles, etc.)
      if (!origin) {
        console.log('🔓 CORS: Request without origin (allowed)');
        return callback(null, true);
      }

      // Verificar si el origin está en la lista permitida
      const isAllowed = origins.some(allowedOrigin => {
        if (typeof allowedOrigin === 'string') {
          return allowedOrigin === origin;
        } else {
          return allowedOrigin.test(origin);
        }
      });

      if (isAllowed) {
        console.log(`✅ CORS: Origin allowed - ${origin}`);
        callback(null, true);
      } else {
        console.log(`❌ CORS: Origin blocked - ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Length', 'X-Kuma-Revision'],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
  };

  // Aplicar CORS
  app.use(cors(corsOptions));

  // Middleware adicional para debugging
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin || 'undefined';
    
    // Solo logear en desarrollo para evitar spam en producción
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🌐 CORS Request: ${req.method} ${req.path} from ${origin}`);
    }
    
    // Agregar headers adicionales para desarrollo
    if (process.env.NODE_ENV === 'development') {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    next();
  });
};

export default setupCorsForRailway;