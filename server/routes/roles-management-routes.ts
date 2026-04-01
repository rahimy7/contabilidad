import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAdmin } from '../authMiddleware';
import { Pool } from '@neondatabase/serverless';

const router = Router();

// ================================
// SCHEMAS DE VALIDACIÓN
// ================================

const CreateRoleSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z_]+$/, 'Solo minúsculas y guiones bajos'),
  displayName: z.string().min(2).max(100),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

const UpdateRoleSchema = CreateRoleSchema.partial();

const UpdatePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      viewId: z.number().int().positive(),
      canAccess: z.boolean(),
      sortOrder: z.number().int().min(0),
    })
  ),
});

// ================================
// ROLES - GESTIÓN
// ================================

// GET /api/roles - Listar todos los roles
router.get('/roles', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const result = await pool.query(`
      SELECT 
        r.*,
        COUNT(ur.id) as user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name ASC;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Error al obtener roles' });
  } finally {
    await pool.end();
  }
});

// GET /api/roles/:id - Obtener un rol por ID
router.get('/roles/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const roleId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      `
      SELECT r.*, COUNT(ur.id) as user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      WHERE r.id = $1
      GROUP BY r.id;
      `,
      [roleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Error al obtener rol' });
  } finally {
    await pool.end();
  }
});

// POST /api/roles - Crear un nuevo rol
router.post('/roles', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const validatedData = CreateRoleSchema.parse(req.body);

    // Verificar que el nombre no existe
    const existing = await pool.query('SELECT id FROM roles WHERE name = $1', [validatedData.name]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un rol con ese nombre' });
    }

    const result = await pool.query(
      `
      INSERT INTO roles (name, display_name, description, is_active, is_system)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING *;
      `,
      [validatedData.name, validatedData.displayName, validatedData.description, validatedData.isActive]
    );

    res.status(201).json({
      role: result.rows[0],
      message: 'Rol creado exitosamente',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Error al crear rol' });
  } finally {
    await pool.end();
  }
});

// PUT /api/roles/:id - Actualizar un rol
router.put('/roles/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const roleId = parseInt(req.params.id);

  try {
    const validatedData = UpdateRoleSchema.parse(req.body);

    // Verificar que el rol existe y no es del sistema
    const existingRole = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    if (existingRole.rows[0].is_system) {
      return res.status(403).json({ error: 'No se puede editar un rol del sistema' });
    }

    // Si se cambia el nombre, verificar que no existe otro rol con ese nombre
    if (validatedData.name) {
      const nameCheck = await pool.query('SELECT id FROM roles WHERE name = $1 AND id != $2', [
        validatedData.name,
        roleId,
      ]);
      if (nameCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Ya existe un rol con ese nombre' });
      }
    }

    // Construir query dinámico
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validatedData.name) {
      updates.push(`name = $${paramCount}`);
      values.push(validatedData.name);
      paramCount++;
    }
    if (validatedData.displayName) {
      updates.push(`display_name = $${paramCount}`);
      values.push(validatedData.displayName);
      paramCount++;
    }
    if (validatedData.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(validatedData.description);
      paramCount++;
    }
    if (validatedData.isActive !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(validatedData.isActive);
      paramCount++;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length === 1) {
      return res.status(400).json({ error: 'No hay cambios para actualizar' });
    }

    values.push(roleId);
    const result = await pool.query(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *;`,
      values
    );

    res.json({
      role: result.rows[0],
      message: 'Rol actualizado exitosamente',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Error al actualizar rol' });
  } finally {
    await pool.end();
  }
});

// DELETE /api/roles/:id - Eliminar un rol
router.delete('/roles/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const roleId = parseInt(req.params.id);

  try {
    // Verificar que el rol existe y no es del sistema
    const existingRole = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    if (existingRole.rows[0].is_system) {
      return res.status(403).json({ error: 'No se puede eliminar un rol del sistema' });
    }

    // Verificar que no hay usuarios asignados
    const usersCheck = await pool.query('SELECT COUNT(*) as count FROM user_roles WHERE role_id = $1', [roleId]);
    if (parseInt(usersCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: `No se puede eliminar el rol porque hay ${usersCheck.rows[0].count} usuario(s) asignado(s)`,
      });
    }

    // Eliminar el rol (los permisos se eliminan automáticamente por CASCADE)
    await pool.query('DELETE FROM roles WHERE id = $1', [roleId]);

    res.json({ message: 'Rol eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Error al eliminar rol' });
  } finally {
    await pool.end();
  }
});

// ================================
// VISTAS - GESTIÓN
// ================================

// GET /api/views - Listar todas las vistas disponibles
router.get('/views', authenticateToken, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const result = await pool.query(`
      SELECT * FROM views
      ORDER BY section, label;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching views:', error);
    res.status(500).json({ error: 'Error al obtener vistas' });
  } finally {
    await pool.end();
  }
});

// ================================
// PERMISOS - GESTIÓN
// ================================

// GET /api/roles/me/permissions - Obtener vistas permitidas del usuario actual
// ⚠️ IMPORTANTE: Esta ruta debe estar ANTES de /roles/:roleId/permissions
// para evitar que "me" se interprete como un roleId
router.get('/roles/me/permissions', authenticateToken, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Admins y super_admins ven TODAS las vistas sin importar role_permissions
    if (userRole === 'admin' || userRole === 'super_admin') {
      const result = await pool.query(`
        SELECT
          v.id,
          v.route_path,
          v.label,
          v.icon_name,
          v.permission_required,
          v.section,
          COALESCE(rp.sort_order, v.id) AS sort_order
        FROM views v
        LEFT JOIN role_permissions rp ON rp.view_id = v.id
          AND rp.role_id = (
            SELECT r.id FROM user_roles ur
            INNER JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = $1 LIMIT 1
          )
        ORDER BY COALESCE(rp.sort_order, v.id) ASC;
      `, [userId]);

      return res.json(result.rows);
    }

    // Para otros roles: solo las vistas asignadas explícitamente
    const result = await pool.query(
      `
      SELECT DISTINCT
        v.id,
        v.route_path,
        v.label,
        v.icon_name,
        v.permission_required,
        v.section,
        rp.sort_order
      FROM user_roles ur
      INNER JOIN roles r ON ur.role_id = r.id
      INNER JOIN role_permissions rp ON r.id = rp.role_id
      INNER JOIN views v ON rp.view_id = v.id
      WHERE ur.user_id = $1 AND rp.can_access = TRUE AND r.is_active = TRUE
      ORDER BY rp.sort_order ASC;
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ error: 'Error al obtener permisos del usuario' });
  } finally {
    await pool.end();
  }
});

// GET /api/roles/:roleId/permissions - Obtener permisos de un rol específico
router.get('/roles/:roleId/permissions', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const roleId = parseInt(req.params.roleId);

  try {
    const result = await pool.query(
      `
      SELECT 
        rp.id,
        rp.role_id,
        rp.view_id,
        rp.can_access,
        rp.sort_order,
        v.route_path,
        v.label,
        v.icon_name,
        v.permission_required,
        v.section
      FROM role_permissions rp
      INNER JOIN views v ON rp.view_id = v.id
      WHERE rp.role_id = $1 AND rp.can_access = TRUE
      ORDER BY rp.sort_order ASC;
      `,
      [roleId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({ error: 'Error al obtener permisos del rol' });
  } finally {
    await pool.end();
  }
});

// PUT /api/roles/:roleId/permissions - Actualizar permisos completos de un rol
router.put('/roles/:roleId/permissions', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const roleId = parseInt(req.params.roleId);

  try {
    const validatedData = UpdatePermissionsSchema.parse(req.body);

    // Verificar que el rol existe y no es del sistema (admin no se edita)
    const roleCheck = await pool.query('SELECT is_system FROM roles WHERE id = $1', [roleId]);
    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    if (roleCheck.rows[0].is_system) {
      return res.status(403).json({ error: 'No se pueden editar los permisos del rol admin' });
    }

    // Iniciar transacción
    await pool.query('BEGIN');

    try {
      // Eliminar permisos existentes
      await pool.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

      // Insertar nuevos permisos
      if (validatedData.permissions.length > 0) {
        const insertValues = validatedData.permissions
          .map(
            (p, idx) =>
              `($1, $${idx * 3 + 2}, $${idx * 3 + 3}, $${idx * 3 + 4})`
          )
          .join(', ');

        const values = validatedData.permissions.flatMap((p) => [p.viewId, p.canAccess, p.sortOrder]);

        await pool.query(
          `
          INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
          VALUES ${insertValues};
          `,
          [roleId, ...values]
        );
      }

      // Commit transacción
      await pool.query('COMMIT');

      res.json({
        message: 'Permisos actualizados exitosamente',
        count: validatedData.permissions.length,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: 'Error al actualizar permisos' });
  } finally {
    await pool.end();
  }
});

export default router;
