import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

/**
 * Script de seed para poblar la tabla views con las vistas iniciales del sistema
 * Extrae las vistas del sidebar actual y las inserta en la base de datos
 */

interface ViewData {
  routePath: string;
  label: string;
  iconName: string;
  permissionRequired: string;
  section: string;
  isSystem: boolean;
}

const initialViews: ViewData[] = [
  // Core views - accesibles para la mayoría de roles
  {
    routePath: '/dashboard',
    label: 'Dashboard',
    iconName: 'ChartLine',
    permissionRequired: 'view_dashboard',
    section: 'core',
    isSystem: true,
  },
  {
    routePath: '/conversations',
    label: 'Conversaciones WhatsApp',
    iconName: 'MessageCircle',
    permissionRequired: 'view_conversations',
    section: 'core',
    isSystem: true,
  },
  {
    routePath: '/notifications',
    label: 'Notificaciones',
    iconName: 'Bell',
    permissionRequired: 'view_notifications',
    section: 'core',
    isSystem: true,
  },
  {
    routePath: '/orders',
    label: 'Pedidos',
    iconName: 'ShoppingCart',
    permissionRequired: 'manage_orders',
    section: 'core',
    isSystem: true,
  },

  // Admin & Management views
  {
    routePath: '/trips',
    label: 'Gestión de Viajes',
    iconName: 'Truck',
    permissionRequired: 'manage_orders',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/employees',
    label: 'Empleados',
    iconName: 'UserPlus',
    permissionRequired: 'manage_users',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/product-management',
    label: 'Gestión de Productos',
    iconName: 'Package',
    permissionRequired: 'manage_products',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/admin/measurement-units',
    label: 'Unidades de Medida',
    iconName: 'Scale',
    permissionRequired: 'manage_products',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/purchase-management',
    label: 'Gestión de Compras',
    iconName: 'FileText',
    permissionRequired: 'manage_products',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/inventory-traceability',
    label: 'Trazabilidad de Inventario',
    iconName: 'PackageSearch',
    permissionRequired: 'manage_products',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/customer-management',
    label: 'Gestión de Clientes',
    iconName: 'Users',
    permissionRequired: 'manage_customers',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/appointments',
    label: 'Agenda de Citas',
    iconName: 'CalendarDays',
    permissionRequired: 'manage_appointments',
    section: 'admin',
    isSystem: true,
  },

  // Sales & POS
  {
    routePath: '/pos',
    label: 'Punto de Venta (POS)',
    iconName: 'ShoppingBasket',
    permissionRequired: 'manage_orders',
    section: 'sales',
    isSystem: true,
  },
  {
    routePath: '/store-settings',
    label: 'Configuración de Tienda',
    iconName: 'Sliders',
    permissionRequired: 'manage_settings',
    section: 'admin',
    isSystem: true,
  },
  {
    routePath: '/exchange-rates',
    label: 'Tasas de Cambio',
    iconName: 'DollarSign',
    permissionRequired: 'manage_settings',
    section: 'admin',
    isSystem: true,
  },

  // Reports & Analytics
  {
    routePath: '/reports',
    label: 'Reportes',
    iconName: 'BarChart3',
    permissionRequired: 'view_reports',
    section: 'reports',
    isSystem: true,
  },
  {
    routePath: '/billing',
    label: 'Facturación',
    iconName: 'CreditCard',
    permissionRequired: 'view_reports',
    section: 'reports',
    isSystem: true,
  },

  // Configuration
  {
    routePath: '/settings',
    label: 'Configuración',
    iconName: 'Settings',
    permissionRequired: 'manage_settings',
    section: 'config',
    isSystem: true,
  },
  {
    routePath: '/auto-responses',
    label: 'Respuestas Automáticas',
    iconName: 'Bot',
    permissionRequired: 'manage_settings',
    section: 'config',
    isSystem: true,
  },
  {
    routePath: '/assignment-rules',
    label: 'Asignación Automática',
    iconName: 'Zap',
    permissionRequired: 'manage_assignments',
    section: 'config',
    isSystem: true,
  },

  // Technician views
  {
    routePath: '/technician-dashboard',
    label: 'Panel Técnico',
    iconName: 'Wrench',
    permissionRequired: 'view_technician',
    section: 'technician',
    isSystem: true,
  },
  {
    routePath: '/installation-requests',
    label: 'Solicitudes de Instalación',
    iconName: 'ClipboardList',
    permissionRequired: 'manage_installations',
    section: 'technician',
    isSystem: true,
  },
  {
    routePath: '/my-installations',
    label: 'Mis Instalaciones',
    iconName: 'ShoppingBag',
    permissionRequired: 'view_installations',
    section: 'technician',
    isSystem: true,
  },

  // Delivery views
  {
    routePath: '/delivery-dashboard',
    label: 'Mi Viaje',
    iconName: 'Truck',
    permissionRequired: 'view_orders',
    section: 'delivery',
    isSystem: true,
  },
];

async function seedInitialViews() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🌱 Iniciando seed de vistas iniciales...\n');

    // Verificar que la tabla views existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'views'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      throw new Error('La tabla "views" no existe. Ejecuta primero migrate-rbac-system.ts');
    }

    let inserted = 0;
    let skipped = 0;

    for (const view of initialViews) {
      try {
        await pool.query(
          `
          INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (route_path) DO NOTHING
          RETURNING id;
          `,
          [
            view.routePath,
            view.label,
            view.iconName,
            view.permissionRequired,
            view.section,
            view.isSystem,
          ]
        );

        console.log(`✅ Vista insertada: ${view.label} (${view.routePath})`);
        inserted++;
      } catch (error: any) {
        if (error.code === '23505') {
          // Unique violation - vista ya existe
          console.log(`⏭️  Vista ya existe: ${view.label} (${view.routePath})`);
          skipped++;
        } else {
          throw error;
        }
      }
    }

    console.log('\n📊 Resumen de seed:');
    console.log(`   ✅ Vistas insertadas: ${inserted}`);
    console.log(`   ⏭️  Vistas omitidas (ya existían): ${skipped}`);
    console.log(`   📝 Total de vistas: ${initialViews.length}\n`);

    // Mostrar estadísticas por sección
    const sectionStats = await pool.query(`
      SELECT section, COUNT(*) as count
      FROM views
      GROUP BY section
      ORDER BY section;
    `);

    console.log('📊 Vistas por sección:');
    sectionStats.rows.forEach((row) => {
      console.log(`   ${row.section || 'sin sección'}: ${row.count}`);
    });

    console.log('\n✨ Seed de vistas completado exitosamente!');
    console.log('\n📝 Próximo paso:');
    console.log('   Ejecutar script: migrate-existing-roles.ts\n');

  } catch (error) {
    console.error('❌ Error durante el seed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar seed
seedInitialViews()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
