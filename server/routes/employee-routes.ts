import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAdmin } from '../authMiddleware';
import bcrypt from 'bcryptjs';
import { getTenantStorageWithSchema } from 'server/routes';
import { Pool } from '@neondatabase/serverless';

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
    
    // ✅ USAR QUERY DIRECTO - bypass del método faltante
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 1 
    });
    
    try {
      // Obtener schema
      const storeResult = await pool.query(
        'SELECT database_url FROM virtual_stores WHERE id = $1',
        [user.storeId]
      );
      
      const schemaMatch = storeResult.rows[0]?.database_url?.match(/schema=([^&]+)/);
      const schemaName = schemaMatch ? schemaMatch[1] : 'public';
      
      await pool.query(`SET search_path TO ${schemaName}, public`);
      
      // Construir query dinámico
      const fields = [];
      const values = [];
      let counter = 1;
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          fields.push(`${columnName} = $${counter}`);
          values.push(updates[key]);
          counter++;
        }
      });
      
      fields.push('updated_at = NOW()');
      values.push(userId);
      
      const result = await pool.query(`
        UPDATE users 
        SET ${fields.join(', ')}
        WHERE id = $${counter}
        RETURNING *
      `, values);
      
      await pool.end();
      
      const updatedUser = result.rows[0];
      const { password, ...safeUser } = updatedUser;
      
      res.json(safeUser);
      
    } catch (error) {
      await pool.end().catch(() => {});
      throw error;
    }
    
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

export default router;