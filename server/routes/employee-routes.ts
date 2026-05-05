import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAdmin } from '../authMiddleware';
import bcrypt from 'bcryptjs';
import { getTenantStorageWithSchema } from '../routes';
import { getTenantDb } from '../multi-tenant-db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { Pool } from '@neondatabase/serverless';

/**
 * Sincroniza user_roles: cuando un empleado cambia de rol (o es creado),
 * actualiza la tabla user_roles para que el sidebar dinámico muestre las
 * vistas configuradas para ese rol en el sistema RBAC.
 */
async function syncUserRole(userId: number, roleName: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Buscar el rol en la tabla roles por nombre
    const roleResult = await pool.query(
      'SELECT id FROM roles WHERE name = $1 AND is_active = TRUE',
      [roleName]
    );
    if (roleResult.rows.length === 0) {
      console.warn(`⚠️  syncUserRole: rol '${roleName}' no encontrado en tabla roles`);
      return;
    }
    const roleId = roleResult.rows[0].id;

    // Reemplazar la asignación de rol del usuario
    await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT (user_id, role_id) DO NOTHING',
      [userId, roleId]
    );
    console.log(`✅ syncUserRole: usuario ${userId} asignado al rol '${roleName}' (id=${roleId})`);
  } catch (error) {
    console.error('❌ syncUserRole error:', error);
  } finally {
    await pool.end();
  }
}

const router = Router();

// ================================
// SCHEMAS DE VALIDACIÓN
// ================================

const EmployeeProfileSchema = z.object({
  department: z.string().min(1),
  position: z.string().min(2),
  specializations: z.array(z.string()).optional(),
  maxDailyOrders: z.number().positive().optional(),
  skillLevel: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
});

const CreateUserWithProfileSchema = z.object({
  // Datos del usuario
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(2),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.enum(['admin', 'technician', 'seller', 'delivery']),
  
  // ID del perfil a asignar
  employeeProfileId: z.number().int().positive(),
  
  // Datos personalizados del empleado (opcionales)
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  vehicleInfo: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

// ================================
// EMPLOYEE PROFILES (Plantillas)
// ================================

// GET - Listar todos los perfiles
router.get('/employee-profiles', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const profiles = await tenantStorage.getAllEmployeeProfiles();
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching employee profiles:', error);
    res.status(500).json({ error: "Error al obtener perfiles" });
  }
});

// GET - Obtener perfil por ID
router.get('/employee-profiles/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const profile = await tenantStorage.getEmployeeProfileById(id);
    if (!profile) {
      return res.status(404).json({ error: "Perfil no encontrado" });
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Error fetching employee profile:', error);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// POST - Crear nuevo perfil (plantilla)
router.post('/employee-profiles', authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const user = req.user;
    const profileData = EmployeeProfileSchema.parse(req.body);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
     
    const profile = await tenantStorage.createEmployeeProfile(profileData);
    res.status(201).json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error('Error creating employee profile:', error);
    res.status(500).json({ error: "Error al crear perfil" });
  }
});

// PUT - Actualizar perfil
router.put('/employee-profiles/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user;
    const updates = EmployeeProfileSchema.partial().parse(req.body);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const profile = await tenantStorage.updateEmployeeProfile(id, updates);
    
    if (!profile) {
      return res.status(404).json({ error: "Perfil no encontrado" });
    }
    
    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error('Error updating employee profile:', error);
    res.status(500).json({ error: "Error al actualizar perfil" });
  }
});

// DELETE - Eliminar perfil (solo si no está en uso)
router.delete('/employee-profiles/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user;
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Esta función ya valida que ningún usuario lo esté usando
    await tenantStorage.deleteEmployeeProfile(id);
    
    res.json({ success: true, message: "Perfil eliminado correctamente" });
  } catch (error) {
    if (error instanceof Error && error.message.includes('users are using it')) {
      return res.status(400).json({ 
        error: "No se puede eliminar el perfil porque hay usuarios asignados a él" 
      });
    }
    console.error('Error deleting employee profile:', error);
    res.status(500).json({ error: "Error al eliminar perfil" });
  }
});

// ================================
// EMPLOYEES (Usuarios con perfil)
// ================================

// GET - Listar todos los empleados con sus perfiles
router.get('/employees', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const employees = await tenantStorage.getEmployeesWithProfiles();
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: "Error al obtener empleados" });
  }
});

// GET - Obtener empleado por ID con perfil
router.get('/employees/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const employee = await tenantStorage.getUserById(id);
    if (!employee) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }
    
    // Obtener perfil si tiene
    let profile = null;
    if (employee.employeeProfileId) {
      profile = await tenantStorage.getEmployeeProfileById(employee.employeeProfileId);
    }
    
    const { password, ...safeEmployee } = employee;
    res.json({ ...safeEmployee, profile });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: "Error al obtener empleado" });
  }
});

// POST - Crear empleado y asignar perfil
router.post('/employees', authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const user = req.user;
    const validatedData = CreateUserWithProfileSchema.parse(req.body);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que el perfil existe
    const profile = await tenantStorage.getEmployeeProfileById(validatedData.employeeProfileId);
    if (!profile) {
      return res.status(404).json({ error: "Perfil no encontrado" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    
    // Crear usuario con perfil asignado
    const newUser = await tenantStorage.createUser({
      username: validatedData.username,
      password: hashedPassword,
      name: validatedData.name,
      email: validatedData.email,
      phone: validatedData.phone,
      role: validatedData.role,
      employeeProfileId: validatedData.employeeProfileId,
      status: 'active',
      // Datos personalizados
      emergencyContact: validatedData.emergencyContact,
      emergencyPhone: validatedData.emergencyPhone,
      vehicleInfo: validatedData.vehicleInfo,
      address: validatedData.address,
    });
    
    // Obtener usuario completo con perfil
    const employeeWithProfile = await tenantStorage.getUserById(newUser.id);
    const completeProfile = await tenantStorage.getEmployeeProfileById(newUser.employeeProfileId!);

    // Sincronizar user_roles con el rol seleccionado
    await syncUserRole(newUser.id, validatedData.role);
    
    const { password, ...safeUser } = employeeWithProfile;
    
    res.status(201).json({
      ...safeUser,
      profile: completeProfile,
      message: "Empleado creado correctamente"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error('Error creating employee:', error);
    res.status(500).json({ error: "Error al crear empleado" });
  }
});


// PUT - Actualizar empleado (usuario)
router.put('/employees/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const userId = parseInt(req.params.id);
    const user = req.user;
    const updates = req.body;
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que existe
    const existingUser = await tenantStorage.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }
    
    // Si viene nuevo perfil, validar
    if (updates.employeeProfileId !== undefined && updates.employeeProfileId !== null) {
      const profile = await tenantStorage.getEmployeeProfileById(updates.employeeProfileId);
      if (!profile) {
        return res.status(404).json({ error: "Perfil no encontrado" });
      }
    }
    
    // Hash password si viene
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    
    // Usar tenantDb con Drizzle ORM
    const tenantDb = await getTenantDb(user.storeId);
    
    // Preparar updates - solo campos definidos
    const updateData: any = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.password !== undefined) updateData.password = updates.password;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.employeeProfileId !== undefined) updateData.employeeProfileId = updates.employeeProfileId;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    
    updateData.updatedAt = new Date();
    
    // Actualizar usuario
    const result = await tenantDb
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    
    if (!result.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const updatedUser = result[0];

    // Si el rol cambió, sincronizar user_roles
    if (updates.role !== undefined) {
      await syncUserRole(userId, updates.role);
    }

    const { password, ...safeUser } = updatedUser;
    
    res.json(safeUser);
    
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: "Error al actualizar empleado" });
  }
});
// PATCH - Cambiar perfil asignado al usuario
router.patch('/employees/:id/profile', authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const userId = parseInt(req.params.id);
    const { profileId } = z.object({ 
      profileId: z.number().int().positive().nullable() 
    }).parse(req.body);
    
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Si viene profileId, verificar que existe
    if (profileId) {
      const profile = await tenantStorage.getEmployeeProfileById(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Perfil no encontrado" });
      }
    }
    
    const updatedUser = await tenantStorage.assignProfileToUser(userId, profileId);
    
    const { password, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error('Error assigning profile:', error);
    res.status(500).json({ error: "Error al asignar perfil" });
  }
});

// DELETE - Eliminar empleado (NO elimina el perfil)
router.delete('/employees/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user;
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que el empleado existe
    const employee = await tenantStorage.getUserById(id);
    if (!employee) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }
    
    // Eliminar SOLO el usuario, el perfil sigue disponible para otros
    await tenantStorage.deleteUser(id);
    
    res.json({ 
      success: true, 
      message: "Empleado eliminado correctamente" 
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: "Error al eliminar empleado" });
  }
});

// ================================
// UTILIDADES
// ================================

// GET - Generar employee ID para departamento
router.post('/employee-profiles/generate-id', authenticateToken, async (req: any, res: any) => {
  try {
    const { department } = z.object({
      department: z.enum(['technical', 'sales', 'delivery', 'support', 'admin'])
    }).parse(req.body);
    
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const employeeId = await tenantStorage.generateEmployeeId(department);
    
    res.json({ employeeId });
  } catch (error) {
    console.error('Error generating employee ID:', error);
    res.status(500).json({ error: "Error al generar ID" });
  }
});

// GET - Empleados por departamento
router.get('/employees/by-department/:department', authenticateToken, async (req: any, res: any) => {
  try {
    const department = req.params.department;
    const user = req.user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const employees = await tenantStorage.getEmployeesByDepartment(department);
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees by department:', error);
    res.status(500).json({ error: "Error al obtener empleados" });
  }
});

// POST - Sincronizar user_roles para todos los empleados existentes
// Corrige la desincronización entre users.role y user_roles
router.post('/employees/sync-roles', authenticateToken, requireAdmin, async (req: any, res: any) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Obtener todos los usuarios con su rol legacy
    const usersResult = await pool.query(
      'SELECT id, username, role FROM users WHERE role IS NOT NULL AND status != $1',
      ['deleted']
    );

    let synced = 0;
    let skipped = 0;
    const details: any[] = [];

    for (const u of usersResult.rows) {
      const roleResult = await pool.query(
        'SELECT id FROM roles WHERE name = $1 AND is_active = TRUE',
        [u.role]
      );
      if (roleResult.rows.length === 0) {
        skipped++;
        details.push({ username: u.username, role: u.role, status: 'skipped - rol no encontrado en RBAC' });
        continue;
      }
      const roleId = roleResult.rows[0].id;
      await pool.query('DELETE FROM user_roles WHERE user_id = $1', [u.id]);
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT (user_id, role_id) DO NOTHING',
        [u.id, roleId]
      );
      synced++;
      details.push({ username: u.username, role: u.role, status: 'synced' });
    }

    res.json({ message: `Sincronización completada: ${synced} sincronizados, ${skipped} omitidos`, details });
  } catch (error) {
    console.error('Error syncing user roles:', error);
    res.status(500).json({ error: 'Error al sincronizar roles' });
  } finally {
    await pool.end();
  }
});

export default router;
